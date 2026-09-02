/**
 * Meeting application service. All mutations validate, authorize, check
 * revisions, apply, audit — in that order. Route handlers and WebMCP tools
 * both call into these methods (docs/03: "No business rules in route
 * handlers"; docs/00: "WebMCP tools and human UI must call the same domain
 * services").
 */
import type { Repos, MeetingDetail } from '../repositories/types.js';
import { MeetingRevisionConflictError } from '../repositories/types.js';
import type { ActorContext } from './actorContext.js';
import { actorRefFor, actorTypeFor } from './actorContext.js';
import { idFactory } from '../ids.js';
import { AppError } from '@meetingops/contracts';
import {
  canTransitionMeeting,
  validateActionAssignment,
  validateAgendaOrdering,
  validateMeetingDuration,
  validateMeetingParticipants,
  isMeetingInOutcomeCaptureState,
} from '../domain/meetingRules.js';
import {
  checkSlotFeasibility,
  findAvailableSlots,
  type AvailabilityInput,
  type BusyInterval,
} from '../domain/availability.js';
import type {
  ActionItem,
  AgendaItem,
  Decision,
  FollowUp,
  Meeting,
  Participant,
  Slot,
} from '@meetingops/contracts';

export interface CreateMeetingInput {
  readonly title: string;
  readonly purpose: string;
  readonly projectId: string | null;
  readonly startAt: string;
  readonly durationMinutes: number;
  readonly participants: readonly { participantId: string; role: 'organizer' | 'attendee' }[];
  readonly agenda?: readonly { title: string; source: AgendaItem['source'] }[];
}

export class MeetingService {
  constructor(
    private readonly repos: Repos,
  ) {}

  async getMeeting(_ctx: ActorContext, meetingId: string): Promise<MeetingDetail> {
    const detail = await this.repos.meetings.findDetail(meetingId);
    if (!detail) throw new AppError('NOT_FOUND', `Meeting ${meetingId} not found`);
    return detail;
  }

  async listMeetings(
    _ctx: ActorContext,
    filter: { from?: string; to?: string; projectId?: string },
  ): Promise<Meeting[]> {
    return this.repos.meetings.list(filter);
  }

  async createMeeting(ctx: ActorContext, input: CreateMeetingInput): Promise<Meeting> {
    // Domain validation first (INV-1..3).
    const durationError = validateMeetingDuration({ durationMinutes: input.durationMinutes });
    if (durationError) throw new AppError('VALIDATION_ERROR', durationError);
    const participantError = validateMeetingParticipants(input.participants);
    if (participantError) throw new AppError('VALIDATION_ERROR', participantError);

    // Referential integrity.
    if (input.projectId !== null) {
      const project = await this.repos.projects.findById(input.projectId);
      if (!project) throw new AppError('NOT_FOUND', `Project ${input.projectId} not found`);
    }
    const participantIds = input.participants.map((p) => p.participantId);
    const known = await this.repos.participants.findByIds(participantIds);
    if (known.length !== participantIds.length) {
      throw new AppError('NOT_FOUND', 'One or more participants do not exist');
    }
    if (Number.isNaN(Date.parse(input.startAt))) {
      throw new AppError('VALIDATION_ERROR', 'Invalid startAt');
    }

    const meeting = await this.repos.meetings.create({
      id: idFactory('mtg'),
      title: input.title,
      purpose: input.purpose,
      projectId: input.projectId,
      startAt: new Date(input.startAt),
      durationMinutes: input.durationMinutes,
      status: 'scheduled',
      createdBy: ctx.userId,
      participants: input.participants,
      agenda: input.agenda,
    });

    await this.repos.audit.record({
      actorType: actorTypeFor(ctx),
      actorRef: actorRefFor(ctx),
      action: 'meeting.create',
      entityType: 'meeting',
      entityId: meeting.id,
      requestId: ctx.requestId,
      after: { title: meeting.title, startAt: meeting.startAt, status: meeting.status },
      channel: ctx.channel,
    });

    return meeting;
  }

