const { z } = require('../lib/zod');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_PATH: z.string().min(1).default('./data/database.sqlite'),
  JWT_SECRET: z.string({ error: 'JWT_SECRET é obrigatório' }).min(32, 'JWT_SECRET deve ter pelo menos 32 caracteres'),
  JWT_EXPIRES_IN: z
    .string()
    .regex(/^\d+[smhd]$/, 'JWT_EXPIRES_IN deve seguir o formato <número><s|m|h|d>, ex: 1h')
    .default('1h'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),
  CORS_ORIGIN: z.string().min(1).default('*'),
  BODY_LIMIT: z.string().min(1).default('100kb'),
  RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  // Quantos proxies (load balancers) ficam na frente da API. 0 = acesso direto.
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
});

class ConfigError extends Error {
  constructor(issues) {
    const lines = issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
    super(`Configuração inválida:\n${lines.join('\n')}`);
    this.name = 'ConfigError';
  }
}

function loadConfig(env = process.env) {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(result.error.issues);
  }

  const e = result.data;
  return {
    env: e.NODE_ENV,
    isProduction: e.NODE_ENV === 'production',
    isDevelopment: e.NODE_ENV === 'development',
    port: e.PORT,
    databasePath: e.DATABASE_PATH,
    jwt: { secret: e.JWT_SECRET, expiresIn: e.JWT_EXPIRES_IN },
    bcryptRounds: e.BCRYPT_ROUNDS,
    corsOrigin: e.CORS_ORIGIN,
    bodyLimit: e.BODY_LIMIT,
    rateLimit: {
      windowMs: e.RATE_LIMIT_WINDOW_MS,
      max: e.RATE_LIMIT_MAX,
      authMax: e.AUTH_RATE_LIMIT_MAX,
    },
    trustProxy: e.TRUST_PROXY,
  };
}

module.exports = { loadConfig, ConfigError };
