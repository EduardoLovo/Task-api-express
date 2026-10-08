// CORS_ORIGIN aceita "*" (qualquer origem) ou uma lista separada por vírgulas. Cada item é uma origem
// exata (https://app.exemplo.com) ou tem "*" no lugar de um trecho do nome do host
// (https://app-*.vercel.app), útil para URLs de preview. O "*" casa letras, números e hífens, mas
// nunca um ponto: https://app-*.vercel.app não aceita https://app-x.dominio-de-outro.vercel.app.
// A mesma regra vale na versão Flask (app/cors.py).

const ORIGIN_RE = /^https?:\/\/[a-z0-9*.-]+(:\d{1,5})?$/;
const WILDCARD = '[a-z0-9-]+';

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Converte um item com "*" numa expressão regular ancorada. */
function wildcardToRegExp(origin) {
  const pattern = origin.split('*').map(escapeRegExp).join(WILDCARD);
  return new RegExp(`^${pattern}$`);
}

/**
 * Lê o valor de CORS_ORIGIN. Devolve `{ origins }` ("*" ou lista de strings e RegExps, no formato
 * aceito pelo pacote cors) ou `{ problems }` com o motivo de cada item inválido.
 */
function parseCorsOrigin(value) {
  const items = value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (items.length === 0) return { problems: ['informe "*" ou ao menos uma origem'] };
  if (items.includes('*')) {
    return items.length === 1 ? { origins: '*' } : { problems: ['"*" libera qualquer origem e deve vir sozinho'] };
  }

  const problems = items
    .filter((item) => !ORIGIN_RE.test(item))
    .map((item) => `origem inválida "${item}": use o formato https://dominio.com, sem caminho nem barra no final`);
  if (problems.length > 0) return { problems };

  return { origins: items.map((item) => (item.includes('*') ? wildcardToRegExp(item) : item)) };
}

module.exports = { parseCorsOrigin };
