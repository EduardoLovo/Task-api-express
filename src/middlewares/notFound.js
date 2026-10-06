const { notFound } = require('../errors/AppError');

function notFoundHandler(req, res, next) {
  next(notFound('ROUTE_NOT_FOUND', `Rota ${req.method} ${req.path} não encontrada`));
}

module.exports = { notFoundHandler };
