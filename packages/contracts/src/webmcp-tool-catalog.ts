/**
 * WebMCP tool catalog — the exact 20 tools from docs/02_WEBMCP_SPEC.md.
 *
 * This file is the single source of truth for tool identity (name/title/
 * description/inputSchema/annotations). The browser adapter
 * (apps/web/src/webmcp) binds these definitions to real execution; the API
 * validates the same inputs server-side. `approve_proposal` is intentionally
 * absent — approval is a human UI action, never an agent tool.
 *
 * Side-effect classification drives `annotations` (readOnlyHint) and the
 * Agent Activity panel. `verify_meeting_state` performs no mutation (D-005).
 */
import type { ZodType } from 'zod';
import type { ToolSideEffect } from './domain.js';
import { toJsonSchema } from './jsonschema.js';
import {
  createActionItemToolInputSchema,
  findAvailableSlotsToolInputSchema,
  getCalendarContextToolInputSchema,
  getDecisionsToolInputSchema,
  getIntegrationsToolInputSchema,
  getMeetingActivityToolInputSchema,
  getMeetingToolInputSchema,
  getOpenActionsToolInputSchema,
  getProjectContextToolInputSchema,
  getTodayOverviewToolInputSchema,
  prepareAgendaProposalInputSchema,
  prepareFollowupProposalInputSchema,
  prepareMeetingProposalInputSchema,
  recordDecisionToolInputSchema,
  assignActionItemToolInputSchema,
  executeApprovedProposalInputSchema,
  updateMeetingProposalInputSchema,
  verifyMeetingStateInputSchema,
} from './schemas.js';

export interface ToolDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly annotations: {
    readonly readOnlyHint?: boolean;
    readonly untrustedContentHint?: boolean;
  };
  readonly sideEffect: ToolSideEffect;
}

function readTool(def: {
  name: string;
  title: string;
  description: string;
  schema: ZodType;
  untrusted?: boolean;
}): ToolDefinition {
  return {
    name: def.name,
    title: def.title,
    description: def.description,
    inputSchema: toJsonSchema(def.schema),
    annotations: def.untrusted
      ? { readOnlyHint: true, untrustedContentHint: true }
      : { readOnlyHint: true },
    sideEffect: 'read',
  };
}

function proposeTool(def: {
  name: string;
  title: string;
  description: string;
  schema: ZodType;
}): ToolDefinition {
  return {
    name: def.name,
    title: def.title,
    description: def.description,
    inputSchema: toJsonSchema(def.schema),
    annotations: {},
    sideEffect: 'propose',
  };
}

function mutateTool(def: {
  name: string;
  title: string;
  description: string;
  schema: ZodType;
}): ToolDefinition {
  return {
    name: def.name,
    title: def.title,
    description: def.description,
    inputSchema: toJsonSchema(def.schema),
    annotations: {},
    sideEffect: 'mutate',
  };
}

/* ------------------------------------------------------------------ */
/* Read-only tools                                                     */
/* ------------------------------------------------------------------ */

export const READ_TOOLS: ToolDefinition[] = [
  readTool({
    name: 'get_today_overview',
    title: 'Get today’s Kestrel overview',
    description:
      'Returns the current server date, ISO week bounds, the next scheduled meeting, meetings needing preparation, overdue action items, pending decisions, and pending proposal count. Use this first to ground “today” and “this week”.',
    schema: getTodayOverviewToolInputSchema,
  }),
  readTool({
    name: 'get_meeting',
    title: 'Get a Kestrel meeting with full detail',
    description:
      'Returns one meeting with participants, agenda items, decisions, action items, follow-ups, linked project, and current revision. Use before proposing changes to an existing meeting.',
    schema: getMeetingToolInputSchema,
  }),
  readTool({
    name: 'get_calendar_context',
    title: 'Get Kestrel calendar context',
    description:
      'Returns meetings and busy intervals for the given inclusive date range (YYYY-MM-DD). This is Kestrel’ local calendar domain model; it is not an external calendar.',
    schema: getCalendarContextToolInputSchema,
  }),
  readTool({
    name: 'find_available_slots',
    title: 'Find available meeting slots',
    description:
      'Find time slots that satisfy participant availability and meeting constraints: working hours, recurring focus blocks, and existing meetings, on a 15-minute grid, ordered ascending. Deterministic.',
    schema: findAvailableSlotsToolInputSchema,
  }),
  readTool({
    name: 'get_project_context',
    title: 'Get Kestrel project context',
    description:
      'Returns a project with its unresolved blockers (open/blocked action items), overdue actions, recent decisions, and recent meetings. Use this to prepare an agenda grounded in real project state.',
    schema: getProjectContextToolInputSchema,
  }),
  readTool({
    name: 'get_open_actions',
    title: 'Get open action items',
    description:
      'Returns open/blocked action items, optionally filtered by project or meeting, with owner, due date, and status.',
    schema: getOpenActionsToolInputSchema,
  }),
  readTool({
    name: 'get_decisions',
    title: 'Get recorded decisions',
    description:
      'Returns recorded decisions, optionally filtered by meeting or by the project the meeting belongs to.',
    schema: getDecisionsToolInputSchema,
  }),
  readTool({
    name: 'get_meeting_activity',
    title: 'Get meeting audit activity',
    description:
      'Returns the real audit trail for a meeting: proposals, approvals, executions, verifications, and edits, with actor classification and timestamps.',
    schema: getMeetingActivityToolInputSchema,
  }),
  readTool({
    name: 'get_integrations',
    title: 'Get Kestrel integration status',
    description:
      'Returns the provider catalog (capability, demo flag) and the live status of connected integrations (connected/disconnected/error, last sync). Read-only; connecting or disconnecting providers is a user action in the Kestrel UI, not a tool.',
    schema: getIntegrationsToolInputSchema,
  }),
];

