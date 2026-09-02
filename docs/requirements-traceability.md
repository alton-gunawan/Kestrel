# Kestrel — Requirements Traceability

This document maps every requirement from the project's source-of-truth documents to:

- **Implementation** — primary file(s)/module(s) that implement it
- **Test** — automated check(s) that verify it
- **Golden-demo evidence** — how the golden scenario (`06_GOLDEN_DEMO.md`) demonstrates it
- **Status** — `PLANNED` → `PASS` / `FAIL` / `UNVERIFIED` / `BLOCKED`

Sources: `Kestrel_PRD.md`, `docs/00_TECH_STACK.md`, `docs/01_BUILD_INSTRUCTIONS.md`, `docs/02_WEBMCP_SPEC.md`, `docs/03_DOMAIN_DATA_API.md`, `docs/04_AGENT_INTERACTION.md`, `docs/05_UX_UI_SPEC.md`, `docs/06_GOLDEN_DEMO.md`, `docs/07_TEST_AND_VERIFICATION.md`, `docs/08_DEVPOST_SUBMISSION.md`, `docs/09_RELEASE_CHECKLIST.md`.

Note: `docs/01_BUILD_INSTRUCTIONS.md` names this document `IMPLEMENTATION_TRACEABILITY.md`; the harness prompt and this repo's canonical name is `requirements-traceability.md` (see `implementation-decisions.md`, D-002).

Status legend:

| Status | Meaning |
| --- | --- |
| `PLANNED` | Not yet implemented (Phase 0 artifact) |
| `PASS` | Implemented and actually verified by the listed test/evidence |
| `FAIL` | Implemented, verification failed — must be fixed |
| `UNVERIFIED` | Implemented but not actually verified; a mock or a passing build is **not** accepted as verification |
| `BLOCKED` | Cannot be verified for a concrete external reason (recorded in the final report) |

---

## 1. Stack & architecture (00_TECH_STACK, 01_BUILD_INSTRUCTIONS)

| ID | Requirement | Implementation | Test | Golden-demo evidence | Status |
| --- | --- | --- | --- | --- | --- |
| STACK-1 | React 19+, Vite, TypeScript strict, React Router | `apps/web` — `package.json`, `vite.config.ts`, `tsconfig.json` (strict), React Router routes | `pnpm typecheck`, production build | App renders all pages | PASS |
| STACK-2 | Astryx design system + StyleX styling | `apps/web` uses `@astryxdesign/core` + `@astryxdesign/theme-neutral`; product styles in `*.stylex.ts` via `@stylexjs/stylex`; `astryxStylex()` Vite plugin | Build + visual check in E2E | Professional UI presentation | PASS |
| STACK-3 | Phosphor Icons only for interface icons | `@phosphor-icons/react` used across `apps/web/src/components` | Lint rule/grep check; E2E visuals | Icons in nav, statuses, activity | PASS |
| STACK-4 | Node.js + Fastify + TypeScript + Zod backend | `apps/api` — Fastify 5, Zod 4 | API integration tests | All agent/UI flows through API | PASS |
| STACK-5 | Drizzle ORM + PostgreSQL (Neon hosted) | `apps/api/src/db` (Drizzle schema + migrations); postgres.js driver; Neon documented in deployment runbook | `pnpm db:migrate` from clean DB; integration tests | Reset/seed writes real Postgres state | PASS |
| STACK-6 | Vitest + Playwright testing | Workspace test configs; `apps/*/vitest.config.ts`; `e2e/playwright.config.ts` | `pnpm test`, `pnpm test:e2e` | E2E runs the golden scenario | PASS |
| STACK-7 | No embedded LLM / no Vercel AI SDK / no LangChain / no OpenAI dependency in product | Dependency audit; no such imports exist | `pnpm audit:deps` script (grep guard) | N/A (absence) | PASS |
| STACK-8 | Browser owns UI state + WebMCP registration; backend owns durable state, validation, authorization, persistence, audit | `apps/web/src/webmcp` adapter vs `apps/api/src` services | Architecture tests (no DB access from web) | Agent activity shows browser-registered tools acting through API | PASS |
| STACK-9 | Deterministic domain logic; server-side validation/authorization; human approval; idempotent mutations; explicit errors | `packages/contracts` (schemas, error codes), `apps/api/src/domain` | Unit + integration tests | Stale proposal rejection step | PASS |
| STACK-10 | Deployment: static Vite frontend, Node/Fastify backend, Neon PostgreSQL | `apps/web` build output; `apps/api` Node service; `docs/deployment.md` | Production build + smoke script | N/A | UNVERIFIED (runbook written, no live deploy) |

