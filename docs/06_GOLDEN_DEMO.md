# Kestrel — Golden Demo

## Goal
A judge should understand the product and WebMCP value in under three minutes.

## Scenario
Project: Launch
Participants: Alex, Sarah, Daniel
Problem:
- Daniel has a focus block Tuesday afternoon.
- Launch project has two unresolved blockers.
- Previous meeting resolved pricing.

## Demo script
### 0:00–0:20 — Setup
Open Kestrel dashboard.
Show “Launch” project and upcoming meetings.

### 0:20–0:45 — Natural language request
Agent prompt:
> Set up a 30-minute launch review with Sarah and Daniel this week. Avoid their focus blocks and use the Launch project context to prepare the agenda.

Expected agent activity:
- get_project_context
- find_available_slots
- prepare_meeting_proposal
- prepare_agenda_proposal

### 0:45–1:15 — Proposal
Show proposal:
- selected time
- participants
- project
- agenda items
- blockers
- rationale

### 1:15–1:35 — Human edit
User:
> Move it to Wednesday and add the payment blocker.

Agent refreshes and presents a revised proposal.

### 1:35–1:50 — Approval
User clicks Review → Approve.
Show the explicit approval boundary.

### 1:50–2:10 — WebMCP execution
Show:
- create_meeting
- create_agenda_item
- verify_meeting_state

### 2:10–2:35 — Outcomes
Open meeting Outcomes.
Show decisions and action items created from the meeting context.

### 2:35–2:55 — Continuity
Show follow-up suggestion:
> “Review the payment integration blocker in Friday’s check-in.”

## Demo requirements
- seeded data must be deterministic
- reset button or demo reset route available
- no signup friction
- the web app must look fully self-sufficient: all core flows work in the UI
  without WebMCP and without an agent — WebMCP demonstrates an alternative
  control path, not a requirement
- integrations may be demonstrated through seeded/mock-safe boundaries (demo
  adapters) when third-party connectivity is not part of the judge path
- no real external calendar dependency required for the primary demo
- no fake tool logs; logs reflect actual tool calls
- if native WebMCP is unavailable, manual fallback remains usable, but the submission must separately document actual native WebMCP verification

## Optional segment — Integrations (judge path, ~30s)
Show the Integrations page:
1. Connect the Google Calendar demo adapter (scope confirmation shown).
2. Sync it — the summary states it reads Kestrel' local demo calendar model (no real external system contacted).
3. Connect Fathom, sync it — the transcript becomes a proposal-ready analysis (payment blocker + data migration action items; no decision/action is committed).
4. Disconnect — canonical data is retained.
The demo adapters are labeled DEMO and never claim a real external side effect.
