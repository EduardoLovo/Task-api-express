const { rateLimit } = require('express-rate-limit');
const { AppError } = require('../errors/AppError');

function createRateLimiter({ windowMs, limit, message }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
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
