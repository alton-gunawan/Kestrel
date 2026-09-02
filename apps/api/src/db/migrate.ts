/**
 * Migration runner: applies pending Drizzle migrations from ./drizzle.
 * Uses the MigrationSession API so the same code path works for local dev,
 * CI (ephemeral test DBs), and production (Neon).
 */
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb } from './client.js';

export async function runMigrations(databaseUrl: string): Promise<number> {
  const handle = createDb(databaseUrl);
  try {
    await migrate(handle.db, { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname });
    return 0;
  } finally {
    await handle.sql.end({ timeout: 5 });
  }
}

const isDirectRun = process.argv[1]?.endsWith('migrate.ts');
if (isDirectRun) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  runMigrations(url)
    .then(() => {
      console.log('Migrations applied.');
      process.exit(0);
    })
    .catch((err: unknown) => {
      console.error('Migration failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
