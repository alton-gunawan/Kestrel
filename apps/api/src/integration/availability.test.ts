/**
 * Integration tests: availability search over the seeded golden week —
 * cross-participant intersection, focus-block exclusion, grid alignment.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import {
  authedHeaders,
  closeTestApp,
  createTestApp,
  loginAs,
  SEED,
  type TestApp,
} from '../testing/testApp.js';
import { weekBounds } from '@kestrel/contracts';

let app: TestApp;
let cookie: string;

beforeAll(async () => {
  app = await createTestApp();
  cookie = await loginAs(app);
}, 60_000);

afterAll(async () => {
  await closeTestApp(app);
}, 60_000);

function dateAt(dayOffsetFromMonday: number): string {
  const { from } = weekBounds(new Date().toISOString().slice(0, 10));
  return new Date(Date.parse(`${from}T00:00:00Z`) + dayOffsetFromMonday * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function localToUtcIso(date: string, hour: number, minute = 0): string {
  return `${date}T${String(hour + 7).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;
}

describe('availability search', () => {
  it('finds slots for all three participants across the week, excluding focus blocks and meetings', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/availability/search',
      headers: authedHeaders(cookie),
      payload: {
        participantIds: [SEED.parAlex, SEED.parSarah, SEED.parDaniel],
        dateFrom: dateAt(0),
        dateTo: dateAt(4),
        durationMinutes: 30,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.slots.length).toBeGreaterThan(0);
    expect(body.slots.length).toBeLessThanOrEqual(12); // MAX_SLOTS_RETURNED

    // Every slot must be grid-aligned (15 min) in LA time and inside 9-5.
    for (const slot of body.slots) {
      const start = new Date(slot.startAt as string);
      const laMinutes = (start.getUTCHours() * 60 + start.getUTCMinutes() + 24 * 60 - 420) % (24 * 60);
      expect(laMinutes % 15).toBe(0);
      expect(laMinutes).toBeGreaterThanOrEqual(9 * 60);
      expect(laMinutes + 30).toBeLessThanOrEqual(17 * 60);
    }

    // No slot may overlap the Tuesday standup (09:00-09:30 LA) or the
    // Wednesday incident review (09:00-10:30 LA) or Daniel's Tuesday focus
    // block (13:00-17:00 LA).
    const tueStandupStart = Date.parse(localToUtcIso(dateAt(1), 9));
    const tueStandupEnd = Date.parse(localToUtcIso(dateAt(1), 9, 30));
    const wedIncidentStart = Date.parse(localToUtcIso(dateAt(2), 9));
    const wedIncidentEnd = Date.parse(localToUtcIso(dateAt(2), 10, 30));
    const tueFocusStart = Date.parse(localToUtcIso(dateAt(1), 13));
    const tueFocusEnd = Date.parse(localToUtcIso(dateAt(1), 17));

    for (const slot of body.slots) {
      const s = Date.parse(slot.startAt as string);
      const e = Date.parse(slot.endAt as string);
      expect(s < tueStandupEnd && e > tueStandupStart).toBe(false);
      expect(s < wedIncidentEnd && e > wedIncidentStart).toBe(false);
      expect(s < tueFocusEnd && e > tueFocusStart).toBe(false);
    }
  });

  it('search restricted to Wednesday returns 10:30 as the first slot (golden demo)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/availability/search',
      headers: authedHeaders(cookie),
      payload: {
        participantIds: [SEED.parAlex, SEED.parSarah, SEED.parDaniel],
        dateFrom: dateAt(2),
        dateTo: dateAt(2),
        durationMinutes: 30,
      },
    });
    const body = JSON.parse(res.body);
    expect(body.slots.length).toBeGreaterThan(0);
    expect(body.slots[0].startAt).toBe(localToUtcIso(dateAt(2), 10, 30));
  });

  it('weekday-only search on a weekend range returns no slots', async () => {
    // Use the following Saturday/Sunday (dateAt(5), dateAt(6)).
    const res = await app.inject({
      method: 'POST',
      url: '/api/availability/search',
      headers: authedHeaders(cookie),
      payload: {
        participantIds: [SEED.parAlex],
        dateFrom: dateAt(5),
        dateTo: dateAt(6),
        durationMinutes: 30,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).slots).toHaveLength(0);
  });

  it('single participant ignores others’ conflicts', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/availability/search',
      headers: authedHeaders(cookie),
      payload: {
        participantIds: [SEED.parDaniel],
        dateFrom: dateAt(1),
        dateTo: dateAt(1),
        durationMinutes: 30,
      },
    });
    const slots = JSON.parse(res.body).slots as Array<{ startAt: string }>;
    // Tuesday: standup 9-9:30, focus 13-17. Free slots must avoid focus hours.
    for (const slot of slots) {
      const start = new Date(slot.startAt);
      const laHour = (start.getUTCHours() + 24 - 7) % 24;
      expect(laHour < 13 || laHour >= 17 || laHour < 9).toBe(true);
    }
  });

  it('check-slot validates a feasible and an infeasible slot', async () => {
    const ok = await app.inject({
      method: 'POST',
      url: '/api/availability/check',
      headers: authedHeaders(cookie),
      payload: {
        participantIds: [SEED.parAlex, SEED.parSarah, SEED.parDaniel],
        startAt: localToUtcIso(dateAt(3), 10, 30),
        durationMinutes: 30,
      },
    });
    expect(ok.statusCode).toBe(200);
    expect(JSON.parse(ok.body).available).toBe(true);

    const conflict = await app.inject({
      method: 'POST',
      url: '/api/availability/check',
      headers: authedHeaders(cookie),
      payload: {
        participantIds: [SEED.parDaniel],
        startAt: localToUtcIso(dateAt(1), 14), // Tuesday focus block
        durationMinutes: 30,
      },
    });
    expect(JSON.parse(conflict.body).available).toBe(false);
    expect(JSON.parse(conflict.body).conflicts.length).toBeGreaterThan(0);
  });
});
