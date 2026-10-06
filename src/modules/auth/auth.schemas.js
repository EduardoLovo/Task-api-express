const { z } = require('../../lib/zod');

const MAX_PASSWORD_BYTES = 72;

const email = z
  .string({ error: (iss) => (iss.input === undefined ? 'E-mail é obrigatório' : 'E-mail deve ser um texto') })
  .trim()
  .toLowerCase()
  .max(254, 'E-mail deve ter no máximo 254 caracteres')
  .pipe(z.email({ error: 'E-mail inválido' }));

const registerSchema = z.strictObject({
  name: z
    .string({ error: (iss) => (iss.input === undefined ? 'Nome é obrigatório' : 'Nome deve ser um texto') })
    .trim()
    .min(2, 'Nome deve ter pelo menos 2 caracteres')
    .max(100, 'Nome deve ter no máximo 100 caracteres'),
  email,
  // bcrypt só considera os primeiros 72 bytes da senha (acentos ocupam 2 bytes em UTF-8).
  password: z
    .string({ error: (iss) => (iss.input === undefined ? 'Senha é obrigatória' : 'Senha deve ser um texto') })
    .min(8, 'Senha deve ter pelo menos 8 caracteres')
    .refine(
      (value) => Buffer.byteLength(value, 'utf8') <= MAX_PASSWORD_BYTES,
      `Senha deve ter no máximo ${MAX_PASSWORD_BYTES} bytes`,
    ),
});

const loginSchema = z.strictObject({
  email,
  password: z
    .string({ error: (iss) => (iss.input === undefined ? 'Senha é obrigatória' : 'Senha deve ser um texto') })
    .min(1, 'Senha é obrigatória'),
});

module.exports = { registerSchema, loginSchema, MAX_PASSWORD_BYTES };
