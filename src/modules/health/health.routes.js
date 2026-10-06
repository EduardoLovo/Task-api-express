const { Router } = require('express');
const { allowMethods } = require('../../middlewares/methodNotAllowed');
const { serviceUnavailable } = require('../../errors/AppError');
const logger = require('../../lib/logger');

function createHealthRouter({ db }) {
  const router = Router();

  router
    .route('/')
    .get((req, res) => {
      try {
        db.prepare('SELECT 1').get();
      } catch (err) {
        logger.error('Health check: banco indisponível', { error: logger.serializeError(err) });
        throw serviceUnavailable('DATABASE_UNAVAILABLE', 'Banco de dados indisponível');
      }

      res.json({
        data: {
          status: 'ok',
          database: 'ok',
          uptime: Math.round(process.uptime()),
          timestamp: new Date().toISOString(),
        },
      });
    })
    .all(allowMethods('GET'));

  return router;
}

module.exports = { createHealthRouter };
