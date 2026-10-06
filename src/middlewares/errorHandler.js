const { AppError } = require('../errors/AppError');
const logger = require('../lib/logger');

// Erros lançados pelo express.json() (body-parser), identificados por err.type.
const BODY_PARSER_ERRORS = {
  'entity.parse.failed': { status: 400, code: 'INVALID_JSON', message: 'JSON malformado no corpo da requisição' },
  'entity.too.large': { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Corpo da requisição excede o tamanho máximo permitido' },
  'encoding.unsupported': { status: 415, code: 'UNSUPPORTED_ENCODING', message: 'Content-Encoding não suportado' },
  'charset.unsupported': { status: 415, code: 'UNSUPPORTED_CHARSET', message: 'Charset não suportado, use utf-8' },
  'request.aborted': { status: 400, code: 'REQUEST_ABORTED', message: 'Requisição interrompida pelo cliente' },
  'request.size.invalid': { status: 400, code: 'INVALID_CONTENT_LENGTH', message: 'Content-Length não corresponde ao corpo enviado' },
};

const STATUS_CODES = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  408: 'REQUEST_TIMEOUT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'TOO_MANY_REQUESTS',
};

function internalError() {
  return new AppError({ status: 500, code: 'INTERNAL_ERROR', message: 'Erro interno do servidor' });
}

/** Converte qualquer coisa lançada (Error, string, objeto) em AppError. */
function normalizeError(err) {
  if (err instanceof AppError) return err;

  if (err && typeof err === 'object' && BODY_PARSER_ERRORS[err.type]) {
    return new AppError(BODY_PARSER_ERRORS[err.type]);
  }

  // Erros HTTP 4xx de outras libs (http-errors) que são seguros para expor.
  const status = err?.status ?? err?.statusCode;
  if (Number.isInteger(status) && status >= 400 && status < 500 && err.expose !== false) {
    return new AppError({
      status,
      code: STATUS_CODES[status] ?? 'CLIENT_ERROR',
      message: typeof err.message === 'string' && err.message ? err.message : 'Requisição inválida',
    });
  }

  return internalError();
}

function createErrorHandler(config) {
  // O Express só reconhece um error handler pela assinatura com 4 parâmetros.
  return function errorHandler(err, req, res, next) {
    const appError = normalizeError(err);

    if (appError.status >= 500) {
      logger.error('Erro não tratado', {
        requestId: req.id,
        method: req.method,
        path: req.originalUrl,
        error: logger.serializeError(err),
      });
    }

    // Se a resposta já começou a ser enviada, não há como trocar o status:
    // só resta encerrar a conexão.
    if (res.headersSent) {
      req.socket?.destroy();
      return;
    }

    const body = {
      error: {
        status: appError.status,
        code: appError.code,
        message: appError.message,
        details: appError.details,
        requestId: req.id,
      },
    };

    // Em desenvolvimento, ajuda a depurar. Nunca em produção.
    if (config.isDevelopment && appError.status >= 500 && err instanceof Error) {
      body.error.debug = { message: err.message, stack: err.stack };
    }

    res.set(appError.headers).status(appError.status).json(body);
  };
}

module.exports = { createErrorHandler, normalizeError };
