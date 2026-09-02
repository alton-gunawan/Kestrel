import { describe, expect, it } from 'vitest';
import {
  addDays,
  alignUpToGrid,
  enumerateDates,
  getTimeZoneOffsetMinutes,
  intersectIntervalLists,
  isDateString,
  mergeOverlapping,
  minutesToHHmm,
  subtractIntervals,
  weekdayOfDate,
  weekBounds,
  zonedTimeToUtcMs,
} from './time.js';

describe('date primitives', () => {
  it('validates YYYY-MM-DD strings strictly', () => {
    expect(isDateString('2026-03-02')).toBe(true);
    expect(isDateString('2026-13-02')).toBe(false);
    expect(isDateString('2026-3-2')).toBe(false);
    expect(isDateString('')).toBe(false);
    expect(isDateString(42)).toBe(false);
  });

  it('adds days across month boundaries', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('computes Monday-based week bounds', () => {
    // 2026-03-04 is a Wednesday.
    expect(weekdayOfDate('2026-03-04')).toBe(3);
    const bounds = weekBounds('2026-03-04');
    expect(bounds.from).toBe('2026-03-02');
    expect(bounds.to).toBe('2026-03-08');
    // Sunday rolls back to the Monday of the same week.
    expect(weekBounds('2026-03-08').from).toBe('2026-03-02');
  });

  it('enumerates inclusive ranges deterministically', () => {
    expect(enumerateDates('2026-03-02', '2026-03-05')).toEqual([
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
      '2026-03-05',
    ]);
  });
});

describe('time zone math', () => {
  it('computes offsets for fixed and DST zones', () => {
    // New York is UTC-5 in January (EST) and UTC-4 in July (EDT).
    const jan = Date.parse('2026-01-15T12:00:00Z');
    const jul = Date.parse('2026-07-15T12:00:00Z');
    expect(getTimeZoneOffsetMinutes('America/New_York', jan)).toBe(-300);
    expect(getTimeZoneOffsetMinutes('America/New_York', jul)).toBe(-240);
    // Singapore has no DST.
    expect(getTimeZoneOffsetMinutes('Asia/Singapore', jan)).toBe(480);
  });

  it('converts local wall time to the correct UTC instant', () => {
    // 09:00 in New York on a winter day = 14:00 UTC.
    const utc = zonedTimeToUtcMs('2026-01-15', 9 * 60, 'America/New_York');
    expect(new Date(utc).toISOString()).toBe('2026-01-15T14:00:00.000Z');
    // 09:00 in New York on a summer day = 13:00 UTC.
    const utcSummer = zonedTimeToUtcMs('2026-07-15', 9 * 60, 'America/New_York');
    expect(new Date(utcSummer).toISOString()).toBe('2026-07-15T13:00:00.000Z');
    // 09:00 in Singapore = 01:00 UTC.
    const utcSg = zonedTimeToUtcMs('2026-01-15', 9 * 60, 'Asia/Singapore');
    expect(new Date(utcSg).toISOString()).toBe('2026-01-15T01:00:00.000Z');
  });

  it('computes weekday of a date in a given zone', () => {
    // 2026-03-03 is a Tuesday (weekday 2) — also in zones offset from UTC.
    expect(weekdayOfDate('2026-03-03', 'America/Los_Angeles')).toBe(2);
    expect(weekdayOfDate('2026-03-03', 'Asia/Tokyo')).toBe(2);
    expect(weekdayOfDate('2026-03-08', 'UTC')).toBe(0); // Sunday
  });
});

describe('interval algebra (availability core)', () => {
  const H = 3_600_000;

  it('subtracts cuts from a base interval', () => {
    const base = [{ start: 0, end: 8 * H }];
    const out = subtractIntervals(base, [
      { start: 2 * H, end: 3 * H },
      { start: 5 * H, end: 6 * H },
    ]);
    expect(out).toEqual([
      { start: 0, end: 2 * H },
      { start: 3 * H, end: 5 * H },
      { start: 6 * H, end: 8 * H },
    ]);
  });

  it('handles cuts outside the base and overlapping cuts', () => {
    const base = [{ start: 0, end: 4 * H }];
    const out = subtractIntervals(base, [
      { start: -2 * H, end: 1 * H },
      { start: 0.5 * H, end: 2 * H },
      { start: 10 * H, end: 12 * H },
    ]);
    expect(out).toEqual([{ start: 2 * H, end: 4 * H }]);
  });

  it('intersects two sorted interval lists', () => {
    const a = [
      { start: 0, end: 3 * H },
      { start: 4 * H, end: 6 * H },
    ];
    const b = [{ start: 2 * H, end: 5 * H }];
    expect(intersectIntervalLists(a, b)).toEqual([
      { start: 2 * H, end: 3 * H },
      { start: 4 * H, end: 5 * H },
    ]);
  });

  it('merges overlapping intervals', () => {
    expect(
      mergeOverlapping([
        { start: 0, end: H },
        { start: H, end: 2 * H },
        { start: 5 * H, end: 6 * H },
      ]),
    ).toEqual([
      { start: 0, end: 2 * H },
      { start: 5 * H, end: 6 * H },
    ]);
  });

  it('aligns instants up to a grid', () => {
    expect(alignUpToGrid(Date.parse('2026-03-02T10:07:00Z'), 15)).toBe(
      Date.parse('2026-03-02T10:15:00Z'),
    );
    expect(alignUpToGrid(Date.parse('2026-03-02T10:15:00Z'), 15)).toBe(
      Date.parse('2026-03-02T10:15:00Z'),
    );
  });
});

describe('display helpers', () => {
  it('renders minutes-of-day', () => {
    expect(minutesToHHmm(0)).toBe('00:00');
    expect(minutesToHHmm(630)).toBe('10:30');
    expect(minutesToHHmm(1439)).toBe('23:59');
  });
});