  async updateMeeting(
    ctx: ActorContext,
    meetingId: string,
    input: {
      expectedRevision: number;
      title?: string;
      purpose?: string;
      projectId?: string | null;
      startAt?: string;
      durationMinutes?: number;
      participants?: readonly { participantId: string; role: 'organizer' | 'attendee' }[];
    },
  ): Promise<Meeting> {
    const existing = await this.repos.meetings.findById(meetingId);
    if (!existing) throw new AppError('NOT_FOUND', `Meeting ${meetingId} not found`);

    if (input.durationMinutes !== undefined) {
      const durationError = validateMeetingDuration({ durationMinutes: input.durationMinutes });
      if (durationError) throw new AppError('VALIDATION_ERROR', durationError);
    }
    if (input.participants !== undefined) {
      const participantError = validateMeetingParticipants(input.participants);
      if (participantError) throw new AppError('VALIDATION_ERROR', participantError);
    }
    if (input.startAt !== undefined && Number.isNaN(Date.parse(input.startAt))) {
      throw new AppError('VALIDATION_ERROR', 'Invalid startAt');
    }
    if (input.projectId !== undefined && input.projectId !== null) {
      const project = await this.repos.projects.findById(input.projectId);
      if (!project) throw new AppError('NOT_FOUND', `Project ${input.projectId} not found`);
    }
    if (input.participants !== undefined) {
      const ids = input.participants.map((p) => p.participantId);
      const known = await this.repos.participants.findByIds(ids);
      if (known.length !== ids.length) {
        throw new AppError('NOT_FOUND', 'One or more participants do not exist');
      }
    }

    let updated: Meeting;
    try {
      updated = await this.repos.meetings.updateWithRevision(meetingId, input.expectedRevision, {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.purpose !== undefined ? { purpose: input.purpose } : {}),
        ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
        ...(input.startAt !== undefined ? { startAt: new Date(input.startAt) } : {}),
        ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
      });
    } catch (err) {
      if (err instanceof MeetingRevisionConflictError) {
        throw new AppError('STALE_REVISION', `Meeting was modified (revision ${err.currentRevision})`, {
          currentRevision: err.currentRevision,
        });
      }
      throw err;
    }

    if (input.participants !== undefined) {
      await this.repos.meetings.replaceParticipants(meetingId, input.participants);
    }

    await this.repos.audit.record({
      actorType: actorTypeFor(ctx),
      actorRef: actorRefFor(ctx),
      action: 'meeting.update',
      entityType: 'meeting',
      entityId: meetingId,
      requestId: ctx.requestId,
      before: { revision: existing.revision, status: existing.status },
      after: { revision: updated.revision, status: updated.status, changed: Object.keys(input).filter((k) => k !== 'expectedRevision') },
      channel: ctx.channel,
    });

    return updated;
  }

  async transitionStatus(
    ctx: ActorContext,
    meetingId: string,
    input: { expectedRevision: number; status: Meeting['status'] },
  ): Promise<Meeting> {
    const existing = await this.repos.meetings.findById(meetingId);
    if (!existing) throw new AppError('NOT_FOUND', `Meeting ${meetingId} not found`);
    if (!canTransitionMeeting(existing.status, input.status)) {
      throw new AppError(
        'INVALID_STATE',
        `Cannot transition meeting from ${existing.status} to ${input.status}`,
      );
    }
    const updated = await this.repos.meetings.updateWithRevision(meetingId, input.expectedRevision, {
      status: input.status,
    });
    await this.repos.audit.record({
      actorType: actorTypeFor(ctx),
      actorRef: actorRefFor(ctx),
      action: 'meeting.status',
      entityType: 'meeting',
      entityId: meetingId,
      requestId: ctx.requestId,
      before: { status: existing.status },
      after: { status: input.status },
      channel: ctx.channel,
    });
    return updated;
  }

  async listMeetingsForParticipant(
    participant: Participant,
    from: Date,
    to: Date,
  ): Promise<Meeting[]> {
    return this.repos.meetings.listIdsForParticipantBetween(participant.id, from, to);
  }
}

export class AgendaService {
  constructor(private readonly repos: Repos) {}