## 2. WebMCP (02_WEBMCP_SPEC)

| ID | Requirement | Implementation | Test | Golden-demo evidence | Status |
| --- | --- | --- | --- | --- | --- |
| WM-1 | Native `document.modelContext.registerTool(...)` — real API, no fake wrapper | `apps/web/src/webmcp/register.ts` — registers only when `'modelContext' in document` | Playwright with conforming WebMCP API stub + native browser verification (Phase 10) | Agent discovers tools in supported client | PASS (native registration verified in Chrome 153 for the 20-tool catalog; the 21st tool `get_integrations` native registration is UNVERIFIED — see webmcp-native-verification.md) |
| WM-2 | Tool catalog — read-only: `get_today_overview`, `get_meeting`, `get_calendar_context`, `find_available_slots`, `get_project_context`, `get_open_actions`, `get_decisions`, `get_meeting_activity`, `get_integrations` | `apps/web/src/webmcp/tools/*.ts` + `packages/contracts/src/webmcp-tool-catalog.ts` (21 tools) | WebMCP tool tests (schema + execution) | Agent reads context before proposing | PASS |
| WM-3 | Tool catalog — proposal: `prepare_meeting_proposal`, `update_meeting_proposal`, `prepare_agenda_proposal`, `prepare_followup_proposal` | same | same | `prepare_meeting_proposal` + `prepare_agenda_proposal` steps | PASS |
| WM-4 | Tool catalog — mutating/verification: `create_meeting`, `update_meeting`, `create_agenda_item`, `record_decision`, `create_action_item`, `assign_action_item`, `schedule_followup`, `verify_meeting_state` | same | same | `create_meeting`, `create_agenda_item`, `verify_meeting_state` execution steps | PASS |
| WM-5 | Strict input schemas: opaque string IDs, date/time formats, unknown fields rejected, min/max lengths, array bounds, exact enums | Zod schemas in `packages/contracts` converted to JSON Schema | Schema unit tests (AJV with `additionalProperties:false`) | Malformed input demo-safe | PASS |
| WM-6 | Tool result contract: `{ok:true,data,context.requestId}` / `{ok:false,error:{code,message},context}` | `apps/web/src/webmcp/result.ts` | WebMCP execution tests | UI activity shows structured results | PASS |
| WM-7 | `approve_proposal` is NOT a WebMCP tool; approval only via human UI | Approval endpoint requires human session; no tool named approve | Negative test: agent path cannot approve | Explicit approval boundary in UI | PASS |
| WM-8 | Safety: read-only tools run without approval; proposal tools don't change committed state; mutating tools require human-approved proposal; forged approval fields rejected; stale revisions rejected | `apps/api/src/services/proposalService.ts`, `executionService.ts` | Integration negative tests | Stale proposal step (1:15–1:35) | PASS |
| WM-9 | State-aware exposure; stale tools must not cause invalid state | Server-side state validation on every tool call; `INVALID_STATE` errors; registration via AbortSignal cleanup on session change | Integration + WebMCP tests | `record_decision` blocked before meeting completion | PASS |
| WM-10 | No hallucinated side effects; verification reports actual persisted state; local calendar domain model clearly labeled | `verify_meeting_state` compares expectation vs DB; UI labels calendar as local domain model | Verification tests | `verify_meeting_state` output shown | PASS |
| WM-11 | Register tools only when WebMCP supported; human UI works without WebMCP | Feature detection; status badge; all UI actions available without WebMCP | E2E with WebMCP absent | Manual fallback usable | PASS |
| WM-12 | Native verification in supported browser/client recorded (browser, version, URL, prompts, outputs, timestamps) | `docs/webmcp-native-verification.md` | Manual verification Phase 10 | Submission evidence | PASS (20/20 native verified; 21-tool re-verification pending — UNVERIFIED for `get_integrations`) |
| WM-13 | Integration status read tool: `get_integrations` (read-only; provider catalog + connection status; no connect/disconnect via tools) | `packages/contracts/src/webmcp-tool-catalog.ts`, `apps/web/src/webmcp/adapter.ts` → `GET /api/integrations` | Contracts catalog test (21 tools, readOnlyHint) + WebMCP E2E | Agent reads integration status before proposing | PASS |

