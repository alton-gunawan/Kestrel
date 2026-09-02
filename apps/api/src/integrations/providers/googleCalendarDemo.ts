/**
 * Demo CalendarProvider — deterministic, local, clearly labeled (doc 9.1).
 *
 * This adapter proves the CalendarProvider lifecycle WITHOUT a real external
 * calendar: availability/busy come from Kestrel' own domain model
 * (participants, meetings, focus blocks), and `source` is always 'local'.
 * createEvent/updateEvent are simulated: they return a demo-scoped external
 * id and record that NO real external event was created (doc: "must be
 * clearly represented as such"). The application layer never treats a demo
 * event as a real external side effect.
 */
import type { CalendarProvider } from '../types.js';
import type { CalendarContext } from '@kestrel/contracts';
import { isoDateSchema } from '@kestrel/contracts';

export const GOOGLE_CALENDAR_DEMO_META = {
  providerId: 'google_calendar',
  displayName: 'Google Calendar',
  description:
    'Calendar capability: scheduling context, availability, and (in demo mode) simulated calendar writes. Demo adapter — no real Google account is accessed.',
  capabilities: ['calendar'],
  demo: true,
} as const;

interface DemoCalendarDeps {
  /** Kestrel meetings in range → busy intervals (local domain model). */
  readonly busyProvider: (dateFrom: string, dateTo: string) => Promise<
    { startAt: string; endAt: string; title: string }[]
  >;
  /** Participant availability engine (doc 5.1 findAvailability). */
  readonly slotsProvider: (input: {
    durationMinutes: number;
    dateFrom: string;
    dateTo: string;
    participantIds: readonly string[];
  }) => Promise<{ startAt: string; endAt: string }[]>;
}

export class GoogleCalendarDemoProvider implements CalendarProvider {
  readonly meta = GOOGLE_CALENDAR_DEMO_META;

  constructor(private readonly deps: DemoCalendarDeps) {}

  async getCalendarContext(input: { dateFrom: string; dateTo: string }): Promise<CalendarContext> {
    // Strictly validate the range (untrusted input even in demo mode).
    isoDateSchema.parse(input.dateFrom);
    isoDateSchema.parse(input.dateTo);
    const busy = await this.deps.busyProvider(input.dateFrom, input.dateTo);
    return {
      providerId: 'google_calendar',
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      // Explicit honesty: this is Kestrel' local calendar model, not a
      // real Google Calendar (doc 9.1, D-020).
      source: 'local',
      busyIntervals: busy.map((b) => ({
        startAt: b.startAt,
        endAt: b.endAt,
        title: b.title,
      })),
      fetchedAt: new Date().toISOString(),
    };
  }

  async findAvailability(input: {
    durationMinutes: number;
    dateFrom: string;
    dateTo: string;
    participantIds: readonly string[];
  }) {
    return this.deps.slotsProvider(input);
  }

  /**
   * Simulated external write. Demo mode returns a demo-scoped event id and
   * never claims a real Google Calendar event exists (doc section 13:
   * verify_meeting_state must not claim external events that were not
   * actually created).
   */
  async createEvent(input: { summary: string; startAt: string; endAt: string }) {
    const externalEventId = `demo_gcal_${input.startAt}_${input.endAt}`.replace(/[^A-Za-z0-9_]/g, '_');
    return {
      externalEventId,
      externalUrl: null, // no real event exists → no real URL
    };
  }

  async updateEvent(input: { externalEventId: string }) {
    return { externalEventId: input.externalEventId, externalUrl: null };
  }
}
