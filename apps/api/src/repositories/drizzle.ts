/**
 * Drizzle/PostgreSQL repository implementations. Each class takes a
 * `Database` (pool or transaction) so services can run inside a transaction
 * (transactional audit: release checklist).
 */
import { and, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import type {
  ActionItem,
  AgendaItem,
  Decision,
  FollowUp,
  Meeting,
  MeetingParticipant,
  Participant,
  Proposal,
  ProposalKind,
  ProposalStatus,
  Project,
  User,
} from '@meetingops/contracts';
import type { Database } from '../db/client.js';
import * as t from '../db/schema.js';
import { MeetingRevisionConflictError, MissingEntityError, type Repos } from './types.js';
import type {
  ActionItemRepository,
  AuditRepository,
  CreateMeetingData,
  DecisionRepository,
  FollowUpRepository,
  IdempotencyRepository,
  MeetingFilter,
  MeetingRepository,
  ParticipantRepository,
  ProjectRepository,
  ProposalRepository,
  SessionRepository,
  UpdateMeetingFields,
  UserRepository,
} from './types.js';
import type { AuditEventInput } from '../domain/audit.js';

/* ------------------------------- mappers ---------------------------------- */

function toIso(d: Date | null): string {
  return (d ?? new Date(0)).toISOString();
}

function mapUser(row: typeof t.users.$inferSelect): User {
  return { id: row.id, displayName: row.displayName, email: row.email };
}

function mapParticipant(row: typeof t.participants.$inferSelect): Participant {
  return {
    id: row.id,
    userId: row.userId,
    displayName: row.displayName,
    email: row.email,
    timezone: row.timezone,
    workingHours: row.workingHours,
    focusBlocks: row.focusBlocks,
  };
}

function mapProject(row: typeof t.projects.$inferSelect): Project {
  return { id: row.id, name: row.name, description: row.description, status: row.status };
}

function mapMeeting(row: typeof t.meetings.$inferSelect): Meeting {
  return {
    id: row.id,
    title: row.title,
    purpose: row.purpose,
    projectId: row.projectId,
    startAt: toIso(row.startAt),
    durationMinutes: row.durationMinutes,
    status: row.status,
    revision: row.revision,
    createdBy: row.createdBy,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function mapAgendaItem(row: typeof t.agendaItems.$inferSelect): AgendaItem {
  return {
    id: row.id,
    meetingId: row.meetingId,
    title: row.title,
    source: row.source,
    sortOrder: row.sortOrder,
    status: row.status,
  };
}

function mapDecision(row: typeof t.decisions.$inferSelect): Decision {
  return {
    id: row.id,
    meetingId: row.meetingId,
    title: row.title,
    outcome: row.outcome,
    recordedAt: toIso(row.recordedAt),
  };
}

function mapActionItem(row: typeof t.actionItems.$inferSelect): ActionItem {
  return {
    id: row.id,
    meetingId: row.meetingId,
    projectId: row.projectId,
    title: row.title,
    ownerParticipantId: row.ownerParticipantId,
    dueAt: row.dueAt === null ? null : toIso(row.dueAt),
    status: row.status,
  };
}

function mapFollowUp(row: typeof t.followUps.$inferSelect): FollowUp {
  return {
    id: row.id,
    sourceMeetingId: row.sourceMeetingId,
    targetMeetingId: row.targetMeetingId,
    proposedAt: toIso(row.proposedAt),
    scheduledAt: row.scheduledAt === null ? null : toIso(row.scheduledAt),
    status: row.status,
  };
}

function mapProposal(row: typeof t.proposals.$inferSelect): Proposal {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    payload: row.payload,
    rationale: row.rationale,
    projectId: row.projectId,
    baseMeetingId: row.baseMeetingId,
    baseMeetingRevision: row.baseMeetingRevision,
    createdByActorType: row.createdByActorType,
    createdByActorRef: row.createdByActorRef,
    createdByUserId: row.createdByUserId,
    approvedByUserId: row.approvedByUserId,
    approvedAt: row.approvedAt === null ? null : toIso(row.approvedAt),
    rejectedAt: row.rejectedAt === null ? null : toIso(row.rejectedAt),
    executedAt: row.executedAt === null ? null : toIso(row.executedAt),
    verification: row.verification,
    supersededById: row.supersededById,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

/* ------------------------------- users ------------------------------------ */

export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: Database) {}

  async listAll(): Promise<User[]> {
    const rows = await this.db.select().from(t.users).orderBy(t.users.displayName);
    return rows.map(mapUser);
  }

  async findById(id: string): Promise<User | null> {
    const [row] = await this.db.select().from(t.users).where(eq(t.users.id, id)).limit(1);
    return row ? mapUser(row) : null;
  }
}

/* ---------------------------- participants -------------------------------- */

export class DrizzleParticipantRepository implements ParticipantRepository {
  constructor(private readonly db: Database) {}

  async listAll(): Promise<Participant[]> {
    const rows = await this.db.select().from(t.participants).orderBy(t.participants.displayName);
    return rows.map(mapParticipant);
  }

  async findByIds(ids: readonly string[]): Promise<Participant[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select()
      .from(t.participants)
      .where(inArray(t.participants.id, [...ids]));
    const byId = new Map(rows.map((r) => [r.id, mapParticipant(r)]));
    return ids.map((id) => byId.get(id)).filter((p): p is Participant => p !== undefined);
  }

  async findByUserId(userId: string): Promise<Participant | null> {
    const [row] = await this.db
      .select()
      .from(t.participants)
      .where(eq(t.participants.userId, userId))
      .limit(1);
    return row ? mapParticipant(row) : null;
  }
}

/* ------------------------------- projects --------------------------------- */

export class DrizzleProjectRepository implements ProjectRepository {
  constructor(private readonly db: Database) {}

  async listAll(): Promise<Project[]> {
    const rows = await this.db.select().from(t.projects).orderBy(t.projects.name);
    return rows.map(mapProject);
  }

  async findById(id: string): Promise<Project | null> {
    const [row] = await this.db.select().from(t.projects).where(eq(t.projects.id, id)).limit(1);
    return row ? mapProject(row) : null;
  }
}

/* ------------------------------- meetings --------------------------------- */

export class DrizzleMeetingRepository implements MeetingRepository {
  constructor(private readonly db: Database) {}

  async findById(id: string): Promise<Meeting | null> {
    const [row] = await this.db.select().from(t.meetings).where(eq(t.meetings.id, id)).limit(1);
    return row ? mapMeeting(row) : null;
  }

  async findDetail(id: string) {
    const [row] = await this.db.select().from(t.meetings).where(eq(t.meetings.id, id)).limit(1);
    if (!row) return null;
    const meeting = mapMeeting(row);
    const [mpRows, agendaRows, decisionRows, actionRows, followUpRows] = await Promise.all([
      this.db.select().from(t.meetingParticipants).where(eq(t.meetingParticipants.meetingId, id)),
      this.db.select().from(t.agendaItems).where(eq(t.agendaItems.meetingId, id)).orderBy(t.agendaItems.sortOrder),
      this.db.select().from(t.decisions).where(eq(t.decisions.meetingId, id)).orderBy(desc(t.decisions.recordedAt)),
      this.db.select().from(t.actionItems).where(eq(t.actionItems.meetingId, id)).orderBy(t.actionItems.createdAt),
      this.db.select().from(t.followUps).where(eq(t.followUps.sourceMeetingId, id)).orderBy(desc(t.followUps.proposedAt)),
    ]);
    const roleById = new Map<string, MeetingParticipant>();
    for (const mp of mpRows) {
      roleById.set(mp.participantId, {
        participantId: mp.participantId,
        role: mp.role,
        response: mp.response,
      });
    }
    return {
      ...meeting,
      participants: [...roleById.values()],
      agenda: agendaRows.map(mapAgendaItem),
      decisions: decisionRows.map(mapDecision),
      actions: actionRows.map(mapActionItem),
      followUps: followUpRows.map(mapFollowUp),
    };
  }

  async list(filter: MeetingFilter): Promise<Meeting[]> {
    const conditions = [];
    if (filter.from) conditions.push(gte(t.meetings.startAt, new Date(`${filter.from}T00:00:00Z`)));
    if (filter.to) conditions.push(lte(t.meetings.startAt, new Date(`${filter.to}T23:59:59.999Z`)));
    if (filter.projectId) conditions.push(eq(t.meetings.projectId, filter.projectId));
    if (filter.statuses && filter.statuses.length > 0) {
      conditions.push(inArray(t.meetings.status, [...filter.statuses]));
    }
    const rows = await this.db
      .select()
      .from(t.meetings)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(t.meetings.startAt);
    return rows.map(mapMeeting);
  }

  async listIdsForParticipantBetween(participantId: string, from: Date, to: Date): Promise<Meeting[]> {
    const rows = await this.db
      .select({ meeting: t.meetings })
      .from(t.meetingParticipants)
      .innerJoin(t.meetings, eq(t.meetings.id, t.meetingParticipants.meetingId))
      .where(
        and(
          eq(t.meetingParticipants.participantId, participantId),
          gte(t.meetings.startAt, from),
          lte(t.meetings.startAt, to),
        ),
      );
    return rows.map((r) => mapMeeting(r.meeting));
  }

  async create(data: CreateMeetingData): Promise<Meeting> {
    const startAt = data.startAt;
    const [row] = await this.db
      .insert(t.meetings)
      .values({
        id: data.id,
        title: data.title,
        purpose: data.purpose,
        projectId: data.projectId,
        startAt,
        durationMinutes: data.durationMinutes,
        status: data.status,
        createdBy: data.createdBy,
      })
      .returning();
    if (!row) throw new Error('Meeting insert failed');
    await this.replaceParticipants(data.id, data.participants);
    if (data.agenda) {
      let order = 1;
      for (const item of data.agenda) {
        await this.db.insert(t.agendaItems).values({
          id: `agi_${crypto.randomUUID().slice(0, 12)}`,
          meetingId: data.id,
          title: item.title,
          source: item.source,
          sortOrder: order,
        });
        order += 1;
      }
    }
    return mapMeeting(row);
  }

  async updateWithRevision(id: string, expectedRevision: number, fields: UpdateMeetingFields): Promise<Meeting> {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (fields.title !== undefined) patch.title = fields.title;
    if (fields.purpose !== undefined) patch.purpose = fields.purpose;
    if (fields.projectId !== undefined) patch.projectId = fields.projectId;
    if (fields.startAt !== undefined) patch.startAt = fields.startAt;
    if (fields.durationMinutes !== undefined) patch.durationMinutes = fields.durationMinutes;
    if (fields.status !== undefined) patch.status = fields.status;
    patch.revision = sql`${t.meetings.revision} + 1`;
    const [row] = await this.db
      .update(t.meetings)
      .set(patch as typeof t.meetings.$inferInsert)
      .where(and(eq(t.meetings.id, id), eq(t.meetings.revision, expectedRevision)))
      .returning();
    if (!row) {
      const [current] = await this.db
        .select({ revision: t.meetings.revision })
        .from(t.meetings)
        .where(eq(t.meetings.id, id))
        .limit(1);
      throw new MeetingRevisionConflictError(current?.revision ?? 0);
    }
    return mapMeeting(row);
  }

  async replaceParticipants(
    meetingId: string,
    participants: readonly { participantId: string; role: 'organizer' | 'attendee' }[],
  ): Promise<void> {
    await this.db.delete(t.meetingParticipants).where(eq(t.meetingParticipants.meetingId, meetingId));
    if (participants.length > 0) {
      await this.db.insert(t.meetingParticipants).values(
        participants.map((p) => ({
          meetingId,
          participantId: p.participantId,
          role: p.role,
          response: 'pending' as const,
        })),
      );
    }
  }

  async participantIds(meetingId: string): Promise<string[]> {
    const rows = await this.db
      .select({ participantId: t.meetingParticipants.participantId })
      .from(t.meetingParticipants)
      .where(eq(t.meetingParticipants.meetingId, meetingId));
    return rows.map((r) => r.participantId);
  }

  async nextAgendaSortOrder(meetingId: string): Promise<number> {
    const [row] = await this.db
      .select({ max: sql<number | null>`max(${t.agendaItems.sortOrder})` })
      .from(t.agendaItems)
      .where(eq(t.agendaItems.meetingId, meetingId));
    return (row?.max ?? 0) + 1;
  }

  async addAgendaItem(
    meetingId: string,
    item: { title: string; source: AgendaItem['source']; sortOrder: number },
  ): Promise<AgendaItem> {
    const [row] = await this.db
      .insert(t.agendaItems)
      .values({ id: `agi_${crypto.randomUUID().slice(0, 12)}`, meetingId, ...item })
      .returning();
    if (!row) throw new Error('Agenda item insert failed');
    return mapAgendaItem(row);
  }

  async updateAgendaItem(
    itemId: string,
    fields: { title?: string; status?: AgendaItem['status']; sortOrder?: number },
  ): Promise<AgendaItem> {
    const [row] = await this.db
      .update(t.agendaItems)
      .set(fields)
      .where(eq(t.agendaItems.id, itemId))
      .returning();
    if (!row) throw new MissingEntityError('agenda_item', itemId);
    return mapAgendaItem(row);
  }

  async deleteAgendaItem(itemId: string): Promise<void> {
    await this.db.delete(t.agendaItems).where(eq(t.agendaItems.id, itemId));
  }
}

/* ------------------------------ decisions --------------------------------- */

export class DrizzleDecisionRepository implements DecisionRepository {
  constructor(private readonly db: Database) {}

  async listByMeeting(meetingId: string): Promise<Decision[]> {
    const rows = await this.db
      .select()
      .from(t.decisions)
      .where(eq(t.decisions.meetingId, meetingId))
      .orderBy(desc(t.decisions.recordedAt));
    return rows.map(mapDecision);
  }

  async insert(decision: { id: string; meetingId: string; title: string; outcome: string; recordedAt: Date }): Promise<Decision> {
    const [row] = await this.db.insert(t.decisions).values(decision).returning();
    if (!row) throw new Error('Decision insert failed');
    return mapDecision(row);
  }
}

/* ----------------------------- action items ------------------------------- */

export class DrizzleActionItemRepository implements ActionItemRepository {
  constructor(private readonly db: Database) {}

  async findById(id: string): Promise<ActionItem | null> {
    const [row] = await this.db.select().from(t.actionItems).where(eq(t.actionItems.id, id)).limit(1);
    return row ? mapActionItem(row) : null;
  }

  async listByMeeting(meetingId: string): Promise<ActionItem[]> {
    const rows = await this.db
      .select()
      .from(t.actionItems)
      .where(eq(t.actionItems.meetingId, meetingId))
      .orderBy(t.actionItems.createdAt);
    return rows.map(mapActionItem);
  }

  async listOpen(filter: { projectId?: string }): Promise<ActionItem[]> {
    const conditions = [inArray(t.actionItems.status, ['open', 'blocked'])];
    if (filter.projectId) conditions.push(eq(t.actionItems.projectId, filter.projectId));
    const rows = await this.db
      .select()
      .from(t.actionItems)
      .where(and(...conditions))
      .orderBy(t.actionItems.dueAt);
    return rows.map(mapActionItem);
  }

  async insert(action: {
    id: string;
    meetingId: string;
    projectId: string | null;
    title: string;
    ownerParticipantId: string | null;
    dueAt: Date | null;
  }): Promise<ActionItem> {
    const [row] = await this.db.insert(t.actionItems).values(action).returning();
    if (!row) throw new Error('Action item insert failed');
    return mapActionItem(row);
  }

  async update(
    id: string,
    fields: {
      title?: string;
      status?: ActionItem['status'];
      ownerParticipantId?: string | null;
      dueAt?: Date | null;
    },
  ): Promise<ActionItem> {
    const [row] = await this.db
      .update(t.actionItems)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(t.actionItems.id, id))
      .returning();
    if (!row) throw new MissingEntityError('action_item', id);
    return mapActionItem(row);
  }
}

/* ------------------------------- follow-ups ------------------------------- */

export class DrizzleFollowUpRepository implements FollowUpRepository {
  constructor(private readonly db: Database) {}

  async listBySourceMeeting(meetingId: string): Promise<FollowUp[]> {
    const rows = await this.db
      .select()
      .from(t.followUps)
      .where(eq(t.followUps.sourceMeetingId, meetingId))
      .orderBy(desc(t.followUps.proposedAt));
    return rows.map(mapFollowUp);
  }

  async listAll(limit = 100): Promise<FollowUp[]> {
    const rows = await this.db.select().from(t.followUps).orderBy(desc(t.followUps.proposedAt)).limit(limit);
    return rows.map(mapFollowUp);
  }

  async insert(followUp: {
    id: string;
    sourceMeetingId: string;
    targetMeetingId: string | null;
    proposedAt: Date;
    scheduledAt: Date | null;
  }): Promise<FollowUp> {
    const [row] = await this.db.insert(t.followUps).values(followUp).returning();
    if (!row) throw new Error('Follow-up insert failed');
    return mapFollowUp(row);
  }

  async update(
    id: string,
    fields: { status?: FollowUp['status']; targetMeetingId?: string | null; scheduledAt?: Date | null },
  ): Promise<FollowUp> {
    const [row] = await this.db.update(t.followUps).set(fields).where(eq(t.followUps.id, id)).returning();
    if (!row) throw new MissingEntityError('follow_up', id);
    return mapFollowUp(row);
  }
}

/* ------------------------------- proposals -------------------------------- */

export class DrizzleProposalRepository implements ProposalRepository {
  constructor(private readonly db: Database) {}

  async insert(proposal: {
    id: string;
    kind: ProposalKind;
    payload: unknown;
    rationale: string;
    projectId: string | null;
    baseMeetingId: string | null;
    baseMeetingRevision: number | null;
    createdByActorType: 'human' | 'agent' | 'system';
    createdByActorRef: string;
    createdByUserId: string | null;
  }): Promise<Proposal> {
    const [row] = await this.db.insert(t.proposals).values(proposal).returning();
    if (!row) throw new Error('Proposal insert failed');
    return mapProposal(row);
  }

  async findById(id: string): Promise<Proposal | null> {
    const [row] = await this.db.select().from(t.proposals).where(eq(t.proposals.id, id)).limit(1);
    return row ? mapProposal(row) : null;
  }

  async listLiveByKindAndBase(
    kind: ProposalKind,
    base: { projectId: string | null } | { baseMeetingId: string },
  ): Promise<Proposal[]> {
    const statusCondition = inArray(t.proposals.status, ['pending', 'approved']);
    const kindCondition = eq(t.proposals.kind, kind);
    const scopeCondition =
      'baseMeetingId' in base
        ? eq(t.proposals.baseMeetingId, base.baseMeetingId)
        : base.projectId === null
          ? isNull(t.proposals.projectId)
          : eq(t.proposals.projectId, base.projectId);
    const rows = await this.db
      .select()
      .from(t.proposals)
      .where(and(kindCondition, scopeCondition, statusCondition));
    return rows.map(mapProposal);
  }

  async list(filter: { status?: ProposalStatus; baseMeetingId?: string; projectId?: string; limit?: number }): Promise<Proposal[]> {
    const conditions = [];
    if (filter.status) conditions.push(eq(t.proposals.status, filter.status));
    if (filter.baseMeetingId) conditions.push(eq(t.proposals.baseMeetingId, filter.baseMeetingId));
    if (filter.projectId) conditions.push(eq(t.proposals.projectId, filter.projectId));
    const rows = await this.db
      .select()
      .from(t.proposals)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(t.proposals.createdAt))
      .limit(filter.limit ?? 50);
    return rows.map(mapProposal);
  }

  async setStatus(
    id: string,
    status: ProposalStatus,
    extra: {
      approvedByUserId?: string;
      supersededById?: string;
      executedAt?: Date;
      verification?: unknown;
      rejectedAt?: Date;
      executionError?: unknown;
    },
  ): Promise<Proposal> {
    const patch: Partial<typeof t.proposals.$inferInsert> = { status, updatedAt: new Date() };
    if (extra.approvedByUserId !== undefined) patch.approvedByUserId = extra.approvedByUserId;
    if (extra.approvedByUserId !== undefined) patch.approvedAt = new Date();
    if (extra.supersededById !== undefined) patch.supersededById = extra.supersededById;
    if (extra.executedAt !== undefined) patch.executedAt = extra.executedAt;
    if (extra.verification !== undefined) patch.verification = extra.verification;
    if (extra.rejectedAt !== undefined) patch.rejectedAt = extra.rejectedAt;
    if (extra.executionError !== undefined) patch.executionError = extra.executionError;
    const [row] = await this.db.update(t.proposals).set(patch).where(eq(t.proposals.id, id)).returning();
    if (!row) throw new MissingEntityError('proposal', id);
    return mapProposal(row);
  }

  async replacePayload(id: string, payload: unknown): Promise<Proposal> {
    const [row] = await this.db
      .update(t.proposals)
      .set({ payload, updatedAt: new Date() })
      .where(eq(t.proposals.id, id))
      .returning();
    if (!row) throw new MissingEntityError('proposal', id);
    return mapProposal(row);
  }
}

