const { methodNotAllowed } = require('../errors/AppError');

// Usado com router.route(path).all(...) depois dos métodos suportados.
function allowMethods(...allowed) {
  return (req, res, next) => next(methodNotAllowed(req.method, allowed));
}

module.exports = { allowMethods };
