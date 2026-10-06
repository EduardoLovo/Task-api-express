const z = require('zod');

// Mensagens padrão de validação em português.
z.config(z.locales.pt());

module.exports = { z };
