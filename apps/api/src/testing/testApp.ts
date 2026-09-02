/**
 * Integration test harness: real PostgreSQL (kestrel_test), real HTTP
 * (fastify inject), migrated + seeded per suite.
 */
import { afterAll, beforeAll } from 'vitest';
import { buildApp, type AppHandle } from '../app.js';
import { resetToGoldenDemo } from '../seed/goldenDemo.js';

export const TEST_DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? 'postgresql://altongunawanpurwanto@localhost:5432/kestrel_test';

export interface TestApp {
  handle: AppHandle;
  /** Injected request helper. */
  inject: AppHandle['app']['inject'];
}

export async function createTestApp(): Promise<TestApp> {
  await resetToGoldenDemo(TEST_DATABASE_URL);
  const handle = await buildApp({
    dbHandle: undefined,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      API_HOST: '127.0.0.1',
      API_PORT: 0,
      CORS_ORIGINS: 'http://localhost:5173',
      SESSION_SECRET: 'test-secret-not-a-real-credential-0123456789',
      NODE_ENV: 'test',
      DEMO_USER_ID: 'usr_alex',
      AUTO_SEED: false,
      ENABLE_DEMO_ROUTES: true,
      LOG_LEVEL: 'error',
    },
  });
  return { handle, inject: handle.app.inject.bind(handle.app) };
}

export async function closeTestApp(app: TestApp): Promise<void> {
  await app.handle.close();
}

/** Convenience: demo session cookie for a user. */
export async function loginAs(app: TestApp, userId = 'usr_alex'): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/session',
    payload: { userId },
  });
  if (res.statusCode !== 200) {
    throw new Error(`login failed: ${res.statusCode} ${res.body}`);
  }
  const setCookie = res.headers['set-cookie'];
  const cookieValue = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return (cookieValue as string).split(';')[0] ?? '';
}

export interface AuthedHeaders {
  [key: string]: string;
  cookie: string;
  'x-request-id': string;
  'content-type': string;
}

export function authedHeaders(cookie: string, channel: 'ui' | 'webmcp' = 'ui'): AuthedHeaders {
  return {
    cookie,
    'x-request-id': `req-${Math.random().toString(16).slice(2)}`,
    'content-type': 'application/json',
    'x-kestrel-channel': channel,
  };
}

export const SEED = {
  alex: 'usr_alex',
  sarah: 'usr_sarah',
  daniel: 'usr_daniel',
  parAlex: 'par_alex',
  parSarah: 'par_sarah',
  parDaniel: 'par_daniel',
  launch: 'prj_launch',
  prevSync: 'mtg_prev_sync4',
  tuesdayStandup: 'mtg_tue_standup',
  wednesdayIncident: 'mtg_wed_incident',
  fridayCheckin: 'mtg_fri_checkin',
  paymentBlocker: 'act_payment_blocker',
  dataMigration: 'act_data_migration',
} as const;

export { beforeAll, afterAll };
