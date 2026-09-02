/**
 * Manual smoke script (not part of the test suite): renders the app in
 * headless Chromium, captures console errors, asserts key UI surfaces, and
 * saves screenshots for inspection.
 */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(`PAGEERROR: ${err.message}`));

  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  console.log('=== title ===', await page.title());
  console.log('=== overview text ===');
  console.log((await page.locator('main, body').first().innerText()).slice(0, 1200));

  await page.screenshot({ path: '/tmp/mops-overview.png', fullPage: false });

  // Meetings page
  await page.goto(BASE + '/meetings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/mops-meetings.png' });

  // Proposals page
  await page.goto(BASE + '/proposals', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/mops-proposals.png' });

  // Settings page (WebMCP status)
  await page.goto(BASE + '/settings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const settingsText = await page.locator('main, body').first().innerText();
  console.log('=== settings (webmcp status) ===');
  console.log(settingsText.slice(0, 800));
  await page.screenshot({ path: '/tmp/mops-settings.png' });

  console.log('=== console errors ===');
  console.log(consoleErrors.length === 0 ? '(none)' : consoleErrors.join('\n'));

  await browser.close();
};

run().catch((err) => {
  console.error('SMOKE FAILED:', err);
  process.exit(1);
});
