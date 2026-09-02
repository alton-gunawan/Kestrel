/**
 * Native WebMCP end-to-end verification: launches real Chrome 153 with the
 * WebMCP feature flag AND its DevTools MCP server, loads MeetingOps, then
 * calls a MeetingOps tool through Chrome's own MCP endpoint — the exact
 * surface external agents (e.g. ChatGPT Desktop) use.
 */
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const CDP_PORT = 9223;

const mcpCall = async (method, params = {}, sessionId = undefined) => {
  const res = await fetch(`http://127.0.0.1:${CDP_PORT}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: Math.floor(Math.random() * 1e9), method, params }),
  });
  const sessionIdOut = res.headers.get('mcp-session-id') ?? sessionId;
  const text = await res.text();
  // MCP servers may answer with SSE frames; extract the JSON payload.
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    const dataLine = text.split('\n').find((l) => l.startsWith('data:'));
    if (dataLine) json = JSON.parse(dataLine.slice(5).trim());
  }
  return { status: res.status, sessionId: sessionIdOut, json };
};

const run = async () => {
  const report = {
    chromeVersion: null,
    nativeModelContext: false,
    mcpServerReachable: false,
    mcpToolsListed: 0,
    meetingOpsToolNames: [],
    nativeToolExecution: null,
    executionResult: null,
    errors: [],
    verifiedAt: new Date().toISOString(),
  };

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    args: [`--remote-debugging-port=${CDP_PORT}`, '--enable-features=WebMCP'],
  });
  try {
    const page = await (await browser.newContext()).newPage();
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    report.chromeVersion = await browser.version();
    report.nativeModelContext = await page.evaluate(
      () => 'modelContext' in document && document.modelContext !== null && window.__MEETINGOPS_WEBMCP_POLYFILL !== true,
    );

    // Chrome's MCP server (initialize → tools/list → tools/call)
    const init = await mcpCall('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'meetingops-verification', version: '1.0.0' },
    });
    if (init.status === 200 && init.json?.result) {
      report.mcpServerReachable = true;
      const sessionId = init.sessionId;
      await mcpCall('notifications/initialized', {}, sessionId);
      const tools = await mcpCall('tools/list', {}, sessionId);
      const all = tools.json?.result?.tools ?? [];
      report.mcpToolsListed = all.length;
      report.meetingOpsToolNames = all.map((t) => t.name).filter((n) => n.startsWith('get_') || n.startsWith('prepare_') || n.startsWith('find_'));
      console.log('MCP tools listed:', all.length);
      console.log(all.map((t) => t.name).join(', '));

      const target = all.find((t) => t.name === 'get_today_overview');
      if (target) {
        const called = await mcpCall(
          'tools/call',
          { name: 'get_today_overview', arguments: {} },
          sessionId,
        );
        report.nativeToolExecution = called.json?.result ? 'executed' : `status ${called.status}`;
        const content = called.json?.result?.content;
        const textPart = Array.isArray(content)
          ? content.find((c) => c.type === 'text')?.text
          : undefined;
        report.executionResult = textPart ?? JSON.stringify(called.json).slice(0, 400);
      } else {
        report.nativeToolExecution = 'get_today_overview not exposed via MCP server';
      }
    } else {
      report.errors.push(`MCP endpoint not available at :${CDP_PORT}/mcp (status ${init.status})`);
    }
  } catch (err) {
    report.errors.push(err instanceof Error ? err.message : String(err));
  } finally {
    await browser.close();
  }

  writeFileSync('/tmp/webmcp-native-full.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
};

run().catch((err) => {
  console.error('NATIVE E2E ERROR:', err);
  process.exit(1);
});
