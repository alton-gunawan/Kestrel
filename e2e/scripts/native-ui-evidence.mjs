/**
 * Native-mode UI evidence: real Chrome 153 + WebMCP flag shows the honest
 * "WebMCP native · 20 tools" badge (20-tool catalog revision; the 21st tool,
 * get_integrations, was added later and its native registration is UNVERIFIED
 * — see docs/webmcp-native-verification.md), and the settings page reports
 * native mode.
 */
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';

const run = async () => {
  const evidence = { badge: null, settings: null, screenshots: [] };
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    args: ['--enable-features=WebMCP'],
  });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    evidence.badge = await page.getByText(/WebMCP (native|polyfill|unavailable)/).first().innerText();
    await page.screenshot({ path: '/tmp/mops-native-overview.png' });
    evidence.screenshots.push('/tmp/mops-native-overview.png');

    await page.goto(BASE + '/settings', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    evidence.settings = await page.locator('main').innerText();
    await page.screenshot({ path: '/tmp/mops-native-settings.png', fullPage: true });
    evidence.screenshots.push('/tmp/mops-native-settings.png');
  } finally {
    await browser.close();
  }
  writeFileSync('/tmp/mops-native-ui-evidence.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
};

run().catch((err) => {
  console.error('NATIVE UI EVIDENCE ERROR:', err);
  process.exit(1);
});
