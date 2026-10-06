// Limite de aninhamento do JSON, checado nos bytes ANTES de interpretar o corpo.
const MAX_JSON_DEPTH = 32;

const QUOTE = 0x22; // "
const BACKSLASH = 0x5c; // \
const OPEN = new Set([0x5b, 0x7b]); // [ {
const CLOSE = new Set([0x5d, 0x7d]); // ] }

/**
 * true se o JSON abre mais de `limit` níveis de [ ou { (fora de strings).
 * O JSON.parse do Node aceita dezenas de milhares de níveis; o limite deixa o
 * comportamento previsível e igual ao da versão Flask. Funciona direto nos
 * bytes UTF-8: os caracteres procurados são ASCII e nunca aparecem dentro de
 * caracteres multibyte.
 */
function exceedsJsonDepth(buffer, limit = MAX_JSON_DEPTH) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (const byte of buffer) {
    if (inString) {
      if (escaped) escaped = false;
      else if (byte === BACKSLASH) escaped = true;
      else if (byte === QUOTE) inString = false;
    } else if (byte === QUOTE) {
      inString = true;
    } else if (OPEN.has(byte)) {
      depth += 1;
      if (depth > limit) return true;
    } else if (CLOSE.has(byte)) {
      depth -= 1;
    }
  }
  return false;
}

module.exports = { MAX_JSON_DEPTH, exceedsJsonDepth };
