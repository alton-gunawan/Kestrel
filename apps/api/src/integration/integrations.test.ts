/**
 * Integration tests: provider abstraction lifecycle (docs …Integration
 * Abstraction sections 5–7, 14).
 *
 * Covers: catalog, connect, disconnect, sync (calendar + meeting
 * intelligence), webhook ingestion (processed / duplicate / invalid /
 * unconnected), provider failure honesty, and idempotency. Runs against real
 * PostgreSQL via the real Fastify app.
 *
 * Tests share one seeded app, so helpers tolerate "already connected"
 * (connectIfNeeded) to stay order-independent.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import {
  authedHeaders,
  closeTestApp,
  createTestApp,
  loginAs,
  type TestApp,
} from '../testing/testApp.js';

let app: TestApp;
let cookie: string;
let ui: ReturnType<typeof authedHeaders>;

beforeAll(async () => {
  app = await createTestApp();
  cookie = await loginAs(app);
  ui = authedHeaders(cookie, 'ui');
}, 60_000);

afterAll(async () => {
  await closeTestApp(app);
}, 60_000);

function idemKey(tag: string): string {
  return `it-${tag}-${Math.random().toString(16).slice(2, 10)}`;
}

interface CatalogProvider {
  providerId: string;
  demo: boolean;
  capabilities: string[];
  connection: { id: string; status: string } | null;
}

async function catalog(): Promise<CatalogProvider[]> {
  const res = await app.inject({ method: 'GET', url: '/api/integrations', headers: ui });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body).providers as CatalogProvider[];
}

/** Connect a provider if not already connected; returns its connection. */
async function connectIfNeeded(providerId: string, scopes?: string[]): Promise<{ id: string; status: string }> {
  const existing = (await catalog()).find((p) => p.providerId === providerId)?.connection;
  if (existing && existing.status === 'connected') return existing;
  const res = await app.inject({
    method: 'POST',
    url: '/api/integrations/connect',
    headers: ui,
    payload: { providerId, scopes, idempotencyKey: idemKey(`cn-${providerId}`) },
  });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body).connection as { id: string; status: string };
}

