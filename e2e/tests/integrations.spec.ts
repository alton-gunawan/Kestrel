/**
 * Integrations UI E2E (@integrations): the user-facing provider lifecycle
 * renders honestly — catalog with demo labels, connect flow, sync status,
 * disconnect, and real activity. No fake success. Order-independent: every
 * action checks current state before acting.
 */
import { test, expect, type Page } from '@playwright/test';

async function catalogState(page: Page): Promise<Array<{ providerId: string; status: string }>> {
  return page.evaluate(async () => {
    const res = await fetch('/api/integrations', { credentials: 'same-origin' });
    const body = (await res.json()) as {
      providers: Array<{ providerId: string; connection: { status: string } | null }>;
    };
    return body.providers.map((p) => ({
      providerId: p.providerId,
      status: p.connection?.status ?? 'disconnected',
    }));
  });
}

test.describe('integrations UI @integrations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/integrations');
    await expect(page.getByText('Integrations', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  });

  test('catalog renders capabilities and demo adapters', async ({ page }) => {
    await expect(page.getByText('Calendar', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Meeting intelligence', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Google Calendar').first()).toBeVisible();
    await expect(page.getByText('Fathom').first()).toBeVisible();
    // Demo adapters are labeled honestly.
    await expect(page.getByText('DEMO').first()).toBeVisible();
  });

  test('connect, sync, and disconnect work end-to-end', async ({ page }) => {
    const state = await catalogState(page);
    const gcal = state.find((s) => s.providerId === 'google_calendar');

    if (gcal?.status !== 'connected') {
      // Connect Google Calendar (scope confirmation → confirm).
      await page.getByRole('button', { name: 'Connect' }).first().click();
      await page.getByRole('button', { name: 'Confirm Connect' }).first().click();
      await expect(page.getByText('CONNECTED').first()).toBeVisible({ timeout: 10_000 });
    }

    // Sync produces an honest local-demo summary.
    await page.getByRole('button', { name: 'Sync' }).first().click();
    await expect(page.getByText(/local demo calendar model/).first()).toBeVisible({ timeout: 10_000 });

    // Disconnect retains the card and shows the connect CTA again.
    await page.getByRole('button', { name: 'Disconnect' }).first().click();
    await expect(page.getByRole('button', { name: 'Connect' }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('activity list shows real server events', async ({ page }) => {
    // Ensure at least one connection + sync happened so activity has entries.
    const state = await catalogState(page);
    const gcal = state.find((s) => s.providerId === 'google_calendar');
    if (gcal?.status !== 'connected') {
      await page.getByRole('button', { name: 'Connect' }).first().click();
      await page.getByRole('button', { name: 'Confirm Connect' }).first().click();
      await expect(page.getByText('CONNECTED').first()).toBeVisible({ timeout: 10_000 });
    }
    await page.getByRole('button', { name: 'Sync' }).first().click();
    await expect(page.getByText(/local demo calendar model/).first()).toBeVisible({ timeout: 10_000 });

    await expect(page.getByText('Integration Activity')).toBeVisible();
    await expect(page.getByText('connected', { exact: false }).first()).toBeVisible({ timeout: 10_000 });
  });
});
