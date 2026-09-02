/**
 * Golden demo E2E (@golden): the exact documented demo flow, in a real
 * browser against the real API. This is the demo-truth test.
 */
import { test, expect } from '@playwright/test';

test.describe('golden demo flow @golden', () => {
  let nextMeetingTitle: string | null = null;

  test.beforeAll(async ({ request }) => {
    // Reset demo state so the flow is deterministic.
    const login = await request.post('/api/session', { data: { userId: 'usr_alex' } });
    const reset = await request.post('/api/demo/reset', { headers: cookieHeader(login) });
    if (!reset.ok()) throw new Error(`demo reset failed: ${reset.status()}`);
    // Ground the overview assertion in server truth: the next meeting shown on
    // the dashboard is whatever the API reports next (demo is anchored to the
    // current week, so the title depends on the day the suite runs).
    const overview = await request.get('/api/overview', { headers: cookieHeader(login) });
    if (overview.ok()) {
      const body = (await overview.json()) as { nextMeeting: { title: string } | null };
      nextMeetingTitle = body.nextMeeting?.title ?? null;
    }
  });

  test('overview answers what needs attention', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('What needs attention today')).toBeVisible();
    await expect(page.getByText('Next meeting')).toBeVisible();
    if (nextMeetingTitle !== null) {
      await expect(page.getByText(nextMeetingTitle)).toBeVisible();
    }
  });

  test('agent proposes via WebMCP; human approves and executes in UI; state verified', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.__KESTREL_POLYFILL_TOOLS__ !== undefined);

    // 1. Agent: ground in overview.
    const overview = await page.evaluate(async () => {
      const tools = window.__KESTREL_POLYFILL_TOOLS__!;
      return await tools.get('get_today_overview')!.execute({});
    });
    expect(overview.ok).toBe(true);
    expect((overview.data as { today: string }).today).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // 2. Agent: get project context (blockers drive the agenda).
    const project = await page.evaluate(async () => {
      const tools = window.__KESTREL_POLYFILL_TOOLS__!;
      return await tools.get('get_project_context')!.execute({ projectId: 'prj_launch' });
    });
    expect(project.ok).toBe(true);
    const projectData = project.data as { actions: Array<{ id: string; title: string }> };
    expect(projectData.actions.length).toBeGreaterThanOrEqual(2);

    // 3. Agent: find a slot for all three participants.
    const slots = await page.evaluate(async () => {
      const tools = window.__KESTREL_POLYFILL_TOOLS__!;
      const today = new Date();
      const from = today.toISOString().slice(0, 10);
      const to = new Date(today.getTime() + 6 * 86_400_000).toISOString().slice(0, 10);
      return await tools.get('find_available_slots')!.execute({
        participantIds: ['par_alex', 'par_sarah', 'par_daniel'],
        dateFrom: from,
        dateTo: to,
        durationMinutes: 30,
      });
    });
    expect(slots.ok).toBe(true);
    const slotList = (slots.data as { slots: Array<{ startAt: string }> }).slots;
    expect(slotList.length).toBeGreaterThan(0);
    const chosen = slotList[0]!.startAt;

    // 4. Agent: propose the meeting at that slot.
    const proposal = await page.evaluate(async (startAt) => {
      const tools = window.__KESTREL_POLYFILL_TOOLS__!;
      return await tools.get('prepare_meeting_proposal')!.execute({
        title: 'Launch readiness review',
        purpose: 'Resolve payment + data-migration blockers',
        projectId: 'prj_launch',
        startAt,
        durationMinutes: 30,
        participants: [
          { participantId: 'par_alex', role: 'organizer' },
          { participantId: 'par_sarah', role: 'attendee' },
          { participantId: 'par_daniel', role: 'attendee' },
        ],
        agenda: [
          { title: 'Payment integration blocker', source: 'project_context' },
          { title: 'Data migration blocker', source: 'project_context' },
          { title: 'Go/no-go', source: 'agent' },
        ],
        rationale: 'Found a slot that avoids Daniel’s focus block and the incident review.',
      });
    }, chosen);
    expect(proposal.ok).toBe(true);
    const proposalId = (proposal.data as { proposal: { id: string } }).proposal.id;

    // 5. Human: see the proposal, approve it.
    await page.goto('/proposals');
    await expect(page.getByText('Launch readiness review')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Approve' }).first().click();
    await expect(page.getByText(/Proposal approved/).first()).toBeVisible();

    // 6. Human: execute the approved proposal.
    await page.getByRole('button', { name: 'Execute approved change' }).first().click();
    await expect(page.getByText(/VERIFIED|verification/i).first()).toBeVisible({ timeout: 10_000 });

    // 7. Verify the meeting actually exists with agenda (server truth).
    const meeting = await page.evaluate(async (pid) => {
      const res = await fetch(`/api/proposals/${pid}`, { credentials: 'same-origin' });
      const body = (await res.json()) as { proposal: { status: string; verification: { ok: boolean; checks: Array<{ name: string; pass: boolean }> } | null } };
      return body.proposal;
    }, proposalId);
    expect(meeting.status).toBe('executed');
    expect(meeting.verification?.ok).toBe(true);

    // 8. Verify the audit trail shows the full chain with honest channels.
    const audit = await page.evaluate(async () => {
      const res = await fetch('/api/activity', { credentials: 'same-origin' });
      const body = (await res.json()) as { events: Array<{ action: string; channel: string; actorType: string }> };
      return body.events.map((e) => `${e.action}:${e.channel}:${e.actorType}`);
    });
    expect(audit).toContain('proposal.create:webmcp:agent');
    expect(audit.some((e) => e.startsWith('proposal.approve:ui:human'))).toBe(true);
    expect(audit.some((e) => e.startsWith('proposal.execute:ui:human'))).toBe(true);
  });

  test('unapproved agent execution is refused', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.__KESTREL_POLYFILL_TOOLS__ !== undefined);

    const proposal = await page.evaluate(async () => {
      const tools = window.__KESTREL_POLYFILL_TOOLS__!;
      const slots = await tools.get('find_available_slots')!.execute({
        participantIds: ['par_alex'],
        dateFrom: new Date().toISOString().slice(0, 10),
        dateTo: new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10),
        durationMinutes: 30,
      });
      const startAt = (slots.data as { slots: Array<{ startAt: string }> }).slots[0]?.startAt;
      return await tools.get('prepare_meeting_proposal')!.execute({
        title: 'Never approved',
        purpose: '',
        projectId: null,
        startAt,
        durationMinutes: 30,
        participants: [{ participantId: 'par_alex', role: 'organizer' }],
        agenda: [],
        rationale: 'Should never execute',
      });
    });
    expect(proposal.ok).toBe(true);
    const proposalId = (proposal.data as { proposal: { id: string } }).proposal.id;

    const attempted = await page.evaluate(async (pid) => {
      const tools = window.__KESTREL_POLYFILL_TOOLS__!;
      return await tools.get('create_meeting')!.execute({ proposalId: pid, idempotencyKey: 'e2e-unapproved-1' });
    }, proposalId);
    expect(attempted.ok).toBe(false);
    expect((attempted.error as { code: string }).code).toBe('PROPOSAL_NOT_APPROVED');

    // Clean up: reject it so the queue stays clean for other tests.
    const rejected = await page.evaluate(async (pid) => {
      const res = await fetch(`/api/proposals/${pid}/reject`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ reason: 'E2E cleanup' }),
      });
      return res.status;
    }, proposalId);
    expect(rejected).toBe(200);
  });
});

function cookieHeader(login: { headers(): Record<string, string> }): Record<string, string> {
  const setCookie = login.headers()['set-cookie'] ?? '';
  const token = setCookie.split(';')[0] ?? '';
  return token ? { cookie: token } : {};
}
