const { unauthorized } = require('../errors/AppError');

function createAuthenticate(authService) {
  return function authenticate(req, res, next) {
    const header = req.get('Authorization');
    if (!header) {
      return next(unauthorized('MISSING_TOKEN', 'Token de autenticação não informado'));
    }

    const [scheme, token, ...rest] = header.trim().split(/\s+/);
    if (!/^Bearer$/i.test(scheme) || !token || rest.length > 0) {
      return next(unauthorized('INVALID_AUTH_HEADER', 'Cabeçalho Authorization deve ter o formato: Bearer <token>'));
    }

    req.user = authService.authenticate(token);
    next();
  };
}

module.exports = { createAuthenticate };
