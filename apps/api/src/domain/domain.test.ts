/**
 * Unit tests: pure domain logic — availability intersection, focus blocks,
 * proposal staleness/supersession, verification expectations (TEST-1/2).
 * Uses the real function signatures from src/domain.
 */
import { describe, expect, it } from 'vitest';
import {
  computeFreeIntervals,
  slotsFromFreeIntervals,
  checkSlotFeasibility,
  findAvailableSlots,
  type BusyInterval,
} from './availability.js';
import {
  isProposalStale,
  proposalScopeKey,
  executionBlockReason,
  isExecutionReady,
  type ProposalStateSnapshot,
} from './proposalRules.js';
import { verifyMeetingSnapshot, expectationsFromProposalPayload } from './verification.js';
import { weekBounds, zonedTimeToUtcMs, type Participant, type FocusBlock } from '@kestrel/contracts';

/* ------------------------------- helpers -------------------------------- */

function pt(date: string, minuteOfDay: number): number {
  return zonedTimeToUtcMs(date, minuteOfDay, 'America/Los_Angeles');
}

const WORKING = { startMinute: 9 * 60, endMinute: 17 * 60, workdays: [1, 2, 3, 4, 5] };

const ALEX: Participant = {
  id: 'par_alex',
  userId: 'usr_alex',
  displayName: 'Alex',
  email: 'alex@example.com',
  timezone: 'America/Los_Angeles',
  workingHours: WORKING,
  focusBlocks: [],
};

function withFocus(blocks: FocusBlock[]): Participant {
  return { ...ALEX, id: 'par_focus', focusBlocks: blocks };
}

const MONDAY = '2026-03-02'; // a Monday
const TUESDAY = '2026-03-03';

/* ---------------------------- availability ------------------------------ */

describe('computeFreeIntervals', () => {
  it('returns the full workday when nothing is busy', () => {
    const free = computeFreeIntervals({
      durationMinutes: 30,
      dateFrom: MONDAY,
      dateTo: MONDAY,
      participants: [ALEX],
      busy: [],
      nowMs: 0,
    });
    expect(free.length).toBe(1);
    expect(free[0]?.start).toBe(pt(MONDAY, 9 * 60));
    expect(free[0]?.end).toBe(pt(MONDAY, 17 * 60));
  });

  it('subtracts busy meetings inside working hours', () => {
    const busy: BusyInterval[] = [
      { participantId: 'par_alex', startMs: pt(MONDAY, 10 * 60), endMs: pt(MONDAY, 11 * 60) },
    ];
    const free = computeFreeIntervals({
      durationMinutes: 30,
      dateFrom: MONDAY,
      dateTo: MONDAY,
      participants: [ALEX],
      busy,
      nowMs: 0,
    });
    expect(free.map((f) => [f.start, f.end])).toEqual([
      [pt(MONDAY, 9 * 60), pt(MONDAY, 10 * 60)],
      [pt(MONDAY, 11 * 60), pt(MONDAY, 17 * 60)],
    ]);
  });

  it('excludes recurring focus blocks (Tuesday afternoon deep work)', () => {
    const free = computeFreeIntervals({
      durationMinutes: 30,
      dateFrom: TUESDAY,
      dateTo: TUESDAY,
      participants: [withFocus([{ weekday: 2, startMinute: 13 * 60, endMinute: 17 * 60, label: 'Deep work' }])],
      busy: [],
      nowMs: 0,
    });
    expect(free.map((f) => [f.start, f.end])).toEqual([[pt(TUESDAY, 9 * 60), pt(TUESDAY, 13 * 60)]]);
  });

  it('intersects availability across participants', () => {
    const sarah: Participant = { ...ALEX, id: 'par_sarah' };
    const busy: BusyInterval[] = [
      { participantId: 'par_alex', startMs: pt(MONDAY, 9 * 60), endMs: pt(MONDAY, 12 * 60) },
      { participantId: 'par_sarah', startMs: pt(MONDAY, 14 * 60), endMs: pt(MONDAY, 17 * 60) },
    ];
    const free = computeFreeIntervals({
      durationMinutes: 30,
      dateFrom: MONDAY,
      dateTo: MONDAY,
      participants: [ALEX, sarah],
      busy,
      nowMs: 0,
    });
    // Only 12:00–14:00 is free for both.
    expect(free.map((f) => [f.start, f.end])).toEqual([[pt(MONDAY, 12 * 60), pt(MONDAY, 14 * 60)]]);
  });

  it('ignores weekends (workday filter)', () => {
    const saturday = '2026-03-07';
    const free = computeFreeIntervals({
      durationMinutes: 30,
      dateFrom: saturday,
      dateTo: saturday,
      participants: [ALEX],
      busy: [],
      nowMs: 0,
    });
    expect(free).toEqual([]);
  });
});

