# MeetingOps Agent Instructions

Read every file under `docs/` before coding. `docs/` is the project source of truth.

Core: MeetingOps turns meetings into execution: Goal → Prepare → Propose → Human Review → Approve → Execute → Verify → Follow-up.

Hard rules:
- React + Vite, not Next.js.
- Astryx + StyleX for UI.
- Phosphor Icons for icons.
- Native WebMCP is the core agent integration.
- No embedded LLM and no Vercel AI SDK.
- External agents provide reasoning through WebMCP.
- UI and WebMCP must share the same domain services.
- Never trust agent-supplied approval flags.
- Mutations require validation, authorization, idempotency where applicable, audit, and verification where specified.
- Never fake WebMCP execution, success, or verification.
- Preserve the golden demo.
- Do not add out-of-scope features.

Verification honesty:
A passing build or mocked WebMCP test does not prove native WebMCP interoperability. If a requirement was not actually tested, mark it UNVERIFIED.
