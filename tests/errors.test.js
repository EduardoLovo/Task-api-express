const request = require('supertest');
const { buildApp, registerUser, expectError } = require('./helpers');
const { createErrorHandler, normalizeError } = require('../src/middlewares/errorHandler');
const { loadConfig, ConfigError } = require('../src/config/env');
const { TEST_ENV } = require('./helpers');

describe('Tratamento global de erros', () => {
  let app;
  let db;

  beforeEach(() => {
    ({ app, db } = buildApp());
  });

  afterEach(() => {
    if (db.isOpen) db.close();
  });

  it('404 para rota inexistente', async () => {
    const res = await request(app).get('/nao-existe');
    expectError(res, 404, 'ROUTE_NOT_FOUND');
    expect(res.body.error.message).toBe('Rota GET /nao-existe não encontrada');
  });

  it.each([
    ['put', '/tasks', 'GET, POST'],
    ['delete', '/tasks', 'GET, POST'],
    ['put', '/tasks/1', 'GET, PATCH, DELETE'],
    ['get', '/auth/login', 'POST'],
    ['post', '/health', 'GET'],
  ])('405 para %s %s com cabeçalho Allow', async (method, path, allow) => {
    const user = await registerUser(app);
    const res = await request(app)[method](path).set('Authorization', user.auth);
    expectError(res, 405, 'METHOD_NOT_ALLOWED');
    expect(res.headers.allow).toBe(allow);
  });

  it('404 e 405 têm prioridade sobre a exigência de token', async () => {
    expectError(await request(app).put('/tasks'), 405, 'METHOD_NOT_ALLOWED');
    expectError(await request(app).get('/tasks/1/extra'), 404, 'ROUTE_NOT_FOUND');
  });

  it('400 para JSON malformado', async () => {
    const res = await request(app)
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": "a@b.com",');
    expectError(res, 400, 'INVALID_JSON');
  });

  it.each([33, 50_000])('400 INVALID_JSON para JSON com %i níveis de aninhamento', async (levels) => {
    const res = await request(app)
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('['.repeat(levels) + ']'.repeat(levels));
    expectError(res, 400, 'INVALID_JSON');
    expect(res.body.error.message).toBe('JSON com aninhamento excessivo (máximo de 32 níveis)');
  });

  it('aceita até 32 níveis de aninhamento', async () => {
    const res = await request(app)
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"a":'.repeat(32) + '1' + '}'.repeat(32));
    expectError(res, 400, 'VALIDATION_ERROR'); // chegou à validação: o JSON foi aceito
  });

  it('colchetes e aspas escapadas dentro de strings não contam', async () => {
    const password = 'x\\"' + '[{'.repeat(40);
    const res = await request(app)
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send(`{"email": "ninguem@example.com", "password": "${password}"}`);
    expectError(res, 401, 'INVALID_CREDENTIALS');
  });

  it('400 para JSON que não é objeto nem array', async () => {
    const res = await request(app).post('/auth/login').set('Content-Type', 'application/json').send('"texto"');
    expectError(res, 400, 'INVALID_JSON');
  });

  it('413 para corpo maior que o limite', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ name: 'x'.repeat(200 * 1024), email: 'a@b.com', password: '12345678' });
    expectError(res, 413, 'PAYLOAD_TOO_LARGE');
  });

  it('415 para Content-Type diferente de JSON', async () => {
    const res = await request(app).post('/auth/login').set('Content-Type', 'text/plain').send('email=a@b.com');
    expectError(res, 415, 'UNSUPPORTED_MEDIA_TYPE');
  });

  it('415 para formulário urlencoded', async () => {
    const res = await request(app).post('/auth/login').type('form').send({ email: 'a@b.com' });
    expectError(res, 415, 'UNSUPPORTED_MEDIA_TYPE');
  });

  it('415 para charset não suportado', async () => {
    const res = await request(app)
      .post('/auth/login')
      .set('Content-Type', 'application/json; charset=latin1')
      .send('{}');
    expectError(res, 415, 'UNSUPPORTED_CHARSET');
  });

  it('415 para Content-Encoding não suportado', async () => {
    const res = await request(app)
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'compress')
      .send('{}');
    expectError(res, 415, 'UNSUPPORTED_ENCODING');
  });

  it('aceita application/json com charset utf-8', async () => {
    const res = await request(app)
      .post('/auth/login')
      .set('Content-Type', 'application/json; charset=utf-8')
      .send(JSON.stringify({ email: 'x@y.com', password: 'abc' }));
    expectError(res, 401, 'INVALID_CREDENTIALS');
  });

  it('500 sem vazar detalhes quando o banco falha', async () => {
    const user = await registerUser(app);
    db.close();
    const res = await request(app).get('/tasks').set('Authorization', user.auth);
    expectError(res, 500, 'INTERNAL_ERROR');
    expect(res.body.error.message).toBe('Erro interno do servidor');
    expect(res.body.error).not.toHaveProperty('debug');
    expect(JSON.stringify(res.body)).not.toMatch(/sqlite|database is not open/i);
  });

  it('503 no health check quando o banco está fora', async () => {
    db.close();
    const res = await request(app).get('/health');
    expectError(res, 503, 'DATABASE_UNAVAILABLE');
  });

  it('health check OK', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'ok', database: 'ok' });
  });

  describe('X-Request-Id', () => {
    it('gera um id e devolve no cabeçalho e no erro', async () => {
      const res = await request(app).get('/nao-existe');
      expect(res.headers['x-request-id']).toEqual(expect.any(String));
      expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
    });

    it('reaproveita um id válido do cliente', async () => {
      const res = await request(app).get('/nao-existe').set('X-Request-Id', 'meu-id-123');
      expect(res.body.error.requestId).toBe('meu-id-123');
    });

    it('ignora um id inválido do cliente', async () => {
      const res = await request(app).get('/nao-existe').set('X-Request-Id', '<script>');
      expect(res.body.error.requestId).not.toBe('<script>');
    });
  });

  describe('Rate limit', () => {
    it('429 após exceder o limite global, com Retry-After', async () => {
      const { app: limited, db: limitedDb } = buildApp({ RATE_LIMIT_MAX: '2' });
      await request(limited).get('/health');
      await request(limited).get('/health');
      const res = await request(limited).get('/health');
      expectError(res, 429, 'TOO_MANY_REQUESTS');
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
      limitedDb.close();
    });

    it('429 com limite próprio para rotas de autenticação', async () => {
      const { app: limited, db: limitedDb } = buildApp({ AUTH_RATE_LIMIT_MAX: '1' });
      await request(limited).post('/auth/login').send({ email: 'a@b.com', password: 'x' });
      const res = await request(limited).post('/auth/login').send({ email: 'a@b.com', password: 'x' });
      expectError(res, 429, 'TOO_MANY_REQUESTS');
      expect(res.body.error.message).toMatch(/autenticação/);
      limitedDb.close();
    });
  });

  it('não expõe X-Powered-By e aplica cabeçalhos de segurança', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('serve a especificação OpenAPI', async () => {
    const res = await request(app).get('/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.3');
  });
});

