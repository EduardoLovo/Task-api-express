const request = require('supertest');
const { buildApp, registerUser, createTask, expectError } = require('./helpers');

describe('Tasks', () => {
  let app;
  let db;
  let alice;
  let bob;

  beforeEach(async () => {
    ({ app, db } = buildApp());
    alice = await registerUser(app);
    bob = await registerUser(app);
  });

  afterEach(() => db.close());

  it('exige autenticação', async () => {
    expectError(await request(app).get('/tasks'), 401, 'MISSING_TOKEN');
    expectError(await request(app).get('/tasks/1'), 401, 'MISSING_TOKEN');
  });

  describe('POST /tasks', () => {
    it('cria com valores padrão e cabeçalho Location', async () => {
      const res = await request(app)
        .post('/tasks')
        .set('Authorization', alice.auth)
        .send({ title: '  Estudar Express  ' });

      expect(res.status).toBe(201);
      expect(res.headers.location).toBe(`/tasks/${res.body.data.id}`);
      expect(res.body.data).toEqual({
        id: expect.any(Number),
        title: 'Estudar Express',
        description: null,
        status: 'pending',
        priority: 'medium',
        dueDate: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it('cria com todos os campos', async () => {
      const res = await request(app).post('/tasks').set('Authorization', alice.auth).send({
        title: 'Deploy',
        description: 'Subir para produção',
        status: 'in_progress',
        priority: 'high',
        dueDate: '2026-12-31',
      });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        status: 'in_progress',
        priority: 'high',
        dueDate: '2026-12-31',
      });
    });

    it.each([
      ['título ausente', {}, 'title'],
      ['título vazio', { title: '   ' }, 'title'],
      ['título longo', { title: 'x'.repeat(121) }, 'title'],
      ['título não texto', { title: 42 }, 'title'],
      ['status inválido', { title: 'a', status: 'feito' }, 'status'],
      ['prioridade inválida', { title: 'a', priority: 'urgent' }, 'priority'],
      ['data em formato errado', { title: 'a', dueDate: '31/12/2026' }, 'dueDate'],
      ['data impossível', { title: 'a', dueDate: '2026-02-30' }, 'dueDate'],
      ['descrição longa', { title: 'a', description: 'x'.repeat(1001) }, 'description'],
      ['campo extra', { title: 'a', userId: 2 }, 'userId'],
    ])('400 para %s', async (_, body, field) => {
      const res = await request(app).post('/tasks').set('Authorization', alice.auth).send(body);
      expectError(res, 400, 'VALIDATION_ERROR');
      expect(res.body.error.details.map((d) => d.field)).toContain(field);
    });
  });

  describe('GET /tasks', () => {
    it('lista só as tarefas do próprio usuário', async () => {
      await createTask(app, alice.auth, { title: 'Da Alice' });
      await createTask(app, bob.auth, { title: 'Do Bob' });

      const res = await request(app).get('/tasks').set('Authorization', alice.auth);
      expect(res.status).toBe(200);
      expect(res.body.data.map((t) => t.title)).toEqual(['Da Alice']);
      expect(res.body.meta).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 });
    });

    it('lista vazia devolve totalPages 0', async () => {
      const res = await request(app).get('/tasks').set('Authorization', alice.auth);
      expect(res.body).toEqual({ data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } });
    });

    it('filtra por status, prioridade e busca', async () => {
      await createTask(app, alice.auth, { title: 'Comprar pão', status: 'done', priority: 'low' });
      await createTask(app, alice.auth, { title: 'Comprar leite', status: 'pending', priority: 'low' });
      await createTask(app, alice.auth, { title: 'Estudar', description: 'comprar livro', priority: 'high' });

      const byStatus = await request(app).get('/tasks?status=done').set('Authorization', alice.auth);
      expect(byStatus.body.data.map((t) => t.title)).toEqual(['Comprar pão']);

      const bySearch = await request(app)
        .get('/tasks?search=comprar&priority=low')
        .set('Authorization', alice.auth);
      expect(bySearch.body.meta.total).toBe(2);

      const inDescription = await request(app).get('/tasks?search=livro').set('Authorization', alice.auth);
      expect(inDescription.body.data.map((t) => t.title)).toEqual(['Estudar']);
    });

    it('trata % e _ da busca como texto literal', async () => {
      await createTask(app, alice.auth, { title: '100% feito' });
      await createTask(app, alice.auth, { title: 'outra coisa' });
      const res = await request(app).get('/tasks?search=%25').set('Authorization', alice.auth);
      expect(res.body.data.map((t) => t.title)).toEqual(['100% feito']);
    });

    it('pagina e ordena', async () => {
      for (const [title, priority] of [['b', 'low'], ['a', 'high'], ['c', 'medium']]) {
        await createTask(app, alice.auth, { title, priority });
      }

      const byTitle = await request(app)
        .get('/tasks?sortBy=title&order=asc&limit=2&page=1')
        .set('Authorization', alice.auth);
      expect(byTitle.body.data.map((t) => t.title)).toEqual(['a', 'b']);
      expect(byTitle.body.meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });

      const page2 = await request(app)
        .get('/tasks?sortBy=title&order=asc&limit=2&page=2')
        .set('Authorization', alice.auth);
      expect(page2.body.data.map((t) => t.title)).toEqual(['c']);

      const byPriority = await request(app)
        .get('/tasks?sortBy=priority&order=desc')
        .set('Authorization', alice.auth);
      expect(byPriority.body.data.map((t) => t.priority)).toEqual(['high', 'medium', 'low']);
    });

    it('ordena por dueDate deixando tarefas sem prazo no final', async () => {
      await createTask(app, alice.auth, { title: 'sem prazo' });
      await createTask(app, alice.auth, { title: 'depois', dueDate: '2026-12-01' });
      await createTask(app, alice.auth, { title: 'antes', dueDate: '2026-11-01' });

      for (const order of ['asc', 'desc']) {
        const res = await request(app)
          .get(`/tasks?sortBy=dueDate&order=${order}`)
          .set('Authorization', alice.auth);
        expect(res.body.data.at(-1).title).toBe('sem prazo');
      }
    });

    it.each([
      ['page=0', 'page'],
      ['page=abc', 'page'],
      ['page=1.5', 'page'],
      ['limit=101', 'limit'],
      ['status=feito', 'status'],
      ['sortBy=senha', 'sortBy'],
      ['order=up', 'order'],
      ['search=', 'search'],
      ['status=done&status=pending', 'status'],
      ['foo=bar', 'foo'],
    ])('400 para query %s', async (query, field) => {
      const res = await request(app).get(`/tasks?${query}`).set('Authorization', alice.auth);
      expectError(res, 400, 'VALIDATION_ERROR');
      expect(res.body.error.details[0]).toMatchObject({ location: 'query', field });
    });
  });

  describe('GET /tasks/:id', () => {
    it('devolve a tarefa', async () => {
      const task = await createTask(app, alice.auth);
      const res = await request(app).get(`/tasks/${task.id}`).set('Authorization', alice.auth);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(task);
    });

    it('404 para tarefa inexistente', async () => {
      const res = await request(app).get('/tasks/9999').set('Authorization', alice.auth);
      expectError(res, 404, 'TASK_NOT_FOUND');
    });

    it('403 para tarefa de outro usuário', async () => {
      const task = await createTask(app, bob.auth);
      const res = await request(app).get(`/tasks/${task.id}`).set('Authorization', alice.auth);
      expectError(res, 403, 'FORBIDDEN');
    });

    it.each(['abc', '0', '-1', '1.5', '01', '9999999999999999'])('400 para id "%s"', async (id) => {
      const res = await request(app).get(`/tasks/${id}`).set('Authorization', alice.auth);
      expectError(res, 400, 'VALIDATION_ERROR');
      expect(res.body.error.details[0]).toMatchObject({ location: 'params', field: 'id' });
    });
  });

  describe('PATCH /tasks/:id', () => {
    it('atualiza só os campos enviados', async () => {
      const task = await createTask(app, alice.auth, { title: 'Original', priority: 'low' });
      const res = await request(app)
        .patch(`/tasks/${task.id}`)
        .set('Authorization', alice.auth)
        .send({ status: 'done' });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ title: 'Original', priority: 'low', status: 'done' });
      expect(res.body.data.updatedAt >= task.updatedAt).toBe(true);
    });

    it('permite limpar descrição e prazo com null', async () => {
      const task = await createTask(app, alice.auth, { description: 'x', dueDate: '2026-12-31' });
      const res = await request(app)
        .patch(`/tasks/${task.id}`)
        .set('Authorization', alice.auth)
        .send({ description: null, dueDate: null });
      expect(res.body.data).toMatchObject({ description: null, dueDate: null });
    });

    it('400 para corpo vazio', async () => {
      const task = await createTask(app, alice.auth);
      const res = await request(app).patch(`/tasks/${task.id}`).set('Authorization', alice.auth).send({});
      expectError(res, 400, 'VALIDATION_ERROR');
      expect(res.body.error.details[0].message).toBe('Informe ao menos um campo para atualizar');
    });

    it('400 para título null', async () => {
      const task = await createTask(app, alice.auth);
      const res = await request(app)
        .patch(`/tasks/${task.id}`)
        .set('Authorization', alice.auth)
        .send({ title: null });
      expectError(res, 400, 'VALIDATION_ERROR');
    });

    it('400 reúne erros de params e body juntos', async () => {
      const res = await request(app)
        .patch('/tasks/abc')
        .set('Authorization', alice.auth)
        .send({ status: 'x' });
      expectError(res, 400, 'VALIDATION_ERROR');
      expect(res.body.error.details.map((d) => d.location)).toEqual(['params', 'body']);
    });

    it('404 e 403', async () => {
      const bobTask = await createTask(app, bob.auth);
      expectError(
        await request(app).patch('/tasks/9999').set('Authorization', alice.auth).send({ title: 'x' }),
        404,
        'TASK_NOT_FOUND',
      );
      expectError(
        await request(app).patch(`/tasks/${bobTask.id}`).set('Authorization', alice.auth).send({ title: 'x' }),
        403,
        'FORBIDDEN',
      );
    });
  });

  describe('DELETE /tasks/:id', () => {
    it('remove e devolve 204 sem corpo', async () => {
      const task = await createTask(app, alice.auth);
      const res = await request(app).delete(`/tasks/${task.id}`).set('Authorization', alice.auth);
      expect(res.status).toBe(204);
      expect(res.text).toBe('');

      const after = await request(app).get(`/tasks/${task.id}`).set('Authorization', alice.auth);
      expectError(after, 404, 'TASK_NOT_FOUND');
    });

    it('403 ao remover tarefa de outro usuário, sem apagá-la', async () => {
      const task = await createTask(app, bob.auth);
      const res = await request(app).delete(`/tasks/${task.id}`).set('Authorization', alice.auth);
      expectError(res, 403, 'FORBIDDEN');

      const stillThere = await request(app).get(`/tasks/${task.id}`).set('Authorization', bob.auth);
      expect(stillThere.status).toBe(200);
    });
  });
});
