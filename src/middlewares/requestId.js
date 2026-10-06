const { randomUUID } = require('node:crypto');

const VALID_ID = /^[\w-]{1,100}$/;

// Reaproveita o X-Request-Id do cliente/proxy quando seguro, senão gera um novo.
function requestId(req, res, next) {
  const incoming = req.get('X-Request-Id');
  req.id = incoming && VALID_ID.test(incoming) ? incoming : randomUUID();
  res.set('X-Request-Id', req.id);
  next();
}

module.exports = { requestId };