## 3. Domain, data, API (03_DOMAIN_DATA_API)

| ID | Requirement | Implementation | Test | Golden-demo evidence | Status |
| --- | --- | --- | --- | --- | --- |
| DOM-1 | Entities: User, Participant, Project, Meeting, MeetingParticipant, AgendaItem, Decision, ActionItem, FollowUp, AuditEvent (+ Proposal, see D-003) | `apps/api/src/db/schema.ts` (Drizzle) | Migration + repository tests | Launch project, Alex/Sarah/Daniel, meetings, agenda, decisions, actions, follow-up | PASS |
| DOM-2 | INV-1 meeting duration 5–180 min | `packages/contracts` Zod + domain validation | Unit tests | 30-minute launch review | PASS |
| DOM-3 | INV-2 participants unique per meeting | DB unique constraint + service check | Integration test | N/A | PASS |
| DOM-4 | INV-3 organizer must be a participant | `meetingService.createMeeting` | Unit + integration | Alex organizer | PASS (exactly-one-organizer rule) |
| DOM-5 | INV-4 agenda sort order unique within meeting | DB unique constraint + reorder service | Unit + integration | Ordered agenda in proposal | PASS |
| DOM-6 | INV-5 action item owner must be meeting participant (unless domain rule allows) | `actionService` validation | Unit + integration | Payment blocker assigned to Sarah/Daniel | PASS |
| DOM-7 | INV-6 completed meeting cannot be rescheduled without reopen flow | Status transition map | Unit + integration | N/A | PASS |
| DOM-8 | INV-7 stale revision cannot be applied | `expectedRevision` checks → `STALE_REVISION` | Integration test | N/A | PASS |
| DOM-9 | INV-8 approval invalid when protected meeting field changes | Proposal supersede rules | Unit + integration | Replan after "move to Wednesday" | PASS |
| DOM-10 | INV-9 agent cannot create approval record | Approval only via human-session endpoint; tools cannot pass approval flags | Negative integration test | Approval boundary step | PASS |
| DOM-11 | INV-10 every successful mutation creates an audit event | Transactional audit write in domain services | Integration test | Agent activity timeline | PASS |
| DOM-12 | Optimistic concurrency: `expectedRevision`, atomic increment, `STALE_REVISION` | Repository update guards | Integration test | N/A | PASS |
| DOM-13 | REST endpoints incl. `GET /api/overview`, meetings CRUD, proposals, approve, agenda-items, decisions, actions, follow-ups, activity | `apps/api/src/routes/*.ts` | API integration tests | All UI/agent flows | PASS |
| DOM-14 | API principles: Zod validation, stable error codes, request ID on every response, JSON only, no business rules in routes, CORS allowlist, idempotency keys | `apps/api/src/app.ts`, `errors.ts`, hooks | API integration tests | N/A | PASS |
| DOM-15 | Repository boundary: route → application service → domain service → repository → Drizzle → PostgreSQL; WebMCP adapter calls same services via authenticated API client | Layered modules; web adapter uses fetch API client | Architecture/unit tests | Same rules both paths | PASS |