/* ------------------------------------------------------------------ */
/* Proposal / planning tools                                           */
/* ------------------------------------------------------------------ */

export const PROPOSAL_TOOLS: ToolDefinition[] = [
  proposeTool({
    name: 'prepare_meeting_proposal',
    title: 'Prepare a meeting creation proposal',
    description:
      'Creates a pending proposal to create a meeting (time, duration, participants, project, agenda). Does not change committed meeting state. A human must review and approve it in the Kestrel UI before it can execute.',
    schema: prepareMeetingProposalInputSchema,
  }),
  proposeTool({
    name: 'update_meeting_proposal',
    title: 'Revise a pending proposal',
    description:
      'Revises a pending proposal (time, duration, participants, agenda additions/removals) and supersedes the previous version. The revised proposal again requires human approval. Material constraint changes always invalidate the previous proposal.',
    schema: updateMeetingProposalInputSchema,
  }),
  proposeTool({
    name: 'prepare_agenda_proposal',
    title: 'Prepare an agenda proposal',
    description:
      'Creates a pending proposal to replace an existing meeting’s agenda with the given ordered items. Does not change committed state until a human approves and the approved mutation executes.',
    schema: prepareAgendaProposalInputSchema,
  }),
  proposeTool({
    name: 'prepare_followup_proposal',
    title: 'Prepare a follow-up meeting proposal',
    description:
      'Creates a pending proposal to schedule a follow-up meeting sourced from an existing meeting. Requires human approval before scheduling.',
    schema: prepareFollowupProposalInputSchema,
  }),
];

/* ------------------------------------------------------------------ */
/* Mutating tools (approval-gated)                                     */
/* ------------------------------------------------------------------ */

export const MUTATING_TOOLS: ToolDefinition[] = [
  mutateTool({
    name: 'create_meeting',
    title: 'Execute an approved meeting creation',
    description:
      'Executes a human-approved meeting_create proposal: persists the meeting, participants, and agenda, records audit events, verifies the persisted state, and returns the created meeting. Requires proposalId of a proposal the human approved in the UI.',
    schema: executeApprovedProposalInputSchema,
  }),
  mutateTool({
    name: 'update_meeting',
    title: 'Execute an approved meeting update',
    description:
      'Executes a human-approved meeting_update proposal against the existing meeting with optimistic revision checks. Rejects stale proposals.',
    schema: executeApprovedProposalInputSchema,
  }),
  mutateTool({
    name: 'create_agenda_item',
    title: 'Execute an approved agenda proposal',
    description:
      'Executes a human-approved agenda proposal: applies the proposed agenda items to the meeting atomically and verifies them.',
    schema: executeApprovedProposalInputSchema,
  }),
  mutateTool({
    name: 'record_decision',
    title: 'Record a meeting decision (approval-gated)',
    description:
      'Proposes recording a decision for a meeting; returns a pending proposal until a human approves in the UI. Calling again with the approved proposalId executes it. Outcome-capture state required.',
    schema: recordDecisionToolInputSchema,
  }),
  mutateTool({
    name: 'create_action_item',
    title: 'Create an action item (approval-gated)',
    description:
      'Proposes creating an action item owned by a meeting participant; returns a pending proposal until a human approves in the UI. Calling again with the approved proposalId executes it.',
    schema: createActionItemToolInputSchema,
  }),
  mutateTool({
    name: 'assign_action_item',
    title: 'Assign an action item (approval-gated)',
    description:
      'Proposes assigning an existing action item to a participant (and optional due date); returns a pending proposal until a human approves in the UI. Calling again with the approved proposalId executes it.',
    schema: assignActionItemToolInputSchema,
  }),
  mutateTool({
    name: 'schedule_followup',
    title: 'Execute an approved follow-up proposal',
    description:
      'Executes a human-approved followup proposal, linking the follow-up to its source meeting.',
    schema: executeApprovedProposalInputSchema,
  }),
  {
    name: 'verify_meeting_state',
    title: 'Verify persisted meeting state',
    description:
      'Reads actual persisted state and checks it against the given expectations (status, agenda contents, action items, participants). Reports a structured pass/fail per check. Performs no mutation.',
    inputSchema: toJsonSchema(verifyMeetingStateInputSchema),
    annotations: { readOnlyHint: true },
    sideEffect: 'verify',
  },
];

export const ALL_TOOLS: ToolDefinition[] = [
  ...READ_TOOLS,
  ...PROPOSAL_TOOLS,
  ...MUTATING_TOOLS,
];

export const REQUIRED_TOOL_NAMES: readonly string[] = [
  'get_today_overview',
  'get_meeting',
  'get_calendar_context',
  'find_available_slots',
  'get_project_context',
  'get_open_actions',
  'get_decisions',
  'get_meeting_activity',
  'get_integrations',
  'prepare_meeting_proposal',
  'update_meeting_proposal',
  'prepare_agenda_proposal',
  'prepare_followup_proposal',
  'create_meeting',
  'update_meeting',
  'create_agenda_item',
  'record_decision',
  'create_action_item',
  'assign_action_item',
  'schedule_followup',
  'verify_meeting_state',
];

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return ALL_TOOLS.find((t) => t.name === name);
}
