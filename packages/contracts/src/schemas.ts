/**
 * Shared Zod schemas: entity DTOs, request payloads, and tool inputs.
 *
 * Rules (docs/02_WEBMCP_SPEC.md "Common schema rules", docs/03_DOMAIN_DATA_API.md):
 * - IDs are opaque strings.
 * - Dates: `YYYY-MM-DD`. Times: ISO 8601 datetime strings.
 * - Unknown fields are rejected (strictObject).
 * - Strings have explicit min/max lengths; arrays have explicit bounds.
 * - Enums use exact allowed values.
 * - Agent-provided approval metadata is NOT part of any input schema (D-004).
 */
import { z } from 'zod';
import {
  AGENDA_ITEM_STATUSES,
  AGENDA_SOURCES,
  ACTION_ITEM_STATUSES,
  ACTOR_TYPES,
  FOLLOWUP_STATUSES,
  INVITE_RESPONSES,
  MEETING_STATUSES,
  PARTICIPANT_ROLES,
  PROJECT_STATUSES,
  PROPOSAL_KINDS,
  PROPOSAL_STATUSES,
} from './domain.js';

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

export const idSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'IDs are opaque ASCII strings');

export const isoDateSchema = z
  .string()
  .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), 'Expected YYYY-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Invalid calendar date');

export const isoDateTimeSchema = z
  .string()
  .min(20)
  .max(40)
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid ISO 8601 datetime')
  .refine(
    (v) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v),
    'Expected ISO 8601 datetime (YYYY-MM-DDTHH:mm…)',
  );

export const durationSchema = z.number().int().min(5).max(180);

export const timeZoneSchema = z.string().min(1).max(64);

export const idempotencyKeySchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._-]+$/, 'Idempotency keys are ASCII tokens');

/** Request ID / opaque token shape used in results and headers. */
export const requestIdSchema = z.string().min(1).max(128);

/* ------------------------------------------------------------------ */
/* Entity DTOs                                                         */
/* ------------------------------------------------------------------ */

export const workingHoursSchema = z.strictObject({
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
  workdays: z.array(z.number().int().min(0).max(6)).max(7),
});

export const focusBlockSchema = z.strictObject({
  weekday: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
  label: z.string().min(1).max(120).optional(),
});

export const userSchema = z.strictObject({
  id: idSchema,
  displayName: z.string().min(1).max(120),
  email: z.string().min(3).max(200),
});
export type User = z.infer<typeof userSchema>;

export const participantSchema = z.strictObject({
  id: idSchema,
  userId: idSchema.nullable(),
  displayName: z.string().min(1).max(120),
  email: z.string().min(3).max(200),
  timezone: timeZoneSchema,
  workingHours: workingHoursSchema,
  focusBlocks: z.array(focusBlockSchema).max(30),
});
export type Participant = z.infer<typeof participantSchema>;

export const projectSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1).max(120),
  description: z.string().max(2000),
  status: z.enum(PROJECT_STATUSES),
});
export type Project = z.infer<typeof projectSchema>;

export const meetingParticipantSchema = z.strictObject({
  participantId: idSchema,
  role: z.enum(PARTICIPANT_ROLES),
  response: z.enum(INVITE_RESPONSES),
});
export type MeetingParticipant = z.infer<typeof meetingParticipantSchema>;