/* --------------------------------- audit ---------------------------------- */

export class DrizzleAuditRepository implements AuditRepository {
  constructor(private readonly db: Database) {}

  async record(event: AuditEventInput): Promise<void> {
    await this.db.insert(t.auditEvents).values({
      actorType: event.actorType,
      actorRef: event.actorRef,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      requestId: event.requestId ?? '',
      beforeJson: event.before ?? null,
      afterJson: event.after ?? null,
      channel: event.channel,
    });
  }

  async recordInTransaction(event: AuditEventInput): Promise<void> {
    return this.record(event);
  }

  async listByEntity(entityType: string, entityId: string, limit = 100): Promise<import('@meetingops/contracts').AuditEvent[]> {
    const rows = await this.db
      .select()
      .from(t.auditEvents)
      .where(and(eq(t.auditEvents.entityType, entityType), eq(t.auditEvents.entityId, entityId)))
      .orderBy(desc(t.auditEvents.id))
      .limit(limit);
    return rows.map(mapAuditEvent);
  }

  async listAll(limit = 100): Promise<import('@meetingops/contracts').AuditEvent[]> {
    const rows = await this.db
      .select()
      .from(t.auditEvents)
      .orderBy(desc(t.auditEvents.id))
      .limit(limit);
    return rows.map(mapAuditEvent);
  }
}

