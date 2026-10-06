const { badRequest } = require('../errors/AppError');

function formatIssues(issues, location) {
  // Se o tipo do campo está errado, as demais regras dele (tamanho, formato...)
  // não fazem sentido para o cliente: fica só o erro de tipo.
  const wrongType = new Set(
    issues.filter((issue) => issue.code === 'invalid_type').map((issue) => issue.path.join('.')),
  );
  const relevant = issues.filter(
    (issue) => issue.code === 'invalid_type' || !wrongType.has(issue.path.join('.')),
  );

  return relevant.flatMap((issue) => {
    const base = issue.path.join('.');
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({
        location,
        field: base ? `${base}.${key}` : key,
        message: 'Campo não permitido',
      }));
    }
    return [{ location, field: base || null, message: issue.message }];
  });
}

/**
 * Valida params, query e body com schemas Zod. Os dados já convertidos ficam em
 * req.validated. Todos os problemas de todas as partes são devolvidos de uma vez.
 */
function validate(schemas) {
  return (req, res, next) => {
    const details = [];
    req.validated = {};

    for (const location of ['params', 'query', 'body']) {
      const schema = schemas[location];
      if (!schema) continue;

      if (location === 'body' && req.body === undefined) {
        details.push({ location, field: null, message: 'Corpo da requisição é obrigatório' });
        continue;
      }
      if (location === 'body' && (typeof req.body !== 'object' || Array.isArray(req.body))) {
        details.push({ location, field: null, message: 'Corpo da requisição deve ser um objeto JSON' });
        continue;
      }

      const result = schema.safeParse(req[location]);
      if (result.success) {
        req.validated[location] = result.data;
      } else {
        details.push(...formatIssues(result.error.issues, location));
      }
    }

    if (details.length > 0) {
      return next(badRequest('VALIDATION_ERROR', 'Dados da requisição inválidos', details));
    }
    next();
  };
}

module.exports = { validate };
