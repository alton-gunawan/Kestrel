# Kestrel

**Kestrel turns meetings into execution.**

An external AI agent reasons over a WebMCP capability surface exposed by this web
app; Kestrel owns the meeting/project state and safely executes only what a
human explicitly approved.

```
Context → Prepare → Propose → Human Review → Approve → Execute → Verify → Follow-up
```

Not a calendar clone. Not an embedded chatbot. Approval is never a tool: agents
can propose and execute-approved, but only a human can approve, in the UI.

## Quick start

```bash
pnpm install

# PostgreSQL 14+ running locally, then create the databases:
createdb kestrel_dev
createdb kestrel_test

# Terminal 1 — API (auto-creates schema, seeds the golden demo)
pnpm dev:api
#   env: DATABASE_URL=postgresql://$USER@localhost:5432/kestrel_dev
#        SESSION_SECRET=<32+ random chars>  AUTO_SEED=true

# Terminal 2 — Web (Vite dev server on :5173, proxies /api → :8787)
pnpm dev:web
```

Open http://localhost:5173 — the app logs in as the demo user (Alex) and the
golden demo dataset is seeded automatically.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Build contracts, run API + Web in parallel |
| `pnpm build` | Production builds (contracts → api tsc → web vite) |
| `pnpm typecheck` | TypeScript strict, all packages |
| `pnpm lint` | ESLint (flat config, react-hooks) |
| `pnpm test` | Contracts + API unit/integration tests (Vitest, real Postgres) |
| `pnpm test:e2e` | Playwright E2E (golden demo, WebMCP contract, a11y) |
| `pnpm check` | typecheck + lint + test + build |
| `pnpm audit:deps` | Guard: no embedded-LLM/AI-SDK dependencies |

## Architecture

- `packages/contracts` — Zod schemas, error codes, domain types, integration contracts, WebMCP tool catalog (21 tools).
- `apps/api` — Fastify 5 + Zod + Drizzle + PostgreSQL. Owns all durable state,
  validation, authorization, idempotency, audit, and verification. Deterministic
  domain logic (availability, focus blocks, proposal rules) lives here, plus the
  capability-based integration abstraction (registry, canonical mapping, demo
  adapters, idempotent webhook ingestion).
- `apps/web` — React 19 + Vite + Astryx (StyleX). Registers the 21-tool catalog
  through native `document.modelContext` (labeled polyfill fallback on
  unsupported browsers). Includes the user-facing Integrations page
  (`/integrations`). UI, WebMCP, and integration adapters all hit the same API.

```
browser ── UI (React) ──────────┐
                                ├──► Fastify API ──► Drizzle ──► PostgreSQL
agent ── document.modelContext ─┘        │
         (WebMCP, 21 tools)              └── audit + verification reports
external ── integration adapters ────────┘
system     (capability-based, demo-first)
```

## The golden demo

Deterministic dataset anchored to the current week's Monday: the Launch project,
Alex/Sarah/Daniel, Daniel's Tuesday-afternoon focus block, two unresolved
blockers, and the previous meeting's pricing decision. The agent reads context,
finds slots, proposes the launch review with a rationale, a human edits the
constraint (move to Wednesday), the proposal is superseded, approved in the UI,
executed, and verified against persisted state — with an audit trail for every
step. Reset any time from Settings.

## WebMCP

- Native first: in Chrome 153+ the app registers through the browser's real
  `document.modelContext` (verified — see `docs/webmcp-native-verification.md`).
- On unsupported browsers a clearly-labeled polyfill keeps the UI fully working.
- Tool results use a stable `{ok, data|error, context}` envelope; read tools are
  annotated `readOnlyHint`; approval exists nowhere in the tool registry.

## Documentation

- `docs/00_TECH_STACK.md` … `docs/10_DEEPSEEK_HARNESS_PROMPT.md` — the spec pack.
- `docs/requirements-traceability.md` — requirement → implementation → test → evidence → status.
- `docs/implementation-decisions.md` — decision log (D-xxx).
- `docs/webmcp-native-verification.md` — honest native-interop record.
- `docs/final-verification-report.md` — gates actually run, results, limitations.
- `docs/deployment.md` — production/Neon runbook.

## Known limitations

See `docs/final-verification-report.md` — notably: native agent round-trip
(ChatGPT Desktop connector) not demonstrated in the build environment; desktop-
optimized layout; no NL command bar (the WebMCP tool surface is the entry point).

## License

MIT — see `LICENSE`.
