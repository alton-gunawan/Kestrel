/**
 * Meeting domain rules. Deterministic, framework-independent (docs/04:
 * "Keep domain logic framework-independent"). No repository or HTTP types
 * appear here.
 */
import type { MeetingStatus } from '@kestrel/contracts';

/**
 * Allowed meeting status transitions (FR-1, INV-6). Terminal states have no
 * outgoing transitions except explicit reopen/cancel flows listed here.
 */
export const MEETING_TRANSITIONS: Readonly<Record<MeetingStatus, readonly MeetingStatus[]>> = {
  draft: ['proposed', 'approved', 'scheduled', 'cancelled'],
  proposed: ['approved', 'scheduled', 'cancelled'],
  approved: ['scheduled', 'cancelled'],
  scheduled: ['in_progress', 'completed', 'cancelled'],
  in_progress: ['completed', 'needs_followup'],
  completed: ['needs_followup'],
  needs_followup: ['scheduled', 'cancelled'],
  cancelled: [],
};

/** Protected fields: changing any of them invalidates affected proposals (INV-8). */
export const PROTECTED_MEETING_FIELDS = [
  'title',
  'purpose',
  'startAt',
  'durationMinutes',
  'projectId',
  'participants',
] as const;
export type ProtectedMeetingField = (typeof PROTECTED_MEETING_FIELDS)[number];

export function canTransitionMeeting(from: MeetingStatus, to: MeetingStatus): boolean {
  return MEETING_TRANSITIONS[from].includes(to);
}

export interface MeetingTimeInput {
  readonly durationMinutes: number;
}

/** INV-1: duration must be 5–180 minutes. */
export function validateMeetingDuration(input: MeetingTimeInput): string | null {
  if (!Number.isInteger(input.durationMinutes)) return 'Meeting duration must be an integer number of minutes';
  if (input.durationMinutes < 5) return 'Meeting duration must be at least 5 minutes';
  if (input.durationMinutes > 180) return 'Meeting duration must be at most 180 minutes';
  return null;
}

export interface ParticipantRef {
  readonly participantId: string;
  readonly role: 'organizer' | 'attendee';
}

/**
 * INV-2 + INV-3: participants must be unique, and an organizer must exist.
 */
export function validateMeetingParticipants(
  participants: readonly ParticipantRef[],
): string | null {
  if (participants.length === 0) return 'A meeting requires at least one participant';
  const ids = participants.map((p) => p.participantId);
  if (new Set(ids).size !== ids.length) return 'Meeting participants must be unique';
  const organizers = participants.filter((p) => p.role === 'organizer');
  if (organizers.length !== 1) {
    return 'A meeting must have exactly one organizer';
  }
  return null;
}

export interface AgendaOrderInput {
  readonly sortOrders: readonly number[];
}

/** INV-4: agenda sort order must be unique (and dense 1..n) within a meeting. */
export function validateAgendaOrdering(input: AgendaOrderInput): string | null {
  const orders = [...input.sortOrders];
  if (new Set(orders).size !== orders.length) {
    return 'Agenda item sort order must be unique within a meeting';
  }
  const sorted = [...orders].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i += 1) {
    if (sorted[i] !== i + 1) {
      return 'Agenda item sort order must be contiguous starting at 1';
    }
  }
  return null;
}

export interface ActionAssignmentInput {
  readonly ownerParticipantId: string | null;
  readonly participantIds: readonly string[];
  readonly allowExternalOwner: boolean;
}

/** INV-5: action item owner must be a meeting participant unless a rule allows otherwise. */
export function validateActionAssignment(input: ActionAssignmentInput): string | null {
  if (input.ownerParticipantId === null) return null;
  if (input.allowExternalOwner) return null;
  if (!input.participantIds.includes(input.ownerParticipantId)) {
    return 'Action item owner must be a participant of the meeting';
  }
  return null;
}

export function isMeetingInOutcomeCaptureState(status: MeetingStatus): boolean {
  return status === 'in_progress' || status === 'completed' || status === 'needs_followup';
}
