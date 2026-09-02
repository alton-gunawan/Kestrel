# MeetingOps v2 Vibe-Coding Pack

This pack is the implementation source of truth for the MeetingOps WebMCP hackathon MVP.

## Files
- `MeetingOps_PRD.md` — product requirements
- `docs/00_TECH_STACK.md` — canonical stack
- `docs/01_BUILD_INSTRUCTIONS.md` — Claude Code build contract
- `docs/02_WEBMCP_SPEC.md` — WebMCP tool contract
- `docs/03_DOMAIN_DATA_API.md` — domain/data/API contract
- `docs/04_AGENT_INTERACTION.md` — agent behavior/state machine
- `docs/05_UX_UI_SPEC.md` — UX/UI contract
- `docs/06_GOLDEN_DEMO.md` — deterministic judge scenario
- `docs/07_TEST_AND_VERIFICATION.md` — release evidence
- `docs/08_DEVPOST_SUBMISSION.md` — submission framing
- `docs/09_RELEASE_CHECKLIST.md` — final release gate

## Core product
**MeetingOps turns meetings into execution.**

It is not a calendar clone and not an embedded chatbot. An external agent reasons over a WebMCP capability surface exposed by the web app; MeetingOps owns the underlying meeting/project state and safely executes approved actions.

## Core loop
`Context → Prepare → Propose → Human Review → Approve → Execute → Verify → Follow-up`

## Build command for Claude Code
Run Claude Code from the root of the extracted project and instruct it to read all files in `./docs/` before implementing anything. Use `docs/01_BUILD_INSTRUCTIONS.md` as the implementation contract.

## DeepSeek Harness

Use `docs/10_DEEPSEEK_HARNESS_PROMPT.md` as the main implementation task inside DeepSeek Harness. The prompt assumes the repository root is the working directory and that all project documentation is under `./docs/`.