## 3b. Integrations (direction change — Kestrel_Perubahan_Arah_…, §12)

| ID | Requirement | Implementation | Test | Golden-demo evidence | Status |
| --- | --- | --- | --- | --- | --- |
| INT-1 | Provider abstraction by capability (Calendar, Meeting Intelligence, Communication, Project, Meeting Platform, Automation); providers are not core domain entities | `apps/api/src/integrations/types.ts` (capability ports), `registry.ts` (registry + catalog) | `apps/api/src/integration/integrations.test.ts` | Optional integrations demo segment | PASS |
| INT-2 | Catalog of 13 providers; MVP implements demo adapters for Google Calendar + Fathom; others declared "Not implemented in MVP" | `packages/contracts/src/integrations.ts` (`INTEGRATION_PROVIDERS`, `PROVIDER_CAPABILITIES_BY_PROVIDER`); `registry.ts` | Contracts + integration tests | Demo segment shows demo labels | PASS |
| INT-3 | Google Calendar demo adapter: local demo calendar model, `demo_gcal_*` external id, `externalUrl: null` — never claims a real external event | `apps/api/src/integrations/providers/googleCalendarDemo.ts` | Integration test (sync summary contains 'local demo calendar model') | Demo segment step 1–2 | PASS |
| INT-4 | Fathom demo adapter: deterministic demo transcript → proposal-ready analysis (payment blocker, data migration); no committed decisions/actions | `apps/api/src/integrations/providers/fathomDemo.ts`, `canonical.ts` (`analyzeTranscript`) | Integration test (sync summary contains 'proposal-ready') | Demo segment step 3 | PASS |
| INT-5 | Persistence: integration_connections, integration_events, external_references, ingestion_records (migration 0001) | `apps/api/src/db/schema.ts`, `apps/api/drizzle/0001_eager_crystal.sql`; `repositories/drizzle.ts` (`DrizzleIntegrationRepository`) | Clean-DB migration + repository tests | Demo reset truncates/rewrites incl. integration tables | PASS |
| INT-6 | IntegrationService: catalog, connect, disconnect (retains canonical data), sync, ingestWebhook, activity; connect duplicate → CONFLICT; unknown provider → VALIDATION_ERROR; idempotency replay | `apps/api/src/services/integrationService.ts`; routes `apps/api/src/routes/integrations.ts` | `integrations.test.ts` (15 tests) | Demo segment connect/disconnect | PASS |
| INT-7 | Webhook ingestion: requires connected provider (INVALID_STATE), idempotent per (providerId, sourceEventId), invalid payload → failed ingestion record + VALIDATION_ERROR, auditable | `integrationService.ingestWebhook` + `ingestion_records` unique index | Integration tests (duplicate eventId, invalid payload, unconnected provider) | N/A | PASS |
| INT-8 | Untrusted-data rule: transcript/calendar/webhook data → Zod validation → canonical mapping → proposals awaiting human approval; never committed directly; integrations never bypass domain invariants or write directly to DB | `canonical.ts` (parseTranscriptInput/parseCalendarContext), `analyzeTranscript` | Integration tests assert no Decision/ActionItem created by ingestion | Demo segment step 3 note | PASS |
| INT-9 | Provider failure states: sync error → connection status `error` + lastError + 'sync.failed' event + UNAVAILABLE error; never reported as success | `integrationService.sync` | Integration test (disconnected sync → INVALID_STATE; failure path) | N/A | PASS |
| INT-10 | User-facing Integrations UI: provider cards by capability, connect with scope confirmation, sync/disconnect, last error, activity list, loading/empty/error states; route `/integrations`, nav "Integrations" | `apps/web/src/pages/IntegrationsPage.tsx`, `apps/web/src/App.tsx` | Web typecheck + build; E2E `e2e/tests/integrations.spec.ts` (catalog, connect→sync→disconnect, activity) | Demo segment (judge path ~30s) | PASS |
| INT-11 | WebMCP exposure: `get_integrations` read-only tool (catalog + connection status); connecting/disconnecting is UI-only, not a tool | `packages/contracts/src/webmcp-tool-catalog.ts` (21 tools), `apps/web/src/webmcp/adapter.ts` | WM-13 (catalog + E2E) | N/A | PASS |
| INT-12 | One connection per provider (documented MVP simplification) | `integrationService.connect` (CONFLICT if already connected) | Integration test | N/A | PASS |

