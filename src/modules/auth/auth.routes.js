const { Router } = require('express');
const { validate } = require('../../middlewares/validate');
const { allowMethods } = require('../../middlewares/methodNotAllowed');
const { registerSchema, loginSchema } = require('./auth.schemas');
const { createAuthController } = require('./auth.controller');

function createAuthRouter({ authService, authenticate, authLimiter }) {
  const router = Router();
  const controller = createAuthController(authService);

  router
    .route('/register')
    .post(authLimiter, validate({ body: registerSchema }), controller.register)
    .all(allowMethods('POST'));

  router
    .route('/login')
    .post(authLimiter, validate({ body: loginSchema }), controller.login)
    .all(allowMethods('POST'));

  router.route('/me').get(authenticate, controller.me).all(allowMethods('GET'));

  return router;
}

module.exports = { createAuthRouter };
