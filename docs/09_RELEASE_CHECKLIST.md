# MeetingOps — Production Release Checklist

## Product
- [ ] Every primary user story is implemented.
- [ ] No dead-end actions.
- [ ] Empty/loading/error states exist.
- [ ] Demo reset is deterministic.

## WebMCP
- [ ] Native `document.modelContext.registerTool` is implemented.
- [ ] All required tools have strict schemas.
- [ ] Tool descriptions are meaningful.
- [ ] Read-only and mutating tools are correctly annotated.
- [ ] Approval boundary cannot be forged by agent input.
- [ ] Native discovery tested.
- [ ] Native execution tested.

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
- [ ] Integration tests PASS
- [ ] E2E tests PASS
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
