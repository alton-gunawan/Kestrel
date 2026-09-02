/**
 * Deterministic availability engine (FR-5, US-02).
 *
 * Given participants (working hours + recurring focus blocks) and existing
 * meetings, produce candidate slots on a fixed grid. All inputs are data; no
 * randomness, no wall-clock reads. docs/02_WEBMCP_SPEC.md: "find time slots
 * that satisfy participant availability and meeting constraints."
 */
import type {
  AvailabilityResult,
  FocusBlock,
  Participant,
  Slot,
  WorkingHours,
} from '@meetingops/contracts';
import {
  addMinutesToInstant,
  alignUpToGrid,
  enumerateDates,
  intersectIntervalLists,
  mergeOverlapping,
  subtractIntervals,
  toIso,
  weekdayOfDate,
  zonedTimeToUtcMs,
  type Interval,
} from '@meetingops/contracts';

export const SLOT_GRID_MINUTES = 15;
export const MAX_SLOTS_RETURNED = 12;

export interface BusyInterval {
  readonly participantId: string;
  readonly startMs: number;
  readonly endMs: number;
}

export interface AvailabilityInput {
  readonly durationMinutes: number;
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly participants: readonly Participant[];
  readonly busy: readonly BusyInterval[];
  readonly nowMs: number;
}

/** Working-hours interval per participant per date, in UTC. */
function workingIntervalFor(
  participant: Participant,
  date: string,
  hours: WorkingHours,
): Interval | null {
  if (!hours.workdays.includes(weekdayOfDate(date, participant.timezone))) return null;
  const start = zonedTimeToUtcMs(date, hours.startMinute, participant.timezone);
  const end = zonedTimeToUtcMs(date, hours.endMinute, participant.timezone);
  if (end <= start) return null;
  return { start, end };
}

/** Focus-block intervals for a participant on a specific date, in UTC. */
function focusBlockIntervalsFor(
  participant: Participant,
  date: string,
  blocks: readonly FocusBlock[],
): Interval[] {
  const weekday = weekdayOfDate(date, participant.timezone);
  return blocks
    .filter((b) => b.weekday === weekday && b.endMinute > b.startMinute)
    .map((b) => ({
      start: zonedTimeToUtcMs(date, b.startMinute, participant.timezone),
      end: zonedTimeToUtcMs(date, b.endMinute, participant.timezone),
    }));
}

/**
 * Compute free intervals per participant per day:
 *   working hours − focus blocks − busy meetings
 * then intersect across all participants.
 */
export function computeFreeIntervals(input: AvailabilityInput): Interval[] {
  const dates = enumerateDates(input.dateFrom, input.dateTo);
  const perParticipant: Interval[][] = [];

  for (const participant of input.participants) {
    const free: Interval[] = [];
    for (const date of dates) {
      const working = workingIntervalFor(participant, date, participant.workingHours);
      if (!working) continue;
      const cuts = focusBlockIntervalsFor(participant, date, participant.focusBlocks);
      const busyForParticipant = input.busy
        .filter((b) => b.participantId === participant.id)
        .map((b) => ({ start: b.startMs, end: b.endMs }));
      const dayFree = subtractIntervals(
        [working],
        mergeOverlapping([...cuts, ...busyForParticipant]),
      );
      free.push(...dayFree);
    }
    free.sort((a, b) => a.start - b.start);
    perParticipant.push(mergeOverlapping(free));
  }

  if (perParticipant.length === 0) return [];
  return perParticipant.reduce((acc, list) => intersectIntervalLists(acc, list));
}

/** Produce grid-aligned candidate slots from free intervals. */
export function slotsFromFreeIntervals(
  free: readonly Interval[],
  durationMinutes: number,
  nowMs: number,
): Slot[] {
  const slots: Slot[] = [];
  for (const interval of free) {
    const earliest = Math.max(interval.start, nowMs);
    let cursor = alignUpToGrid(earliest, SLOT_GRID_MINUTES);
    while (cursor + durationMinutes * 60_000 <= interval.end) {
      slots.push({
        startAt: toIso(cursor),
        endAt: toIso(addMinutesToInstant(cursor, durationMinutes)),
      });
      cursor = alignUpToGrid(cursor + SLOT_GRID_MINUTES * 60_000, SLOT_GRID_MINUTES);
      if (slots.length >= MAX_SLOTS_RETURNED * 4) break;
    }
  }
  return slots.slice(0, MAX_SLOTS_RETURNED);
}

export function findAvailableSlots(input: AvailabilityInput): AvailabilityResult {
  const free = computeFreeIntervals(input);
  const slots = slotsFromFreeIntervals(free, input.durationMinutes, input.nowMs);
  return {
    slots,
    gridMinutes: SLOT_GRID_MINUTES,
    window: { dateFrom: input.dateFrom, dateTo: input.dateTo },
    consideredParticipantIds: input.participants.map((p) => p.id),
  };
}

/**
 * Check whether one specific slot is feasible for all participants
 * (used to validate proposal times deterministically).
 */
export interface SlotFeasibility {
  readonly available: boolean;
  readonly conflicts: Array<{
    participantId: string;
    reason: 'outside_working_hours' | 'focus_block' | 'meeting';
    label?: string;
  }>;
}

export function checkSlotFeasibility(
  startMs: number,
  _durationMinutes: number,
  endMs: number,
  participants: readonly Participant[],
  busy: readonly BusyInterval[],
): SlotFeasibility {
  const conflicts: SlotFeasibility['conflicts'] = [];
  for (const participant of participants) {
    const working = workingIntervalFor(
      participant,
      isoDateFor(startMs, participant.timezone),
      participant.workingHours,
    );
    // A slot may span past local midnight only in pathological cases; the grid
    // and durations make this impossible in practice, but stay strict.
    const workingEnd =
      working !== null && working.end >= endMs
        ? working
        : null;
    if (working === null || workingEnd === null || startMs < working.start) {
      conflicts.push({ participantId: participant.id, reason: 'outside_working_hours' });
      continue;
    }
    const focus = focusBlockIntervalsFor(participant, isoDateFor(startMs, participant.timezone), participant.focusBlocks);
    const focusHit = focus.find((b) => startMs < b.end && endMs > b.start);
    if (focusHit) {
      conflicts.push({ participantId: participant.id, reason: 'focus_block' });
      continue;
    }
    const meetingHit = busy.find(
      (b) =>
        b.participantId === participant.id && startMs < b.endMs && endMs > b.startMs,
    );
    if (meetingHit) {
      conflicts.push({ participantId: participant.id, reason: 'meeting' });
    }
  }
  return { available: conflicts.length === 0, conflicts };
}

function isoDateFor(instantMs: number, timeZone: string): string {
  const offsetMs = -new Date(instantMs).getTimezoneOffset() * 60_000;
  void offsetMs;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date(instantMs));
}
