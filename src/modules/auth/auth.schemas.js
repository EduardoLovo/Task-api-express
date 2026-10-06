const { z } = require('../../lib/zod');

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
  // bcrypt só considera os primeiros 72 bytes da senha.
  password: z
    .string({ error: (iss) => (iss.input === undefined ? 'Senha é obrigatória' : 'Senha deve ser um texto') })
    .min(8, 'Senha deve ter pelo menos 8 caracteres')
    .max(72, 'Senha deve ter no máximo 72 caracteres'),
});

const loginSchema = z.strictObject({
  email,
  password: z
    .string({ error: (iss) => (iss.input === undefined ? 'Senha é obrigatória' : 'Senha deve ser um texto') })
    .min(1, 'Senha é obrigatória'),
});

module.exports = { registerSchema, loginSchema };