describe('slotsFromFreeIntervals', () => {
  it('produces grid-aligned ascending slots and caps at MAX', () => {
    const slots = slotsFromFreeIntervals(
      [{ start: pt(MONDAY, 9 * 60), end: pt(MONDAY, 17 * 60) }],
      30,
      0,
    );
    expect(slots.length).toBeLessThanOrEqual(12);
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      const start = new Date(slot.startAt).getTime();
      expect((start - pt(MONDAY, 9 * 60)) % (15 * 60_000)).toBe(0);
    }
  });
});

describe('checkSlotFeasibility', () => {
  it('accepts a feasible slot', () => {
    const result = checkSlotFeasibility(pt(MONDAY, 10 * 60), 30, pt(MONDAY, 10 * 60 + 30), [ALEX], []);
    expect(result.available).toBe(true);
    expect(result.conflicts).toEqual([]);
  });

  it('rejects a slot outside working hours', () => {
    const result = checkSlotFeasibility(pt(MONDAY, 18 * 60), 30, pt(MONDAY, 18 * 60 + 30), [ALEX], []);
    expect(result.available).toBe(false);
    expect(result.conflicts.some((c) => c.reason === 'outside_working_hours')).toBe(true);
  });

  it('rejects overlap with an existing meeting', () => {
    const busy: BusyInterval[] = [
      { participantId: 'par_alex', startMs: pt(MONDAY, 10 * 60), endMs: pt(MONDAY, 11 * 60) },
    ];
    const result = checkSlotFeasibility(pt(MONDAY, 10 * 60 + 30), 30, pt(MONDAY, 11 * 60), [ALEX], busy);
    expect(result.available).toBe(false);
    expect(result.conflicts.length).toBeGreaterThan(0);
  });

  it('rejects a slot inside a focus block', () => {
    const daniel = withFocus([{ weekday: 2, startMinute: 13 * 60, endMinute: 17 * 60, label: 'Deep work' }]);
    const result = checkSlotFeasibility(pt(TUESDAY, 14 * 60), 30, pt(TUESDAY, 14 * 60 + 30), [daniel], []);
    expect(result.available).toBe(false);
    expect(result.conflicts.some((c) => c.reason === 'focus_block')).toBe(true);
  });
});

describe('findAvailableSlots (end-to-end pure)', () => {
  it('returns no slot at 10:30 when a meeting occupies it, and the first slot after', () => {
    const busy: BusyInterval[] = [
      { participantId: 'par_alex', startMs: pt(MONDAY, 9 * 60), endMs: pt(MONDAY, 10 * 60 + 30) },
    ];
    const result = findAvailableSlots({
      durationMinutes: 30,
      dateFrom: MONDAY,
      dateTo: MONDAY,
      participants: [ALEX],
      busy,
      nowMs: 0,
    });
    const starts = result.slots.map((s) => new Date(s.startAt).getTime());
    // The 9:00–10:30 meeting removes every slot before 10:30 local.
    for (const start of starts) {
      expect(start).toBeGreaterThanOrEqual(pt(MONDAY, 10 * 60 + 30));
    }
    expect(starts[0]).toBe(new Date('2026-03-02T18:30:00.000Z').getTime()); // 10:30 PST
  });
});

/* ----------------------------- proposals -------------------------------- */