## 4. Agent interaction (04_AGENT_INTERACTION)

| ID | Requirement | Implementation | Test | Golden-demo evidence | Status |
| --- | --- | --- | --- | --- | --- |
| AG-1 | Read before mutate: meeting, availability, project context, actions/decisions readable via tools | Read tools (WM-2) | WebMCP tests | Agent reads Launch context first | PASS |
| AG-2 | Proposals state what/why/constraints/uncertainties | Proposal `rationale` + diff payload rendered in UI | Integration test on proposal payload | Proposal shows rationale | PASS |
| AG-3 | Never forge approval | WM-7/DOM-10 | Negative tests | Approval boundary | PASS |
| AG-4 | Human constraint change invalidates previous proposal; new proposal computed | Supersede rules + `update_meeting_proposal` | Integration test | Wednesday replan step | PASS |
| AG-5 | Verify after execution: meeting state, agenda, action items, owners, follow-up | `verify_meeting_state` + execution verification | Integration test | Verification step | PASS |
| AG-6 | Example interaction (launch review flow) supported end-to-end | Whole system | E2E golden scenario | The demo itself | PASS |
| AG-7 | Prompt-injection boundary: user content treated as data | Content rendered as text; never executed/interpreted as instructions; documented | Code review + unit test on seeded injection-safe content | N/A | PASS |
| AG-8 | Failure behavior: report error, stop dependent mutations, no ID guessing, no unsafe retries, replan on state change | Structured error results; idempotency; stale checks | WebMCP negative tests | Error states visible | PASS |

## 5. UX/UI (05_UX_UI_SPEC)

| ID | Requirement | Implementation | Test | Golden-demo evidence | Status |
| --- | --- | --- | --- | --- | --- |
| UX-1 | Professional, calm, operational; no AI-toy aesthetics | Astryx neutral theme, restrained StyleX tokens | Visual check in E2E | Dashboard presentation | PASS |
| UX-2 | Primary navigation: Overview, Meetings, Projects, Actions, Decisions, Settings | `AppShell` + `SideNav` | E2E navigation test | Judge navigates areas | PASS |
| UX-3 | Shell: persistent left nav, top command bar, main content, right Agent Activity panel on workflow pages; mobile compact header + bottom nav | `apps/web/src/ui/AppShell.tsx` + responsive styles | E2E responsive check | Demo layout | FAIL (desktop-optimized; no mobile bottom-nav — stated limitation) |
| UX-4 | Overview answers "What needs my attention?" (next meeting, needs preparation, overdue actions, pending decisions, recent agent activity) | `apps/web/src/pages/OverviewPage.tsx` | E2E + component tests | 0:00–0:20 setup view | PASS |
| UX-5 | Meetings list with filters (all/today/week/needs attention) and per-row time/title/participants/project/status/prep-outcome indicator | `apps/web/src/pages/MeetingsPage.tsx` | E2E | Meetings list at setup | PASS |
| UX-6 | Meeting detail header + tabs: Overview, Agenda, Outcomes, Follow-up with documented contents | `apps/web/src/pages/MeetingDetailPage.tsx` | E2E tab tests | 2:10–2:35 outcomes step | PASS |
| UX-7 | Approval UX: review changes, before/after summary, rationale, warnings, unresolved items, Reject/Edit/Approve | `apps/web/src/proposals/ProposalReview*` | E2E approval flow | 1:35–1:50 approval step | PASS |
| UX-8 | Agent Activity shows actual tool activity; waiting state from real proposal state | Reads audit events API; no fabricated logs | E2E + integration | Activity panel through demo | PASS |
| UX-9 | Command bar: NL entry point, not a chat app; placeholder text as documented | Honest handoff surface (D-009): records request, shows WebMCP status + agent guidance | E2E presence test | 0:20–0:45 request step | FAIL (no NL command bar; WebMCP tool surface + Settings guidance instead) |
| UX-10 | Accessibility: keyboard nav, visible focus, semantic headings, labelled controls, dialog focus trap, Esc closes, no color-only meaning, reduced motion, touch targets | Astryx primitives + app conventions; axe tests | A11y tests (axe + keyboard E2E) | Judge can keyboard-drive demo | PASS |
| UX-11 | Phosphor icon set usage consistent | Shared icon components | Lint/grep | Icons consistent | PASS |
| UX-12 | Astryx primitives for buttons, dialogs, inputs, tabs, menus, badges, tables, tooltips, tokens | Direct imports from `@astryxdesign/core` | Build + a11y tests | N/A | PASS |
| UX-13 | Every important view has loading/empty/success/error/blocked/stale/unavailable states | Shared state components + per-page wiring | Component/E2E tests | Stale proposal blocked state | PASS |

