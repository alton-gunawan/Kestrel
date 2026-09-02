# MeetingOps — UX/UI Specification

## Product feeling
Professional, calm, operational, trustworthy.

Avoid “AI toy” aesthetics: no neon gradients, robot illustrations, oversized chat bubbles, or gratuitous animation.

## Primary navigation
- Overview
- Meetings
- Projects
- Actions
- Decisions
- Settings

## Application shell
Desktop:
- persistent left navigation
- top command bar
- main content area
- optional right-side Agent Activity panel on workflow pages

Mobile:
- compact header
- bottom navigation for primary areas
- action-oriented meeting view

## Overview page
Must answer “What needs my attention?”
- next meeting
- meetings needing preparation
- overdue actions
- pending decisions
- recent agent activity

## Meetings list
Filters:
- all
- today
- this week
- needs attention

Each meeting row shows:
- time
- title
- participants
- project
- status
- preparation/outcome indicator

## Meeting detail
Header:
- title
- date/time
- participants
- project
- status

Tabs:
1. Overview
2. Agenda
3. Outcomes
4. Follow-up

### Overview
- purpose
- preparation checklist
- relevant project context
- agent activity

### Agenda
- ordered agenda items
- add/edit/reorder
- source indicator for agent-proposed items
- status: open/covered/skipped

### Outcomes
- decisions
- action items
- owners
- due dates

### Follow-up
- outstanding actions
- suggested follow-up date
- agenda continuity from previous meeting

## Approval UX
Never use a single ambiguous “Approve” button without showing consequences.

Use:
- Review changes
- summary of before/after
- rationale
- warnings
- unresolved items
- Reject
- Edit
- Approve

Example:
```text
Agent proposal

Changed
+ Added Payment Integration blocker
+ Changed meeting time → Wed 10:30

Removed
- Pricing discussion

Reason
Pricing was already decided in the previous meeting.

[Reject] [Edit] [Approve]
```

## Agent Activity
Display tool activity for transparency:
```text
✓ get_project_context
✓ find_available_slots
✓ prepare_meeting_proposal
⏸ Waiting for approval
```

After approval:
```text
✓ create_meeting
✓ create_agenda_item
✓ verify_meeting_state
```

## Command bar
Primary natural-language entry point, but not a full chat application.

Placeholder:
> Ask MeetingOps to prepare or update a meeting…

## Accessibility
- keyboard navigation throughout
- visible focus states
- semantic headings
- labelled form controls
- dialog focus trapping
- escape closes transient dialogs
- no color-only meaning
- reduced-motion support
- minimum touch targets appropriate to platform

## Icons
Use Phosphor only. Suggested:
- Calendar
- Users
- ListChecks
- CheckCircle
- Warning
- Sparkle
- Robot
- Clock
- GitDiff
- ShieldCheck
- ArrowRight

Phosphor is a flexible icon family with a React package; keep icon usage consistent across the app. citehttps://phosphoricons.com/

## Astryx
Use Astryx primitives for buttons, dialogs, inputs, tabs, menus, badges, tables, tooltips, and theme tokens. Astryx currently documents React 19+ and StyleX support. citehttps://astryx.atmeta.com/https://astryx.atmeta.com/docs/tokens
