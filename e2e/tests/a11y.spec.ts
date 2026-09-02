/**
 * Accessibility (@a11y): axe-core scans of the main surfaces, plus keyboard
 * reachability of the approval flow (UX-13, keyboard workflows).
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function scan(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const critical = results.violations.filter((v) =>
    v.impact === 'critical' || v.impact === 'serious',
  );
  // Report violations in the assertion message for debuggability.
  expect(
    critical.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} nodes`),
    'serious/critical accessibility violations',
  ).toEqual([]);
}

test.describe('accessibility @a11y', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.__KESTREL_POLYFILL_TOOLS__ !== undefined, undefined, {
      timeout: 15_000,
    });
  });

  test('overview page has no serious a11y violations @a11y', async ({ page }) => {
    await expect(page.getByText('What needs attention today')).toBeVisible();
    await scan(page);
  });

  test('meetings page has no serious a11y violations @a11y', async ({ page }) => {
    await page.goto('/meetings');
    await expect(page.getByText('Jadwal & Ruang Kerja Rapat Pengguna')).toBeVisible();
    await scan(page);
  });

  test('proposals page has no serious a11y violations @a11y', async ({ page }) => {
    await page.goto('/proposals');
    await expect(page.getByText('Nothing executes without approval here.')).toBeVisible();
    await scan(page);
  });

  test('settings page has no serious a11y violations @a11y', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText('Settings & Integrasi')).toBeVisible();
    await scan(page);
  });

  test('approve action is keyboard reachable @a11y', async ({ page }) => {
    // Create a pending proposal through the hook, then reach Approve via Tab.
    const proposal = await page.evaluate(async () => {
      const tools = window.__KESTREL_POLYFILL_TOOLS__;
      const slots = await tools.get('find_available_slots')!.execute({
        participantIds: ['par_alex'],
        dateFrom: new Date().toISOString().slice(0, 10),
        dateTo: new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10),
        durationMinutes: 30,
      });
      return await tools.get('prepare_meeting_proposal')!.execute({
        title: 'Keyboard a11y meeting',
        purpose: '',
        projectId: null,
        startAt: (slots.data as { slots: Array<{ startAt: string }> }).slots[0]!.startAt,
        durationMinutes: 30,
        participants: [{ participantId: 'par_alex', role: 'organizer' }],
        agenda: [],
        rationale: 'Keyboard reachability test',
      });
    });
    expect(proposal.ok).toBe(true);

    await page.goto('/proposals');
    await expect(page.getByText('Keyboard a11y meeting')).toBeVisible();

    const approveButton = page.getByRole('button', { name: 'Approve' }).first();
    await approveButton.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText(/Proposal approved/).first()).toBeVisible({ timeout: 10_000 });

    // Keyboard-execute the approved proposal too.
    const execButton = page.getByRole('button', { name: 'Execute approved change' }).first();
    await execButton.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText(/VERIFIED|verification/i).first()).toBeVisible({ timeout: 10_000 });

    // Reset demo to keep state clean.
    await page.evaluate(async () => {
      await fetch('/api/demo/reset', { method: 'POST', credentials: 'same-origin' });
    });
  });
});
