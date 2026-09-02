/**
 * Proposal application service: the human-control boundary.
 *
 * - Proposals never mutate committed meeting state (FR-2).
 * - Only authenticated human sessions can approve/reject (FR-3, INV-9).
 * - Every proposal targeting the same scope supersedes the previous live one
 *   (D-025) — "changing a material constraint invalidates the old proposal".
 * - Execution requires status `approved`, freshness (revision match), and runs
 *   apply + verify in one transaction (D-026). Failure rolls everything back.
 */
import {
  AppError,
  outcomeProposalPayloadSchema,
  proposalPayloadSchema,
  type Proposal,
  type ProposalKind,
  type ProposalStatus,
} from '@meetingops/contracts';
import { idFactory } from '../ids.js';
import {
  executionBlockReason,
  isProposalStale,
  proposalScopeKey,
  type ProposalStateSnapshot,
} from '../domain/proposalRules.js';
import {
  expectationsFromProposalPayload,
  verifyMeetingSnapshot,
  type VerificationExpectation,
  type VerificationReport,
} from '../domain/verification.js';
import type { ActorContext } from './actorContext.js';
import { actorRefFor, actorTypeFor, SYSTEM_CONTEXT } from './actorContext.js';
import { MeetingService, AvailabilityService } from './meetingService.js';
import { withTransaction, type DbHandle } from '../db/client.js';
import { createRepos } from '../repositories/drizzle.js';
import { z } from 'zod';

const updateChangesSchema = z.strictObject({
  title: z.string().min(1).max(200).optional(),
  purpose: z.string().max(2000).optional(),
  startAt: z.string().optional(),
  durationMinutes: z.number().int().min(5).max(180).optional(),
  projectId: z.string().nullable().optional(),
  participants: z
    .array(z.strictObject({ participantId: z.string(), role: z.enum(['organizer', 'attendee']) }))
    .min(1)
    .max(20)
    .optional(),
  agendaAdditions: z
    .array(z.strictObject({ title: z.string().min(1).max(200), source: z.enum(['human', 'agent', 'project_context', 'previous_outcome']) }))
    .max(20)
    .optional(),
  agendaRemovals: z.array(z.string()).max(20).optional(),
});

export interface CreateProposalInput {
  readonly kind: ProposalKind;
  readonly payload: unknown;
  readonly rationale: string;
}

export class ProposalService {
  constructor(
    private readonly handle: DbHandle,
    private readonly now: () => number = Date.now,
  ) {}

  private repos() {
    return createRepos(this.handle.db);
  }

  private availabilityService(repos = this.repos()): AvailabilityService {
    return new AvailabilityService(repos);
  }

  /* ----------------------------- create proposal -------------------------- */