  async addItem(
    ctx: ActorContext,
    meetingId: string,
    input: { title: string; source: AgendaItem['source']; sortOrder?: number; expectedRevision: number },
  ): Promise<AgendaItem> {
    const detail = await this.repos.meetings.findDetail(meetingId);
    if (!detail) throw new AppError('NOT_FOUND', `Meeting ${meetingId} not found`);

    let sortOrder = input.sortOrder;
    if (sortOrder === undefined) {
      sortOrder = await this.repos.meetings.nextAgendaSortOrder(meetingId);
    } else {
      const orders = detail.agenda.map((a) => a.sortOrder);
      const orderError = validateAgendaOrdering({ sortOrders: [...orders, sortOrder] });
      if (orderError) throw new AppError('VALIDATION_ERROR', orderError);
    }

    const item = await this.repos.meetings.addAgendaItem(meetingId, {
      title: input.title,
      source: input.source,
      sortOrder,
    });
    await this.repos.meetings.updateWithRevision(meetingId, input.expectedRevision, {});
    await this.repos.audit.record({
      actorType: actorTypeFor(ctx),
      actorRef: actorRefFor(ctx),
      action: 'agenda.add',
      entityType: 'meeting',
      entityId: meetingId,
      requestId: ctx.requestId,
      after: { itemId: item.id, title: item.title, sortOrder: item.sortOrder, source: item.source },
      channel: ctx.channel,
    });
    return item;
  }

  async updateItem(
    ctx: ActorContext,
    itemId: string,
    input: {
      meetingId: string;
      title?: string;
      status?: AgendaItem['status'];
      sortOrder?: number;
      expectedRevision: number;
    },
  ): Promise<AgendaItem> {
    const detail = await this.repos.meetings.findDetail(input.meetingId);
    if (!detail) throw new AppError('NOT_FOUND', `Meeting ${input.meetingId} not found`);
    if (!detail.agenda.some((a) => a.id === itemId)) {
      throw new AppError('NOT_FOUND', `Agenda item ${itemId} not found`);
    }
    if (input.sortOrder !== undefined) {
      const orders = detail.agenda.filter((a) => a.id !== itemId).map((a) => a.sortOrder);
      const orderError = validateAgendaOrdering({ sortOrders: [...orders, input.sortOrder] });
      if (orderError) throw new AppError('VALIDATION_ERROR', orderError);
    }
    const item = await this.repos.meetings.updateAgendaItem(itemId, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    });
    await this.repos.meetings.updateWithRevision(input.meetingId, input.expectedRevision, {});
    await this.repos.audit.record({
      actorType: actorTypeFor(ctx),
      actorRef: actorRefFor(ctx),
      action: 'agenda.update',
      entityType: 'meeting',
      entityId: input.meetingId,
      requestId: ctx.requestId,
      after: { itemId: item.id, changed: Object.keys(input).filter((k) => k !== 'expectedRevision') },
      channel: ctx.channel,
    });
    return item;
  }
}

export class DecisionService {
  constructor(private readonly repos: Repos) {}

  async record(
    ctx: ActorContext,
    meetingId: string,
    input: { title: string; outcome: string },
  ): Promise<Decision> {
    const meeting = await this.repos.meetings.findById(meetingId);
    if (!meeting) throw new AppError('NOT_FOUND', `Meeting ${meetingId} not found`);
    if (!isMeetingInOutcomeCaptureState(meeting.status)) {
      throw new AppError(
        'INVALID_STATE',
        `Decisions can only be recorded for meetings in outcome-capture state (current: ${meeting.status})`,
      );
    }
    const decision = await this.repos.decisions.insert({
      id: idFactory('dec'),
      meetingId,
      title: input.title,
      outcome: input.outcome,
      recordedAt: new Date(this.nowTime()),
    });
    await this.repos.audit.record({
      actorType: actorTypeFor(ctx),
      actorRef: actorRefFor(ctx),
      action: 'decision.record',
      entityType: 'meeting',
      entityId: meetingId,
      requestId: ctx.requestId,
      after: { decisionId: decision.id, title: decision.title },
      channel: ctx.channel,
    });
    return decision;
  }

  async listByMeeting(_ctx: ActorContext, meetingId: string): Promise<Decision[]> {
    return this.repos.decisions.listByMeeting(meetingId);
  }

  private nowTime(): number {
    return Date.now();
  }
}

export class ActionItemService {
  constructor(private readonly repos: Repos) {}

