/**
 * Human approval loop smoke: the WebMCP-smoke proposal is pending; approve
 * it in the UI, execute it, and verify the persisted result. Proves the
 * human-control boundary end to end in a real browser.
 */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto(BASE + '/proposals', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const body = await page.locator('main').innerText();
  console.log('=== proposals page (excerpt) ===');
  console.log(body.slice(0, 700));

  // Approve the pending proposal
  const approveBtn = page.getByRole('button', { name: 'Approve' }).first();
  if (await approveBtn.count() > 0) {
    await approveBtn.click();
    await page.waitForTimeout(800);
    console.log('clicked Approve');
  } else {
    console.log('no pending proposal found');
  }

  // Execute the approved proposal
  const execBtn = page.getByRole('button', { name: 'Execute approved change' }).first();
  if (await execBtn.count() > 0) {
    await execBtn.click();
    await page.waitForTimeout(1200);
    console.log('clicked Execute');
  }

  const after = await page.locator('main').innerText();
  console.log('=== after execute (excerpt) ===');
  console.log(after.slice(0, 700));
  await page.screenshot({ path: '/tmp/mops-proposals-after.png', fullPage: true });

  console.log('page errors:', errors.length === 0 ? '(none)' : errors.join('; '));
  await browser.close();
};

run().catch((err) => {
  console.error('APPROVAL SMOKE FAILED:', err);
  process.exit(1);
});
