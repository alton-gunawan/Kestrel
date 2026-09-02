# MeetingOps v2 — Technology Stack

## Purpose
This is the canonical technical stack for MeetingOps. Any implementation decision must prefer this document unless a higher-priority requirement in the product specification requires otherwise.

## Frontend
- React 19+
- Vite
- TypeScript (strict mode)
- React Router
- Astryx Design System
- StyleX
- Phosphor Icons (`@phosphor-icons/react`)
- Native WebMCP imperative API
- Zod for all untrusted input and WebMCP schemas

Astryx is currently beta, built on React 19+ and StyleX, and provides an agent-ready CLI/templates. Use its current documented installation flow rather than hard-coding stale package versions. citehttps://astryx.atmeta.com/https://astryx.atmeta.com/docs/cli

## Backend
- Node.js
- Fastify
- TypeScript (strict mode)
- Zod
- Drizzle ORM
- PostgreSQL (Neon for hosted deployment)

## Client/server boundary
- Browser owns UI state and WebMCP registration.
- Backend owns durable business state, validation, authorization, persistence, and audit records.
- WebMCP tools and human UI must call the same domain services; never duplicate business rules in tool handlers.

## AI
- No embedded LLM.
- No Vercel AI SDK.
- No LangChain/LangGraph dependency.
- Reasoning is supplied by an external WebMCP-capable agent such as ChatGPT.
- MeetingOps exposes capabilities; the agent supplies reasoning and natural-language intent.

## Testing
- Vitest for domain/unit/integration tests.
- Playwright for browser E2E and judge-path tests.
- Native WebMCP verification in a supported browser/client is a separate acceptance gate.

## Deployment
- Frontend: static Vite build, deployable to Vercel or Cloudflare Pages.
- Backend: Node/Fastify service, deployable to a Node-compatible host. Keep deployment provider-neutral in code.
- Database: Neon PostgreSQL.

## UI rules
- Astryx is the primary component system. Do not introduce a second design system.
- StyleX is the primary styling mechanism.
- Phosphor is the only icon family.
- Prefer Astryx primitives over hand-built components when an equivalent exists.
- Follow Astryx layout guidance: scaffold regions first, then content hierarchy, spacing, and responsive behavior. citehttps://astryx.atmeta.com/docs/layout

## WebMCP baseline
Use the current imperative API shape based on `document.modelContext.registerTool(...)`. Each tool must have:
- unique `name`
- human-readable `title`
- precise `description`
- JSON Schema `inputSchema`
- `execute` implementation
- appropriate annotations where supported

The current WebMCP draft defines `registerTool`, `getTools`, and `executeTool` on `document.modelContext`; duplicate names and invalid schemas are rejected. citehttps://webmachinelearning.github.io/webmcp/https://developer.chrome.com/docs/ai/agents

## Engineering principles
1. Deterministic domain logic over LLM-generated business rules.
2. Server-side validation and authorization over UI-only protection.
3. Human approval before consequential mutations.
4. Idempotent mutations.
5. Explicit error states; never claim success after a failed mutation.
6. Test the golden workflow before adding secondary features.
7. Keep the app small enough to be polished.
