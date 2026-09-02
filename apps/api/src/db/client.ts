/**
 * Database connection. A single postgres.js pool shared by repositories.
 * The client is injected into repositories so tests can pass alternatives.
 */
import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

export type Database = PostgresJsDatabase<typeof schema>;
export { schema };

export interface DbHandle {
  readonly sql: postgres.Sql;
  readonly db: Database;
}

export function createDb(databaseUrl: string): DbHandle {
  const sql = postgres(databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  const db = drizzle(sql, { schema });
  return { sql, db };
}

/**
 * Run `fn` inside a transaction; rolls back on throw. Used so that
 * apply + verify + audit execute atomically (D-026).
 */
export async function withTransaction<T>(
  handle: DbHandle,
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  return handle.db.transaction(async (tx) => fn(tx as Database));
}
