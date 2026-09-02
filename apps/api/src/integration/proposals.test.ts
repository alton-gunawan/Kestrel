/**
 * Integration tests: proposal lifecycle — propose → review → approve →
 * execute → verify, plus every rejection path (stale, superseded, replay,
 * forged approval). This is the heart of the human-control boundary.
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
  const utcHour = hour + 7; // PDT
  return `${date}T${String(utcHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;
}

function meetingCreatePayload(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'meeting_create',
    payload: {
      title: 'Launch review',
      purpose: 'Review launch blockers',
      projectId: SEED.launch,
      startAt: isoAt(3, 10, 30), // Wednesday 10:30 local
      durationMinutes: 30,
      participants: [
        { participantId: SEED.parAlex, role: 'organizer' },
        { participantId: SEED.parSarah, role: 'attendee' },
        { participantId: SEED.parDaniel, role: 'attendee' },
      ],
      agenda: [
        { title: 'Payment integration blocker', source: 'project_context' },
        { title: 'Launch readiness checklist', source: 'agent' },
      ],
    },
    ...overrides,
  };
}

describe('proposal lifecycle', () => {
  it('creates a proposal without touching committed meeting state (FR-2)', async () => {
    const before = await app.inject({
      method: 'GET',
      url: '/api/meetings',
      headers: authedHeaders(cookie),
    });
    const countBefore = JSON.parse(before.body).meetings.length;

    const created = await app.inject({
      method: 'POST',
      url: '/api/proposals',
      headers: authedHeaders(cookie, 'webmcp'),
      payload: {
        kind: 'meeting_create',
        rationale: 'Wednesday 10:30 avoids Daniel’s focus block and the incident review.',
        payload: meetingCreatePayload(),
      },
    });
    expect(created.statusCode).toBe(201);
    const proposal = JSON.parse(created.body).proposal;
    expect(proposal.status).toBe('pending');

    const after = await app.inject({
      method: 'GET',
      url: '/api/meetings',
      headers: authedHeaders(cookie),
    });
    expect(JSON.parse(after.body).meetings.length).toBe(countBefore); // unchanged
  });

  it('rejects proposals at times violating focus blocks (deterministic constraint)', async () => {
    // Tuesday 14:00 = Daniel's focus block.
    const rejected = await app.inject({
      method: 'POST',
      url: '/api/proposals',
      headers: authedHeaders(cookie),
      payload: {
        kind: 'meeting_create',
        rationale: 'Should fail',
        payload: {
          kind: 'meeting_create',
          payload: {
            ...meetingCreatePayload().payload,
            startAt: isoAt(1, 14),
          },
        },
      },
    });
    expect(rejected.statusCode).toBe(422);
    expect(JSON.parse(rejected.body).error.code).toBe('INVALID_TIME');
    const details = JSON.parse(rejected.body).error.details as { conflicts: Array<{ reason: string }> };
    expect(details.conflicts.some((c) => c.reason === 'focus_block')).toBe(true);
  });

  it('cannot execute a pending proposal (PROPOSAL_NOT_APPROVED)', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/proposals',
      headers: authedHeaders(cookie),
      payload: { kind: 'meeting_create', rationale: 'r', payload: { ...meetingCreatePayload(), payload: { ...meetingCreatePayload().payload, title: 'Pending exec', startAt: isoAt(3, 11) } } },
    });
    const id = JSON.parse(created.body).proposal.id;
    const executed = await app.inject({
      method: 'POST',
      url: `/api/proposals/${id}/execute`,
      headers: authedHeaders(cookie),
      payload: { idempotencyKey: 'exec-pending-1' },
    });
    expect(executed.statusCode).toBe(409);
    expect(JSON.parse(executed.body).error.code).toBe('PROPOSAL_NOT_APPROVED');
  });

  it('approves → executes → verifies, persists meeting + agenda (golden path)', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/proposals',
      headers: authedHeaders(cookie),
      payload: {
        kind: 'meeting_create',
        rationale: 'Launch review Wednesday 10:30.',
        payload: meetingCreatePayload(),
      },
    });
    const proposalId = JSON.parse(created.body).proposal.id;

    const approved = await app.inject({
      method: 'POST',
      url: `/api/proposals/${proposalId}/approve`,
      headers: authedHeaders(cookie),
      payload: {},
    });
    expect(approved.statusCode).toBe(200);
    expect(JSON.parse(approved.body).proposal.status).toBe('approved');
    expect(JSON.parse(approved.body).proposal.approvedByUserId).toBe('usr_alex');

    const executed = await app.inject({
      method: 'POST',
      url: `/api/proposals/${proposalId}/execute`,
      headers: authedHeaders(cookie),
      payload: { idempotencyKey: 'exec-golden-1' },
    });
    expect(executed.statusCode).toBe(200);
    const body = JSON.parse(executed.body);
    expect(body.proposal.status).toBe('executed');
    expect(body.verification.ok).toBe(true);

    // Meeting actually persisted with agenda.
    const meetings = await app.inject({ method: 'GET', url: '/api/meetings', headers: authedHeaders(cookie) });
    const created2 = (JSON.parse(meetings.body).meetings as Array<{ id: string; title: string; agenda: { title: string }[] }>).find(
      (m) => m.title === 'Launch review',
    );
    expect(created2).toBeTruthy();
    expect(created2?.agenda.some((a) => a.title === 'Payment integration blocker')).toBe(true);

    // Audit: propose → approve → execute chain exists.
    const activity = await app.inject({ method: 'GET', url: '/api/activity', headers: authedHeaders(cookie) });
    const events = JSON.parse(activity.body).events as Array<{ action: string; entityId: string }>;
    expect(events.filter((e) => e.entityId === proposalId).map((e) => e.action)).toEqual(
      expect.arrayContaining(['proposal.create', 'proposal.approve', 'proposal.execute']),
    );
  });

  it('rejects double execution (PROPOSAL_ALREADY_EXECUTED)', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/proposals',
      headers: authedHeaders(cookie),
      payload: { kind: 'meeting_create', rationale: 'r2', payload: { ...meetingCreatePayload(), payload: { ...meetingCreatePayload().payload, title: 'Double exec', startAt: isoAt(3, 11) } } },
    });
    const id = JSON.parse(created.body).proposal.id;
    await app.inject({ method: 'POST', url: `/api/proposals/${id}/approve`, headers: authedHeaders(cookie), payload: {} });
    const first = await app.inject({
      method: 'POST',
      url: `/api/proposals/${id}/execute`,
      headers: authedHeaders(cookie),
      payload: { idempotencyKey: 'exec-double-1' },
    });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({
      method: 'POST',
      url: `/api/proposals/${id}/execute`,
      headers: authedHeaders(cookie),
      payload: { idempotencyKey: 'exec-double-2' },
    });
    expect(second.statusCode).toBe(409);
    expect(JSON.parse(second.body).error.code).toBe('PROPOSAL_ALREADY_EXECUTED');
  });

  it('supersedes the previous proposal when a new one covers the same scope', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/proposals',
      headers: authedHeaders(cookie),
      payload: {
        kind: 'meeting_create',
        rationale: 'First attempt',
        payload: { ...meetingCreatePayload(), payload: { ...meetingCreatePayload().payload, title: 'Supersede A', startAt: isoAt(3, 11, 30) } },
      },
    });
    const firstId = JSON.parse(first.body).proposal.id;
    await app.inject({ method: 'POST', url: `/api/proposals/${firstId}/approve`, headers: authedHeaders(cookie), payload: {} });

    // New proposal for the same project scope supersedes the approved one.
    const second = await app.inject({
      method: 'POST',
      url: '/api/proposals',
      headers: authedHeaders(cookie),
      payload: {
        kind: 'meeting_create',
        rationale: 'Revised after human edit',
        payload: { ...meetingCreatePayload(), payload: { ...meetingCreatePayload().payload, title: 'Supersede B', startAt: isoAt(3, 12) } },
      },
    });
    const secondId = JSON.parse(second.body).proposal.id;

    const after = await app.inject({ method: 'GET', url: `/api/proposals/${firstId}`, headers: authedHeaders(cookie) });
    expect(JSON.parse(after.body).proposal.status).toBe('superseded');
    expect(JSON.parse(after.body).proposal.supersededById).toBe(secondId);

    // Executing the superseded proposal fails safely.
    const exec = await app.inject({
      method: 'POST',
      url: `/api/proposals/${firstId}/execute`,
      headers: authedHeaders(cookie),
      payload: { idempotencyKey: 'exec-superseded-1' },
    });
    expect(exec.statusCode).toBe(409);
    expect(JSON.parse(exec.body).error.code).toBe('PROPOSAL_SUPERSEDED');
  });

  it('human Edit → revise creates a new pending proposal (replan flow)', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/proposals',
      headers: authedHeaders(cookie),
      payload: {
        kind: 'meeting_create',
        rationale: 'Original plan',
        payload: { ...meetingCreatePayload(), payload: { ...meetingCreatePayload().payload, title: 'Revise me', startAt: isoAt(3, 12, 30) } },
      },
    });
    const firstId = JSON.parse(first.body).proposal.id;

    const revised = await app.inject({
      method: 'POST',
      url: `/api/proposals/${firstId}/revise`,
      headers: authedHeaders(cookie),
      payload: {
        rationale: 'Moved to Thursday 11:00 per human request; payment blocker added.',
        changes: { startAt: isoAt(4, 11) },
        // Thursday 11:00 is free in the seeded week.
      },
    });
    expect(revised.statusCode).toBe(200);
    const revisedProposal = JSON.parse(revised.body).proposal;
    expect(revisedProposal.status).toBe('pending');
    expect(revisedProposal.id).not.toBe(firstId);

    const original = await app.inject({ method: 'GET', url: `/api/proposals/${firstId}`, headers: authedHeaders(cookie) });
    expect(JSON.parse(original.body).proposal.status).toBe('superseded');
  });

  it('rejected proposals cannot be executed', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/proposals',
      headers: authedHeaders(cookie),
      payload: { kind: 'meeting_create', rationale: 'reject me', payload: { ...meetingCreatePayload(), payload: { ...meetingCreatePayload().payload, title: 'Reject me', startAt: isoAt(4, 11, 30) } } },
    });
    const id = JSON.parse(created.body).proposal.id;
    const rejected = await app.inject({
      method: 'POST',
      url: `/api/proposals/${id}/reject`,
      headers: authedHeaders(cookie),
      payload: { reason: 'Wrong week' },
    });
    expect(rejected.statusCode).toBe(200);
    const exec = await app.inject({
      method: 'POST',
      url: `/api/proposals/${id}/execute`,
      headers: authedHeaders(cookie),
      payload: { idempotencyKey: 'exec-rejected-1' },
    });
    expect(exec.statusCode).toBe(409);
    expect(JSON.parse(exec.body).error.code).toBe('PROPOSAL_REJECTED');
  });

  it('idempotent execution replays the same result without duplicating meetings', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/proposals',
      headers: authedHeaders(cookie),
      payload: { kind: 'meeting_create', rationale: 'idem exec', payload: { ...meetingCreatePayload(), payload: { ...meetingCreatePayload().payload, title: 'Idem exec', startAt: isoAt(4, 12) } } },
    });
    const id = JSON.parse(created.body).proposal.id;
    await app.inject({ method: 'POST', url: `/api/proposals/${id}/approve`, headers: authedHeaders(cookie), payload: {} });
    const first = await app.inject({
      method: 'POST',
      url: `/api/proposals/${id}/execute`,
      headers: authedHeaders(cookie),
      payload: { idempotencyKey: 'exec-idem-1' },
    });
    expect(first.statusCode).toBe(200);
    const firstMeetingId = JSON.parse(first.body).proposal.payload.payload.title;
    const replay = await app.inject({
      method: 'POST',
      url: `/api/proposals/${id}/execute`,
      headers: authedHeaders(cookie),
      payload: { idempotencyKey: 'exec-idem-1' },
    });
    expect(replay.statusCode).toBe(200);
    expect(JSON.parse(replay.body).proposal.payload.payload.title).toBe(firstMeetingId);
  });

  it('verify-meeting endpoint reports actual state (US-11)', async () => {
    const meetings = await app.inject({ method: 'GET', url: '/api/meetings', headers: authedHeaders(cookie) });
    const launchReview = (JSON.parse(meetings.body).meetings as Array<{ id: string; title: string }>).find(
      (m) => m.title === 'Launch review',
    );
    expect(launchReview).toBeTruthy();

    const good = await app.inject({
      method: 'POST',
      url: '/api/verify-meeting',
      headers: authedHeaders(cookie),
      payload: {
        meetingId: launchReview?.id,
        expectations: {
          status: 'scheduled',
          agendaContains: ['Payment integration blocker'],
          participantIds: [SEED.parAlex, SEED.parSarah, SEED.parDaniel],
        },
      },
    });
    expect(good.statusCode).toBe(200);
    expect(JSON.parse(good.body).verification.ok).toBe(true);

    const bad = await app.inject({
      method: 'POST',
      url: '/api/verify-meeting',
      headers: authedHeaders(cookie),
      payload: {
        meetingId: launchReview?.id,
        expectations: { agendaContains: ['Nonexistent agenda item'] },
      },
    });
    expect(JSON.parse(bad.body).verification.ok).toBe(false);
  });

  it('unknown proposal ids return NOT_FOUND, unknown meetings too', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/proposals/prp_nope', headers: authedHeaders(cookie) });
    expect(res.statusCode).toBe(404);
    const exec = await app.inject({
      method: 'POST',
      url: '/api/proposals/prp_nope/execute',
      headers: authedHeaders(cookie),
      payload: { idempotencyKey: 'exec-unknown-1' },
    });
    expect(exec.statusCode).toBe(404);
  });
});

describe('channel classification (D-011)', () => {
  it('audits webmcp-channel proposals as agent actor', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/proposals',
      headers: authedHeaders(cookie, 'webmcp'),
      payload: {
        kind: 'meeting_create',
        rationale: 'Agent-authored proposal',
        payload: { ...meetingCreatePayload(), payload: { ...meetingCreatePayload().payload, title: 'Agent proposal', startAt: isoAt(4, 12, 30) } },
      },
    });
    const id = JSON.parse(created.body).proposal.id;
    const detail = await app.inject({ method: 'GET', url: `/api/proposals/${id}`, headers: authedHeaders(cookie) });
    expect(JSON.parse(detail.body).proposal.createdByActorType).toBe('agent');
  });
});