  async create(
    ctx: ActorContext,
    input: {
      meetingId: string;
      title: string;
      ownerParticipantId: string | null;
      projectId: string | null;
      dueAt: string | null;
    },
  ): Promise<ActionItem> {
    const detail = await this.repos.meetings.findDetail(input.meetingId);
    if (!detail) throw new AppError('NOT_FOUND', `Meeting ${input.meetingId} not found`);

    const ownerError = validateActionAssignment({
      ownerParticipantId: input.ownerParticipantId,
      participantIds: detail.participants.map((p) => p.participantId),
      allowExternalOwner: false,
    });
    if (ownerError) throw new AppError('VALIDATION_ERROR', ownerError);

    if (input.ownerParticipantId !== null) {
      const owner = await this.repos.participants.findByIds([input.ownerParticipantId]);
      if (owner.length === 0) throw new AppError('NOT_FOUND', 'Owner participant not found');
    }

    const action = await this.repos.actions.insert({
      id: idFactory('act'),
      meetingId: input.meetingId,
      projectId: input.projectId,
      title: input.title,
      ownerParticipantId: input.ownerParticipantId,
      dueAt: input.dueAt === null || input.dueAt === undefined ? null : new Date(input.dueAt),
    });
    await this.repos.audit.record({
      actorType: actorTypeFor(ctx),
      actorRef: actorRefFor(ctx),
      action: 'action.create',
      entityType: 'meeting',
      entityId: input.meetingId,
      requestId: ctx.requestId,
      after: { actionId: action.id, title: action.title, owner: action.ownerParticipantId },
      channel: ctx.channel,
    });
    return action;
  }

  async update(
    ctx: ActorContext,
    actionItemId: string,
    input: {
      title?: string;
      status?: ActionItem['status'];
      ownerParticipantId?: string | null;
      dueAt?: string | null;
    },
  ): Promise<ActionItem> {
    const existing = await this.repos.actions.findById(actionItemId);
    if (!existing) throw new AppError('NOT_FOUND', `Action item ${actionItemId} not found`);
    if (input.ownerParticipantId !== undefined && input.ownerParticipantId !== null) {
      const ownerError = validateActionAssignment({
        ownerParticipantId: input.ownerParticipantId,
        participantIds: (await this.repos.meetings.participantIds(existing.meetingId)) ?? [],
        allowExternalOwner: false,
      });
      if (ownerError) throw new AppError('VALIDATION_ERROR', ownerError);
    }
    const updated = await this.repos.actions.update(actionItemId, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.ownerParticipantId !== undefined ? { ownerParticipantId: input.ownerParticipantId } : {}),
      ...(input.dueAt !== undefined ? { dueAt: input.dueAt === null ? null : new Date(input.dueAt) } : {}),
    });
    await this.repos.audit.record({
      actorType: actorTypeFor(ctx),
      actorRef: actorRefFor(ctx),
      action: 'action.update',
      entityType: 'action_item',
      entityId: actionItemId,
      requestId: ctx.requestId,
      before: { status: existing.status, owner: existing.ownerParticipantId },
      after: { status: updated.status, owner: updated.ownerParticipantId },
      channel: ctx.channel,
    });
    return updated;
  }

  async listOpen(_ctx: ActorContext, filter: { projectId?: string; meetingId?: string }): Promise<ActionItem[]> {
    if (filter.meetingId) return this.repos.actions.listByMeeting(filter.meetingId);
    return this.repos.actions.listOpen({ projectId: filter.projectId });
  }
}

export class FollowUpService {
  constructor(private readonly repos: Repos) {}

  async create(
    ctx: ActorContext,
    input: { sourceMeetingId: string; targetMeetingId: string | null; scheduledAt: string | null },
  ): Promise<FollowUp> {
    const source = await this.repos.meetings.findById(input.sourceMeetingId);
    if (!source) throw new AppError('NOT_FOUND', `Meeting ${input.sourceMeetingId} not found`);
    const followUp = await this.repos.followUps.insert({
      id: idFactory('flu'),
      sourceMeetingId: input.sourceMeetingId,
      targetMeetingId: input.targetMeetingId,
      proposedAt: new Date(),
      scheduledAt: input.scheduledAt === null ? null : new Date(input.scheduledAt),
    });
    await this.repos.audit.record({
      actorType: actorTypeFor(ctx),
      actorRef: actorRefFor(ctx),
      action: 'followup.create',
      entityType: 'meeting',
      entityId: input.sourceMeetingId,
      requestId: ctx.requestId,
      after: { followUpId: followUp.id, scheduledAt: followUp.scheduledAt },
      channel: ctx.channel,
    });
    return followUp;
  }

  async listBySourceMeeting(_ctx: ActorContext, meetingId: string): Promise<FollowUp[]> {
    return this.repos.followUps.listBySourceMeeting(meetingId);
  }
}