export const meetingSchema = z.strictObject({
  id: idSchema,
  title: z.string().min(1).max(200),
  purpose: z.string().max(2000),
  projectId: idSchema.nullable(),
  startAt: isoDateTimeSchema,
  durationMinutes: durationSchema,
  status: z.enum(MEETING_STATUSES),
  revision: z.number().int().min(1),
  createdBy: idSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Meeting = z.infer<typeof meetingSchema>;

export const agendaItemSchema = z.strictObject({
  id: idSchema,
  meetingId: idSchema,
  title: z.string().min(1).max(200),
  source: z.enum(AGENDA_SOURCES),
  sortOrder: z.number().int().min(1).max(100),
  status: z.enum(AGENDA_ITEM_STATUSES),
});
export type AgendaItem = z.infer<typeof agendaItemSchema>;

export const decisionSchema = z.strictObject({
  id: idSchema,
  meetingId: idSchema,
  title: z.string().min(1).max(200),
  outcome: z.string().min(1).max(4000),
  recordedAt: isoDateTimeSchema,
});
export type Decision = z.infer<typeof decisionSchema>;

export const actionItemSchema = z.strictObject({
  id: idSchema,
  meetingId: idSchema,
  projectId: idSchema.nullable(),
  title: z.string().min(1).max(200),
  ownerParticipantId: idSchema.nullable(),
  dueAt: isoDateTimeSchema.nullable(),
  status: z.enum(ACTION_ITEM_STATUSES),
});
export type ActionItem = z.infer<typeof actionItemSchema>;

export const followUpSchema = z.strictObject({
  id: idSchema,
  sourceMeetingId: idSchema,
  targetMeetingId: idSchema.nullable(),
  proposedAt: isoDateTimeSchema,
  scheduledAt: isoDateTimeSchema.nullable(),
  status: z.enum(FOLLOWUP_STATUSES),
});
export type FollowUp = z.infer<typeof followUpSchema>;

export const auditEventSchema = z.strictObject({
  id: z.string().min(1).max(64),
  actorType: z.enum(ACTOR_TYPES),
  actorRef: z.string().min(1).max(200),
  action: z.string().min(1).max(120),
  entityType: z.string().min(1).max(64),
  entityId: z.string().min(1).max(64),
  requestId: z.string().max(128),
  beforeJson: z.unknown().nullable(),
  afterJson: z.unknown().nullable(),
  channel: z.enum(['ui', 'webmcp', 'system']),
  createdAt: isoDateTimeSchema,
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

/* ------------------------------------------------------------------ */
/* Proposal payloads                                                   */
/* ------------------------------------------------------------------ */

export const proposedAgendaItemSchema = z.strictObject({
  title: z.string().min(1).max(200),
  source: z.enum(AGENDA_SOURCES),
});

export const proposedParticipantSchema = z.strictObject({
  participantId: idSchema,
  role: z.enum(PARTICIPANT_ROLES),
});

/** A full meeting to be created when the proposal executes. */
export const meetingCreatePayloadSchema = z.strictObject({
  title: z.string().min(1).max(200),
  purpose: z.string().max(2000),
  projectId: idSchema.nullable(),
  startAt: isoDateTimeSchema,
  durationMinutes: durationSchema,
  participants: z.array(proposedParticipantSchema).min(1).max(20),
  agenda: z.array(proposedAgendaItemSchema).max(20),
});
export type MeetingCreatePayload = z.infer<typeof meetingCreatePayloadSchema>;

/** Field-level changes to an existing meeting. */
export const meetingUpdateChangesSchema = z.strictObject({
  title: z.string().min(1).max(200).optional(),
  purpose: z.string().max(2000).optional(),
  startAt: isoDateTimeSchema.optional(),
  durationMinutes: durationSchema.optional(),
  projectId: idSchema.nullable().optional(),
  participants: z.array(proposedParticipantSchema).min(1).max(20).optional(),
  agendaAdditions: z.array(proposedAgendaItemSchema).max(20).optional(),
  agendaRemovals: z.array(idSchema).max(20).optional(),
});
export type MeetingUpdateChanges = z.infer<typeof meetingUpdateChangesSchema>;

export const meetingUpdatePayloadSchema = z.strictObject({
  meetingId: idSchema,
  changes: meetingUpdateChangesSchema,
});
export type MeetingUpdatePayload = z.infer<typeof meetingUpdatePayloadSchema>;

export const agendaProposalPayloadSchema = z.strictObject({
  meetingId: idSchema,
  items: z.array(proposedAgendaItemSchema).min(1).max(20),
});
export type AgendaProposalPayload = z.infer<typeof agendaProposalPayloadSchema>;

export const followupProposalPayloadSchema = z.strictObject({
  sourceMeetingId: idSchema,
  proposedScheduledAt: isoDateTimeSchema.nullable(),
  note: z.string().max(2000),
});
export type FollowupProposalPayload = z.infer<typeof followupProposalPayloadSchema>;

export const outcomeProposalPayloadSchema = z.discriminatedUnion('op', [
  z.strictObject({
    op: z.literal('record_decision'),
    meetingId: idSchema,
    title: z.string().min(1).max(200),
    outcome: z.string().min(1).max(4000),
  }),
  z.strictObject({
    op: z.literal('create_action_item'),
    meetingId: idSchema,
    title: z.string().min(1).max(200),
    ownerParticipantId: idSchema.nullable(),
    projectId: idSchema.nullable(),
    dueAt: isoDateTimeSchema.nullable(),
  }),
  z.strictObject({
    op: z.literal('assign_action_item'),
    actionItemId: idSchema,
    ownerParticipantId: idSchema,
    dueAt: isoDateTimeSchema.nullable(),
  }),
]);
export type OutcomeProposalPayload = z.infer<typeof outcomeProposalPayloadSchema>;

export const proposalPayloadSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('meeting_create'), payload: meetingCreatePayloadSchema }),
  z.strictObject({ kind: z.literal('meeting_update'), payload: meetingUpdatePayloadSchema }),
  z.strictObject({ kind: z.literal('agenda'), payload: agendaProposalPayloadSchema }),
  z.strictObject({ kind: z.literal('followup'), payload: followupProposalPayloadSchema }),
  z.strictObject({ kind: z.literal('outcome'), payload: outcomeProposalPayloadSchema }),
]);
export type ProposalPayload = z.infer<typeof proposalPayloadSchema>;

