const request = require('supertest');
const { createApp } = require('../src/app');
const { createDatabase } = require('../src/db/database');
const { loadConfig } = require('../src/config/env');

const TEST_ENV = {
  NODE_ENV: 'test',
  JWT_SECRET: 'test-secret-with-at-least-32-characters!!',
  JWT_EXPIRES_IN: '1h',
  BCRYPT_ROUNDS: '4',
  RATE_LIMIT_MAX: '10000',
  AUTH_RATE_LIMIT_MAX: '10000',
};

function buildApp(envOverrides = {}) {
  const config = loadConfig({ ...TEST_ENV, ...envOverrides });
  const db = createDatabase(':memory:');
  const app = createApp({ db, config });
  return { app, db, config };
}

let userCounter = 0;

async function registerUser(app, overrides = {}) {
  userCounter += 1;
  const payload = {
    name: 'Usuário Teste',
    email: `user${userCounter}@example.com`,
    password: 'senha-segura-123',
    ...overrides,
  };
  const res = await request(app).post('/auth/register').send(payload);
  if (res.status !== 201) {
    throw new Error(`Falha ao registrar usuário de teste: ${JSON.stringify(res.body)}`);
  }
  return { ...res.body.data, password: payload.password, auth: `Bearer ${res.body.data.accessToken}` };
}

async function createTask(app, auth, overrides = {}) {
  const res = await request(app)
    .post('/tasks')
    .set('Authorization', auth)
    .send({ title: 'Tarefa', ...overrides });
  if (res.status !== 201) {
    throw new Error(`Falha ao criar tarefa de teste: ${JSON.stringify(res.body)}`);
  }
  return res.body.data;
}

/** Garante que a resposta segue o formato padrão de erro. */
function expectError(res, status, code) {
  expect(res.status).toBe(status);
  expect(res.headers['content-type']).toMatch(/application\/json/);
  expect(res.body).toEqual({
    error: {
      status,
      code,
      message: expect.any(String),
      details: expect.any(Array),
      requestId: expect.any(String),
    },
  });
}

module.exports = { TEST_ENV, buildApp, registerUser, createTask, expectError };
