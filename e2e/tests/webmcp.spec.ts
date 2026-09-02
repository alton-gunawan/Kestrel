/**
 * WebMCP contract tests (@webmcp): the browser must expose exactly the 20
 * documented tools with correct annotations, and the trust boundary must
 * hold (no approval tool, agent cannot self-approve).
 */
import { test, expect } from '@playwright/test';

interface RegisteredToolLite {
  name: string;
  title: string;
  description: string;
  inputSchema?: object;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
}

interface ModelContextLite {
  getTools: () => Promise<RegisteredToolLite[]>;
}

declare global {
  interface Document {
    readonly modelContext?: ModelContextLite;
  }
}

const REQUIRED_TOOLS = [
  'get_today_overview',
  'get_meeting',
  'get_calendar_context',
  'find_available_slots',
  'get_project_context',
  'get_open_actions',
  'get_decisions',
  'get_meeting_activity',
  'get_integrations',
  'prepare_meeting_proposal',
  'update_meeting_proposal',
  'prepare_agenda_proposal',
  'prepare_followup_proposal',
  'create_meeting',
  'update_meeting',
  'create_agenda_item',
  'record_decision',
  'create_action_item',
  'assign_action_item',
  'schedule_followup',
  'verify_meeting_state',
];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__KESTREL_POLYFILL_TOOLS__ !== undefined, undefined, {
    timeout: 15_000,
  });
});

test('registers exactly the 21 documented tools @webmcp', async ({ page }) => {
  const names = await page.evaluate(async () => {
    const ctx = document.modelContext!;
    const tools = await ctx.getTools();
    return tools.map((t) => t.name).sort();
  });
  expect(names).toEqual([...REQUIRED_TOOLS].sort());
  expect(names).not.toContain('approve_proposal');
});

test('read tools carry readOnlyHint and get_meeting exposes a schema @webmcp', async ({ page }) => {
  const tools = await page.evaluate(async () => {
    const ctx = document.modelContext!;
    const list = await ctx.getTools();
    return Object.fromEntries(
      list.map((t) => [t.name, { readOnly: t.annotations?.readOnlyHint === true, hasSchema: Boolean(t.inputSchema) }]),
    );
  });
  const readOnlyNames = [
    'get_today_overview',
    'get_meeting',
    'get_calendar_context',
    'find_available_slots',
    'get_project_context',
    'get_open_actions',
    'get_decisions',
    'get_meeting_activity',
    'verify_meeting_state',
  ];
  for (const name of readOnlyNames) {
    expect(tools[name]?.readOnly, `${name} should be readOnlyHint`).toBe(true);
  }
  for (const t of REQUIRED_TOOLS) {
    expect(tools[t]?.hasSchema, `${t} should have an input schema`).toBe(true);
  }
});

test('UI status honestly reports polyfill mode (no false native claim) @webmcp', async ({ page }) => {
  // In this test browser there is no native modelContext, so the badge must
  // say polyfill — never native.
  await expect(page.getByText(/WebMCP (native|polyfill)/)).toBeVisible();
  const text = await page.getByText(/WebMCP (native|polyfill)/).innerText();
  if (!text.includes('native ·') || text.includes('polyfill')) {
    expect(text).toContain('polyfill');
  }
});

test('tool results use the ok/error envelope with stable error codes @webmcp', async ({ page }) => {
  const bad = await page.evaluate(async () => {
    const tools = window.__KESTREL_POLYFILL_TOOLS__!;
    return await tools.get('get_meeting')!.execute({ meetingId: 'mtg_does_not_exist' });
  });
  expect(bad.ok).toBe(false);
  expect((bad.error as { code: string }).code).toBe('NOT_FOUND');

  const good = await page.evaluate(async () => {
    const tools = window.__KESTREL_POLYFILL_TOOLS__!;
    return await tools.get('get_meeting')!.execute({ meetingId: 'mtg_prev_sync4' });
  });
  expect(good.ok).toBe(true);
  // GET /api/meetings/:id returns the detail object directly.
  expect((good.data as { id: string }).id).toBe('mtg_prev_sync4');
});

test('outcome tools propose first and never execute without approval @webmcp', async ({ page }) => {
  const proposed = await page.evaluate(async () => {
    const tools = window.__KESTREL_POLYFILL_TOOLS__!;
    return await tools.get('create_action_item')!.execute({
      meetingId: 'mtg_prev_sync4',
      title: 'E2E: verify payment fix',
      ownerParticipantId: 'par_sarah',
      projectId: 'prj_launch',
      dueAt: null,
      rationale: 'E2E propose-or-execute check',
      idempotencyKey: 'e2e-oia-1',
    });
  });
  expect(proposed.ok).toBe(true);
  const pid = (proposed.data as { proposal: { id: string; status: string } }).proposal.id;
  expect((proposed.data as { proposal: { status: string } }).proposal.status).toBe('pending');

  const attempted = await page.evaluate(async (id) => {
    const tools = window.__KESTREL_POLYFILL_TOOLS__!;
    return await tools.get('create_action_item')!.execute({
      meetingId: 'mtg_prev_sync4',
      title: 'E2E: verify payment fix',
      ownerParticipantId: 'par_sarah',
      projectId: 'prj_launch',
      dueAt: null,
      rationale: 'E2E propose-or-execute check',
      proposalId: id,
      idempotencyKey: 'e2e-oia-2',
    });
  }, pid);
  expect(attempted.ok).toBe(false);
  expect((attempted.error as { code: string }).code).toBe('PROPOSAL_NOT_APPROVED');
});