describe('errorHandler (unidade)', () => {
  function run(err, config = loadConfig(TEST_ENV)) {
    const res = {
      headersSent: false,
      set: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    createErrorHandler(config)(err, { id: 'req-1', socket: { destroy: jest.fn() } }, res, jest.fn());
    return res;
  }

  it.each([
    ['string', 'falhou'],
    ['null', null],
    ['objeto qualquer', { foo: 'bar' }],
    ['Error comum', new Error('segredo interno')],
    ['status 5xx de lib', Object.assign(new Error('x'), { status: 502 })],
  ])('converte %s em 500 genérico', (_, thrown) => {
    expect(normalizeError(thrown)).toMatchObject({ status: 500, code: 'INTERNAL_ERROR' });
  });

  it('preserva erros 4xx expostos de outras libs', () => {
    const err = Object.assign(new Error('Request Timeout'), { status: 408, expose: true });
    expect(normalizeError(err)).toMatchObject({ status: 408, code: 'REQUEST_TIMEOUT' });
  });

  it('inclui debug apenas em desenvolvimento', () => {
    const dev = run(new Error('boom'), loadConfig({ ...TEST_ENV, NODE_ENV: 'development' }));
    expect(dev.json.mock.calls[0][0].error.debug.message).toBe('boom');

    const prod = run(new Error('boom'), loadConfig({ ...TEST_ENV, NODE_ENV: 'production' }));
    expect(prod.json.mock.calls[0][0].error).not.toHaveProperty('debug');
  });

  it('encerra a conexão se a resposta já começou', () => {
    const res = { headersSent: true, status: jest.fn(), json: jest.fn() };
    const req = { id: 'r', socket: { destroy: jest.fn() } };
    createErrorHandler(loadConfig(TEST_ENV))(new Error('tarde'), req, res, jest.fn());
    expect(req.socket.destroy).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('Configuração', () => {
  it('falha com mensagem clara quando JWT_SECRET falta ou é curto', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({})).toThrow(/JWT_SECRET é obrigatório/);
    expect(() => loadConfig({ JWT_SECRET: 'curto' })).toThrow(/pelo menos 32 caracteres/);
  });

  it('rejeita valores inválidos', () => {
    expect(() => loadConfig({ ...TEST_ENV, PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadConfig({ ...TEST_ENV, JWT_EXPIRES_IN: 'uma hora' })).toThrow(/JWT_EXPIRES_IN/);
    expect(() => loadConfig({ ...TEST_ENV, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});