function mapAuditEvent(row: typeof t.auditEvents.$inferSelect) {
  return {
    id: `evt_${row.id}`,
    actorType: row.actorType,
    actorRef: row.actorRef,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    requestId: row.requestId,
    beforeJson: row.beforeJson,
    afterJson: row.afterJson,
    channel: row.channel,
    createdAt: toIso(row.createdAt),
  };
}

/* ------------------------------ idempotency ------------------------------- */

export class DrizzleIdempotencyRepository implements IdempotencyRepository {
  constructor(private readonly db: Database) {}

  async find(actorUserId: string, key: string) {
    const [row] = await this.db
      .select()
      .from(t.idempotencyRecords)
      .where(
        and(
          eq(t.idempotencyRecords.actorUserId, actorUserId),
          eq(t.idempotencyRecords.idempotencyKey, key),
        ),
      )
      .limit(1);
    if (!row) return null;
    return {
      requestHash: row.requestHash,
      responseJson: row.responseJson,
      statusCode: row.statusCode,
    };
  }

  async insert(record: {
    actorUserId: string;
    idempotencyKey: string;
    endpoint: string;
    requestHash: string;
    responseJson: unknown;
    statusCode: number;
  }): Promise<void> {
    await this.db.insert(t.idempotencyRecords).values(record);
  }
}

