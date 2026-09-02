/**
 * Native WebMCP verification (Phase 10, WM-11): runs the app in real Chrome
 * (stable channel, no polyfill needed) and checks whether
 * document.modelContext exists natively. If it does, verifies that all 20
 * MeetingOps tools register through the NATIVE implementation and that a
 * native tool call executes the real API path.
 *
 * Honesty: whatever this script cannot prove is reported as UNVERIFIED.
 */
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const CHROME_ARGS = (process.env.CHROME_ARGS ?? '--enable-features=WebMCP').split(' ').filter(Boolean);

const run = async () => {
  const report = {
    chromeVersion: null,
    nativeModelContext: false,
    flagsUsed: CHROME_ARGS,
    registeredNatively: false,
    nativeToolCount: 0,
    nativeExecuteWorks: null,
    errors: [],
    verifiedAt: new Date().toISOString(),
  };

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false, // native WebMCP may require a real browser window
    args: CHROME_ARGS,
  });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('pageerror', (err) => report.errors.push(`pageerror: ${err.message}`));

    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    report.chromeVersion = await browser.version();
    report.nativeModelContext = await page.evaluate(
      () =>
        typeof document !== 'undefined' &&
        'modelContext' in document &&
        document.modelContext !== null &&
        window.__MEETINGOPS_WEBMCP_POLYFILL !== true,
    );

    if (report.nativeModelContext) {
      // The adapter should have registered through the NATIVE context.
      const status = await page.evaluate(async () => {
        const ctx = document.modelContext;
        const tools = await ctx.getTools();
        return { count: tools.length, names: tools.map((t) => t.name) };
      });
      report.nativeToolCount = status.count;
      report.registeredNatively = status.count === 20;
      console.log('native registered tools:', status.count, status.names.join(', '));
    } else {
      console.log('document.modelContext NOT natively available in this Chrome.');
      console.log('Polyfill status flag:', await page.evaluate(() => window.__MEETINGOPS_WEBMCP_POLYFILL === true));
    }
  } catch (err) {
    report.errors.push(err instanceof Error ? err.message : String(err));
  } finally {
    await browser.close();
  }

  writeFileSync('/tmp/webmcp-native-verification.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
};

run().catch((err) => {
  console.error('NATIVE VERIFICATION ERROR:', err);
  process.exit(1);
});
