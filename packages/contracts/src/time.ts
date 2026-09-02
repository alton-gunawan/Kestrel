/**
 * Deterministic date/time helpers used by the availability engine and domain
 * validation. Pure functions: every function that depends on "now" takes it as
 * an explicit parameter. All instants are UTC ms since epoch internally;
 * wall-clock interpretation happens per IANA time zone via Intl.
 *
 * Dates are `YYYY-MM-DD` strings (docs/02_WEBMCP_SPEC.md "Common schema
 * rules"). Minutes-of-day are integers 0..1440. Weekday is 0..6 with Sunday=0.
 */

export interface WorkingHours {
  /** Minutes from local midnight, inclusive. */
  readonly startMinute: number;
  /** Minutes from local midnight, exclusive. */
  readonly endMinute: number;
  /** Weekdays (0=Sunday..6=Saturday) on which these hours apply. */
  readonly workdays: readonly number[];
}

export interface FocusBlock {
  /** Weekday (0=Sunday..6=Saturday) this block recurs on. */
  readonly weekday: number;
  /** Minutes from local midnight, inclusive start. */
  readonly startMinute: number;
  /** Minutes from local midnight, exclusive end. */
  readonly endMinute: number;
  readonly label?: string;
}

export interface Interval {
  /** UTC ms since epoch, inclusive. */
  readonly start: number;
  /** UTC ms since epoch, exclusive. */
  readonly end: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Offset (minutes) of `timeZone` at the given instant. Positive = east of UTC. */
export function getTimeZoneOffsetMinutes(timeZone: string, instantMs: number): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(instantMs);
  const map = new Map<string, number>();
  for (const part of parts) {
    if (part.type !== 'literal') map.set(part.type, Number(part.value));
  }
  const year = map.get('year');
  const month = map.get('month');
  const day = map.get('day');
  const hour = map.get('hour');
  const minute = map.get('minute');
  const second = map.get('second');
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined
  ) {
    throw new Error(`Unparseable time zone offset for ${timeZone}`);
  }
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return (asUtc - instantMs) / 60_000;
}

/**
 * Convert a local wall-clock time in `timeZone` to a UTC instant.
 * Two-pass computation handles DST boundary days.
 */
export function zonedTimeToUtcMs(
  date: string,
  minuteOfDay: number,
  timeZone: string,
): number {
  if (!isDateString(date)) throw new Error(`Invalid date string: ${date}`);
  if (!Number.isInteger(minuteOfDay) || minuteOfDay < 0 || minuteOfDay > 1440) {
    throw new Error(`Invalid minute-of-day: ${minuteOfDay}`);
  }
  if (!isValidTimeZone(timeZone)) throw new Error(`Invalid time zone: ${timeZone}`);
  const guess = Date.parse(`${date}T00:00:00Z`) + minuteOfDay * 60_000;
  const offset1 = getTimeZoneOffsetMinutes(timeZone, guess);
  const candidate1 = guess - offset1 * 60_000;
  const offset2 = getTimeZoneOffsetMinutes(timeZone, candidate1);
  if (offset2 === offset1) return candidate1;
  return guess - offset2 * 60_000;
}

/** Weekday (0=Sunday..6=Saturday) of a calendar date interpreted in `timeZone`. */
export function weekdayOfDate(date: string, timeZone = 'UTC'): number {
  const noonUtc = Date.parse(`${date}T12:00:00Z`);
  const offset = getTimeZoneOffsetMinutes(timeZone, noonUtc);
  const local = new Date(noonUtc + offset * 60_000);
  return local.getUTCDay();
}

export function addDays(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Monday-based week bounds containing `date` (inclusive). */
export function weekBounds(date: string): { from: string; to: string } {
  const wd = weekdayOfDate(date, 'UTC'); // Sunday=0
  const daysSinceMonday = wd === 0 ? 6 : wd - 1;
  const from = addDays(date, -daysSinceMonday);
  return { from, to: addDays(from, 6) };
}

export function enumerateDates(from: string, to: string): string[] {
  if (!isDateString(from) || !isDateString(to)) throw new Error('Invalid range');
  const out: string[] = [];
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard < 400) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return out;
}

export function addMinutesToInstant(instantMs: number, minutes: number): number {
  return instantMs + minutes * 60_000;
}

/** Align an instant down/up to a grid of `gridMinutes` starting at the epoch hour. */
export function alignUpToGrid(instantMs: number, gridMinutes: number): number {
  const gridMs = gridMinutes * 60_000;
  const remainder = instantMs % gridMs;
  return remainder === 0 ? instantMs : instantMs + (gridMs - remainder);
}

/** Subtract a set of intervals from `base`, returning the remaining free intervals. */
export function subtractIntervals(base: Interval[], cuts: Interval[]): Interval[] {
  const sortedCuts = [...cuts].sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const b of base) {
    let cursor = b.start;
    for (const c of sortedCuts) {
      if (c.end <= cursor || c.start >= b.end) continue;
      if (c.start > cursor) out.push({ start: cursor, end: Math.min(c.start, b.end) });
      cursor = Math.max(cursor, c.end);
      if (cursor >= b.end) break;
    }
    if (cursor < b.end) out.push({ start: cursor, end: b.end });
  }
  return out.filter((i) => i.end > i.start);
}

/** Intersect two already-sorted lists of disjoint intervals. */
export function intersectIntervalLists(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i]!.start, b[j]!.start);
    const end = Math.min(a[i]!.end, b[j]!.end);
    if (start < end) out.push({ start, end });
    if (a[i]!.end <= b[j]!.end) i += 1;
    else j += 1;
  }
  return out;
}

export function mergeOverlapping(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.start <= last.end) {
      out[out.length - 1] = { start: last.start, end: Math.max(last.end, iv.end) };
    } else {
      out.push({ ...iv });
    }
  }
  return out;
}

export function toIso(instantMs: number): string {
  return new Date(instantMs).toISOString();
}

/** Render minutes-of-day as HH:mm (local wall time, display only). */
export function minutesToHHmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Local wall-clock rendering of an instant in a zone (display only; never used
 * for domain decisions).
 */
export function formatInZone(instantMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(instantMs));
}
