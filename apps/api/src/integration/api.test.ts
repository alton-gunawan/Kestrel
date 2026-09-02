/**
 * Integration tests: meeting lifecycle, validation, revisions, audit (TEST-3).
 * Runs against real PostgreSQL via the real Fastify app.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import {
  authedHeaders,
  closeTestApp,
  createTestApp,
  loginAs,
  SEED,
  type TestApp,
} from '../testing/testApp.js';
import { weekBounds } from '@kestrel/contracts';

let app: TestApp;
let cookie: string;

beforeAll(async () => {
  app = await createTestApp();
  cookie = await loginAs(app);
}, 60_000);

afterAll(async () => {
  await closeTestApp(app);
}, 60_000);

function isoAt(dayOffsetFromMonday: number, hour: number, minute = 0): string {
  const { from } = weekBounds(new Date().toISOString().slice(0, 10));
  const date = new Date(Date.parse(`${from}T00:00:00Z`) + dayOffsetFromMonday * 86_400_000)
    .toISOString()
    .slice(0, 10);
  // Los Angeles working hours; compute UTC instant for local hour.
  const offsetHours = 7; // PDT (UTC-7): UTC = local + 7
  const utcHour = hour + offsetHours;
  return `${date}T${String(utcHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;
}

describe('GET /api/health', () => {
  it('reports ok with database check', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.database).toBe('ok');
    expect(body.requestId).toBeTruthy();
  });

  it('returns x-request-id on every response', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/overview' });
    expect(res.headers['x-request-id']).toBeTruthy();
  });
});

describe('authentication', () => {
  it('rejects unauthenticated requests with UNAUTHENTICATED', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/overview' });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects unknown session cookies', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/overview',
      headers: { cookie: 'kestrel_session=not-a-real-session' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects unknown user ids on session create', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/session',
      payload: { userId: 'usr_nobody' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('meeting lifecycle', () => {
  it('creates a meeting with participants and agenda', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/meetings',
      headers: authedHeaders(cookie),
      payload: {
        title: 'Launch review',
        purpose: 'Review launch blockers',
        projectId: SEED.launch,
        startAt: isoAt(2, 11),
        durationMinutes: 30,
        participants: [
          { participantId: SEED.parAlex, role: 'organizer' },
          { participantId: SEED.parSarah, role: 'attendee' },
        ],
        agenda: [{ title: 'Payment blocker', source: 'project_context' }],
        idempotencyKey: 'create-meeting-it-1',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.meeting.status).toBe('scheduled');
    expect(body.meeting.revision).toBe(1);
  });

  it('rejects duration outside 5-180 with VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/meetings',
      headers: authedHeaders(cookie),
      payload: {
        title: 'Too long',
        purpose: '',
        projectId: null,
        startAt: isoAt(2, 11),
        durationMinutes: 240,
        participants: [{ participantId: SEED.parAlex, role: 'organizer' }],
        idempotencyKey: 'create-meeting-it-2',
      },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(['VALIDATION_ERROR']).toContain(body.error.code);
  });

  it('rejects duplicate participants (INV-2)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/meetings',
      headers: authedHeaders(cookie),
      payload: {
        title: 'Dupes',
        purpose: '',
        projectId: null,
        startAt: isoAt(2, 11),
        durationMinutes: 30,
        participants: [
          { participantId: SEED.parAlex, role: 'organizer' },
          { participantId: SEED.parAlex, role: 'attendee' },
        ],
        idempotencyKey: 'create-meeting-it-3',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects meetings without organizer (INV-3)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/meetings',
      headers: authedHeaders(cookie),
      payload: {
        title: 'No organizer',
        purpose: '',
        projectId: null,
        startAt: isoAt(2, 11),
        durationMinutes: 30,
        participants: [{ participantId: SEED.parSarah, role: 'attendee' }],
        idempotencyKey: 'create-meeting-it-4',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects unknown participants', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/meetings',
      headers: authedHeaders(cookie),
      payload: {
        title: 'Ghost',
        purpose: '',
        projectId: null,
        startAt: isoAt(2, 11),
        durationMinutes: 30,
        participants: [{ participantId: 'par_ghost', role: 'organizer' }],
        idempotencyKey: 'create-meeting-it-5',
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects stale revisions with STALE_REVISION (INV-7)', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/meetings',
      headers: authedHeaders(cookie),
      payload: {
        title: 'Rev test',
        purpose: '',
        projectId: null,
        startAt: isoAt(3, 14),
        durationMinutes: 30,
        participants: [{ participantId: SEED.parAlex, role: 'organizer' }],
        idempotencyKey: 'rev-test-1',
      },
    });
    const meeting = JSON.parse(created.body).meeting;

    const first = await app.inject({
      method: 'PATCH',
      url: `/api/meetings/${meeting.id}`,
      headers: authedHeaders(cookie),
      payload: { expectedRevision: 1, title: 'Rev test v2', idempotencyKey: 'rev-test-2' },
    });
    expect(first.statusCode).toBe(200);
    expect(JSON.parse(first.body).meeting.revision).toBe(2);

    const stale = await app.inject({
      method: 'PATCH',
      url: `/api/meetings/${meeting.id}`,
      headers: authedHeaders(cookie),
      payload: { expectedRevision: 1, title: 'Rev test v3', idempotencyKey: 'rev-test-3' },
    });
    expect(stale.statusCode).toBe(409);
    expect(JSON.parse(stale.body).error.code).toBe('STALE_REVISION');
  });

  it('validates status transitions (FR-1, INV-6)', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/meetings',
      headers: authedHeaders(cookie),
      payload: {
        title: 'Transition test',
        purpose: '',
        projectId: null,
        startAt: isoAt(3, 15),
        durationMinutes: 30,
        participants: [{ participantId: SEED.parAlex, role: 'organizer' }],
        idempotencyKey: 'trans-test-1',
      },
    });
    const meeting = JSON.parse(created.body).meeting;

    // scheduled -> completed is allowed
    const completed = await app.inject({
      method: 'POST',
      url: `/api/meetings/${meeting.id}/status`,
      headers: authedHeaders(cookie),
      payload: { expectedRevision: 1, status: 'completed', idempotencyKey: 'trans-test-2' },
    });
    expect(completed.statusCode).toBe(200);

    // completed -> scheduled is NOT allowed (INV-6: no reschedule without reopen)
    const rescheduled = await app.inject({
      method: 'POST',
      url: `/api/meetings/${meeting.id}/status`,
      headers: authedHeaders(cookie),
      payload: { expectedRevision: 2, status: 'scheduled', idempotencyKey: 'trans-test-3' },
    });
    expect(rescheduled.statusCode).toBe(409);
    expect(JSON.parse(rescheduled.body).error.code).toBe('INVALID_STATE');
  });

  it('replays identical idempotency requests deterministically', async () => {
    const payload = {
      title: 'Idem test',
      purpose: '',
      projectId: null,
      startAt: isoAt(3, 16),
      durationMinutes: 30,
      participants: [{ participantId: SEED.parAlex, role: 'organizer' }],
      idempotencyKey: 'idem-replay-1',
    };
    const first = await app.inject({ method: 'POST', url: '/api/meetings', headers: authedHeaders(cookie), payload });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({ method: 'POST', url: '/api/meetings', headers: authedHeaders(cookie), payload });
    expect(second.statusCode).toBe(200);
    expect(JSON.parse(second.body).meeting.id).toBe(JSON.parse(first.body).meeting.id);

    // Same key, different payload -> conflict
    const conflict = await app.inject({
      method: 'POST',
      url: '/api/meetings',
      headers: authedHeaders(cookie),
      payload: { ...payload, title: 'Different' },
    });
    expect(conflict.statusCode).toBe(409);
    expect(JSON.parse(conflict.body).error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('writes audit events for mutations (INV-10)', async () => {
    const activity = await app.inject({
      method: 'GET',
      url: '/api/activity',
      headers: authedHeaders(cookie),
    });
    const events = JSON.parse(activity.body).events as Array<{ action: string; channel: string }>;
    expect(events.some((e) => e.action === 'meeting.create')).toBe(true);
  });
});

describe('agenda', () => {
  it('adds agenda items and enforces unique sort order (INV-4)', async () => {
    const meeting = await app.inject({
      method: 'POST',
      url: '/api/meetings',
      headers: authedHeaders(cookie),
      payload: {
        title: 'Agenda meeting',
        purpose: '',
        projectId: null,
        startAt: isoAt(3, 10),
        durationMinutes: 30,
        participants: [{ participantId: SEED.parAlex, role: 'organizer' }],
        idempotencyKey: 'agenda-it-1',
      },
    });
    const id = JSON.parse(meeting.body).meeting.id;

    const item1 = await app.inject({
      method: 'POST',
      url: `/api/meetings/${id}/agenda-items`,
      headers: authedHeaders(cookie),
      payload: { title: 'First', source: 'human', expectedRevision: 1, idempotencyKey: 'agenda-it-2' },
    });
    expect(item1.statusCode).toBe(201);
    expect(JSON.parse(item1.body).item.sortOrder).toBe(1);

    const item2 = await app.inject({
      method: 'POST',
      url: `/api/meetings/${id}/agenda-items`,
      headers: authedHeaders(cookie),
      payload: { title: 'Second', source: 'human', sortOrder: 1, expectedRevision: 2, idempotencyKey: 'agenda-it-3' },
    });
    expect(item2.statusCode).toBe(400);
  });
});

describe('decisions and actions', () => {
  it('records decisions only in outcome-capture state', async () => {
    const scheduled = await app.inject({
      method: 'POST',
      url: `/api/meetings/${SEED.tuesdayStandup}/decisions`,
      headers: authedHeaders(cookie),
      payload: { title: 'Too early', outcome: 'nope', idempotencyKey: 'dec-it-1' },
    });
    expect(scheduled.statusCode).toBe(409);
    expect(JSON.parse(scheduled.body).error.code).toBe('INVALID_STATE');

    const completed = await app.inject({
      method: 'POST',
      url: `/api/meetings/${SEED.prevSync}/decisions`,
      headers: authedHeaders(cookie),
      payload: { title: 'Follow-up pricing note', outcome: 'Pricing stands as decided.', idempotencyKey: 'dec-it-2' },
    });
    expect(completed.statusCode).toBe(201);
  });

  it('enforces action item owner is a participant (INV-5)', async () => {
    // Sarah is not a participant of the Friday check-in? Actually she is not.
    const bad = await app.inject({
      method: 'POST',
      url: `/api/meetings/${SEED.fridayCheckin}/actions`,
      headers: authedHeaders(cookie),
      payload: {
        title: 'Wrong owner',
        ownerParticipantId: SEED.parSarah,
        idempotencyKey: 'act-it-1',
      },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('creates action items linked to the project', async () => {
    const ok = await app.inject({
      method: 'POST',
      url: `/api/meetings/${SEED.fridayCheckin}/actions`,
      headers: authedHeaders(cookie),
      payload: {
        title: 'Verify payment fix in staging',
        ownerParticipantId: SEED.parDaniel,
        projectId: SEED.launch,
        idempotencyKey: 'act-it-2',
      },
    });
    expect(ok.statusCode).toBe(201);
    expect(JSON.parse(ok.body).action.projectId).toBe(SEED.launch);
  });
});

describe('overview', () => {
  it('answers what needs attention', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/overview', headers: authedHeaders(cookie) });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Array.isArray(body.overdueActions)).toBe(true);
    expect(body.pendingProposalsCount).toBe(0);
  });
});

describe('security', () => {
  it('rejects unknown fields with VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/session',
      payload: { userId: 'usr_alex', extraField: 'nope' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('never leaks approval state from request bodies on approve', async () => {
    // Create a proposal via API, then try to approve while spoofing.
    const proposal = await app.inject({
      method: 'POST',
      url: '/api/proposals',
      headers: authedHeaders(cookie),
      payload: {
        kind: 'meeting_create',
        rationale: 'Test proposal',
        payload: {
          kind: 'meeting_create',
          payload: {
            title: 'Spoof test',
            purpose: '',
            projectId: null,
            startAt: isoAt(4, 11),
            durationMinutes: 30,
            participants: [{ participantId: SEED.parAlex, role: 'organizer' }],
            agenda: [],
          },
        },
      },
    });
    expect(proposal.statusCode).toBe(201);
    const proposalId = JSON.parse(proposal.body).proposal.id;

    const spoof = await app.inject({
      method: 'POST',
      url: `/api/proposals/${proposalId}/approve`,
      headers: authedHeaders(cookie),
      payload: { approved: true, approvedBy: 'agent', status: 'approved' },
    });
    expect(spoof.statusCode).toBe(403);
    expect(JSON.parse(spoof.body).error.code).toBe('APPROVAL_FORBIDDEN');

    // Unapproved execution must fail (FR-2/FR-3)
    const execute = await app.inject({
      method: 'POST',
      url: `/api/proposals/${proposalId}/execute`,
      headers: authedHeaders(cookie),
      payload: { idempotencyKey: 'spoof-execute-1' },
    });
    expect(execute.statusCode).toBe(409);
    expect(JSON.parse(execute.body).error.code).toBe('PROPOSAL_NOT_APPROVED');
  });
});