  async createProposal(ctx: ActorContext, input: CreateProposalInput): Promise<Proposal> {
    const parsed = proposalPayloadSchema.safeParse(input.payload);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid proposal payload', {
        issues: parsed.error.issues.slice(0, 10),
      });
    }
    const payload = parsed.data;

    // Deterministic time validation: a proposed meeting time that violates
    // working hours / focus blocks / existing meetings is an error (agent must
    // pick a valid slot; we never silently soften constraints).
    if (payload.kind === 'meeting_create') {
      await this.assertSlotFeasible(
        payload.payload.startAt,
        payload.payload.durationMinutes,
        payload.payload.participants.map((p) => p.participantId),
      );
    }
    if (payload.kind === 'meeting_update' && payload.payload.changes.startAt) {
      const meeting = await this.repos().meetings.findById(payload.payload.meetingId);
      if (!meeting) throw new AppError('NOT_FOUND', `Meeting ${payload.payload.meetingId} not found`);
      await this.assertSlotFeasible(
        payload.payload.changes.startAt,
        payload.payload.changes.durationMinutes ?? meeting.durationMinutes,
        payload.payload.changes.participants?.map((p) => p.participantId) ??
          (await this.repos().meetings.participantIds(meeting.id)),
      );
    }

    const repos = this.repos();
    const baseMeetingId =
      payload.kind === 'meeting_create'
        ? null
        : ('meetingId' in payload.payload
            ? (payload.payload.meetingId as string)
            : ('sourceMeetingId' in payload.payload
                ? (payload.payload.sourceMeetingId as string)
                : ('actionItemId' in payload.payload ? null : null)));
    const baseRevision = baseMeetingId
      ? ((await repos.meetings.findById(baseMeetingId))?.revision ?? null)
      : null;
    const projectId =
      payload.kind === 'meeting_create'
        ? (payload.payload.projectId ?? null)
        : baseMeetingId
          ? ((await repos.meetings.findById(baseMeetingId))?.projectId ?? null)
          : null;

    const proposal = await repos.proposals.insert({
      id: idFactory('prp'),
      kind: payload.kind,
      payload: input.payload,
      rationale: input.rationale,
      projectId,
      baseMeetingId,
      baseMeetingRevision: baseRevision,
      createdByActorType: actorTypeFor(ctx),
      createdByActorRef: actorRefFor(ctx),
      createdByUserId: ctx.userId,
    });

    // Supersede previous live proposals for the same scope (D-025).
    await this.supersedeSameScope(proposal);

    await repos.audit.record({
      actorType: actorTypeFor(ctx),
      actorRef: actorRefFor(ctx),
      action: 'proposal.create',
      entityType: 'proposal',
      entityId: proposal.id,
      requestId: ctx.requestId,
      after: { kind: proposal.kind, status: proposal.status, baseMeetingId },
      channel: ctx.channel,
    });

    return proposal;
  }

  /** Validate a concrete proposed time against real availability. */
  private async assertSlotFeasible(
    startAt: string,
    durationMinutes: number,
    participantIds: readonly string[],
  ): Promise<void> {
    const result = await this.availabilityService().checkSlot(SYSTEM_CONTEXT, {
      startAt,
      durationMinutes,
      participantIds,
    });
    if (!result.available) {
      throw new AppError(
        'INVALID_TIME',
        'Proposed time violates participant constraints (working hours, focus blocks, or existing meetings)',
        { conflicts: result.conflicts },
      );
    }
  }

  private async supersedeSameScope(proposal: Proposal): Promise<void> {
    const repos = this.repos();
    const scopeKey = proposalScopeKey(proposal.kind, proposal.projectId, proposal.baseMeetingId);
    const live = await repos.proposals.listLiveByKindAndBase(proposal.kind, proposal.baseMeetingId
      ? { baseMeetingId: proposal.baseMeetingId }
      : { projectId: proposal.projectId });
    for (const existing of live) {
      const existingKey = proposalScopeKey(existing.kind, existing.projectId, existing.baseMeetingId);
      if (existing.id !== proposal.id && existingKey === scopeKey) {
        await repos.proposals.setStatus(existing.id, 'superseded', {
          supersededById: proposal.id,
        });
        await repos.audit.record({
          actorType: 'system',
          actorRef: 'proposal-service',
          action: 'proposal.superseded',
          entityType: 'proposal',
          entityId: existing.id,
          requestId: proposal.id,
          before: { status: existing.status },
          after: { status: 'superseded', supersededById: proposal.id },
          channel: 'system',
        });
      }
    }
  }

  /* ------------------------------ revise proposal ------------------------- */

  /**
   * Creates a NEW pending proposal from an existing one + changes, superseding
   * the previous version (docs/04: "Replan on human edits"). Works for both
   * the agent (`update_meeting_proposal`) and the human Edit path.
   */
  async reviseProposal(
    ctx: ActorContext,
    proposalId: string,
    changes: unknown,
    rationale: string,
  ): Promise<Proposal> {
    const repos = this.repos();
    const original = await repos.proposals.findById(proposalId);
    if (!original) throw new AppError('NOT_FOUND', `Proposal ${proposalId} not found`);
    if (original.status === 'executed') {
      throw new AppError('PROPOSAL_ALREADY_EXECUTED', 'Proposal was already executed');
    }
    if (original.status === 'rejected') {
      throw new AppError('PROPOSAL_REJECTED', 'Proposal was rejected; prepare a new one');
    }

    const parsedOriginal = proposalPayloadSchema.safeParse(original.payload);
    if (!parsedOriginal.success) {
      throw new AppError('INTERNAL', 'Stored proposal payload is invalid');
    }

    const parsedChanges = updateChangesSchema.safeParse(changes);
    if (!parsedChanges.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid proposal changes', {
        issues: parsedChanges.error.issues.slice(0, 10),
      });
    }
    const change = parsedChanges.data;

    const newKind: ProposalKind = original.kind;
    let newPayload: unknown;

    if (original.kind === 'meeting_create' && parsedOriginal.data.kind === 'meeting_create') {
      const base = parsedOriginal.data;
      const startAt = change.startAt ?? base.payload.startAt;
      const durationMinutes = change.durationMinutes ?? base.payload.durationMinutes;
      const participants = change.participants ?? base.payload.participants;
      await this.assertSlotFeasible(startAt, durationMinutes, participants.map((p) => p.participantId));
      // Apply agenda additions/removals to the proposed agenda.
      const titles = new Set((change.agendaRemovals ?? []).map((id) => id));
      const agenda = [
        ...base.payload.agenda.filter((a) => !titles.has(a.title) && !titles.has(a.title)),
        ...(change.agendaAdditions ?? []),
      ];
      newPayload = {
        kind: 'meeting_create',
        payload: {
          ...base.payload,
          ...(change.title !== undefined ? { title: change.title } : {}),
          ...(change.purpose !== undefined ? { purpose: change.purpose } : {}),
          ...(change.projectId !== undefined ? { projectId: change.projectId } : {}),
          startAt,
          durationMinutes,
          participants,
          agenda,
        },
      };
    } else if (original.kind === 'meeting_update' && parsedOriginal.data.kind === 'meeting_update') {
      const base = parsedOriginal.data;
      const merged = { ...base.payload.changes, ...change };
      newPayload = { kind: 'meeting_update', payload: { meetingId: base.payload.meetingId, changes: merged } };
      if (typeof merged.startAt === 'string') {
        const meeting = await repos.meetings.findById(base.payload.meetingId);
        if (!meeting) throw new AppError('NOT_FOUND', 'Meeting not found');
        await this.assertSlotFeasible(
          merged.startAt,
          typeof merged.durationMinutes === 'number' ? merged.durationMinutes : meeting.durationMinutes,
          Array.isArray(merged.participants)
            ? (merged.participants as { participantId: string }[]).map((p) => p.participantId)
            : await repos.meetings.participantIds(base.payload.meetingId),
        );
      }
    } else if (original.kind === 'agenda' && parsedOriginal.data.kind === 'agenda') {
      const base = parsedOriginal.data;
      const titles = new Set(change.agendaRemovals ?? []);
      const items = [
        ...base.payload.items.filter((i) => !titles.has(i.title)),
        ...(change.agendaAdditions ?? []),
      ];
      if (items.length === 0) throw new AppError('VALIDATION_ERROR', 'Revised agenda is empty');
      newPayload = { kind: 'agenda', payload: { meetingId: base.payload.meetingId, items } };
    } else {
      throw new AppError('VALIDATION_ERROR', `Proposal kind ${original.kind} cannot be revised`);
    }

    const revised = await repos.proposals.insert({
      id: idFactory('prp'),
      kind: newKind,
      payload: newPayload,
      rationale,
      projectId: original.projectId,
      baseMeetingId: original.baseMeetingId,
      baseMeetingRevision: original.baseMeetingRevision,
      createdByActorType: actorTypeFor(ctx),
      createdByActorRef: actorRefFor(ctx),
      createdByUserId: ctx.userId,
    });
    await this.supersedeSameScope(revised);

    await repos.audit.record({
      actorType: actorTypeFor(ctx),
      actorRef: actorRefFor(ctx),
      action: 'proposal.revise',
      entityType: 'proposal',
      entityId: revised.id,
      requestId: ctx.requestId,
      after: {
        revisedFrom: original.id,
        kind: revised.kind,
        rationale,
      },
      channel: ctx.channel,
    });

    return revised;
  }

  /* ------------------------------- approve -------------------------------- */

  /** Human-only (FR-3). The session IS the authorization. */
  async approve(ctx: ActorContext, proposalId: string): Promise<Proposal> {
    if (ctx.channel !== 'ui') {
      throw new AppError('APPROVAL_FORBIDDEN', 'Approval is a human action in the MeetingOps UI');
    }
    const repos = this.repos();
    const proposal = await repos.proposals.findById(proposalId);
    if (!proposal) throw new AppError('NOT_FOUND', `Proposal ${proposalId} not found`);
    if (proposal.status !== 'pending') {
      throw new AppError('PROPOSAL_NOT_PENDING', `Proposal is ${proposal.status}, not pending`);
    }
    const approved = await repos.proposals.setStatus(proposalId, 'approved', {
      approvedByUserId: ctx.userId,
    });
    await repos.audit.record({
      actorType: 'human',
      actorRef: actorRefFor(ctx),
      action: 'proposal.approve',
      entityType: 'proposal',
      entityId: proposalId,
      requestId: ctx.requestId,
      before: { status: 'pending' },
      after: { status: 'approved', approvedByUserId: ctx.userId },
      channel: 'ui',
    });
    return approved;
  }

  async reject(ctx: ActorContext, proposalId: string, reason: string): Promise<Proposal> {
    if (ctx.channel !== 'ui') {
      throw new AppError('APPROVAL_FORBIDDEN', 'Rejection is a human action in the MeetingOps UI');
    }
    const repos = this.repos();
    const proposal = await repos.proposals.findById(proposalId);
    if (!proposal) throw new AppError('NOT_FOUND', `Proposal ${proposalId} not found`);
    if (proposal.status !== 'pending') {
      throw new AppError('PROPOSAL_NOT_PENDING', `Proposal is ${proposal.status}, not pending`);
    }
    const rejected = await repos.proposals.setStatus(proposalId, 'rejected', {
      rejectedAt: new Date(),
    });
    await repos.audit.record({
      actorType: 'human',
      actorRef: actorRefFor(ctx),
      action: 'proposal.reject',
      entityType: 'proposal',
      entityId: proposalId,
      requestId: ctx.requestId,
      before: { status: 'pending' },
      after: { status: 'rejected', reason },
      channel: 'ui',
    });
    return rejected;
  }

  /* ------------------------------- execute -------------------------------- */

  /**
   * Execute a human-approved proposal. Deterministic gate order:
   *   exists → approved → not superseded/executed/rejected → revision fresh
   * then apply + verify in ONE transaction (D-026).
   */
  async executeProposal(ctx: ActorContext, proposalId: string): Promise<{ proposal: Proposal; verification: VerificationReport | null }> {
    const repos = this.repos();
    const proposal = await repos.proposals.findById(proposalId);
    if (!proposal) throw new AppError('NOT_FOUND', `Proposal ${proposalId} not found`);

    const snapshot: ProposalStateSnapshot = {
      id: proposal.id,
      kind: proposal.kind,
      status: proposal.status,
      baseMeetingId: proposal.baseMeetingId,
      baseMeetingRevision: proposal.baseMeetingRevision,
    };
    const blockReason = executionBlockReason(snapshot);
    if (blockReason === 'PROPOSAL_NOT_APPROVED') {
      throw new AppError('PROPOSAL_NOT_APPROVED', 'Proposal has not been approved by a human');
    }
    if (blockReason === 'PROPOSAL_SUPERSEDED') {
      throw new AppError('PROPOSAL_SUPERSEDED', 'Proposal was superseded by a newer proposal');
    }
    if (blockReason === 'PROPOSAL_ALREADY_EXECUTED') {
      throw new AppError('PROPOSAL_ALREADY_EXECUTED', 'Proposal was already executed');
    }
    if (blockReason === 'PROPOSAL_REJECTED') {
      throw new AppError('PROPOSAL_REJECTED', 'Proposal was rejected');
    }

    // Freshness (INV-7).
    let currentRevision: number | null = null;
    if (proposal.baseMeetingId) {
      const meeting = await repos.meetings.findById(proposal.baseMeetingId);
      currentRevision = meeting?.revision ?? null;
    }
    if (isProposalStale(snapshot, currentRevision)) {
      throw new AppError(
        'STALE_PROPOSAL',
        'Meeting state changed since this proposal was approved; review again',
        { currentRevision, proposalRevision: proposal.baseMeetingRevision },
      );
    }

    // Apply + verify in one transaction.
    return withTransaction(this.handle, async (tx) => {
      const txRepos = createRepos(tx);
      const parsed = proposalPayloadSchema.safeParse(proposal.payload);
      if (!parsed.success) {
        throw new AppError('INTERNAL', 'Stored proposal payload is invalid');
      }
      const payload = parsed.data;

      const meetingService = new MeetingService(txRepos);
      const executedAt = new Date();
      let verification: VerificationReport | null = null;

      if (payload.kind === 'meeting_create') {
        const p = payload.payload;
        const meeting = await meetingService.createMeeting(ctx, {
          title: p.title,
          purpose: p.purpose,
          projectId: p.projectId,
          startAt: p.startAt,
          durationMinutes: p.durationMinutes,
          participants: p.participants,
          agenda: p.agenda.map((a) => ({ title: a.title, source: a.source })),
        });
        verification = await this.verifyAgainstPersisted(txRepos, meeting.id, {
          status: 'scheduled',
          participantIds: p.participants.map((x) => x.participantId),
          agendaContains: p.agenda.map((a) => a.title),
          minimumAgendaItems: p.agenda.length,
        }, executedAt);
      } else if (payload.kind === 'meeting_update') {
        const p = payload.payload;
        const changes = p.changes;
        await meetingService.updateMeeting(ctx, p.meetingId, {
          expectedRevision: proposal.baseMeetingRevision ?? 1,
          ...(changes.title !== undefined ? { title: changes.title } : {}),
          ...(changes.purpose !== undefined ? { purpose: changes.purpose } : {}),
          ...(changes.projectId !== undefined ? { projectId: changes.projectId } : {}),
          ...(changes.startAt !== undefined ? { startAt: changes.startAt } : {}),
          ...(changes.durationMinutes !== undefined ? { durationMinutes: changes.durationMinutes } : {}),
          ...(changes.participants !== undefined ? { participants: changes.participants } : {}),
        });
        // Agenda additions/removals
        const detail = await txRepos.meetings.findDetail(p.meetingId);
        if (!detail) throw new AppError('NOT_FOUND', 'Meeting not found');
        let nextOrder = detail.agenda.length;
        for (const removal of changes.agendaRemovals ?? []) {
          const item = detail.agenda.find((a) => a.id === removal || a.title === removal);
          if (item) await txRepos.meetings.deleteAgendaItem(item.id);
        }
        for (const addition of changes.agendaAdditions ?? []) {
          nextOrder += 1;
          await txRepos.meetings.addAgendaItem(p.meetingId, {
            title: addition.title,
            source: addition.source,
            sortOrder: nextOrder,
          });
        }
        verification = await this.verifyAgainstPersisted(txRepos, p.meetingId, {}, executedAt);
      } else if (payload.kind === 'agenda') {
        const p = payload.payload;
        // Replace agenda atomically (documented semantics of the agenda proposal).
        const detail = await txRepos.meetings.findDetail(p.meetingId);
        if (!detail) throw new AppError('NOT_FOUND', `Meeting ${p.meetingId} not found`);
        for (const item of detail.agenda) {
          await txRepos.meetings.deleteAgendaItem(item.id);
        }
        let order = 1;
        for (const item of p.items) {
          await txRepos.meetings.addAgendaItem(p.meetingId, {
            title: item.title,
            source: item.source,
            sortOrder: order,
          });
          order += 1;
        }
        await txRepos.meetings.updateWithRevision(p.meetingId, proposal.baseMeetingRevision ?? 1, {});
        verification = await this.verifyAgainstPersisted(txRepos, p.meetingId, {
          agendaContains: p.items.map((i) => i.title),
          minimumAgendaItems: p.items.length,
        }, executedAt);
      } else if (payload.kind === 'followup') {
        const p = payload.payload;
        const followUp = await txRepos.followUps.insert({
          id: idFactory('flu'),
          sourceMeetingId: p.sourceMeetingId,
          targetMeetingId: null,
          proposedAt: executedAt,
          scheduledAt: p.proposedScheduledAt === null ? null : new Date(p.proposedScheduledAt),
        });
        verification = {
          ok: followUp.id.length > 0,
          checkedAt: executedAt.toISOString(),
          checks: [
            { name: 'followup_created', expected: true, actual: true, pass: true },
            {
              name: 'followup_source_meeting',
              expected: p.sourceMeetingId,
              actual: followUp.sourceMeetingId,
              pass: followUp.sourceMeetingId === p.sourceMeetingId,
            },
          ],
        };
      } else {
        // outcome
        const p = outcomeProposalPayloadSchema.parse(payload.payload);
        if (p.op === 'record_decision') {
          const decision = await txRepos.decisions.insert({
            id: idFactory('dec'),
            meetingId: p.meetingId,
            title: p.title,
            outcome: p.outcome,
            recordedAt: executedAt,
          });
          verification = {
            ok: decision.id.length > 0,
            checkedAt: executedAt.toISOString(),
            checks: [
              { name: 'decision_recorded', expected: p.title, actual: decision.title, pass: decision.title === p.title },
            ],
          };
        } else if (p.op === 'create_action_item') {
          const action = await txRepos.actions.insert({
            id: idFactory('act'),
            meetingId: p.meetingId,
            projectId: p.projectId,
            title: p.title,
            ownerParticipantId: p.ownerParticipantId,
            dueAt: p.dueAt === null ? null : new Date(p.dueAt),
          });
          verification = {
            ok: action.id.length > 0 && action.title === p.title && action.ownerParticipantId === p.ownerParticipantId,
            checkedAt: executedAt.toISOString(),
            checks: [
              { name: 'action_created', expected: p.title, actual: action.title, pass: action.title === p.title },
              {
                name: 'action_owner',
                expected: p.ownerParticipantId,
                actual: action.ownerParticipantId,
                pass: action.ownerParticipantId === p.ownerParticipantId,
              },
            ],
          };
        } else {
          const existing = await txRepos.actions.findById(p.actionItemId);
          if (!existing) throw new AppError('NOT_FOUND', `Action item ${p.actionItemId} not found`);
          const updated = await txRepos.actions.update(p.actionItemId, {
            ownerParticipantId: p.ownerParticipantId,
            ...(p.dueAt !== undefined ? { dueAt: p.dueAt === null ? null : new Date(p.dueAt) } : {}),
          });
          verification = {
            ok: updated.ownerParticipantId === p.ownerParticipantId,
            checkedAt: executedAt.toISOString(),
            checks: [
              {
                name: 'action_owner_assigned',
                expected: p.ownerParticipantId,
                actual: updated.ownerParticipantId,
                pass: updated.ownerParticipantId === p.ownerParticipantId,
              },
            ],
          };
        }
      }

      // Never silently continue after failed verification (D-026).
      if (!verification.ok) {
        await txRepos.proposals.setStatus(proposalId, 'failed', {
          executionError: { code: 'VERIFICATION_FAILED', verification },
        });
        throw new AppError('VERIFICATION_FAILED', 'Post-execution verification failed; mutation rolled back', {
          verification,
        });
      }

      const executed = await txRepos.proposals.setStatus(proposalId, 'executed', {
        executedAt,
        verification,
      });

      await txRepos.audit.record({
        actorType: actorTypeFor(ctx),
        actorRef: actorRefFor(ctx),
        action: 'proposal.execute',
        entityType: 'proposal',
        entityId: proposalId,
        requestId: ctx.requestId,
        before: { status: 'approved' },
        after: { status: 'executed', verification },
        channel: ctx.channel,
      });

      return { proposal: executed, verification };
    });
  }

  /**
   * Standalone verification (the `verify_meeting_state` tool): compares the
   * caller's expectations against actual persisted state.
   */
  async verifyMeetingState(
    ctx: ActorContext,
    meetingId: string,
    expectations: VerificationExpectation,
  ): Promise<VerificationReport> {
    const repos = this.repos();
    const detail = await repos.meetings.findDetail(meetingId);
    if (!detail) throw new AppError('NOT_FOUND', `Meeting ${meetingId} not found`);
    const report = verifyMeetingSnapshot(
      {
        id: detail.id,
        status: detail.status,
        startAt: detail.startAt,
        durationMinutes: detail.durationMinutes,
        title: detail.title,
        participantIds: detail.participants.map((p) => p.participantId),
        agendaTitles: detail.agenda.map((a) => a.title),
        actionItemTitles: detail.actions.map((a) => a.title),
        revision: detail.revision,
      },
      expectations,
      new Date(this.now()).toISOString(),
    );
    await repos.audit.record({
      actorType: actorTypeFor(ctx),
      actorRef: actorRefFor(ctx),
      action: 'meeting.verify',
      entityType: 'meeting',
      entityId: meetingId,
      requestId: ctx.requestId,
      after: { ok: report.ok, failedChecks: report.checks.filter((c) => !c.pass).map((c) => c.name) },
      channel: ctx.channel,
    });
    return report;
  }

  private async verifyAgainstPersisted(
    repos: ReturnType<typeof createRepos>,
    meetingId: string,
    expectations: Record<string, unknown>,
    at: Date,
  ): Promise<VerificationReport> {
    const detail = await repos.meetings.findDetail(meetingId);
    if (!detail) {
      return {
        ok: false,
        checkedAt: at.toISOString(),
        checks: [{ name: 'meeting_exists', expected: true, actual: false, pass: false }],
      };
    }
    const base = expectationsFromProposalPayload({ ...expectations });
    return verifyMeetingSnapshot(
      {
        id: detail.id,
        status: detail.status,
        startAt: detail.startAt,
        durationMinutes: detail.durationMinutes,
        title: detail.title,
        participantIds: detail.participants.map((p) => p.participantId),
        agendaTitles: detail.agenda.map((a) => a.title),
        actionItemTitles: detail.actions.map((a) => a.title),
        revision: detail.revision,
      },
      base,
      at.toISOString(),
    );
  }

  /**
   * INV-8: invalidate live proposals for a meeting when protected fields
   * change. Called by MeetingService after a successful human/agent edit.
   */
  async supersedeLiveForMeetingChange(
    meetingId: string,
    requestId: string,
  ): Promise<number> {
    const repos = this.repos();
    const live = await repos.proposals.listLiveByKindAndBase('meeting_update', { baseMeetingId: meetingId });
    const agendaLive = await repos.proposals.listLiveByKindAndBase('agenda', { baseMeetingId: meetingId });
    let count = 0;
    for (const proposal of [...live, ...agendaLive]) {
      await repos.proposals.setStatus(proposal.id, 'superseded', {});
      await repos.audit.record({
        actorType: 'system',
        actorRef: 'meeting-change',
        action: 'proposal.superseded',
        entityType: 'proposal',
        entityId: proposal.id,
        requestId,
        before: { status: proposal.status },
        after: { status: 'superseded', reason: 'meeting_changed' },
        channel: 'system',
      });
      count += 1;
    }
    return count;
  }

  async listProposals(
    _ctx: ActorContext,
    filter: {
      status?: ProposalStatus;
      baseMeetingId?: string;
      projectId?: string;
    },
  ): Promise<Proposal[]> {
    return this.repos().proposals.list(filter);
  }

  async getProposal(_ctx: ActorContext, proposalId: string): Promise<Proposal> {
    const proposal = await this.repos().proposals.findById(proposalId);
    if (!proposal) throw new AppError('NOT_FOUND', `Proposal ${proposalId} not found`);
    return proposal;
  }
}