export class OverviewService {
  constructor(
    private readonly repos: Repos,
    private readonly now: () => number = Date.now,
  ) {}

  /** Deterministic "today" context for agents and UI (D-022). */
  async getTodayOverview(_ctx: ActorContext): Promise<{
    today: string;
    weekStart: string;
    weekEnd: string;
    nextMeeting: Meeting | null;
    needsPreparation: Meeting[];
    overdueActions: ActionItem[];
    pendingDecisionsCount: number;
    pendingProposalsCount: number;
  }> {
    const nowMs = this.now();
    const nowDate = new Date(nowMs).toISOString().slice(0, 10);
    const { weekBounds } = await import('@meetingops/contracts');
    const bounds = weekBounds(nowDate);
    const meetings = await this.repos.meetings.list({ from: bounds.from, to: bounds.to });
    const next = meetings
      .filter((m) => m.status === 'scheduled' && Date.parse(m.startAt) >= nowMs)
      .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))[0];
    const needsPreparation = meetings.filter(
      (m) => m.status === 'draft' || m.status === 'proposed' || m.status === 'approved',
    );
    const overdueActions = (await this.repos.actions.listOpen({})).filter(
      (a) => a.dueAt !== null && Date.parse(a.dueAt) < nowMs,
    );
    const pendingDecisionsCount = meetings.filter((m) => m.status === 'needs_followup').length;
    const pendingProposals = await this.repos.proposals.list({ status: 'pending', limit: 100 });
    return {
      today: nowDate,
      weekStart: bounds.from,
      weekEnd: bounds.to,
      nextMeeting: next ?? null,
      needsPreparation,
      overdueActions,
      pendingDecisionsCount,
      pendingProposalsCount: pendingProposals.length,
    };
  }
}

export class AvailabilityService {
  constructor(private readonly repos: Repos) {}

  async findSlots(_ctx: ActorContext, input: {
    durationMinutes: number;
    dateFrom: string;
    dateTo: string;
    participantIds: readonly string[];
    nowMs?: number;
  }): Promise<{ slots: Slot[]; gridMinutes: number; window: { dateFrom: string; dateTo: string }; consideredParticipantIds: string[] }> {
    const participants = await this.repos.participants.findByIds(input.participantIds);
    if (participants.length !== input.participantIds.length) {
      throw new AppError('NOT_FOUND', 'One or more participants do not exist');
    }
    const busy: BusyInterval[] = [];
    for (const participant of participants) {
      const meetings = await this.repos.meetings.listIdsForParticipantBetween(
        participant.id,
        new Date(`${input.dateFrom}T00:00:00Z`),
        new Date(`${input.dateTo}T23:59:59.999Z`),
      );
      for (const meeting of meetings) {
        if (meeting.status === 'cancelled') continue;
        busy.push({
          participantId: participant.id,
          startMs: Date.parse(meeting.startAt),
          endMs: Date.parse(meeting.startAt) + meeting.durationMinutes * 60_000,
        });
      }
    }
    const availabilityInput: AvailabilityInput = {
      durationMinutes: input.durationMinutes,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      participants,
      busy,
      nowMs: input.nowMs ?? Date.now(),
    };
    return findAvailableSlots(availabilityInput);
  }

  async checkSlot(_ctx: ActorContext, input: {
    startAt: string;
    durationMinutes: number;
    participantIds: readonly string[];
  }) {
    const participants = await this.repos.participants.findByIds(input.participantIds);
    if (participants.length !== input.participantIds.length) {
      throw new AppError('NOT_FOUND', 'One or more participants do not exist');
    }
    const startMs = Date.parse(input.startAt);
    const endMs = startMs + input.durationMinutes * 60_000;
    const busy: BusyInterval[] = [];
    for (const participant of participants) {
      const meetings = await this.repos.meetings.listIdsForParticipantBetween(
        participant.id,
        new Date(startMs - 86_400_000),
        new Date(endMs + 86_400_000),
      );
      for (const meeting of meetings) {
        if (meeting.status === 'cancelled') continue;
        busy.push({
          participantId: participant.id,
          startMs: Date.parse(meeting.startAt),
          endMs: Date.parse(meeting.startAt) + meeting.durationMinutes * 60_000,
        });
      }
    }
    return checkSlotFeasibility(startMs, input.durationMinutes, endMs, participants, busy);
  }
}
