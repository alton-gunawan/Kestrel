/** Execute a tool through the NATIVE document.modelContext in Chrome 153. */
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--enable-features=WebMCP'] });
try {
  const page = await (await browser.newContext()).newPage();
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const result = await page.evaluate(async () => {
    const ctx = document.modelContext;
    const tools = await ctx.getTools();
    const target = tools.find((t) => t.name === 'get_today_overview');
    if (!target) return { ok: false, error: 'tool missing from native registry', keys: Object.keys(target ?? {}) };
    // The native surface exposes an MCP-style call, not the draft's execute().
    if (typeof target.execute === 'function') {
      return { ok: true, via: 'execute', result: await target.execute({}) };
    }
    if (typeof ctx.callTool === 'function') {
      return { ok: true, via: 'callTool', result: await ctx.callTool('get_today_overview', {}) };
    }
    return { ok: false, error: 'no execution surface on native context', toolKeys: Object.keys(target), ctxKeys: Object.keys(ctx) };
  });
  console.log(JSON.stringify(result, null, 2).slice(0, 1600));
} finally {
  await browser.close();
}
