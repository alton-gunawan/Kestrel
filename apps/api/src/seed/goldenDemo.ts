/**
 * Deterministic golden-demo seed (docs/06_GOLDEN_DEMO, D-023).
 *
 * Anchored to the Monday of the current week so the demo always reads "this
 * week". All ids are fixed strings so tests and the WebMCP flow can reference
 * them. Reset = truncate + insert, inside one transaction.
 *
 * Scenario invariants:
 * - Project "Launch" with two unresolved blockers (payment + data migration).
 * - Daniel has a focus block Tuesday afternoon.
 * - A previous (completed) meeting resolved pricing.
 * - Tuesday standup 09:00 and Wednesday incident review 09:00-10:30 make the
 *   first Wednesday slot deterministically 10:30 for a 30-minute meeting
 *   (grid-aligned), matching the UX example "Wed 10:30".
 */
import type { FocusBlock, WorkingHours } from '@kestrel/contracts';
import { weekBounds, weekdayOfDate, zonedTimeToUtcMs } from '@kestrel/contracts';
import { createDb } from '../db/client.js';
import type postgres from 'postgres';

type Sql = postgres.Sql;

export const SEED_IDS = {
  users: {
    alex: 'usr_alex',
    sarah: 'usr_sarah',
    daniel: 'usr_daniel',
  },
  participants: {
    alex: 'par_alex',
    sarah: 'par_sarah',
    daniel: 'par_daniel',
  },
  project: {
    launch: 'prj_launch',
  },
  meetings: {
    previousSync: 'mtg_prev_sync4',
    tuesdayStandup: 'mtg_tue_standup',
    wednesdayIncident: 'mtg_wed_incident',
  },
  decisions: {
    pricing: 'dec_pricing',
  },
  actions: {
    paymentBlocker: 'act_payment_blocker',
    dataMigrationBlocker: 'act_data_migration',
  },
} as const;

const WORK_WEEK: number[] = [1, 2, 3, 4, 5];
const STANDARD_HOURS: WorkingHours = {
  startMinute: 9 * 60,
  endMinute: 17 * 60,
  workdays: WORK_WEEK,
};

const DANIEL_FOCUS_BLOCKS: FocusBlock[] = [
  {
    weekday: 2, // Tuesday
    startMinute: 13 * 60,
    endMinute: 17 * 60,
    label: 'Deep work — architecture',
  },
];

/** Monday of the current week (Pacific), computed deterministically. */
export function demoAnchor(nowMs: number = Date.now()): {
  monday: string;
  friday: string;
  lastFriday: string;
  todayInWeek: boolean;
} {
  const tz = 'America/Los_Angeles';
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(nowMs));
  const { from } = weekBounds(today);
  // Demo week runs Monday..Friday of the current calendar week.
  const monday = from;
  const friday = dateOffset(monday, 4);
  const lastFriday = dateOffset(monday, -3);
  return { monday, friday, lastFriday, todayInWeek: today >= monday && today <= friday };
}

