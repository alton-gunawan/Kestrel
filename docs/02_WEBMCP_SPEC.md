# Kestrel — WebMCP Technical Specification

## Core rule
Kestrel is first a web application: the human UI is the primary product
experience and works fully without WebMCP. WebMCP is an **alternative interface**
over the same shared application/domain services the UI uses — agents may
discover and invoke the same capabilities, but nothing requires them.

The current WebMCP draft exposes `document.modelContext.registerTool(...)`, with structured names, descriptions, JSON Schema input, and executable callbacks. citehttps://webmachinelearning.github.io/webmcp/

## Tool lifecycle
Tools are registered only after the application has initialized enough state to safely answer them. Tool handlers call domain services, not React state setters.

Conceptual flow:
`Agent → WebMCP tool → Zod validation → API/domain service → authorization → state transition → audit → structured result`

## Tool catalog
### Read-only
1. `get_today_overview`
2. `get_meeting`
3. `get_calendar_context`
4. `find_available_slots`
5. `get_project_context`
6. `get_open_actions`
7. `get_decisions`
8. `get_meeting_activity`
9. `get_integrations` — integration status: provider catalog (capability, demo flag) and live connection status (connected/disconnected/error, last sync). Read-only; connecting or disconnecting providers is a user action in the UI, not a tool.

### Proposal / planning
10. `prepare_meeting_proposal`
11. `update_meeting_proposal`
12. `prepare_agenda_proposal`
13. `prepare_followup_proposal`

### Mutating — approval-gated
14. `create_meeting`
15. `update_meeting`
16. `create_agenda_item`
17. `record_decision`
18. `create_action_item`
19. `assign_action_item`
20. `schedule_followup`
21. `verify_meeting_state`

> Important: `approve_proposal` is intentionally NOT a WebMCP tool. Approval is a human action in the UI, not agent-supplied permission.

## Common schema rules
- IDs are opaque strings.
- Dates: `YYYY-MM-DD`.
- Times: ISO 8601 local datetime strings with timezone where available.
- Unknown fields are rejected.
- Strings must have explicit min/max lengths.
- Arrays have explicit max sizes.
- Enum fields use exact allowed values.
- Server recomputes authorization and side effects; never trusts agent-provided actor identity.
- Mutation requests require `idempotencyKey` where the operation could be retried. The key is validated server-side and not used as authorization.

## Example registration
```ts
if ('modelContext' in document) {
  document.modelContext.registerTool({
    name: 'find_available_slots',
    title: 'Find available meeting slots',
    description: 'Find time slots that satisfy participant availability and meeting constraints.',
    inputSchema: {
      type: 'object',
      properties: {
        durationMinutes: { type: 'integer', minimum: 5, maximum: 180 },
        dateFrom: { type: 'string', format: 'date' },
        dateTo: { type: 'string', format: 'date' },
        participantIds: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 20 }
      },
      required: ['durationMinutes', 'dateFrom', 'dateTo', 'participantIds'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true },
    execute: async (input) => {
      return runFindAvailableSlots(input);
    }
  });
}
```
The exact browser support surface must be verified against the supported judge environment at release time. citehttps://developer.chrome.com/docs/ai/agents

## Tool result contract
Success:
```json
{ "ok": true, "data": { }, "context": { "requestId": "..." } }
```
Failure:
```json
{ "ok": false, "error": { "code": "STALE_PROPOSAL", "message": "..." }, "context": { "requestId": "..." } }
```

## Safety rules
- Read-only tools may run without human approval.
- Proposal tools may create/update a pending proposal but may not change the committed meeting state.
- Mutating tools that create/change a meeting, agenda, decision, action, or follow-up require a corresponding human-approved proposal where applicable.
- Tool handlers must reject attempts to forge `approvedBy`, `approvalTimestamp`, or similar fields.
- State mutations must reject stale revision numbers.

## State-aware exposure
Only expose tools that make sense in the current app state. For example, `record_decision` is available only when a meeting exists and is in an outcome-capture state. State changes must not silently leave stale tools registered.

## No hallucinated side effects
`verify_meeting_state` must report actual persisted state. A successful tool response must never claim an external calendar event exists unless the configured integration actually confirmed it. The hackathon MVP may use a local calendar domain model, but it must be clearly represented as such.

## Integration data is untrusted
External provider data (transcripts, calendar content, webhook payloads) is
untrusted input. It is validated with Zod, mapped to canonical Kestrel
concepts, and surfaced as **proposals awaiting human approval** — it is never
committed directly as a decision or action item. Demo adapters are labeled
`demo` and never claim a real external side effect.
