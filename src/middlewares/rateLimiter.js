const { rateLimit } = require('express-rate-limit');
const { AppError } = require('../errors/AppError');

function createRateLimiter({ windowMs, limit, message }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    // Nome da política em segundos ("100-in-900sec"), igual ao da versão Flask. O padrão da
    // biblioteca arredonda para a maior unidade inteira ("100-in-15min").
    identifier: `${limit}-in-${Math.ceil(windowMs / 1000)}sec`,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
      const resetTime = req.rateLimit?.resetTime;
      const retryAfterMs = resetTime ? resetTime.getTime() - Date.now() : options.windowMs;
      const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
      next(
        new AppError({
          status: 429,
          code: 'TOO_MANY_REQUESTS',
          message,
          headers: { 'Retry-After': String(retryAfterSeconds) },
        }),
      );
    },
  });
}

module.exports = { createRateLimiter };
