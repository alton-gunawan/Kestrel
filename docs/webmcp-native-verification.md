# Native WebMCP Verification — honest record

Status date: 2026-09-02 · Chrome 153.0.8010.12 (stable, macOS) · MeetingOps dev build

## What was verified (PASS)

| Check | Method | Result |
| --- | --- | --- |
| `document.modelContext` exists natively | Real Chrome 153 (channel `chrome`), flag `--enable-features=WebMCP`, no polyfill (`window.__MEETINGOPS_WEBMCP_POLYFILL` unset) | PASS |
| All 20 MeetingOps tools register through the **native** context | `await document.modelContext.getTools()` after app boot | PASS — exactly 20, names match `REQUIRED_TOOL_NAMES` |
| `registerTool` duplicate handling | Re-registration attempt | Native context rejects duplicates; app adapter is idempotent (module-level promise + `getTools()` pre-check) |
| Metadata fidelity | Inspected native tool records | `annotations` (incl. `readOnlyHint`), `description`, `inputSchema`, `title`, `origin` present |

Scripts: `e2e/scripts/native-webmcp-check.mjs`, `native-ui-evidence.mjs`, `native-execute-check.mjs`.
UI evidence: settings page shows “Mode: native document.modelContext · Registered tools (20)”.

## What was verified about the polyfill (PASS, distinct from native)

All 13 Playwright E2E tests (`@golden`, `@webmcp`, `@a11y`) run against the labeled
**polyfill** in Chromium, including the full golden chain
agent→propose→human-approve(UI)→execute→verify→audit. This proves the app logic and
the adapter contract; it does **not** prove native interop by itself — which is why
the native checks above exist.

## What is NOT verifiable locally (UNVERIFIED / BLOCKED)

1. **Native tool execution from the page.** Chrome 153's native surface exposes tool
   *metadata* to the page (`getTools()`), but `execute` is not callable from page
   JavaScript (`toolKeys: [annotations, description, inputSchema, name, origin,
   title, window]`; no `callTool` on the context). Execution is brokered by the
   browser's agent bridge for external MCP clients. There is no page-reachable
   execution path, so “a native tool call executes the real API path” is **UNVERIFIED
   locally**. A `POST /mcp` endpoint on the DevTools port returned 404 in this build.
2. **ChatGPT Desktop end-to-end.** Requires the ChatGPT desktop client connecting to
   this local dev origin over the browser connector. Not attempted (no client
   available in this environment) — **BLOCKED** until that client is used.

## Consequence for the traceability matrix

- WM-1 (native registration): **PASS** (verified above).
- WM-2 (tool schemas/annotations on native): **PASS**.
- WM-3 (native execution / agent round-trip): **UNVERIFIED** — polyfill execution verified; native page-side execution is architecturally unavailable; external-client round-trip pending.
- Approval-is-not-a-tool holds in both modes (no `approve_proposal` anywhere in the registry).
