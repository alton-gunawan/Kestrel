# Kestrel — Test & Verification Plan

## Test philosophy
Separate four claims:
1. code correctness
2. product workflow correctness
3. native WebMCP interoperability
4. deployed judge-path readiness

Do not use one claim as evidence for another.

## Unit tests
- availability intersection
- focus-block exclusion
- meeting validation
- agenda ordering
- decision creation
- action assignment
- follow-up logic
- approval invalidation
- revision/concurrency rules
- idempotency

## Integration tests
- create meeting
- edit meeting
- propose/approve/apply
- create agenda
- create decision
- create action
- schedule follow-up
- audit events
- stale revision rejection

### Integrations
- provider abstraction: registry catalog, capability lookup, declared-but-unimplemented providers
- connect lifecycle: connect records event + audit; duplicate connect → `CONFLICT`; unknown provider → `VALIDATION_ERROR`; idempotency replay returns the same connection
- disconnect lifecycle: status → `disconnected`, event recorded, canonical data retained
- sync: calendar → local demo calendar model summary; meeting intelligence → transcript → proposal-ready summary; provider failure → connection status `error` + `lastError` + `UNAVAILABLE` error (never false success)
- webhook ingestion: requires connected provider (`INVALID_STATE` otherwise); idempotent per (providerId, sourceEventId); invalid payload → failed ingestion record + `VALIDATION_ERROR`; processed payload → analysis + external reference + event + audit, without committing decisions/actions
- golden workflow WITHOUT WebMCP: the full propose → approve → execute → verify loop driven purely through the UI

## WebMCP tests
### Registration
- tools register successfully when API exists
- no duplicate registrations
- invalid schema is caught during development/tests

### Discovery
- required tool names are discoverable in supported environment (21-tool catalog, incl. `get_integrations`)
- state-appropriate tools appear as intended

### Execution
- read tool returns correct state
- proposal tools do not mutate committed state
- mutation tools enforce approval
- stale proposal fails safely
- malformed input fails safely
- `get_integrations` returns provider catalog + connection status (read-only)

### Negative tests
- fake approval fields rejected
- unknown IDs rejected
- unauthorized mutation rejected
- duplicate idempotency key handled deterministically
- tool timeout/cancellation does not create false success

## E2E tests
Golden scenario from `06_GOLDEN_DEMO.md` must pass, including the pure-UI path
(no WebMCP). Integrations UI is covered: catalog renders, connect, sync status,
disconnect, and activity list.

## Accessibility
- keyboard-only workflow
- focus management in dialogs
- screen-reader labels
- reduced motion
- color-independent status

## Security
- CORS allowlist
- server validation
- authorization checks
- error-message redaction
- prompt-injection data treated as untrusted
- no secret values in client bundle

## Release gates
### P0 — must pass
- production build
- migrations
- API health check
- golden scenario
- WebMCP native discovery
- WebMCP native execution
- approval boundary
- deployed smoke test

### P1 — must pass
- accessibility suite
- responsive layout
- error recovery
- idempotency
- audit trail consistency

### P2 — polish
- microcopy
- transitions
- empty states
- loading skeletons

## Required commands
At minimum expose scripts analogous to:
```bash
npm run dev
npm run build
npm run preview
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run check
```

## Native WebMCP verification
Use a currently supported WebMCP client/browser. Chrome documentation currently describes WebMCP as an agent-facing web API where sites register tools with names, descriptions, JSON schemas, and executable callbacks. citehttps://developer.chrome.com/docs/ai/agents

Record:
- browser/client
- version
- URL
- tool discovery evidence
- exact prompts
- tool outputs
- resulting UI state
- timestamps

A mock registry test does not count as native WebMCP interoperability evidence.
