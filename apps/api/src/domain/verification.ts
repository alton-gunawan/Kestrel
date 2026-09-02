/**
 * Verification comparator (FR-7, US-11, WM-10).
 *
 * Pure function: compares caller expectations against ACTUAL persisted state
 * snapshots. Never trusts claimed state; never mutates. Used by
 * `executeProposal` (transactional verification) and by the
 * `verify_meeting_state` tool (standalone re-verification).
 */
import type {
  MeetingStatus,
  VerificationCheck,
  VerificationReport,
} from '@meetingops/contracts';

export interface PersistedMeetingSnapshot {
  readonly id: string;
  readonly status: MeetingStatus;
  readonly startAt: string;
  readonly durationMinutes: number;
  readonly title: string;
  readonly participantIds: readonly string[];
  readonly agendaTitles: readonly string[];
  readonly actionItemTitles: readonly string[];
  readonly revision: number;
}

/** Re-export shared verification shapes for local convenience. */
export type { VerificationCheck, VerificationReport } from '@meetingops/contracts';

export interface VerificationExpectation {
  readonly status?: MeetingStatus;
  readonly agendaContains?: readonly string[];
  readonly actionItemTitles?: readonly string[];
  readonly participantIds?: readonly string[];
  readonly minimumAgendaItems?: number;
}

export function verifyMeetingSnapshot(
  snapshot: PersistedMeetingSnapshot,
  expectations: VerificationExpectation,
  checkedAt: string,
): VerificationReport {
  const checks: VerificationCheck[] = [];

  checks.push({
    name: 'meeting_exists',
    expected: true,
    actual: true,
    pass: true,
  });

  if (expectations.status !== undefined) {
    checks.push({
      name: 'meeting_status',
      expected: expectations.status,
      actual: snapshot.status,
      pass: snapshot.status === expectations.status,
    });
  }

  if (expectations.participantIds !== undefined) {
    const missing = expectations.participantIds.filter(
      (id) => !snapshot.participantIds.includes(id),
    );
    checks.push({
      name: 'participants_present',
      expected: expectations.participantIds,
      actual: snapshot.participantIds,
      pass: missing.length === 0,
    });
  }

  if (expectations.agendaContains !== undefined) {
    const missing = expectations.agendaContains.filter(
      (title) => !snapshot.agendaTitles.some((t) => t.toLowerCase() === title.toLowerCase()),
    );
    checks.push({
      name: 'agenda_items_present',
      expected: expectations.agendaContains,
      actual: snapshot.agendaTitles,
      pass: missing.length === 0,
    });
  }

  if (expectations.actionItemTitles !== undefined) {
    const missing = expectations.actionItemTitles.filter(
      (title) => !snapshot.actionItemTitles.some((t) => t.toLowerCase() === title.toLowerCase()),
    );
    checks.push({
      name: 'action_items_present',
      expected: expectations.actionItemTitles,
      actual: snapshot.actionItemTitles,
      pass: missing.length === 0,
    });
  }

  if (expectations.minimumAgendaItems !== undefined) {
    checks.push({
      name: 'agenda_minimum_count',
      expected: `>= ${expectations.minimumAgendaItems}`,
      actual: snapshot.agendaTitles.length,
      pass: snapshot.agendaTitles.length >= expectations.minimumAgendaItems,
    });
  }

  return {
    ok: checks.every((c) => c.pass),
    checkedAt,
    checks,
  };
}

/**
 * Derive expectations from a proposal payload so transactional verification
 * checks exactly what the human approved — nothing more, nothing less.
 */
export function expectationsFromProposalPayload(payload: unknown): VerificationExpectation {
  if (payload === null || typeof payload !== 'object') return {};
  const p = payload as Record<string, unknown>;

  // meeting_create payload
  if ('startAt' in p && 'participants' in p) {
    return {
      status: 'scheduled',
      participantIds: (p.participants as Array<{ participantId: string }>).map(
        (x) => x.participantId,
      ),
      agendaContains: ((p.agenda as Array<{ title: string }> | undefined) ?? []).map(
        (a) => a.title,
      ),
      minimumAgendaItems: ((p.agenda as Array<unknown> | undefined) ?? []).length,
    };
  }

  // meeting_update payload
  if ('meetingId' in p && 'changes' in p) {
    const changes = p.changes as Record<string, unknown>;
    const agendaAdditions = (changes.agendaAdditions as Array<{ title: string }> | undefined) ?? [];
    const agendaRemovals = (changes.agendaRemovals as string[] | undefined) ?? [];
    return {
      ...(agendaAdditions.length > 0 ? { agendaContains: agendaAdditions.map((a) => a.title) } : {}),
      minimumAgendaItems: agendaRemovals.length > 0 ? 0 : undefined,
    };
  }

  // agenda payload
  if ('meetingId' in p && 'items' in p) {
    return {
      agendaContains: (p.items as Array<{ title: string }>).map((i) => i.title),
      minimumAgendaItems: (p.items as Array<unknown>).length,
    };
  }

  // followup / outcome payloads verify by entity existence in the execution
  // service (they are single-row inserts checked directly after apply).
  return {};
}
