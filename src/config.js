import { z } from 'zod';

const baseConfigSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const squareConfigSchema = z.object({
  SQUARE_ENV: z.string().min(1),
  SQUARE_APP_ID: z.string().min(1),
  SQUARE_APP_SECRET: z.string().min(1),
  SQUARE_OAUTH_REDIRECT_URL: z.string().url(),
  SQUARE_OAUTH_SCOPES: z.string().min(1),
});

/**
 * In tests, we allow missing env vars because many tests don't need DB/Redis.
 * In dev/prod, we validate strictly and throw on any missing/invalid values.
 */
export function loadConfig() {
  const nodeEnv = process.env.NODE_ENV ?? 'development';

  // ✅ Test mode: return best-effort config without hard failing on import
  if (nodeEnv === 'test') {
    return {
      PORT: Number(process.env.PORT ?? 3000),
      DATABASE_URL: process.env.DATABASE_URL ?? '',
      REDIS_URL: process.env.REDIS_URL ?? '',
      NODE_ENV: 'test',
      // Square vars optional in test mode (empty strings are fine)
      SQUARE_ENV: process.env.SQUARE_ENV ?? '',
      SQUARE_APP_ID: process.env.SQUARE_APP_ID ?? '',
      SQUARE_APP_SECRET: process.env.SQUARE_APP_SECRET ?? '',
      SQUARE_OAUTH_REDIRECT_URL: process.env.SQUARE_OAUTH_REDIRECT_URL ?? '',
      SQUARE_OAUTH_SCOPES: process.env.SQUARE_OAUTH_SCOPES ?? '',
    };
  }

  // ✅ Dev/prod: strict validation for base config
  const baseParsed = baseConfigSchema.safeParse(process.env);
  if (!baseParsed.success) {
    console.error('Configuration validation failed:');
    baseParsed.error.errors.forEach((err) => {
      console.error(`  ${err.path.join('.')}: ${err.message}`);
    });
    throw new Error('Invalid environment configuration');
  }

  // ✅ Dev/prod: strict validation for Square config
  const squareParsed = squareConfigSchema.safeParse(process.env);
  if (!squareParsed.success) {
    console.error('Square configuration validation failed:');
    squareParsed.error.errors.forEach((err) => {
      console.error(`  ${err.path.join('.')}: ${err.message}`);
    });
    throw new Error('Invalid Square environment configuration');
  }

  return {
    ...baseParsed.data,
    ...squareParsed.data,
  };
}