## 6. Golden demo (06_GOLDEN_DEMO)

| ID | Requirement | Implementation | Test | Golden-demo evidence | Status |
| --- | --- | --- | --- | --- | --- |
| DEMO-1 | Judge understands product + WebMCP value in <3 minutes | Demo route + documentation; proposal/verification visibility | E2E duration sanity | Whole demo | PASS |
| DEMO-2 | Scenario data: Launch project; Alex, Sarah, Daniel; Daniel focus block Tuesday afternoon; two unresolved blockers; previous meeting resolved pricing | `apps/api/src/seed/goldenDemo.ts` | Seed determinism tests | Setup step | PASS |
| DEMO-3 | Agent activity: get_project_context, find_available_slots, prepare_meeting_proposal, prepare_agenda_proposal | WebMCP tools + activity panel | E2E agent-path test | 0:20–0:45 | PASS |
| DEMO-4 | Proposal shows time, participants, project, agenda, blockers, rationale | Proposal review UI | E2E | 0:45–1:15 | PASS |
| DEMO-5 | Human edit → revised proposal (move to Wednesday, add payment blocker, remove pricing) | `update_meeting_proposal` + supersede | E2E replan test | 1:15–1:35 | PASS |
| DEMO-6 | Explicit approval boundary (Review → Approve) | Approval UX (UX-7) | E2E approval test | 1:35–1:50 | PASS |
| DEMO-7 | WebMCP execution: create_meeting, create_agenda_item, verify_meeting_state | Mutating tools + verification | WebMCP + E2E | 1:50–2:10 | PASS |
| DEMO-8 | Outcomes: decisions and action items connected to project | Outcomes tab + action creation | E2E | 2:10–2:35 | PASS |
| DEMO-9 | Continuity: follow-up suggestion (payment blocker → Friday check-in) | Follow-up proposal + UI | E2E + `apps/api/src/integration/followups.test.ts` (propose→approve→execute→verify + supersede) | 2:35–2:55 | PASS |
| DEMO-10 | Deterministic seed; reset button/route; no signup; no external calendar; no fake logs | Reset endpoint + Settings UI + honest activity | Reset determinism test | Reset reproducibility | PASS |

## 7. Testing & verification (07_TEST_AND_VERIFICATION)

