const { AppError } = require('../errors/AppError');

const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH']);

function hasBody(req) {
  if (req.headers['transfer-encoding'] !== undefined) return true;
  const length = req.headers['content-length'];
  return length !== undefined && length !== '0';
}

// Rejeita corpo em formato diferente de JSON antes de tentar interpretá-lo.
function requireJson(req, res, next) {
  if (METHODS_WITH_BODY.has(req.method) && hasBody(req) && !req.is('application/json')) {
    return next(
      new AppError({
        status: 415,
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Content-Type deve ser application/json',
      }),
    );
  }
  next();
}

module.exports = { requireJson };
