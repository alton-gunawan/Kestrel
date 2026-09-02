/**
 * API entrypoint: env validation, optional auto-seed, listen, graceful
 * shutdown (Phase 9 hardening).
 */
import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';
import { runSeed } from './seed/goldenDemo.js';
import { createDb } from './db/client.js';

async function main(): Promise<void> {
  const env = loadEnv();

  if (env.AUTO_SEED) {
    const handle = createDb(env.DATABASE_URL);
    try {
      await runSeed(env.DATABASE_URL, { reset: false });
      handle.sql.end({ timeout: 1 });
      console.log('[api] auto-seed checked (seeded when empty)');
    } catch (err) {
      handle.sql.end({ timeout: 1 });
      console.error('[api] auto-seed failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  }

  const handle = await buildApp({ env });

  await handle.app.listen({ port: env.API_PORT, host: env.API_HOST });
  console.log(`[api] MeetingOps API listening on http://${env.API_HOST}:${env.API_PORT}`);

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[api] ${signal} received; shutting down gracefully`);
    try {
      await handle.close();
      console.log('[api] closed');
      process.exit(0);
    } catch (err) {
      console.error('[api] shutdown error:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  console.error('[api] fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