describe('proposalRules', () => {
  const base: ProposalStateSnapshot = {
    id: 'prp_1',
    kind: 'meeting_create',
    status: 'pending',
    baseMeetingId: null,
    baseMeetingRevision: null,
  };

  it('isProposalStale: base revision differs from the meeting revision', () => {
    const meetingScoped = { ...base, kind: 'meeting_update' as const, baseMeetingId: 'mtg_1' };
    expect(isProposalStale({ ...meetingScoped, baseMeetingRevision: 2 }, 3)).toBe(true);
    expect(isProposalStale({ ...meetingScoped, baseMeetingRevision: 3 }, 3)).toBe(false);
    expect(isProposalStale({ ...meetingScoped, baseMeetingRevision: 3 }, null)).toBe(true);
    // meeting_create proposals are not revision-stale (they have no base meeting).
    expect(isProposalStale(base, 3)).toBe(false);
  });

  it('proposalScopeKey scopes meeting_create by project, others by meeting', () => {
    expect(proposalScopeKey('meeting_create', 'prj_launch', null)).toBe('project:prj_launch');
    expect(proposalScopeKey('agenda', null, 'mtg_1')).toBe('meeting:mtg_1');
  });

  it('execution gate requires approved + live state', () => {
    expect(isExecutionReady(base)).toBe(false); // pending
    expect(isExecutionReady({ ...base, status: 'approved' })).toBe(true);
    expect(isExecutionReady({ ...base, status: 'executed' })).toBe(false);

    // Supersession/execution state is part of the status lifecycle.
    expect(executionBlockReason({ ...base, status: 'pending' })).toBe('PROPOSAL_NOT_APPROVED');
    expect(executionBlockReason({ ...base, status: 'rejected' })).toBe('PROPOSAL_REJECTED');
    expect(executionBlockReason({ ...base, status: 'executed' })).toBe('PROPOSAL_ALREADY_EXECUTED');
    expect(executionBlockReason({ ...base, status: 'superseded' })).toBe('PROPOSAL_SUPERSEDED');
    expect(executionBlockReason({ ...base, status: 'approved' })).toBeNull();
  });
});

/* ---------------------------- verification ------------------------------ */

describe('verification', () => {
  const snapshot = {
    id: 'mtg_1',
    status: 'scheduled' as const,
    startAt: '2026-03-04T17:30:00.000Z',
    durationMinutes: 30,
    title: 'Launch review',
    participantIds: ['par_alex', 'par_sarah'],
    agendaTitles: ['Payment blocker', 'Go/no-go'],
    actionItemTitles: ['Verify payment fix'],
    revision: 1,
  };

  it('passes when expectations match persisted state', () => {
    const report = verifyMeetingSnapshot(
      snapshot,
      { status: 'scheduled', agendaContains: ['Payment blocker'], participantIds: ['par_alex'] },
      '2026-03-04T18:00:00.000Z',
    );
    expect(report.ok).toBe(true);
    expect(report.checks.every((c) => c.pass)).toBe(true);
  });

  it('fails with named checks when expectations do not match', () => {
    const report = verifyMeetingSnapshot(
      snapshot,
      { status: 'completed', agendaContains: ['Nonexistent'], participantIds: ['par_ghost'] },
      '2026-03-04T18:00:00.000Z',
    );
    expect(report.ok).toBe(false);
    const names = report.checks.filter((c) => !c.pass).map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining(['meeting_status', 'agenda_items_present', 'participants_present']),
    );
  });

  it('expectationsFromProposalPayload derives checks from payload kinds', () => {
    const create = expectationsFromProposalPayload({
      startAt: '2026-03-04T17:30:00.000Z',
      agenda: [{ title: 'A' }, { title: 'B' }],
      participants: [{ participantId: 'par_alex', role: 'organizer' }],
    });
    expect(create.minimumAgendaItems).toBe(2);
    expect(create.participantIds).toEqual(['par_alex']);

    const agenda = expectationsFromProposalPayload({
      meetingId: 'mtg_1',
      items: [{ title: 'New item' }],
    });
    expect(agenda.agendaContains).toEqual(['New item']);
    expect(agenda.minimumAgendaItems).toBe(1);
  });
});

describe('weekBounds integration', () => {
  it('Monday-anchored bounds are stable across the week', () => {
    expect(weekBounds('2026-03-04').from).toBe('2026-03-02'); // Wednesday
    expect(weekBounds('2026-03-01').from).toBe('2026-02-23'); // Sunday → previous Monday
  });
});
