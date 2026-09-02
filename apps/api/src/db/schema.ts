/**
 * Drizzle schema — authoritative persistence model.
 * Mirrors docs/03_DOMAIN_DATA_API.md entities plus the proposal aggregate
 * (D-003), audit events (INV-10), and idempotency records (D-017).
 */
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { FocusBlock, WorkingHours } from '@meetingops/contracts';

/* ---------------------------------- enums --------------------------------- */

export const projectStatusEnum = pgEnum('project_status', ['active', 'paused', 'archived']);
export const meetingStatusEnum = pgEnum('meeting_status', [
  'draft',
  'proposed',
  'approved',
  'scheduled',
  'in_progress',
  'completed',
  'needs_followup',
  'cancelled',
]);
export const participantRoleEnum = pgEnum('participant_role', ['organizer', 'attendee']);
export const inviteResponseEnum = pgEnum('invite_response', ['pending', 'accepted', 'declined']);
export const agendaSourceEnum = pgEnum('agenda_source', [
  'human',
  'agent',
  'project_context',
  'previous_outcome',
]);
export const agendaItemStatusEnum = pgEnum('agenda_item_status', ['open', 'covered', 'skipped']);
export const actionItemStatusEnum = pgEnum('action_item_status', ['open', 'done', 'blocked', 'cancelled']);
export const followUpStatusEnum = pgEnum('follow_up_status', [
  'proposed',
  'scheduled',
  'completed',
  'cancelled',
]);
export const actorTypeEnum = pgEnum('actor_type', ['human', 'agent', 'system']);
export const auditChannelEnum = pgEnum('audit_channel', ['ui', 'webmcp', 'system']);
export const proposalKindEnum = pgEnum('proposal_kind', [
  'meeting_create',
  'meeting_update',
  'agenda',
  'followup',
  'outcome',
]);
export const proposalStatusEnum = pgEnum('proposal_status', [
  'pending',
  'approved',
  'rejected',
  'superseded',
  'executed',
  'failed',
]);

/* ---------------------------------- tables -------------------------------- */

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    displayName: text('display_name').notNull(),
    email: text('email').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_unique').on(t.email)],
);

export const participants = pgTable('participants', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  displayName: text('display_name').notNull(),
  email: text('email').notNull(),
  timezone: text('timezone').notNull(),
  workingHours: jsonb('working_hours').$type<WorkingHours>().notNull(),
  focusBlocks: jsonb('focus_blocks').$type<FocusBlock[]>().notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  status: projectStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const meetings = pgTable(
  'meetings',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    purpose: text('purpose').notNull().default(''),
    projectId: text('project_id').references(() => projects.id),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    status: meetingStatusEnum('status').notNull().default('draft'),
    revision: integer('revision').notNull().default(1),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('meetings_start_at_idx').on(t.startAt), index('meetings_project_idx').on(t.projectId)],
);

export const meetingParticipants = pgTable(
  'meeting_participants',
  {
    meetingId: text('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    participantId: text('participant_id')
      .notNull()
      .references(() => participants.id),
    role: participantRoleEnum('role').notNull(),
    response: inviteResponseEnum('response').notNull().default('pending'),
  },
  (t) => [
    primaryKey({ columns: [t.meetingId, t.participantId] }),
    index('meeting_participants_participant_idx').on(t.participantId),
  ],
);

export const agendaItems = pgTable(
  'agenda_items',
  {
    id: text('id').primaryKey(),
    meetingId: text('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    source: agendaSourceEnum('source').notNull(),
    sortOrder: integer('sort_order').notNull(),
    status: agendaItemStatusEnum('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('agenda_items_meeting_sort_unique').on(t.meetingId, t.sortOrder)],
);

export const decisions = pgTable(
  'decisions',
  {
    id: text('id').primaryKey(),
    meetingId: text('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    outcome: text('outcome').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('decisions_meeting_idx').on(t.meetingId)],
);

export const actionItems = pgTable(
  'action_items',
  {
    id: text('id').primaryKey(),
    meetingId: text('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    projectId: text('project_id').references(() => projects.id),
    title: text('title').notNull(),
    ownerParticipantId: text('owner_participant_id').references(() => participants.id),
    dueAt: timestamp('due_at', { withTimezone: true }),
    status: actionItemStatusEnum('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('action_items_meeting_idx').on(t.meetingId), index('action_items_status_idx').on(t.status)],
);

export const followUps = pgTable(
  'follow_ups',
  {
    id: text('id').primaryKey(),
    sourceMeetingId: text('source_meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    targetMeetingId: text('target_meeting_id').references(() => meetings.id),
    proposedAt: timestamp('proposed_at', { withTimezone: true }).notNull().defaultNow(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    status: followUpStatusEnum('status').notNull().default('proposed'),
  },
  (t) => [index('follow_ups_source_idx').on(t.sourceMeetingId)],
);

export const proposals = pgTable(
  'proposals',
  {
    id: text('id').primaryKey(),
    kind: proposalKindEnum('kind').notNull(),
    status: proposalStatusEnum('status').notNull().default('pending'),
    payload: jsonb('payload').notNull(),
    rationale: text('rationale').notNull(),
    projectId: text('project_id').references(() => projects.id),
    baseMeetingId: text('base_meeting_id').references(() => meetings.id, { onDelete: 'cascade' }),
    baseMeetingRevision: integer('base_meeting_revision'),
    createdByActorType: actorTypeEnum('created_by_actor_type').notNull(),
    createdByActorRef: text('created_by_actor_ref').notNull(),
    createdByUserId: text('created_by_user_id').references(() => users.id),
    approvedByUserId: text('approved_by_user_id').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    executedAt: timestamp('executed_at', { withTimezone: true }),
    verification: jsonb('verification'),
    supersededById: text('superseded_by_id'),
    executionError: jsonb('execution_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('proposals_status_idx').on(t.status),
    index('proposals_base_meeting_idx').on(t.baseMeetingId),
    index('proposals_project_idx').on(t.projectId),
  ],
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorType: actorTypeEnum('actor_type').notNull(),
    actorRef: text('actor_ref').notNull(),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    requestId: text('request_id').notNull().default(''),
    beforeJson: jsonb('before_json'),
    afterJson: jsonb('after_json'),
    channel: auditChannelEnum('channel').notNull().default('ui'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_events_entity_idx').on(t.entityType, t.entityId),
    index('audit_events_created_at_idx').on(t.createdAt),
  ],
);

export const idempotencyRecords = pgTable(
  'idempotency_records',
  {
    actorUserId: text('actor_user_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    endpoint: text('endpoint').notNull(),
    requestHash: text('request_hash').notNull(),
    responseJson: jsonb('response_json'),
    statusCode: integer('status_code').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.actorUserId, t.idempotencyKey] })],
);

/** Session storage: signed-cookie references a server-side session row. */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    revoked: boolean('revoked').notNull().default(false),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);
