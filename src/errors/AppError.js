/**
 * Erro de domínio/HTTP esperado. Tudo que chega ao errorHandler é convertido
 * para este formato antes de virar resposta.
 */
class AppError extends Error {
  constructor({ status, code, message, details = [], headers = {} }) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.headers = headers;
  }
}

const badRequest = (code, message, details) => new AppError({ status: 400, code, message, details });

const unauthorized = (code, message) =>
  new AppError({ status: 401, code, message, headers: { 'WWW-Authenticate': 'Bearer' } });

const forbidden = (code, message) => new AppError({ status: 403, code, message });

const notFound = (code, message) => new AppError({ status: 404, code, message });

const methodNotAllowed = (method, allowed) =>
  new AppError({
    status: 405,
    code: 'METHOD_NOT_ALLOWED',
    message: `Método ${method} não permitido para este recurso`,
    details: [{ allowed }],
    headers: { Allow: allowed.join(', ') },
  });

const conflict = (code, message) => new AppError({ status: 409, code, message });

const serviceUnavailable = (code, message) => new AppError({ status: 503, code, message });

module.exports = {
  AppError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  methodNotAllowed,
  conflict,
  serviceUnavailable,
};