export const proposalSchema = z.strictObject({
  id: idSchema,
  kind: z.enum(PROPOSAL_KINDS),
  status: z.enum(PROPOSAL_STATUSES),
  payload: z.unknown(),
  rationale: z.string().min(1).max(4000),
  projectId: idSchema.nullable(),
  baseMeetingId: idSchema.nullable(),
  baseMeetingRevision: z.number().int().min(1).nullable(),
  createdByActorType: z.enum(ACTOR_TYPES),
  createdByActorRef: z.string().min(1).max(200),
  createdByUserId: idSchema.nullable(),
  approvedByUserId: idSchema.nullable(),
  approvedAt: isoDateTimeSchema.nullable(),
  rejectedAt: isoDateTimeSchema.nullable(),
  executedAt: isoDateTimeSchema.nullable(),
  verification: z.unknown().nullable(),
  supersededById: idSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Proposal = z.infer<typeof proposalSchema>;

/* ------------------------------------------------------------------ */
/* Request payloads (REST)                                             */
/* ------------------------------------------------------------------ */

export const createMeetingRequestSchema = z.strictObject({
  title: z.string().min(1).max(200),
  purpose: z.string().max(2000),
  projectId: idSchema.nullable().optional(),
  startAt: isoDateTimeSchema,
  durationMinutes: durationSchema,
  participants: z.array(proposedParticipantSchema).min(1).max(20),
  agenda: z.array(proposedAgendaItemSchema).max(20).optional(),
  idempotencyKey: idempotencyKeySchema,
});
export type CreateMeetingRequest = z.infer<typeof createMeetingRequestSchema>;

export const updateMeetingRequestSchema = z.strictObject({
  expectedRevision: z.number().int().min(1),
  title: z.string().min(1).max(200).optional(),
  purpose: z.string().max(2000).optional(),
  projectId: idSchema.nullable().optional(),
  startAt: isoDateTimeSchema.optional(),
  durationMinutes: durationSchema.optional(),
  participants: z.array(proposedParticipantSchema).min(1).max(20).optional(),
  idempotencyKey: idempotencyKeySchema,
});
export type UpdateMeetingRequest = z.infer<typeof updateMeetingRequestSchema>;

export const meetingStatusTransitionRequestSchema = z.strictObject({
  expectedRevision: z.number().int().min(1),
  status: z.enum(MEETING_STATUSES),
  idempotencyKey: idempotencyKeySchema,
});

export const addAgendaItemRequestSchema = z.strictObject({
  title: z.string().min(1).max(200),
  source: z.enum(AGENDA_SOURCES),
  sortOrder: z.number().int().min(1).max(100).optional(),
  expectedRevision: z.number().int().min(1),
  idempotencyKey: idempotencyKeySchema,
});

export const updateAgendaItemRequestSchema = z.strictObject({
  title: z.string().min(1).max(200).optional(),
  status: z.enum(AGENDA_ITEM_STATUSES).optional(),
  sortOrder: z.number().int().min(1).max(100).optional(),
  expectedRevision: z.number().int().min(1),
  idempotencyKey: idempotencyKeySchema,
});

export const recordDecisionRequestSchema = z.strictObject({
  title: z.string().min(1).max(200),
  outcome: z.string().min(1).max(4000),
  idempotencyKey: idempotencyKeySchema,
});

export const createActionItemRequestSchema = z.strictObject({
  title: z.string().min(1).max(200),
  ownerParticipantId: idSchema.nullable(),
  projectId: idSchema.nullable().optional(),
  dueAt: isoDateTimeSchema.nullable().optional(),
  idempotencyKey: idempotencyKeySchema,
});

export const updateActionItemRequestSchema = z.strictObject({
  status: z.enum(ACTION_ITEM_STATUSES).optional(),
  ownerParticipantId: idSchema.nullable().optional(),
  dueAt: isoDateTimeSchema.nullable().optional(),
  title: z.string().min(1).max(200).optional(),
  idempotencyKey: idempotencyKeySchema,
});

export const createFollowUpRequestSchema = z.strictObject({
  sourceMeetingId: idSchema,
  targetMeetingId: idSchema.nullable().optional(),
  scheduledAt: isoDateTimeSchema.nullable().optional(),
  idempotencyKey: idempotencyKeySchema,
});

export const createProposalRequestSchema = z.strictObject({
  kind: z.enum(['meeting_create', 'meeting_update', 'agenda', 'followup', 'outcome']),
  payload: z.unknown(),
  rationale: z.string().min(1).max(4000),
});

export const reviseProposalRequestSchema = z.strictObject({
  changes: z.unknown(),
  rationale: z.string().min(1).max(4000),
});

export const rejectProposalRequestSchema = z.strictObject({
  reason: z.string().min(1).max(2000),
});

export const approveProposalRequestSchema = z.strictObject({});

export const executeProposalRequestSchema = z.strictObject({
  idempotencyKey: idempotencyKeySchema,
});

export const sessionRequestSchema = z.strictObject({
  userId: idSchema,
});

export const searchSlotsRequestSchema = z.strictObject({
  durationMinutes: durationSchema,
  dateFrom: isoDateSchema,
  dateTo: isoDateSchema,
  participantIds: z.array(idSchema).min(1).max(20),
});

export const checkSlotRequestSchema = z.strictObject({
  startAt: isoDateTimeSchema,
  durationMinutes: durationSchema,
  participantIds: z.array(idSchema).min(1).max(20),
});

export const resetDemoRequestSchema = z.strictObject({});

/* ------------------------------------------------------------------ */
/* Tool inputs (WebMCP) — also used by proposal service                */
/* ------------------------------------------------------------------ */

/** `prepare_meeting_proposal` input. */
export const prepareMeetingProposalInputSchema = z.strictObject({
  title: z.string().min(1).max(200),
  purpose: z.string().max(2000),
  projectId: idSchema.nullable(),
  startAt: isoDateTimeSchema,
  durationMinutes: durationSchema,
  participants: z.array(proposedParticipantSchema).min(1).max(20),
  agenda: z.array(proposedAgendaItemSchema).max(20),
  rationale: z.string().min(1).max(4000),
});
export type PrepareMeetingProposalInput = z.infer<typeof prepareMeetingProposalInputSchema>;

/** `update_meeting_proposal` input — human or agent revision of an existing proposal. */
export const updateMeetingProposalInputSchema = z.strictObject({
  proposalId: idSchema,
  changes: meetingUpdateChangesSchema,
  rationale: z.string().min(1).max(4000),
});
export type UpdateMeetingProposalInput = z.infer<typeof updateMeetingProposalInputSchema>;

/** `prepare_agenda_proposal` input. */
export const prepareAgendaProposalInputSchema = z.strictObject({
  meetingId: idSchema,
  items: z.array(proposedAgendaItemSchema).min(1).max(20),
  rationale: z.string().min(1).max(4000),
});

/** `prepare_followup_proposal` input. */
export const prepareFollowupProposalInputSchema = z.strictObject({
  sourceMeetingId: idSchema,
  proposedScheduledAt: isoDateTimeSchema.nullable(),
  note: z.string().max(2000),
  rationale: z.string().min(1).max(4000),
});

/**
 * Shared shape for approval-gated execution tools. Note what is absent: any
 * approval metadata. There is no `approved`/`approvedBy`/`approvalTimestamp`
 * input anywhere (docs/02_WEBMCP_SPEC.md "Safety rules").
 */
export const executeApprovedProposalInputSchema = z.strictObject({
  proposalId: idSchema,
  idempotencyKey: idempotencyKeySchema,
});

/** Outcome tools: propose-or-execute (D-004). */
export const recordDecisionToolInputSchema = z.strictObject({
  meetingId: idSchema,
  title: z.string().min(1).max(200),
  outcome: z.string().min(1).max(4000),
  rationale: z.string().min(1).max(4000),
  proposalId: idSchema.optional(),
  idempotencyKey: idempotencyKeySchema,
});

export const createActionItemToolInputSchema = z.strictObject({
  meetingId: idSchema,
  title: z.string().min(1).max(200),
  ownerParticipantId: idSchema.nullable(),
  projectId: idSchema.nullable(),
  dueAt: isoDateTimeSchema.nullable(),
  rationale: z.string().min(1).max(4000),
  proposalId: idSchema.optional(),
  idempotencyKey: idempotencyKeySchema,
});

export const assignActionItemToolInputSchema = z.strictObject({
  actionItemId: idSchema,
  ownerParticipantId: idSchema,
  dueAt: isoDateTimeSchema.nullable(),
  rationale: z.string().min(1).max(4000),
  proposalId: idSchema.optional(),
  idempotencyKey: idempotencyKeySchema,
});

/** `verify_meeting_state` input — expectations are checked against real state. */
export const verifyMeetingStateInputSchema = z.strictObject({
  meetingId: idSchema,
  expectations: z.strictObject({
    status: z.enum(MEETING_STATUSES).optional(),
    agendaContains: z.array(z.string().min(1).max(200)).max(20).optional(),
    actionItemTitles: z.array(z.string().min(1).max(200)).max(20).optional(),
    participantIds: z.array(idSchema).max(20).optional(),
    minimumAgendaItems: z.number().int().min(0).max(20).optional(),
  }),
});
export type VerifyMeetingStateInput = z.infer<typeof verifyMeetingStateInputSchema>;

/* ------------------------------------------------------------------ */
/* Read tool inputs                                                    */
/* ------------------------------------------------------------------ */

export const getMeetingToolInputSchema = z.strictObject({
  meetingId: idSchema,
});

export const getCalendarContextToolInputSchema = z.strictObject({
  dateFrom: isoDateSchema,
  dateTo: isoDateSchema,
});

export const findAvailableSlotsToolInputSchema = z.strictObject({
  durationMinutes: durationSchema,
  dateFrom: isoDateSchema,
  dateTo: isoDateSchema,
  participantIds: z.array(idSchema).min(1).max(20),
});

export const getProjectContextToolInputSchema = z.strictObject({
  projectId: idSchema,
});

export const getOpenActionsToolInputSchema = z.strictObject({
  projectId: idSchema.optional(),
  meetingId: idSchema.optional(),
});

export const getDecisionsToolInputSchema = z.strictObject({
  meetingId: idSchema.optional(),
  projectId: idSchema.optional(),
});

export const getMeetingActivityToolInputSchema = z.strictObject({
  meetingId: idSchema,
});

export const getTodayOverviewToolInputSchema = z.strictObject({});

/* ------------------------------------------------------------------ */
/* Search/filter DTOs                                                  */
/* ------------------------------------------------------------------ */

export const meetingsFilterSchema = z.enum(['all', 'today', 'week', 'attention']);

export interface Slot {
  startAt: string;
  endAt: string;
}

export const slotSchema = z.strictObject({
  startAt: isoDateTimeSchema,
  endAt: isoDateTimeSchema,
});

export interface AvailabilityResult {
  slots: Slot[];
  gridMinutes: number;
  window: { dateFrom: string; dateTo: string };
  consideredParticipantIds: string[];
}

export interface MeetingConflict {
  meetingId: string;
  title: string;
  startAt: string;
  endAt: string;
  participantIds: string[];
}

export interface ParticipantConflict {
  participantId: string;
  focusBlock: { startAt: string; endAt: string; label?: string } | null;
  meeting: MeetingConflict | null;
}

export interface CheckSlotResponse {
  available: boolean;
  conflicts: ParticipantConflict[];
}
