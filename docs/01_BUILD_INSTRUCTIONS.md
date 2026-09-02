# MeetingOps — Build Instructions for Claude Code

## Mission
Build MeetingOps from scratch as a production-quality hackathon MVP using every document in `./docs/` as the authoritative specification.

## First action: read the spec
Before creating or editing application code:
1. Read every file in `./docs/` completely.
2. Identify contradictions, then resolve them using the following priority: PRD → WebMCP Spec → Agent Interaction → Domain/API → UX → Golden Demo → Test/Verification → Submission.
3. Create `docs/IMPLEMENTATION_TRACEABILITY.md` mapping each requirement to implementation and tests.
4. Do not start feature coding until the traceability document exists.

## Non-negotiable constraints
- React + Vite, not Next.js.
- Native WebMCP is a first-class browser integration.
- Use actual `document.modelContext.registerTool(...)`.
- No embedded LLM and no Vercel AI SDK.
- External agents provide reasoning.
- Use Astryx + StyleX + Phosphor Icons.
- Keep business rules in domain services.
- UI and WebMCP must share the same domain operations.
- Consequential mutations require explicit human approval.
- All mutation endpoints must validate authorization, optimistic concurrency/version, idempotency, and state preconditions.
- Every mutation writes an audit event.
- Every successful execution that changes business state must have a post-action verification step where specified.
- No placeholder controls, fake WebMCP execution, or simulated success messages in production code.
- No features outside the documented MVP unless required to make the documented flow reliable.

## Required implementation order
### Phase 1 — Foundation
- Vite React TypeScript scaffold.
- ESLint/formatter/typecheck/test scripts.
- Environment config.
- Routing.
- API client.
- Error boundary/loading primitives.
- Astryx Theme setup.
- StyleX setup.
- Phosphor icon conventions.

### Phase 2 — Domain and persistence
Implement:
- users
- participants
- projects
- meetings
- meeting_participants
- agenda_items
- decisions
- action_items
- follow_ups
- audit_events
- optimistic revision/version fields

Create repository interfaces and a Postgres/Drizzle implementation.

### Phase 3 — Core meeting workflow
Implement:
- meeting creation
- scheduling/availability
- project context
- agenda preparation
- meeting status transitions
- outcomes
- action items
- follow-up

### Phase 4 — Human control
Implement:
- proposal state
- approval request
- approval invalidation on stale changes
- explicit approval UI
- safe mutation boundaries
- audit timeline

### Phase 5 — WebMCP
Implement all tools in `02_WEBMCP_SPEC.md`.
- Register after app boot when WebMCP exists.
- Cleanly unregister/re-register or update tools as required by current app state.
- Keep tool handlers thin.
- Validate tool inputs with Zod.
- Return structured JSON-serializable results.
- Surface errors as structured error codes/messages.
- Do not expose approval metadata as an agent-controlled input.

### Phase 6 — UI polish
Follow `05_UX_UI_SPEC.md` exactly enough to make the golden demo obvious.

### Phase 7 — Golden demo
Implement `06_GOLDEN_DEMO.md` exactly and add deterministic seed/reset support.

### Phase 8 — Verification
Execute the entire `07_TEST_AND_VERIFICATION.md` suite.
Fix failures rather than weakening tests.

### Phase 9 — Production hardening
- security headers
- CORS allowlist
- request IDs
- structured server logs
- validation of environment variables
- safe migrations
- database indexes
- rate limiting appropriate for demo endpoints
- error redaction
- idempotency protections
- migration/seed/runbook

### Phase 10 — Release
- production build
- deploy frontend and backend
- configure database
- run smoke tests against deployed environment
- run WebMCP judge-path test
- update README with real commands and URLs
- run requirements traceability audit

## Quality gate
Do not report success when only build/typecheck passes. “Done” requires:
- all automated tests passing
- golden scenario passing
- WebMCP tool discovery and execution verified in a supported browser/client
- no known P0/P1 defects
- deployment smoke test passing
- submission prerequisites satisfied or explicitly marked UNVERIFIED

## Decision rule
When forced to choose between more features and higher reliability/polish, choose reliability/polish.
