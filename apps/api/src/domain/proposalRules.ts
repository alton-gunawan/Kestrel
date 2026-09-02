/**
 * Proposal lifecycle rules — the heart of the human-control boundary.
 *
 * Deterministic and framework-independent. Implements:
 * - docs/02_WEBMCP_SPEC.md "Safety rules"
 * - docs/03_DOMAIN_DATA_API.md INV-7/8/9
 * - docs/04_AGENT_INTERACTION.md "Replan on human edits", "Never forge approval"
 * - docs/implementation-decisions.md D-004, D-005, D-025, D-026
 */
import type { ProposalKind, ProposalStatus } from '@meetingops/contracts';

export interface ProposalStateSnapshot {
  readonly id: string;
  readonly kind: ProposalKind;
  readonly status: ProposalStatus;
  readonly baseMeetingId: string | null;
  readonly baseMeetingRevision: number | null;
}

/**
 * A proposal may execute only when a human has actually approved it in the
 * application (status `approved`), and it has not been superseded, executed,
 * or rejected. Agent-supplied flags never influence this (there is no input
 * anywhere in the system that can change it).
 */
export function isExecutionReady(proposal: ProposalStateSnapshot): boolean {
  return proposal.status === 'approved';
}

export type ExecutionBlockReason =
  | 'PROPOSAL_NOT_FOUND'
  | 'PROPOSAL_NOT_APPROVED'
  | 'PROPOSAL_SUPERSEDED'
  | 'PROPOSAL_ALREADY_EXECUTED'
  | 'PROPOSAL_REJECTED';

export function executionBlockReason(proposal: ProposalStateSnapshot): ExecutionBlockReason | null {
  switch (proposal.status) {
    case 'approved':
      return null;
    case 'pending':
      return 'PROPOSAL_NOT_APPROVED';
    case 'superseded':
      return 'PROPOSAL_SUPERSEDED';
    case 'executed':
      return 'PROPOSAL_ALREADY_EXECUTED';
    case 'rejected':
    case 'failed':
      return 'PROPOSAL_REJECTED';
    default: {
      const exhaustive: never = proposal.status;
      return exhaustive;
    }
  }
}

/**
 * INV-7: a stale revision cannot be applied. For proposals that target an
 * existing meeting, the meeting's current revision must match the revision
 * the proposal was based on.
 */
export function isProposalStale(
  proposal: ProposalStateSnapshot,
  currentMeetingRevision: number | null,
): boolean {
  if (proposal.baseMeetingId === null) return false;
  if (currentMeetingRevision === null) return true; // meeting vanished
  return proposal.baseMeetingRevision !== currentMeetingRevision;
}

/**
 * Kind → the proposal kinds that supersede a pending/approved proposal of the
 * same scope. A new proposal for the same scope invalidates the old one
 * (D-025): only one live proposal may exist per scope.
 */
export function supersedesScope(
  newKind: ProposalKind,
  newScopeKey: string,
  existing: { id: string; kind: ProposalKind; scopeKey: string | null },
): boolean {
  return existing.kind === newKind && existing.scopeKey === newScopeKey && existing.id !== undefined;
}

/**
 * Scope keys make "same target" explicit:
 * - meeting_create → the project it will belong to (or global)
 * - meeting_update / agenda / followup / outcome → the meeting
 */
export function proposalScopeKey(
  kind: ProposalKind,
  projectId: string | null,
  baseMeetingId: string | null,
): string {
  if (kind === 'meeting_create') {
    return `project:${projectId ?? 'none'}`;
  }
  return `meeting:${baseMeetingId ?? 'none'}`;
}

export interface ApprovalActionContext {
  readonly proposal: ProposalStateSnapshot;
  /** True only when the action comes from an authenticated human UI session. */
  readonly isHumanSession: boolean;
}

/** Only humans approve; pending proposals only (INV-9, WM-7). */
export function canApprove(ctx: ApprovalActionContext): { ok: boolean; code?: string } {
  if (!ctx.isHumanSession) return { ok: false, code: 'APPROVAL_FORBIDDEN' };
  if (ctx.proposal.status !== 'pending') {
    return { ok: false, code: `PROPOSAL_NOT_PENDING` };
  }
  return { ok: true };
}

/** Reject is likewise a human-only action on pending proposals. */
export function canReject(ctx: ApprovalActionContext): { ok: boolean; code?: string } {
  return canApprove(ctx);
}
