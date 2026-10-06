// Logger mínimo em JSON (uma linha por evento). Silencioso durante os testes.
function write(level, message, meta = {}) {
  if (process.env.NODE_ENV === 'test') return;

  const entry = { level, time: new Date().toISOString(), message, ...meta };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else console.log(line);
}

function serializeError(err) {
  if (!(err instanceof Error)) return { value: String(err) };
  return { name: err.name, message: err.message, stack: err.stack };
}

module.exports = {
  info: (message, meta) => write('info', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta),
  serializeError,
};