function dateOffset(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function pt(monday: string, dayOffset: number, minuteOfDay: number): Date {
  const date = dateOffset(monday, dayOffset);
  return new Date(zonedTimeToUtcMs(date, minuteOfDay, 'America/Los_Angeles'));
}

export interface SeedOptions {
  readonly nowMs?: number;
}

export async function resetToGoldenDemo(databaseUrl: string, options: SeedOptions = {}): Promise<void> {
  const handle = createDb(databaseUrl);
  try {
    await seedInto(handle.sql, options);
  } finally {
    await handle.sql.end({ timeout: 5 });
  }
}

export async function runSeed(
  databaseUrl: string,
  opts: { reset?: boolean } = {},
  options: SeedOptions = {},
): Promise<void> {
  const handle = createDb(databaseUrl);
  try {
    const rows = (await handle.sql`select count(*)::int as count from users`) as Array<{ count: number }>;
    const count = rows[0]?.count ?? 0;
    if (opts.reset || count === 0) {
      await seedInto(handle.sql, options);
    }
  } finally {
    await handle.sql.end({ timeout: 5 });
  }
}

async function seedInto(sql: Sql, options: SeedOptions): Promise<void> {
  await truncateAll(sql);
  const anchor = demoAnchor(options.nowMs ?? Date.now());
  const monday = anchor.monday;

  await sql.begin(async (tx) => {
    // Users
    await tx`insert into users (id, display_name, email) values
      ('usr_alex', 'Alex Rivera', 'alex@kestrel.example'),
      ('usr_sarah', 'Sarah Chen', 'sarah@kestrel.example'),
      ('usr_daniel', 'Daniel Osei', 'daniel@kestrel.example')`;

    // Participants
    await tx`insert into participants (id, user_id, display_name, email, timezone, working_hours, focus_blocks) values
      ('par_alex', 'usr_alex', 'Alex Rivera', 'alex@kestrel.example', 'America/Los_Angeles',
        ${JSON.stringify(STANDARD_HOURS)}::jsonb, '[]'::jsonb),
      ('par_sarah', 'usr_sarah', 'Sarah Chen', 'sarah@kestrel.example', 'America/Los_Angeles',
        ${JSON.stringify(STANDARD_HOURS)}::jsonb, '[]'::jsonb),
      ('par_daniel', 'usr_daniel', 'Daniel Osei', 'daniel@kestrel.example', 'America/Los_Angeles',
        ${JSON.stringify(STANDARD_HOURS)}::jsonb, ${JSON.stringify(DANIEL_FOCUS_BLOCKS)}::jsonb)`;

    // Project
    await tx`insert into projects (id, name, description, status) values
      ('prj_launch', 'Launch', 'Q3 product launch. Two unresolved blockers: payment integration and data migration. Pricing was decided in the last sync.', 'active')`;

    // Previous sync (last Friday): completed; pricing decided; blockers live here.
    await tx`insert into meetings (id, title, purpose, project_id, start_at, duration_minutes, status, created_by) values
      ('mtg_prev_sync4', 'Launch sync #4', 'Weekly launch sync. Pricing discussion closed.', 'prj_launch',
       ${pt(monday, -3, 10 * 60).toISOString()}, 30, 'completed', 'usr_alex')`;
    await tx`insert into meeting_participants (meeting_id, participant_id, role, response) values
      ('mtg_prev_sync4', 'par_alex', 'organizer', 'accepted'),
      ('mtg_prev_sync4', 'par_sarah', 'attendee', 'accepted'),
      ('mtg_prev_sync4', 'par_daniel', 'attendee', 'accepted')`;
    await tx`insert into agenda_items (id, meeting_id, title, source, sort_order, status) values
      ('agi_prev_1', 'mtg_prev_sync4', 'Pricing model decision', 'human', 1, 'covered'),
      ('agi_prev_2', 'mtg_prev_sync4', 'Launch blockers review', 'project_context', 2, 'covered')`;
    await tx`insert into decisions (id, meeting_id, title, outcome, recorded_at) values
      ('dec_pricing', 'mtg_prev_sync4', 'Pricing model',
       'Usage-based pricing approved with launch discount. Pricing is decided — do not reopen in upcoming meetings.',
       ${pt(monday, -3, 10 * 60 + 25).toISOString()})`;
    await tx`insert into action_items (id, meeting_id, project_id, title, owner_participant_id, due_at, status) values
      ('act_payment_blocker', 'mtg_prev_sync4', 'prj_launch', 'Resolve payment integration blocker',
       'par_sarah', ${pt(monday, 4, 17 * 60).toISOString()}, 'blocked'),
      ('act_data_migration', 'mtg_prev_sync4', 'prj_launch', 'Resolve data migration blocker',
       'par_daniel', ${pt(monday, 4, 17 * 60).toISOString()}, 'open')`;

    // Tuesday standup 09:00-09:30 (all three)
    await tx`insert into meetings (id, title, purpose, project_id, start_at, duration_minutes, status, created_by) values
      ('mtg_tue_standup', 'Team standup (Tue)', 'Daily sync.', null,
       ${pt(monday, 1, 9 * 60).toISOString()}, 30, 'scheduled', 'usr_alex')`;
    await tx`insert into meeting_participants (meeting_id, participant_id, role, response) values
      ('mtg_tue_standup', 'par_alex', 'organizer', 'accepted'),
      ('mtg_tue_standup', 'par_sarah', 'attendee', 'accepted'),
      ('mtg_tue_standup', 'par_daniel', 'attendee', 'accepted')`;

    // Wednesday incident review 09:00-10:30 (all three) — makes first Wednesday slot 10:30
    await tx`insert into meetings (id, title, purpose, project_id, start_at, duration_minutes, status, created_by) values
      ('mtg_wed_incident', 'Incident review', 'Post-incident review for Tuesday outage.', null,
       ${pt(monday, 2, 9 * 60).toISOString()}, 90, 'scheduled', 'usr_alex')`;
    await tx`insert into meeting_participants (meeting_id, participant_id, role, response) values
      ('mtg_wed_incident', 'par_alex', 'organizer', 'accepted'),
      ('mtg_wed_incident', 'par_sarah', 'attendee', 'accepted'),
      ('mtg_wed_incident', 'par_daniel', 'attendee', 'accepted')`;

    // Friday check-in (planned, unscheduled follow-up target for continuity)
    await tx`insert into meetings (id, title, purpose, project_id, start_at, duration_minutes, status, created_by) values
      ('mtg_fri_checkin', 'Launch check-in (Fri)', 'Friday launch check-in with Alex and Daniel.', 'prj_launch',
       ${pt(monday, 4, 15 * 60).toISOString()}, 30, 'scheduled', 'usr_alex')`;
    await tx`insert into meeting_participants (meeting_id, participant_id, role, response) values
      ('mtg_fri_checkin', 'par_alex', 'organizer', 'accepted'),
      ('mtg_fri_checkin', 'par_daniel', 'attendee', 'pending')`;

    // Audit trail for the seeded state (system actor, honest provenance).
    await tx`insert into audit_events (actor_type, actor_ref, action, entity_type, entity_id, channel, request_id)
      values ('system', 'seed', 'demo.reset', 'system', 'golden-demo', 'system', 'seed')`;
  });
}

async function truncateAll(sql: Sql): Promise<void> {
  await sql.unsafe(
    `truncate table
      audit_events,
      idempotency_records,
      sessions,
      integration_events,
      ingestion_records,
      external_references,
      integration_connections,
      follow_ups,
      action_items,
      decisions,
      agenda_items,
      meeting_participants,
      meetings,
      proposals,
      participants,
      projects,
      users
     restart identity cascade`);
}

/** True when a date string falls Monday..Friday. */
export function isWeekday(date: string): boolean {
  const wd = weekdayOfDate(date, 'UTC');
  return wd >= 1 && wd <= 5;
}
