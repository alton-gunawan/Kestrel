# Kestrel Product Requirements Document v2

## 1. Product summary
Kestrel is a web workspace that turns meetings into execution. It combines scheduling, project context, agenda preparation, outcome capture, action-item creation, and follow-up into one lifecycle.

The differentiator is WebMCP: an external agent can discover structured meeting capabilities exposed by the site and use them with human approval, instead of mechanically driving the UI.

## 2. Target user
Primary: product managers, project managers, engineering managers, founders, and operations leads who run recurring meetings tied to work.

## 3. Problem
Traditional calendars answer “when?” but leave administrative work scattered across calendars, project trackers, notes, and follow-up tasks. Kestrel closes the loop from meeting intent to persistent work.

## 4. Product promise
**Kestrel turns meetings into execution.**

## 5. MVP goals
1. Prepare a meeting using calendar constraints and project context.
2. Let an external agent propose structured changes through WebMCP.
3. Keep humans in control of consequential changes.
4. Capture decisions and action items.
5. Make follow-up connected to the original meeting.

## 6. Non-goals
- video conferencing
- transcription engine
- email client
- enterprise project management suite
- real-time collaborative document editing
- autonomous financial or legal actions
- broad external-calendar integration in the core demo

## 7. Personas
### Alex — PM
Needs meetings to be focused and leave with clear owners and deadlines.

### Sarah — teammate
Needs to know what was decided and what she owns.

### Daniel — engineering lead
Needs meeting time to respect focus blocks and technical workload.

## 8. Core user stories
### US-01 Create meeting from natural language
As a PM, I can say what meeting I need so the agent can convert intent into a draft.

**Acceptance:** requirements and participants are visible before commitment.

### US-02 Use calendar constraints
As a PM, I want candidate slots that avoid focus blocks and participant conflicts.

### US-03 Use project context
As a PM, I want the agenda informed by open blockers, overdue tasks, and pending decisions.

### US-04 Review proposal
As a PM, I want to see before/after changes and rationale before approving.

### US-05 Change constraints
As a PM, I can change a constraint and get a recalculated proposal.

### US-06 Approve
As a PM, I can explicitly approve a proposal in the UI.

### US-07 Execute
As a PM, the approved plan becomes persisted meeting/agenda state.

### US-08 Capture outcomes
As a participant, I can record decisions and action items linked to the meeting.

### US-09 Assign action items
As a PM, I can assign owners and due dates.

### US-10 Follow up
As a PM, I can schedule a follow-up informed by unresolved actions/decisions.

### US-11 Verify
As a PM, I can see confirmation that the persisted state matches the approved plan.

### US-12 Audit
As a user, I can see what the agent proposed, what the human approved, and what was executed.

## 9. Functional requirements
### FR-1 Meeting lifecycle
Meeting statuses must be explicit and transitions validated.

### FR-2 Proposal isolation
A proposal must not mutate committed meeting state.

### FR-3 Approval boundary
Only a human UI action can create approval authorization.

### FR-4 WebMCP
The app exposes the tool catalog in `02_WEBMCP_SPEC.md`.

### FR-5 Deterministic domain logic
Availability, focus-block exclusion, project-context lookup, validation, and persistence are deterministic code paths.

### FR-6 Auditability
Mutations produce audit events.

### FR-7 Verification
After approved mutations, the app verifies actual persisted state.

## 10. Success criteria
### Product
A new user can complete the golden workflow without training.

### WebMCP
An external agent can discover and invoke the required read/proposal/mutation/verification tools in the supported browser/client.

### Demo
The golden demo completes reliably in under 3 minutes when recorded.

## 11. Key UX principles
- show, don’t hide
- proposal before mutation
- explicit human approval
- explain why
- show actual state after execution
- keep AI activity visible but secondary to the work
