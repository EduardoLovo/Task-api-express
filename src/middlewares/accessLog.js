const logger = require('../lib/logger');

// Uma linha de log por requisição, quando a resposta termina. O /health com
// sucesso fica de fora: a plataforma de hospedagem o chama a cada poucos segundos.
function accessLog(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    // originalUrl sem a query: req.path muda dentro dos routers montados (/tasks → /).
    const path = req.originalUrl.split('?')[0];
    if (path === '/health' && res.statusCode < 400) return;

    logger.info('Requisição', {
      requestId: req.id,
      method: req.method,
      path,
      status: res.statusCode,
      durationMs: Number((process.hrtime.bigint() - start) / 1_000_000n),
      // Com TRUST_PROXY configurado, é o IP real do cliente (e não o do proxy).
      ip: req.ip,
    });
  });

  next();
}

module.exports = { accessLog };