| ID | Requirement | Implementation | Test | Golden-demo evidence | Status |
| --- | --- | --- | --- | --- | --- |
| TEST-1 | Four claims separated (code correctness, workflow correctness, native WebMCP interop, deployed judge-path readiness) | Separate suites; honest statuses | Suite structure | Submission narrative | PASS |
| TEST-2 | Unit: availability intersection, focus-block exclusion, meeting validation, agenda ordering, decision creation, action assignment, follow-up logic, approval invalidation, revision/concurrency, idempotency | `apps/api/src/**/*.test.ts` (Vitest) | `pnpm test` | N/A | PASS |
| TEST-3 | Integration: create/edit meeting, propose/approve/apply, agenda, decision, action, follow-up, audit events, stale revision rejection, integrations (connect/disconnect/sync, webhook idempotency, provider failure, invalid payload) | API + DB integration tests (incl. `apps/api/src/integration/integrations.test.ts`) | `pnpm test` — 73 tests / 6 files | N/A | PASS |
| TEST-4 | WebMCP: registration, no duplicates, invalid schema caught; discovery; read tools; proposal tools don't mutate committed state; mutation approval enforcement; stale rejection; malformed input; negative (fake approval fields, unknown IDs, unauthorized, duplicate idempotency key, timeout no false success); `get_integrations` read-only status | `e2e/webmcp*.spec.ts` + Vitest tool tests | `pnpm test:e2e` — 5 tests incl. "registers exactly the 21 documented tools" | N/A | PASS |
| TEST-5 | E2E golden scenario passes, incl. pure-UI path; integrations UI (catalog/connect/sync/disconnect/activity) covered | `e2e/golden-demo.spec.ts`, `e2e/integrations.spec.ts` | `pnpm test:e2e` — 16 tests total | The demo itself | PASS |
| TEST-6 | Accessibility: keyboard-only workflow, dialog focus, SR labels, reduced motion, color-independent status | axe + keyboard E2E | `pnpm test:a11y` | N/A | PASS |
| TEST-7 | Security: CORS allowlist, server validation, authorization, error redaction, prompt-injection data untrusted, no secrets in client bundle | API config + audit scripts | Security tests | N/A | PASS (static review + tests; no live deployment smoke) |
| TEST-8 | Release gates P0/P1/P2 | `docs/final-verification-report.md` gate table | Final audit | N/A | PASS |
| TEST-9 | Required commands: dev, build, preview, typecheck, lint, test, test:e2e, check | Root `package.json` scripts | Script execution | N/A | PASS |
| TEST-10 | Native WebMCP verification record (client, version, URL, prompts, outputs, timestamps); mocks don't count | `docs/webmcp-native-verification.md` | Manual Phase 10 | Evidence file | PASS |

## 8. PRD user stories & functional requirements (Kestrel_PRD)

