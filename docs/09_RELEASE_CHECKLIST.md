# Kestrel — Production Release Checklist

## Product
- [ ] Every primary user story is implemented.
- [ ] No dead-end actions.
- [ ] Empty/loading/error states exist.
- [ ] Demo reset is deterministic.

## WebMCP
- [ ] Native `document.modelContext.registerTool` is implemented.
- [ ] All required tools have strict schemas (21-tool catalog, incl. read-only `get_integrations`).
- [ ] Tool descriptions are meaningful.
- [ ] Read-only and mutating tools are correctly annotated.
- [ ] Approval boundary cannot be forged by agent input.
- [ ] Native discovery tested.
- [ ] Native execution tested.
- [ ] Native re-verification of the 21st tool (`get_integrations`) recorded, or honestly marked UNVERIFIED.

## Integrations
- [ ] Provider abstraction by capability (calendar, meeting intelligence, communication, project, meeting platform, automation).
- [ ] Integration health: provider status + last error surfaced in the UI; no false success.
- [ ] Secure credential handling: no secrets in client bundle; connection config held server-side.
- [ ] Webhook verification: Zod-validated payloads; provider id from URL path (not spoofable); unconnected provider rejected.
- [ ] Idempotent ingestion keyed on (providerId, sourceEventId), auditable.
- [ ] Provider-specific failure states (sync error → status `error` + lastError; `UNAVAILABLE` error).
- [ ] User-facing disconnect flow retains canonical Kestrel data; duplicate connect → `CONFLICT`.
- [ ] Demo adapters labeled; no real external side effects claimed.

## Domain/API
- [ ] Database migrations succeed from clean state.
- [ ] All mutation endpoints validate authorization.
- [ ] Optimistic concurrency works.
- [ ] Idempotency works where required.
- [ ] Audit events are written transactionally with mutations where applicable.
- [ ] Error codes are stable.

## UI
- [ ] Astryx used for primary controls/components.
- [ ] StyleX used for application styling.
- [ ] Phosphor used for icons.
- [ ] Keyboard navigation passes.
- [ ] Responsive layouts pass.

## Quality
- [ ] Typecheck PASS
- [ ] Lint PASS
- [ ] Unit tests PASS
- [ ] Integration tests PASS (incl. integrations: connect/disconnect/sync, webhook idempotency, provider failure, invalid payload)
- [ ] E2E tests PASS (incl. golden flow without WebMCP)
- [ ] Accessibility PASS
- [ ] Production build PASS
- [ ] Deployed smoke test PASS

## Documentation
- [ ] README has exact setup commands.
- [ ] Environment variables documented without secrets.
- [ ] Architecture documented.
- [ ] WebMCP testing documented.
- [ ] Known limitations documented.
- [ ] License present.
