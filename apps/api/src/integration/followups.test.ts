/**
 * Follow-up leg of the core loop (DEMO-9, US-10): a follow-up proposal
 * (e.g. "payment blocker -> Friday check-in") goes through the same
 * propose -> human-approve -> execute -> verify path as every other kind, and
 * a newer proposal for the same source meeting supersedes the older one.
 *
 * API contract note: POST /api/proposals takes {kind, rationale,
 * payload: <proposalPayload envelope>} - the payload member is itself the
 * discriminated-union envelope {kind, payload: <inner>}.
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

let app: TestApp;
let cookie: string;

beforeAll(async () => {
  app = await createTestApp();
  cookie = await loginAs(app);
}, 60_000);

afterAll(async () => {
  await closeTestApp(app);
}, 60_000);

function followupEnvelope(
  sourceMeetingId: string,
  note: string,
  rationale: string,
): { kind: 'followup'; rationale: string; payload: { kind: 'followup'; payload: Record<string, unknown> } } {
  return {
    kind: 'followup',
    rationale,
    payload: {
      kind: 'followup',
      payload: {
        sourceMeetingId,
        proposedScheduledAt: null, // "suggest a check-in" - exact slot decided later
        note,
      },
    },
  };
}

async function createProposal(body: unknown): Promise<{ statusCode: number; body: string }> {
  return app.inject({
    method: 'POST',
    url: '/api/proposals',
    headers: authedHeaders(cookie),
    payload: body as object,
  });
}

describe('follow-up proposals (US-10, DEMO-9)', () => {
  it('proposes -> approves -> executes a follow-up and verifies persisted state', async () => {
    const created = await createProposal(
      followupEnvelope(
        SEED.wednesdayIncident,
        'Payment blocker must be verified in a follow-up check-in.',
        'Unresolved payment blocker from the incident review.',
      ),
    );
    expect(created.statusCode).toBe(201);
    const proposal = (JSON.parse(created.body) as { proposal: { id: string } }).proposal;

    const approved = await app.inject({
      method: 'POST',
      url: `/api/proposals/${proposal.id}/approve`,
      headers: authedHeaders(cookie),
      payload: {},
    });
    expect(approved.statusCode).toBe(200);

    const executed = await app.inject({
      method: 'POST',
      url: `/api/proposals/${proposal.id}/execute`,
      headers: authedHeaders(cookie),
      payload: { idempotencyKey: `it-flu-${proposal.id}` },
    });
    expect(executed.statusCode).toBe(200);
    const body = JSON.parse(executed.body) as {
      proposal: {
        status: string;
        verification: { ok: boolean; checks: Array<{ name: string; pass: boolean }> };
      };
    };
    expect(body.proposal.status).toBe('executed');
    expect(body.proposal.verification.ok).toBe(true);
    const names = body.proposal.verification.checks.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['followup_created', 'followup_source_meeting']));

    // The follow-up is queryable via the follow-ups listing.
    const list = await app.inject({
      method: 'GET',
      url: '/api/follow-ups',
      headers: authedHeaders(cookie),
    });
    expect(list.statusCode).toBe(200);
    const followUps = JSON.parse(list.body) as {
      followUps: Array<{ sourceMeetingId: string }>;
    };
    expect(
      followUps.followUps.some((f) => f.sourceMeetingId === SEED.wednesdayIncident),
    ).toBe(true);
  });

  it('a newer follow-up proposal for the same source meeting supersedes the pending one', async () => {
    const first = await createProposal(
      followupEnvelope(SEED.tuesdayStandup, 'First suggestion.', 'First follow-up suggestion.'),
    );
    expect(first.statusCode).toBe(201);
    const firstId = (JSON.parse(first.body) as { proposal: { id: string } }).proposal.id;

    const second = await createProposal(
      followupEnvelope(
        SEED.tuesdayStandup,
        'Refined suggestion after constraint change.',
        'Refined follow-up suggestion.',
      ),
    );
    expect(second.statusCode).toBe(201);
    const secondId = (JSON.parse(second.body) as { proposal: { id: string } }).proposal.id;

    // First proposal is superseded and can no longer be approved.
    const approveOld = await app.inject({
      method: 'POST',
      url: `/api/proposals/${firstId}/approve`,
      headers: authedHeaders(cookie),
      payload: {},
    });
    expect(approveOld.statusCode).toBe(409);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/proposals/${firstId}`,
      headers: authedHeaders(cookie),
    });
    expect(detail.statusCode).toBe(200);
    const old = JSON.parse(detail.body) as {
      proposal: { status: string; supersededById: string | null };
    };
    expect(old.proposal.status).toBe('superseded');
    expect(old.proposal.supersededById).toBe(secondId);
  });
});
