# Kestrel Deployment Runbook

Production deployment for Kestrel (API + Web on Neon PostgreSQL).

## 1. Prerequisites

- Node 24+, pnpm 10+
- A Neon PostgreSQL connection string (`DATABASE_URL`, pooled endpoint recommended)
- `SESSION_SECRET` — a 32+ byte random value (`openssl rand -hex 32`)

## 2. Provision the database

```bash
# One-time: apply schema migrations (Drizzle)
cd apps/api
DATABASE_URL="$NEON_URL" npx drizzle-kit push   # or: generate + migrate for reviewed SQL
```

Migrations are additive; the schema is created from `apps/api/src/db/schema.ts`.

## 3. Build

```bash
pnpm install --frozen-lockfile
pnpm build            # contracts → api (tsc) → web (vite build)
```

Artifacts: `apps/api/dist/`, `apps/web/dist/`.

## 4. Configure

Environment variables for the API process:

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon pooled connection string |
| `SESSION_SECRET` | yes | 32+ bytes; rotating it invalidates sessions |
| `PORT` | no | default `8787` |
| `AUTO_SEED` | **no in production** | demo auto-seed; dev/test only |
| `NODE_ENV` | yes | `production` — disables demo reset routes |

The demo reset/seed endpoints exist for the golden demo; guard or disable them
at the edge (or keep `NODE_ENV=production` behavior) for any shared deployment.

## 5. Serve

- **API**: run `node apps/api/dist/index.js` behind TLS termination (Neon requires TLS).
- **Web**: serve `apps/web/dist/` as static assets (any CDN/static host), with
  `/api` proxied to the API origin so cookies stay same-origin.
- **CSP**: production responses should carry a CSP that allows the app origin
  only; WebMCP needs no special CSP directives (it uses `document.modelContext`).

## 6. Post-deploy checks

1. `GET /api/health` → `200 {ok:true}`.
2. Log in; the Overview page renders the golden demo attention list.
3. Settings shows WebMCP status: `native document.modelContext` in Chrome 153+,
   labeled polyfill elsewhere. Never `unavailable` in a supporting browser.
4. Create a proposal through the WebMCP registry (any MCP client) and confirm
   it appears in Proposals as pending — approval only from the UI.

## 7. Rollback

Re-deploy the previous build artifact; the schema is forward-compatible for the
MVP (no destructive migrations shipped).
