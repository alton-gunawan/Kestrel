/**
 * Fastify application factory. Wires plugins, hooks, error mapping, and
 * routes. No business rules here — routes validate, authorize, delegate to
 * services, and serialize (docs/03 "API principles").
 */
import Fastify, { type FastifyInstance } from 'fastify';
import type { FastifyError } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { randomUUID } from 'node:crypto';
import { AppError, HTTP_STATUS_BY_CODE, isErrorCode } from '@kestrel/contracts';
import { loadEnv, corsOriginAllowlist, type Env } from './config/env.js';
import { createDb, type DbHandle } from './db/client.js';
import { createRepos } from './repositories/drizzle.js';
import type { Repos } from './repositories/types.js';
import { registerRoutes } from './routes/index.js';
import { registerIntegrationRoutes } from './routes/integrations.js';

export interface AppOptions {
  readonly env?: Env;
  readonly dbHandle?: DbHandle;
  readonly logger?: boolean;
}

export interface AppHandle {
  readonly app: FastifyInstance;
  readonly env: Env;
  readonly db: DbHandle;
  readonly repos: Repos;
  close(): Promise<void>;
}

export async function buildApp(options: AppOptions = {}): Promise<AppHandle> {
  const env = options.env ?? loadEnv();
  const db = options.dbHandle ?? createDb(env.DATABASE_URL);
  const repos = createRepos(db.db);

  const app = Fastify({
    logger: options.logger ?? {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === 'development'
        ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } }
        : {}),
    },
    trustProxy: true,
    bodyLimit: 512 * 1024,
  });

  await app.register(cookie);

  await app.register(helmet, {
    contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  await app.register(cors, {
    origin: corsOriginAllowlist(env),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    ...(env.NODE_ENV === 'test' ? { max: 10_000 } : {}),
  });

  // Request ID + timing: every response carries x-request-id (DOM-14).
  app.addHook('onRequest', async (request, reply) => {
    const requestId = (request.headers['x-request-id'] as string | undefined) ?? randomUUID();
    request.id = requestId;
    reply.header('x-request-id', requestId);
  });

  // Safe error mapping: AppError -> stable code + HTTP status; ZodError ->
  // VALIDATION_ERROR; everything else is a redacted 500 (release checklist:
  // error-message redaction).
  app.setErrorHandler((error: FastifyError & { validation?: unknown[] }, request, reply) => {
    // Zod schema errors (routes use .parse on untrusted input).
    const issues = (error as unknown as { issues?: unknown[] }).issues;
    if (error && typeof error === 'object' && error.name === 'ZodError' && Array.isArray(issues)) {
      reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: { issues: issues.slice(0, 10) },
        },
        requestId: request.id,
      });
      return;
    }
    if (error instanceof AppError) {
      const status = HTTP_STATUS_BY_CODE[error.code] ?? 500;
      reply.status(status).send({
        error: error.toJSON(),
        requestId: request.id,
      });
      return;
    }
    // Fastify validation errors -> VALIDATION_ERROR
    if (error.validation) {
      reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: { issues: error.validation.slice(0, 10) },
        },
        requestId: request.id,
      });
      return;
    }
    if (error.statusCode === 429) {
      reply.status(429).send({
        error: { code: 'RATE_LIMITED', message: 'Too many requests; slow down' },
        requestId: request.id,
      });
      return;
    }
    const statusCode = error.statusCode && error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 500;
    const code = statusCode === 404 ? 'NOT_FOUND' : statusCode === 503 ? 'UNAVAILABLE' : isErrorCode('INTERNAL') ? 'INTERNAL' : 'INTERNAL';
    request.log.error(
      { err: error, path: request.url },
      'unhandled error',
    );
    reply.status(statusCode).send({
      error: {
        code,
        message:
          statusCode >= 500
            ? 'Internal error. The request was not completed.'
            : error.message,
      },
      requestId: request.id,
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: { code: 'NOT_FOUND', message: `No route for ${request.method} ${request.url}` },
      requestId: request.id,
    });
  });

  registerRoutes(app, { env, repos, db });
  registerIntegrationRoutes(app, { repos, db });

  await app.ready();

  const close = async (): Promise<void> => {
    await app.close();
    await db.sql.end({ timeout: 5 });
  };

  return { app, env, db, repos, close };
}
