const request = require('supertest');
const jwt = require('jsonwebtoken');
const { buildApp, registerUser, expectError, TEST_ENV } = require('./helpers');
const { createUserRepository } = require('../src/modules/users/user.repository');
const { JWT_ISSUER } = require('../src/modules/auth/auth.service');

describe('Auth', () => {
  let app;
  let db;

  beforeEach(() => {
    ({ app, db } = buildApp());
  });

  afterEach(() => db.close());

  describe('POST /auth/register', () => {
    it('cria a conta e devolve usuário + token', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ name: '  Maria  ', email: ' MARIA@Example.com ', password: 'senha-segura-123' });

      expect(res.status).toBe(201);
      expect(res.body.data.user).toEqual({
        id: expect.any(Number),
        name: 'Maria',
        email: 'maria@example.com',
        createdAt: expect.any(String),
      });
      expect(res.body.data.tokenType).toBe('Bearer');
      expect(res.body.data.accessToken).toEqual(expect.any(String));
      expect(res.body.data.user).not.toHaveProperty('passwordHash');
    });

    it('400 quando faltam campos, listando todos', async () => {
      const res = await request(app).post('/auth/register').send({});
      expectError(res, 400, 'VALIDATION_ERROR');
      const fields = res.body.error.details.map((d) => d.field);
      expect(fields).toEqual(expect.arrayContaining(['name', 'email', 'password']));
    });

    it('400 para e-mail inválido e senha curta', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ name: 'Ana', email: 'nao-e-email', password: '123' });
      expectError(res, 400, 'VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          { location: 'body', field: 'email', message: 'E-mail inválido' },
          { location: 'body', field: 'password', message: 'Senha deve ter pelo menos 8 caracteres' },
        ]),
      );
    });

    it('400 para senha acima de 72 bytes (limite do bcrypt)', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ name: 'Ana', email: 'ana@example.com', password: 'a'.repeat(73) });
      expectError(res, 400, 'VALIDATION_ERROR');
      expect(res.body.error.details[0].message).toBe('Senha deve ter no máximo 72 bytes');
    });

    it('conta bytes e não caracteres: 37 "á" = 74 bytes', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ name: 'Ana', email: 'ana@example.com', password: 'á'.repeat(37) });
      expectError(res, 400, 'VALIDATION_ERROR');
    });

    it('aceita senha com exatamente 72 bytes', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ name: 'Ana', email: 'ana@example.com', password: 'á'.repeat(36) });
      expect(res.status).toBe(201);
    });

    it('400 para tipos errados', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ name: 123, email: true, password: ['x'] });
      expectError(res, 400, 'VALIDATION_ERROR');
      expect(res.body.error.details).toHaveLength(3);
    });

    it('400 para campos não permitidos', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ name: 'Ana', email: 'ana@example.com', password: 'senha-segura-123', role: 'admin' });
      expectError(res, 400, 'VALIDATION_ERROR');
      expect(res.body.error.details).toEqual([
        { location: 'body', field: 'role', message: 'Campo não permitido' },
      ]);
    });

    it('400 quando o corpo é um array', async () => {
      const res = await request(app).post('/auth/register').send([1, 2]);
      expectError(res, 400, 'VALIDATION_ERROR');
      expect(res.body.error.details).toEqual([
        { location: 'body', field: null, message: 'Corpo da requisição deve ser um objeto JSON' },
      ]);
    });

    it('409 para e-mail já cadastrado (sem diferenciar maiúsculas)', async () => {
      await registerUser(app, { email: 'dup@example.com' });
      const res = await request(app)
        .post('/auth/register')
        .send({ name: 'Outro', email: 'DUP@example.com', password: 'senha-segura-123' });
      expectError(res, 409, 'EMAIL_ALREADY_EXISTS');
    });

    it('409 mesmo quando dois cadastros passam juntos pela checagem (UNIQUE do banco)', () => {
      const repo = createUserRepository(db);
      const data = { name: 'A', email: 'race@example.com', passwordHash: 'hash' };
      repo.create(data);
      expect(() => repo.create(data)).toThrow(
        expect.objectContaining({ status: 409, code: 'EMAIL_ALREADY_EXISTS' }),
      );
    });
  });

  describe('POST /auth/login', () => {
    it('autentica com credenciais corretas', async () => {
      const user = await registerUser(app);
      const res = await request(app)
        .post('/auth/login')
        .send({ email: user.user.email, password: user.password });
      expect(res.status).toBe(200);
      expect(res.body.data.user.id).toBe(user.user.id);
      expect(res.body.data.accessToken).toEqual(expect.any(String));
    });

    it('401 para senha errada', async () => {
      const user = await registerUser(app);
      const res = await request(app)
        .post('/auth/login')
        .send({ email: user.user.email, password: 'senha-errada-000' });
      expectError(res, 401, 'INVALID_CREDENTIALS');
    });

    it('401 com a mesma mensagem para e-mail inexistente', async () => {
      const user = await registerUser(app);
      const wrongPassword = await request(app)
        .post('/auth/login')
        .send({ email: user.user.email, password: 'senha-errada-000' });
      const unknownEmail = await request(app)
        .post('/auth/login')
        .send({ email: 'ninguem@example.com', password: 'qualquer-coisa' });
      expectError(unknownEmail, 401, 'INVALID_CREDENTIALS');
      expect(unknownEmail.body.error.message).toBe(wrongPassword.body.error.message);
    });

    it('401 para senha acima de 72 bytes, mesmo com o prefixo correto', async () => {
      const password = 'p'.repeat(72);
      const user = await registerUser(app, { password });
      const res = await request(app)
        .post('/auth/login')
        .send({ email: user.user.email, password: `${password}extra` });
      expectError(res, 401, 'INVALID_CREDENTIALS');
    });

    it('400 sem corpo', async () => {
      const res = await request(app).post('/auth/login');
      expectError(res, 400, 'VALIDATION_ERROR');
      expect(res.body.error.details).toEqual([
        { location: 'body', field: null, message: 'Corpo da requisição é obrigatório' },
      ]);
    });
  });

  describe('GET /auth/me', () => {
    it('devolve o usuário autenticado', async () => {
      const user = await registerUser(app);
      const res = await request(app).get('/auth/me').set('Authorization', user.auth);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(user.user);
    });

    it('401 MISSING_TOKEN sem cabeçalho, com WWW-Authenticate', async () => {
      const res = await request(app).get('/auth/me');
      expectError(res, 401, 'MISSING_TOKEN');
      expect(res.headers['www-authenticate']).toBe('Bearer');
    });

    it.each([
      ['sem esquema', 'abc.def.ghi'],
      ['esquema errado', 'Basic abc'],
      ['só o esquema', 'Bearer'],
      ['partes demais', 'Bearer a b'],
    ])('401 INVALID_AUTH_HEADER (%s)', async (_, header) => {
      const res = await request(app).get('/auth/me').set('Authorization', header);
      expectError(res, 401, 'INVALID_AUTH_HEADER');
    });

    it('401 INVALID_TOKEN para token malformado', async () => {
      const res = await request(app).get('/auth/me').set('Authorization', 'Bearer nao-e-um-jwt');
      expectError(res, 401, 'INVALID_TOKEN');
    });

    it('401 INVALID_TOKEN para token assinado com outro segredo', async () => {
      const token = jwt.sign({}, 'outro-segredo-qualquer-com-32-caracteres', { subject: '1' });
      const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);
      expectError(res, 401, 'INVALID_TOKEN');
    });

    it('401 INVALID_TOKEN para algoritmo "none"', async () => {
      const token = jwt.sign({}, null, { subject: '1', algorithm: 'none' });
      const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);
      expectError(res, 401, 'INVALID_TOKEN');
    });

    it('401 TOKEN_EXPIRED para token expirado', async () => {
      const user = await registerUser(app);
      const token = jwt.sign({ exp: Math.floor(Date.now() / 1000) - 60 }, TEST_ENV.JWT_SECRET, {
        subject: String(user.user.id),
        issuer: JWT_ISSUER,
      });
      const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);
      expectError(res, 401, 'TOKEN_EXPIRED');
    });

    it('401 INVALID_TOKEN quando o usuário do token não existe mais', async () => {
      const token = jwt.sign({}, TEST_ENV.JWT_SECRET, { subject: '999999', issuer: JWT_ISSUER });
      const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);
      expectError(res, 401, 'INVALID_TOKEN');
    });

    it.each([
      ['emitido pela API Flask', { issuer: 'task-api-flask' }],
      ['sem emissor', {}],
    ])('401 INVALID_TOKEN para token com o mesmo segredo, mas %s', async (_, issuerOption) => {
      const user = await registerUser(app);
      const token = jwt.sign({}, TEST_ENV.JWT_SECRET, { subject: String(user.user.id), ...issuerOption });
      const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);
      expectError(res, 401, 'INVALID_TOKEN');
    });

    it('401 INVALID_TOKEN para subject não numérico', async () => {
      const token = jwt.sign({}, TEST_ENV.JWT_SECRET, { subject: 'abc', issuer: JWT_ISSUER });
      const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);
      expectError(res, 401, 'INVALID_TOKEN');
    });
  });
});
