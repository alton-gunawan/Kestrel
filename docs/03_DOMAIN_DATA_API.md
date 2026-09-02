# Kestrel — Domain, Data Model, and API Contract

## Domain entities
### User
- id
- displayName
- email

### Participant
A person who can attend a meeting.
- id
- userId (nullable for seeded contacts)
- displayName
- email
- timezone
- workingHours
- focusBlocks

### Project
- id
- name
- description
- status

### Meeting
- id
- title
- purpose
- projectId (nullable)
- startAt
- durationMinutes
- status
- revision
- createdBy
- createdAt
- updatedAt

Statuses:
`draft | proposed | approved | scheduled | in_progress | completed | needs_followup | cancelled`

### MeetingParticipant
- meetingId
- participantId
- role (`organizer | attendee`)
- response (`pending | accepted | declined`)

### AgendaItem
- id
- meetingId
- title
- source (`human | agent | project_context | previous_outcome`)
- sortOrder
- status (`open | covered | skipped`)

### Decision
- id
- meetingId
- title
- outcome
- recordedAt

### ActionItem
- id
- meetingId
- projectId (nullable)
- title
- ownerParticipantId
- dueAt
- status (`open | done | blocked | cancelled`)

### FollowUp
- id
- sourceMeetingId
- targetMeetingId (nullable)
- proposedAt
- scheduledAt
- status (`proposed | scheduled | completed | cancelled`)

### AuditEvent
- id
- actorType (`human | agent | system`)
- actorRef
- action
- entityType
- entityId
- requestId
- beforeJson
- afterJson
- createdAt

## Invariants
1. Meeting duration is 5–180 minutes.
2. Meeting participants are unique.
3. Organizer must be a participant.
4. Agenda item sort order is unique within a meeting.
5. Action item owner must be a meeting participant unless explicitly allowed by domain rule.
6. A completed meeting cannot be rescheduled without an explicit reopen flow.
7. A stale revision cannot be applied.
8. An approval becomes invalid whenever a protected meeting field changes.
9. Agent cannot create an approval record.
10. Every successful mutation creates an audit event.

## Concurrency
Use optimistic concurrency on mutable aggregate roots:
- client sends `expectedRevision`
- server compares with current revision
- mismatch returns `STALE_REVISION`
- successful mutation increments revision atomically

## API style
Use a small REST API from the Vite client to Fastify.

Examples:
- `GET /api/overview`
- `GET /api/meetings/:id`
- `POST /api/meetings`
- `PATCH /api/meetings/:id`
- `POST /api/meetings/:id/proposals`
- `POST /api/meetings/:id/approve`
- `POST /api/meetings/:id/agenda-items`
- `POST /api/meetings/:id/decisions`
- `POST /api/meetings/:id/actions`
- `POST /api/follow-ups`
- `GET /api/activity`

## API principles
- Zod request/response validation.
- Stable error codes.
- Request ID on every response.
- JSON only.
- No business rules in route handlers.
- No direct DB access from UI.
- CORS allowlist for deployed frontend origin.
- Mutation endpoints accept idempotency keys where defined.

## Repository boundary
```text
Fastify route
  → application service
    → domain service
      → repository
        → Drizzle
          → PostgreSQL
```

The WebMCP browser adapter calls the same application service through the authenticated API client rather than maintaining a parallel business implementation. Integration adapters do the same: provider → adapter → canonical mapping → shared application/domain services.

## Integrations (provider abstraction, external references, ingestion)

Providers are **not** core domain entities. External systems connect through
capability-based ports (calendar, meeting intelligence, communication, project,
meeting platform, automation) implemented by adapters that map untrusted
provider data to canonical Kestrel concepts.

```text
External system
  → provider adapter (capability port)
    → canonical mapping (Zod-validated, untrusted input)
      → shared application/domain services
        → repository → Drizzle → PostgreSQL
```

### Tables (migration `0001_eager_crystal.sql`)
- `integration_connections` — one per provider: status (`disconnected | connecting | connected | error`), scopes, config, `lastSyncAt`, `lastError`, `connectedAt`.
- `integration_events` — per-connection event log (connect, disconnect, sync, webhook received, failures).
- `external_references` — mapping provider + externalId ↔ entityType + entityId.
- `ingestion_records` — idempotency keyed on (providerId, sourceEventId).

### API endpoints
- `GET /api/integrations` — provider catalog + connection status (requires session).
- `POST /api/integrations/connect` — connect a provider (idempotency key required; duplicate → `CONFLICT`).
- `POST /api/integrations/:connectionId/disconnect` — disconnect; canonical Kestrel data is retained.
- `POST /api/integrations/:connectionId/sync` — pull provider data (calendar context / transcript analysis).
- `GET /api/integrations/activity?connectionId=` — integration event log.
- `POST /api/integrations/webhooks/:providerId` — idempotent, auditable ingestion of untrusted webhook payloads (Zod-validated; provider from URL path cannot be spoofed; unconnected provider → `INVALID_STATE`).

### Canonical mapping rules
- Transcript input is bounded and validated; raw transcripts become proposal-ready analysis awaiting human approval — never committed as Decision/ActionItem.
- Calendar context maps to Kestrel' local calendar domain model (demo adapters are honest: no real external side effects are claimed).
