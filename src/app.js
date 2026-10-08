const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');

const { requestId } = require('./middlewares/requestId');
const { accessLog } = require('./middlewares/accessLog');
const { requireJson } = require('./middlewares/requireJson');
const { createRateLimiter } = require('./middlewares/rateLimiter');
const { createAuthenticate } = require('./middlewares/authenticate');
const { allowMethods } = require('./middlewares/methodNotAllowed');
const { notFoundHandler } = require('./middlewares/notFound');
const { createErrorHandler } = require('./middlewares/errorHandler');

const { createUserRepository } = require('./modules/users/user.repository');
const { createTaskRepository } = require('./modules/tasks/task.repository');
const { createAuthService } = require('./modules/auth/auth.service');
const { createTaskService } = require('./modules/tasks/task.service');
const { createAuthRouter } = require('./modules/auth/auth.routes');
const { createTaskRouter } = require('./modules/tasks/task.routes');
const { createHealthRouter } = require('./modules/health/health.routes');
const { openapi } = require('./docs/openapi');
const { badRequest } = require('./errors/AppError');
const { MAX_JSON_DEPTH, exceedsJsonDepth } = require('./lib/jsonDepth');

// Cabeçalhos que o JavaScript do navegador pode ler numa resposta de outra origem.
const EXPOSED_HEADERS = ['X-Request-Id', 'Location', 'RateLimit', 'RateLimit-Policy', 'Retry-After'];

function createApp({ db, config }) {
  const userRepository = createUserRepository(db);
  const taskRepository = createTaskRepository(db);
  const authService = createAuthService({ userRepository, config });
  const taskService = createTaskService({ taskRepository });
  const authenticate = createAuthenticate(authService);

  const app = express();
  app.disable('x-powered-by');
  // Atrás de um proxy (ex.: Render), o IP real do cliente vem no X-Forwarded-For.
  // Confiar no número exato de proxies: um a mais deixaria o cliente forjar o
  // próprio IP e escapar do rate limit.
  app.set('trust proxy', config.trustProxy);

  app.use(requestId);
  app.use(accessLog);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins, exposedHeaders: EXPOSED_HEADERS }));
  app.use(
    createRateLimiter({
      windowMs: config.rateLimit.windowMs,
      limit: config.rateLimit.max,
      message: 'Muitas requisições, tente novamente mais tarde',
    }),
  );
  app.use(requireJson);
  app.use(
    express.json({
      limit: config.bodyLimit,
      // Roda sobre os bytes (já descompactados) antes do JSON.parse.
      verify: (req, res, buffer) => {
        if (exceedsJsonDepth(buffer)) {
          throw badRequest('INVALID_JSON', `JSON com aninhamento excessivo (máximo de ${MAX_JSON_DEPTH} níveis)`);
        }
      },
    }),
  );

  app.use('/health', createHealthRouter({ db }));

  app
    .route('/openapi.json')
    .get((req, res) => res.json(openapi))
    .all(allowMethods('GET'));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));

  const authLimiter = createRateLimiter({
    windowMs: config.rateLimit.windowMs,
    limit: config.rateLimit.authMax,
    message: 'Muitas tentativas de autenticação, tente novamente mais tarde',
  });
  app.use('/auth', createAuthRouter({ authService, authenticate, authLimiter }));
  app.use('/tasks', createTaskRouter({ taskService, authenticate }));

  app.use(notFoundHandler);
  app.use(createErrorHandler(config));

  return app;
}

module.exports = { createApp };