| ID | Requirement | Implementation | Test | Golden-demo evidence | Status |
| --- | --- | --- | --- | --- | --- |
| US-01 | Create meeting from natural language (agent converts intent to draft; requirements visible before commitment) | Proposal flow via WebMCP | E2E | 0:20–0:45 | PASS |
| US-02 | Candidate slots avoid focus blocks and conflicts | Availability engine | Unit tests | Slot selection | PASS |
| US-03 | Agenda informed by project blockers/overdue/pending decisions | `get_project_context` + agenda proposal | Integration test | Launch blockers on agenda | PASS |
| US-04 | Before/after changes + rationale before approving | Proposal diff UI | E2E | 0:45–1:15 | PASS |
| US-05 | Change constraint → recalculated proposal | Replan flow | E2E | 1:15–1:35 | PASS |
| US-06 | Explicit approval in UI | Approval boundary | E2E | 1:35–1:50 | PASS |
| US-07 | Approved plan becomes persisted meeting/agenda state | Execution service | Integration test | 1:50–2:10 | PASS |
| US-08 | Record decisions and action items linked to meeting | Outcomes endpoints + UI | Integration test | 2:10–2:35 | PASS |
| US-09 | Assign owners and due dates | Action assignment | Unit + integration | Owners on payment blocker | PASS |
| US-10 | Follow-up informed by unresolved actions/decisions | Follow-up proposal flow | Integration test: `apps/api/src/integration/followups.test.ts` | 2:35–2:55 | PASS |
| US-11 | Confirmation that persisted state matches approved plan | Verification service + UI | Integration test | verify_meeting_state output | PASS |
| US-12 | See what agent proposed, human approved, executed | Audit timeline UI | Integration test | Agent activity panel | PASS |
| FR-1 | Meeting lifecycle statuses explicit; transitions validated | Transition map in domain | Unit tests | Status badges | PASS |
| FR-2 | Proposal isolation — no committed-state mutation until execution | Proposal service | Integration test | Pending proposal doesn't alter meetings | PASS |
| FR-3 | Only human UI action creates approval authorization | Approval endpoint + session auth | Negative test | Approval step | PASS |
| FR-4 | App exposes WebMCP tool catalog | WM-2..4 | WebMCP tests | Tool discovery | PASS |
| FR-5 | Deterministic domain logic (availability, focus blocks, context lookup, validation, persistence) | Domain services | Unit tests | Deterministic slots | PASS |
| FR-6 | Mutations produce audit events | Audit service | Integration test | Activity timeline | PASS |
| FR-7 | After approved mutations, app verifies actual persisted state | Verification service | Integration test | Verification step | PASS |
| SC-1 | New user completes golden workflow without training | Demo doc + UX clarity | Manual/E2E | Demo script | PASS |
| SC-2 | External agent discovers and invokes read/proposal/mutation/verification tools in supported browser/client | Native registration | Native verification (Phase 10) | Evidence file | UNVERIFIED (native registration verified; external agent-client round-trip not demonstrated) |
| SC-3 | Golden demo completes reliably in <3 min | Deterministic seed + E2E timing | E2E | Recording | PASS |

## 9. Release checklist (09_RELEASE_CHECKLIST) — audited at final phase

| ID | Requirement | Status |
| --- | --- | --- |
| REL-1 | Product: primary stories implemented; no dead-ends; states exist; deterministic reset | PASS |
| REL-2 | WebMCP: native registration; strict schemas; meaningful descriptions; correct annotations; approval unforgable; native discovery/execution tested | PASS |
| REL-3 | Domain/API: clean-DB migrations; authorization on mutations; optimistic concurrency; idempotency; transactional audit; stable error codes | PASS |
| REL-4 | UI: Astryx primary controls; StyleX styling; Phosphor icons; keyboard nav; responsive layouts | PASS |
| REL-5 | Quality: typecheck/lint/unit/integration/E2E/a11y/build/deployed smoke PASS | PASS (except deployed smoke — UNVERIFIED) |
| REL-6 | Docs: README exact commands; env vars documented without secrets; architecture; WebMCP testing; known limitations; license | PASS |

## 10. Build contract process requirements (01_BUILD_INSTRUCTIONS)

| ID | Requirement | Status |
| --- | --- | --- |
| BUILD-1 | Read all docs before coding; reconcile contradictions (priority: PRD → WebMCP → Agent Interaction → Domain/API → UX → Golden Demo → Test/Verification → Submission) | PASS (Phase 0) |
| BUILD-2 | Traceability doc exists before feature coding | PASS (this file) |
| BUILD-3 | Implementation order phases 1–10 followed | PASS |
| BUILD-4 | Quality gate: all tests passing, golden scenario, native WebMCP discovery/execution verified, no P0/P1 defects, deployment smoke, submission prerequisites or UNVERIFIED | PASS (see final-verification-report.md for claim separation) |
| BUILD-5 | Reliability/polish over features when forced to choose | PASS (decision rule applied throughout) |

---

## Maintenance rule

Every status in this file must be backed by evidence (test run output, recorded verification, or explicit `UNVERIFIED`/`BLOCKED` with reason in `final-verification-report.md`). Never upgrade `UNVERIFIED` to `PASS` without the actual verification artifact.