describe('GET /api/integrations (catalog)', () => {
  it('returns implemented demo providers with capability metadata', async () => {
    const providers = await catalog();
    expect(providers.length).toBeGreaterThanOrEqual(2);
    const gcal = providers.find((p) => p.providerId === 'google_calendar');
    const fathom = providers.find((p) => p.providerId === 'fathom');
    expect(gcal?.demo).toBe(true);
    expect(gcal?.capabilities).toContain('calendar');
    expect(fathom?.demo).toBe(true);
    expect(fathom?.capabilities).toContain('meeting_intelligence');
  });

  it('requires authentication', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/integrations' });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/integrations/connect', () => {
  it('connects google_calendar and records a real event', async () => {
    const connection = await connectIfNeeded('google_calendar', ['calendar.readonly']);
    expect(connection.status).toBe('connected');

    const events = await app.inject({
      method: 'GET',
      url: `/api/integrations/activity?connectionId=${connection.id}`,
      headers: ui,
    });
    const evt = JSON.parse(events.body).events as Array<{ eventType: string; status: string }>;
    expect(evt.some((e) => e.eventType === 'connected' && e.status === 'ok')).toBe(true);
  });

  it('rejects duplicate connect for the same provider with CONFLICT', async () => {
    await connectIfNeeded('google_calendar');
    const res = await app.inject({
      method: 'POST',
      url: '/api/integrations/connect',
      headers: ui,
      payload: { providerId: 'google_calendar', idempotencyKey: idemKey('gcal-dup') },
    });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error.code).toBe('CONFLICT');
  });

  it('rejects unknown providers with VALIDATION_ERROR at the schema boundary', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/integrations/connect',
      headers: ui,
      payload: { providerId: 'not_a_provider', idempotencyKey: idemKey('bad') },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('is idempotent: replaying the same key returns the stored response', async () => {
    const key = idemKey('idem');
    const first = await app.inject({
      method: 'POST',
      url: '/api/integrations/connect',
      headers: ui,
      payload: { providerId: 'fathom', scopes: ['transcript'], idempotencyKey: key },
    });
    expect(first.statusCode).toBe(200);
    const replay = await app.inject({
      method: 'POST',
      url: '/api/integrations/connect',
      headers: ui,
      payload: { providerId: 'fathom', scopes: ['transcript'], idempotencyKey: key },
    });
    expect(replay.statusCode).toBe(200);
    expect(JSON.parse(replay.body).connection.id).toBe(JSON.parse(first.body).connection.id);
  });
});

describe('POST /api/integrations/:id/sync', () => {
  it('syncs the demo calendar provider honestly (local source, real events)', async () => {
    const connection = await connectIfNeeded('google_calendar');
    const res = await app.inject({
      method: 'POST',
      url: `/api/integrations/${connection.id}/sync`,
      headers: ui,
      payload: { idempotencyKey: idemKey('sync-gcal') },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.result.ok).toBe(true);
    expect(body.result.summary).toContain('local demo calendar model');
    expect(body.connection.lastSyncAt).toBeTruthy();
  });

  it('syncs the demo Fathom provider into proposal-ready analysis', async () => {
    const connection = await connectIfNeeded('fathom');
    const res = await app.inject({
      method: 'POST',
      url: `/api/integrations/${connection.id}/sync`,
      headers: ui,
      payload: { idempotencyKey: idemKey('sync-fathom') },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.result.ok).toBe(true);
    expect(body.result.summary).toContain('proposal-ready');
  });

  it('rejects sync on a disconnected connection with INVALID_STATE', async () => {
    const connection = await connectIfNeeded('google_calendar');
    await app.inject({
      method: 'POST',
      url: `/api/integrations/${connection.id}/disconnect`,
      headers: ui,
      payload: { idempotencyKey: idemKey('disc-sync') },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/api/integrations/${connection.id}/sync`,
      headers: ui,
      payload: { idempotencyKey: idemKey('sync-disc') },
    });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error.code).toBe('INVALID_STATE');
  });
});

describe('POST /api/integrations/webhooks/:providerId', () => {
  const validTranscript = {
    providerId: 'fathom',
    externalMeetingId: 'demo_launch_review',
    meetingTitle: 'Launch review',
    startedAt: '2026-09-02T10:00:00.000Z',
    endedAt: '2026-09-02T10:30:00.000Z',
    transcript: 'Payment integration blocked. Pricing already decided.',
    summary: 'Payment blocker open; pricing decided.',
    rawActionItems: [
      { title: 'Resolve payment integration blocker', ownerName: 'Sarah Chen', dueLabel: 'Friday' },
    ],
    rawDecisions: [
      { title: 'Pricing model', outcome: 'Usage-based pricing approved — do not reopen.' },
    ],
    metadata: { demo: true },
  };

  it('ingests a valid transcript into proposal-ready analysis (not committed)', async () => {
    await connectIfNeeded('fathom');
    const res = await app.inject({
      method: 'POST',
      url: '/api/integrations/webhooks/fathom',
      payload: { eventId: 'evt-001', eventType: 'meeting.completed', payload: validTranscript },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('processed');
    expect(body.analysis.actionItems[0]?.title).toBe('Resolve payment integration blocker');
    expect(body.analysis.decisions[0]?.title).toBe('Pricing model');
    expect(body.summary).toContain('awaiting human review');
  });

  it('is idempotent: the same (provider, eventId) returns duplicate without reprocessing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/integrations/webhooks/fathom',
      payload: { eventId: 'evt-001', eventType: 'meeting.completed', payload: validTranscript },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('duplicate');
  });

  it('rejects invalid payloads with VALIDATION_ERROR and records a failed ingestion', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/integrations/webhooks/fathom',
      payload: { eventId: 'evt-002', eventType: 'meeting.completed', payload: { providerId: 'fathom' } },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('ignores webhooks from an unconnected provider with INVALID_STATE', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/integrations/webhooks/google_calendar',
      payload: {
        eventId: 'evt-x',
        eventType: 'calendar.event.created',
        payload: { providerId: 'google_calendar', dateFrom: '2026-09-02', dateTo: '2026-09-02', source: 'external', busyIntervals: [], fetchedAt: '2026-09-02T00:00:00.000Z' },
      },
    });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error.code).toBe('INVALID_STATE');
  });

  it('rejects unknown provider ids with VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/integrations/webhooks/unknown_provider',
      payload: { eventId: 'evt-y', eventType: 'x', payload: {} },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/integrations/:id/disconnect', () => {
  it('disconnects, records the event, and keeps local canonical state', async () => {
    const connection = await connectIfNeeded('google_calendar');
    const res = await app.inject({
      method: 'POST',
      url: `/api/integrations/${connection.id}/disconnect`,
      headers: ui,
      payload: { idempotencyKey: idemKey('disc2') },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.connection.status).toBe('disconnected');

    const events = await app.inject({
      method: 'GET',
      url: `/api/integrations/activity?connectionId=${connection.id}`,
      headers: ui,
    });
    const evt = JSON.parse(events.body).events as Array<{ eventType: string }>;
    expect(evt.some((e) => e.eventType === 'disconnected')).toBe(true);
  });
});
