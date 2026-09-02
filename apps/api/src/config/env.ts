/**
 * Environment validation (Phase 9): every runtime input is validated at boot.
 * The process refuses to start with an invalid environment rather than
 * guessing defaults outside documented local-development behavior.
 */
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  SESSION_SECRET: z.string().min(16),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DEMO_USER_ID: z.string().min(1).default('usr_alex'),
  AUTO_SEED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  ENABLE_DEMO_ROUTES: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

const KNOWN_ENV_KEYS = envSchema.keyof().options;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // Select only known keys: process.env always carries unrelated platform
  // variables, which must not fail validation. Unknown *known-key-like*
  // input is still rejected by the strict per-key schemas.
  const subset: Record<string, string | undefined> = {};
  for (const key of KNOWN_ENV_KEYS) {
    if (source[key] !== undefined) subset[key] = source[key];
  }
  const parsed = envSchema.safeParse(subset);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}

export function corsOriginAllowlist(env: Env): string[] {
  return env.CORS_ORIGINS.split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter((o) => o.length > 0);
}