/* -------------------------------- sessions -------------------------------- */

export class DrizzleSessionRepository implements SessionRepository {
  constructor(private readonly db: Database) {}

  async create(id: string, userId: string): Promise<void> {
    await this.db.insert(t.sessions).values({ id, userId });
  }

  async findActive(id: string) {
    const [row] = await this.db
      .select()
      .from(t.sessions)
      .where(and(eq(t.sessions.id, id), eq(t.sessions.revoked, false)))
      .limit(1);
    return row ? { userId: row.userId } : null;
  }

  async touch(id: string): Promise<void> {
    await this.db.update(t.sessions).set({ lastSeenAt: new Date() }).where(eq(t.sessions.id, id));
  }
}

/* ------------------------------- bundle ----------------------------------- */

export function createRepos(db: Database): Repos {
  return {
    users: new DrizzleUserRepository(db),
    participants: new DrizzleParticipantRepository(db),
    projects: new DrizzleProjectRepository(db),
    meetings: new DrizzleMeetingRepository(db),
    decisions: new DrizzleDecisionRepository(db),
    actions: new DrizzleActionItemRepository(db),
    followUps: new DrizzleFollowUpRepository(db),
    proposals: new DrizzleProposalRepository(db),
    audit: new DrizzleAuditRepository(db),
    idempotency: new DrizzleIdempotencyRepository(db),
    sessions: new DrizzleSessionRepository(db),
  };
}
