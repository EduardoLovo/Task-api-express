const request = require('supertest');
const { buildApp, TEST_ENV } = require('./helpers');
const { loadConfig } = require('../src/config/env');
const { parseCorsOrigin } = require('../src/config/cors');

const FRONT = 'https://task-app.vercel.app';
const PREVIEWS = 'https://task-app-*-eduardo.vercel.app';

function preflight(app, origin) {
  return request(app)
    .options('/tasks')
    .set('Origin', origin)
    .set('Access-Control-Request-Method', 'POST')
    .set('Access-Control-Request-Headers', 'authorization,content-type');
}

describe('CORS', () => {
  it('com "*" (padrão), libera qualquer origem', async () => {
    const { app } = buildApp();
    const res = await preflight(app, 'https://qualquer.site');
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  describe('com lista de origens', () => {
    const { app } = buildApp({ CORS_ORIGIN: `${FRONT}, ${PREVIEWS}` });

    it.each([
      ['origem exata', FRONT],
      ['preview que casa o curinga', 'https://task-app-git-feat-x-eduardo.vercel.app'],
      ['outro preview', 'https://task-app-a1b2c3-eduardo.vercel.app'],
    ])('libera %s, devolvendo a própria origem', async (_, origin) => {
      const res = await preflight(app, origin);
      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe(origin);
      expect(res.headers['access-control-expose-headers']).toBe(
        'X-Request-Id,Location,RateLimit,RateLimit-Policy,Retry-After',
      );
      // A resposta muda conforme a origem: caches intermediários precisam saber disso.
      expect(res.headers.vary).toMatch(/Origin/);
    });

    it.each([
      ['domínio fora da lista', 'https://outro-site.com'],
      ['origem exata com outro protocolo', 'http://task-app.vercel.app'],
      ['curinga tentando atravessar um ponto', 'https://task-app-x.atacante-eduardo.vercel.app'],
      ['sufixo diferente', 'https://task-app-x-eduardo.vercel.app.atacante.com'],
    ])('não libera %s', async (_, origin) => {
      const res = await preflight(app, origin);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('requisições comuns também recebem o cabeçalho', async () => {
      const res = await request(app).get('/health').set('Origin', FRONT);
      expect(res.headers['access-control-allow-origin']).toBe(FRONT);
    });
  });
});

describe('parseCorsOrigin', () => {
  it('ignora espaços, itens vazios e maiúsculas', () => {
    expect(parseCorsOrigin(' https://A.com ,, http://localhost:4200 ')).toEqual({
      origins: ['https://a.com', 'http://localhost:4200'],
    });
  });

  it('converte o curinga numa expressão que não casa pontos', () => {
    const [pattern] = parseCorsOrigin('https://app-*.vercel.app').origins;
    expect(pattern).toBeInstanceOf(RegExp);
    expect(pattern.test('https://app-abc-123.vercel.app')).toBe(true);
    expect(pattern.test('https://app-a.b.vercel.app')).toBe(false);
    expect(pattern.test('https://app-.vercel.app')).toBe(false);
  });

  it.each([
    ['barra no final', 'https://app.com/', /origem inválida "https:\/\/app.com\/"/],
    ['caminho', 'https://app.com/front', /origem inválida/],
    ['sem protocolo', 'app.com', /origem inválida/],
    ['"*" junto de outras origens', '*, https://app.com', /deve vir sozinho/],
    ['lista vazia', ' , ', /ao menos uma origem/],
  ])('recusa %s ao subir a API', (_, value, message) => {
    expect(() => loadConfig({ ...TEST_ENV, CORS_ORIGIN: value })).toThrow(message);
    expect(() => loadConfig({ ...TEST_ENV, CORS_ORIGIN: value })).toThrow(/CORS_ORIGIN/);
  });
});
