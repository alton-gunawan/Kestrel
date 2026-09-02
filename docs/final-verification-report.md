# Kestrel — Final Verification Report

Date: 2026-09-02 (updated after the integrations direction change) · Commit at verification: see `git log -1` · Machine: macOS, Node 24.5.0, pnpm 10.14.0

## Verdict

Kestrel is implemented as a **web-app-first** product (direction change:
`docs/Kestrel_Perubahan_Arah_Produk_WebApp_First_WebMCP_Integration_Abstraction.md`):
the human UI is the primary experience, WebMCP is an alternative interface over
the same shared services, and integrations are a user-facing capability. The
four claim classes from `docs/07_TEST_AND_VERIFICATION.md` are kept separate:

1. **Code correctness** — PASS (typecheck, lint, 96 automated tests green: 23
   contracts + 73 API, incl. 15 new integration tests).
2. **Workflow correctness** — PASS (16 Playwright E2E tests: 3 golden incl. the
   agent→propose→human-approve→execute→verify→audit chain and the unapproved-refusal
   chain, 5 WebMCP contract incl. the 21-tool catalog, 5 a11y, 3 integrations UI).
3. **Native WebMCP interop** — PARTIAL: native **registration** verified in real
   Chrome 153 for the 20-tool catalog; the 21st tool (`get_integrations`) is
   **UNVERIFIED** natively; native tool **execution** through an external agent
   client (ChatGPT Desktop connector) is **UNVERIFIED** — see
   `docs/webmcp-native-verification.md`.
4. **Deployed judge-path readiness** — UNVERIFIED: production builds exist and a
   deployment runbook is written; no live deployment was performed in this environment.

## Gates actually run (with results)

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck (all packages) | `pnpm typecheck` | PASS (0 errors) |
| Lint | `pnpm lint` (eslint 10 flat config) | PASS (0 problems) |
| Contracts tests | `pnpm --filter @kestrel/contracts test` | PASS — 23 tests / 2 files (incl. 21-tool catalog + integration schemas) |
| API unit + integration | `pnpm --filter @kestrel/api test` (Vitest, real PostgreSQL `kestrel_test`) | PASS — 73 tests / 6 files (incl. 15 integration tests: connect/disconnect/sync, webhook idempotency, provider failure, invalid payload) |
| Clean-DB migration proof | scratch database + `pnpm db:migrate` (`drizzle/0000_*.sql` + `0001_*.sql` via migration runner) | PASS — 17 tables created from empty database, runner verified |
| E2E golden | `npx playwright test tests/golden.spec.ts` | PASS — 3 tests |
| E2E WebMCP contract | `npx playwright test tests/webmcp.spec.ts` | PASS — 5 tests (incl. "registers exactly the 21 documented tools") |
| E2E accessibility | `npx playwright test tests/a11y.spec.ts` (axe-core + keyboard) | PASS — 5 tests, 0 serious/critical violations |
| E2E integrations UI | `npx playwright test tests/integrations.spec.ts` | PASS — 3 tests (catalog, connect→sync→disconnect, activity) |
| Web production build | `pnpm build:web` (Vite + Astryx/StyleX plugin) | PASS |
| API production build | `pnpm build:api` (tsc) | PASS |
| Dependency guard | `pnpm audit:deps` | PASS — no LLM/AI-SDK/OpenAI/LangChain dependencies or imports |
| Native registration | `node e2e/scripts/native-webmcp-check.mjs` (Chrome 153.0.8010.12, `--enable-features=WebMCP`) | PASS (20-tool catalog at run time) — `document.modelContext` native, duplicate-safe; 21st tool UNVERIFIED natively |
| Native UI evidence | `node e2e/scripts/native-ui-evidence.mjs` | PASS (20-tool revision) — Settings shows "native document.modelContext · Registered tools (20)" |

## Known limitations (stated, not hidden)

1. **Native agent round-trip (ChatGPT Desktop) not demonstrated.** Chrome 153
   exposes tool metadata to the page but brokers execution for external MCP
   clients only; no external agent client was available here. The execution
   callbacks are the same functions the polyfill exercised, and the polyfill
   chain (propose→approve→execute→verify) is E2E-verified — but the browser-
   brokered invocation path itself is unproven in this environment.
2. **21st WebMCP tool not natively re-verified.** The direction change added
   `get_integrations` (catalog now 21 tools). Native registration in Chrome 153
   was verified for the 20-tool catalog; the new tool is covered by the labeled
   polyfill E2E path only — native registration of `get_integrations` is
   **UNVERIFIED** (see `webmcp-native-verification.md`).
3. **Integration demo adapters are demo-scoped.** Google Calendar and Fathom
   adapters exercise the real adapter boundary over seeded/local data; no real
   external system is contacted. This is honest by design (no fake success),
   and real provider connectivity remains UNVERIFIED.
4. **No mobile bottom-nav layout.** The UI is desktop-optimized; Astryx AppShell
   provides a compact side nav but a dedicated mobile bottom-nav was not built
   (out of the MVP's demo path).
5. **No NL command-bar input.** The agent entry point is the WebMCP tool surface;
   agent guidance is documented in Settings instead of a top-bar NL input.
6. **Deployment smoke not executed.** `docs/deployment.md` describes Neon
   deployment; no live deploy was performed.
7. **Demo routes** are disabled in production unless `ENABLE_DEMO_ROUTES=true`.
8. **AI-generated UI strings** are English/Indonesian mixed; no full i18n (out of scope).

## Requirement status summary

Per-requirement statuses live in `docs/requirements-traceability.md` (updated at
final phase). Roll-up: all STACK/WM/DOM/AG/TEST/INT rows PASS except WM-1's native
*execution* sub-claim and the 21st tool's native registration (documented
UNVERIFIED above), UX-3 and UX-9 (FAIL — stated limitations 4 and 5),
TEST-7/REL-5 deployment-smoke portions (UNVERIFIED), and SC-2 external-client
round-trip (UNVERIFIED).

## Security review notes (Phase 9)

- CORS: strict origin allowlist + credentials (no wildcard with credentials).
- Sessions: HttpOnly SameSite=Lax cookie; 401 on missing session (tested).
- Approval boundary: `approve_proposal` is not a tool; approve/reject endpoints
  reject body-spoofed approval fields with `APPROVAL_FORBIDDEN` (tested, 403).
- Error handling: unknown errors → redacted 500; stable codes elsewhere; Zod
  errors → 400 `VALIDATION_ERROR` (tested).
- Headers: helmet enabled (CSP on in production); rate limit 300/min (raised in tests).
- Logging: pino; request-id hook `x-request-id` on every response (tested).
- No secrets in client bundle: web client only holds same-origin API paths;
  `SESSION_SECRET` lives in API env only.
- Prompt-injection posture: meeting titles/agenda/decisions are user content and
  are rendered as inert text (no `dangerouslySetInnerHTML`, no eval); tool
  results pass through the API's validated envelopes.
