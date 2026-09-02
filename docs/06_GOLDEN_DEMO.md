# MeetingOps — Golden Demo

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
Open MeetingOps dashboard.
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
- no real external calendar dependency required for the primary demo
- no fake tool logs; logs reflect actual tool calls
- if native WebMCP is unavailable, manual fallback remains usable, but the submission must separately document actual native WebMCP verification
