/**
 * Domain enumerations and shared types. Mirrors docs/03_DOMAIN_DATA_API.md.
 * These are the authoritative vocabulary for both API and WebMCP surfaces.
 */

export const MEETING_STATUSES = [
  'draft',
  'proposed',
  'approved',
  'scheduled',
  'in_progress',
  'completed',
  'needs_followup',
  'cancelled',
] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const PARTICIPANT_ROLES = ['organizer', 'attendee'] as const;
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];

export const INVITE_RESPONSES = ['pending', 'accepted', 'declined'] as const;
export type InviteResponse = (typeof INVITE_RESPONSES)[number];

export const AGENDA_SOURCES = [
  'human',
  'agent',
  'project_context',
  'previous_outcome',
] as const;
export type AgendaSource = (typeof AGENDA_SOURCES)[number];

export const AGENDA_ITEM_STATUSES = ['open', 'covered', 'skipped'] as const;
export type AgendaItemStatus = (typeof AGENDA_ITEM_STATUSES)[number];

export const ACTION_ITEM_STATUSES = ['open', 'done', 'blocked', 'cancelled'] as const;
export type ActionItemStatus = (typeof ACTION_ITEM_STATUSES)[number];

export const FOLLOWUP_STATUSES = ['proposed', 'scheduled', 'completed', 'cancelled'] as const;
export type FollowUpStatus = (typeof FOLLOWUP_STATUSES)[number];

export const ACTOR_TYPES = ['human', 'agent', 'system'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const PROJECT_STATUSES = ['active', 'paused', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** Proposal kinds map 1:1 to what an agent or the UI can propose. */
export const PROPOSAL_KINDS = [
  'meeting_create',
  'meeting_update',
  'agenda',
  'followup',
  'outcome',
] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

export const PROPOSAL_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'superseded',
  'executed',
  'failed',
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

/** Tool classification used for annotations and for the Agent Activity panel. */
export type ToolSideEffect = 'read' | 'propose' | 'mutate' | 'verify';
