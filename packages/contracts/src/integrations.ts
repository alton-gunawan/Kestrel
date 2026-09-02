/**
 * Integration abstraction contracts.
 *
 * Source of truth: docs/MeetingOps_Perubahan_Arah_Produk_WebApp_First_WebMCP_Integration_Abstraction.md
 * (sections 4–5). Integrations are organized by *capability*, never by
 * vendor implementation. Provider-specific objects are mapped into canonical
 * MeetingOps concepts (CalendarContext, TranscriptInput, Decision, ActionItem,
 * FollowUp, ExternalReference). The domain model does NOT know about
 * "Fathom Action Items" or "Linear Action Items" as core entities.
 *
 * Rules enforced here:
 * - Provider ids and capabilities are a closed vocabulary (zod enums).
 * - External payloads (webhook, transcript) are UNTRUSTED input; schemas bound
 *   every field, and ingestion is idempotent per (providerId, sourceEventId).
 * - A connection carries user-facing scopes/status; it never grants
 *   authorization by itself — server-side domain rules remain authoritative.
 */
import { z } from 'zod';
import { idSchema, idempotencyKeySchema, isoDateSchema, isoDateTimeSchema } from './schemas.js';

/* ------------------------------------------------------------------ */
/* Capabilities (abstraction layer)                                    */
/* ------------------------------------------------------------------ */

export const PROVIDER_CAPABILITIES = [
  'calendar',
  'meeting_intelligence',
  'communication',
  'project',
  'meeting_platform',
  'automation',
] as const;
export type ProviderCapability = (typeof PROVIDER_CAPABILITIES)[number];

/* ------------------------------------------------------------------ */
/* Vendor provider ids                                                 */
/* ------------------------------------------------------------------ */

export const INTEGRATION_PROVIDERS = [
  'google_calendar',
  'fathom',
  'slack',
  'linear',
  'microsoft_outlook',
  'fireflies',
  'tldv',
  'github',
  'zoom',
  'google_meet',
  'notion',
  'email',
  'zapier',
] as const;
export type IntegrationProviderId = (typeof INTEGRATION_PROVIDERS)[number];

/** Which capabilities each vendor provider offers (docs section 5 table). */
export const PROVIDER_CAPABILITIES_BY_PROVIDER: Record<
  IntegrationProviderId,
  readonly ProviderCapability[]
> = {
  google_calendar: ['calendar'],
  fathom: ['meeting_intelligence'],
  slack: ['communication'],
  linear: ['project'],
  microsoft_outlook: ['calendar'],
  fireflies: ['meeting_intelligence'],
  tldv: ['meeting_intelligence'],
  github: ['project'],
  zoom: ['meeting_platform'],
  google_meet: ['meeting_platform'],
  notion: ['project'],
  email: ['communication'],
  zapier: ['automation'],
};

/* ------------------------------------------------------------------ */
/* Connection / event / reference / ingestion statuses                 */
/* ------------------------------------------------------------------ */

export const CONNECTION_STATUSES = ['disconnected', 'connecting', 'connected', 'error'] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const INTEGRATION_EVENT_STATUSES = ['ok', 'error'] as const;
export type IntegrationEventStatus = (typeof INTEGRATION_EVENT_STATUSES)[number];

export const INGESTION_STATUSES = ['processed', 'duplicate', 'failed'] as const;
export type IngestionStatus = (typeof INGESTION_STATUSES)[number];

export const EXTERNAL_REFERENCE_TYPES = [
  'meeting',
  'transcript',
  'summary',
  'action_item',
  'decision',
  'issue',
  'event',
  'notification',
] as const;
export type ExternalReferenceType = (typeof EXTERNAL_REFERENCE_TYPES)[number];

export const CALENDAR_CONTEXT_SOURCES = ['local', 'external'] as const;
export type CalendarContextSource = (typeof CALENDAR_CONTEXT_SOURCES)[number];

/* ------------------------------------------------------------------ */
/* Canonical entity schemas                                            */
/* ------------------------------------------------------------------ */

export const integrationConnectionSchema = z.strictObject({
  id: idSchema,
  providerId: z.enum(INTEGRATION_PROVIDERS),
  capability: z.enum(PROVIDER_CAPABILITIES),
  status: z.enum(CONNECTION_STATUSES),
  displayName: z.string().min(1).max(120),
  scopes: z.array(z.string().min(1).max(200)).max(20),
  config: z.record(z.string(), z.unknown()).nullable(),
  lastSyncAt: isoDateTimeSchema.nullable(),
  lastError: z
    .strictObject({
      code: z.string().min(1).max(64),
      message: z.string().min(1).max(500),
      at: isoDateTimeSchema,
    })
    .nullable(),
  connectedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type IntegrationConnection = z.infer<typeof integrationConnectionSchema>;

export const integrationEventSchema = z.strictObject({
  id: idSchema,
  connectionId: idSchema,
  providerId: z.enum(INTEGRATION_PROVIDERS),
  eventType: z.string().min(1).max(120),
  status: z.enum(INTEGRATION_EVENT_STATUSES),
  summary: z.string().min(1).max(500),
  details: z.unknown().nullable(),
  occurredAt: isoDateTimeSchema,
});
export type IntegrationEvent = z.infer<typeof integrationEventSchema>;

/** Canonical link from a MeetingOps entity to a provider-side object. */
export const externalReferenceSchema = z.strictObject({
  id: idSchema,
  providerId: z.enum(INTEGRATION_PROVIDERS),
  externalId: z.string().min(1).max(300),
  externalUrl: z.string().url().max(2000).nullable(),
  referenceType: z.enum(EXTERNAL_REFERENCE_TYPES),
  entityType: z.string().min(1).max(64),
  entityId: idSchema,
  payload: z.unknown().nullable(),
  createdAt: isoDateTimeSchema,
});
export type ExternalReference = z.infer<typeof externalReferenceSchema>;

/** Idempotent webhook/event ingestion record (docs section 14). */
export const ingestionRecordSchema = z.strictObject({
  id: idSchema,
  providerId: z.enum(INTEGRATION_PROVIDERS),
  sourceEventId: z.string().min(1).max(300),
  sourceEventType: z.string().min(1).max(120),
  receivedAt: isoDateTimeSchema,
  payloadHash: z.string().min(8).max(64),
  status: z.enum(INGESTION_STATUSES),
  outputEntityType: z.string().max(64).nullable(),
  outputEntityId: idSchema.nullable(),
  error: z
    .strictObject({
      code: z.string().min(1).max(64),
      message: z.string().min(1).max(500),
    })
    .nullable(),
  createdAt: isoDateTimeSchema,
});
export type IngestionRecord = z.infer<typeof ingestionRecordSchema>;

/* ------------------------------------------------------------------ */
/* Canonical capability inputs                                         */
/* ------------------------------------------------------------------ */

/** Raw output of a MeetingIntelligenceProvider — UNTRUSTED input. */
export const transcriptInputSchema = z.strictObject({
  providerId: z.enum(INTEGRATION_PROVIDERS),
  externalMeetingId: z.string().min(1).max(300),
  meetingTitle: z.string().min(1).max(300),
  startedAt: isoDateTimeSchema.nullable(),
  endedAt: isoDateTimeSchema.nullable(),
  transcript: z.string().max(200_000),
  summary: z.string().max(20_000).nullable(),
  rawActionItems: z
    .array(
      z.strictObject({
        title: z.string().min(1).max(300),
        ownerName: z.string().max(200).optional(),
        dueLabel: z.string().max(200).optional(),
      }),
    )
    .max(100),
  rawDecisions: z
    .array(
      z.strictObject({
        title: z.string().min(1).max(300),
        outcome: z.string().max(4000),
      }),
    )
    .max(100),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type TranscriptInput = z.infer<typeof transcriptInputSchema>;

/** Calendar context produced by a CalendarProvider (local or external). */
export const calendarContextSchema = z.strictObject({
  providerId: z.enum(INTEGRATION_PROVIDERS),
  dateFrom: isoDateSchema,
  dateTo: isoDateSchema,
  source: z.enum(CALENDAR_CONTEXT_SOURCES),
  busyIntervals: z
    .array(
      z.strictObject({
        startAt: isoDateTimeSchema,
        endAt: isoDateTimeSchema,
        title: z.string().max(300).optional(),
        externalEventId: z.string().max(300).optional(),
      }),
    )
    .max(500),
  fetchedAt: isoDateTimeSchema,
});
export type CalendarContext = z.infer<typeof calendarContextSchema>;

/* ------------------------------------------------------------------ */
/* Provider catalog DTO (user-facing Integrations UI)                  */
/* ------------------------------------------------------------------ */

export const integrationProviderInfoSchema = z.strictObject({
  providerId: z.enum(INTEGRATION_PROVIDERS),
  displayName: z.string().min(1).max(120),
  description: z.string().min(1).max(600),
  capabilities: z.array(z.enum(PROVIDER_CAPABILITIES)).max(6),
  demo: z.boolean(),
});
export type IntegrationProviderInfo = z.infer<typeof integrationProviderInfoSchema>;

/* ------------------------------------------------------------------ */
/* Request schemas (REST)                                              */
/* ------------------------------------------------------------------ */

export const connectIntegrationRequestSchema = z.strictObject({
  providerId: z.enum(INTEGRATION_PROVIDERS),
  scopes: z.array(z.string().min(1).max(200)).max(20).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  idempotencyKey: idempotencyKeySchema,
});
export type ConnectIntegrationRequest = z.infer<typeof connectIntegrationRequestSchema>;

export const disconnectIntegrationRequestSchema = z.strictObject({
  idempotencyKey: idempotencyKeySchema,
});

export const syncIntegrationRequestSchema = z.strictObject({
  idempotencyKey: idempotencyKeySchema,
});

export const updateIntegrationConfigRequestSchema = z.strictObject({
  config: z.record(z.string(), z.unknown()),
  idempotencyKey: idempotencyKeySchema,
});

/** Incoming provider webhook — UNTRUSTED. Event id drives idempotency. */
export const ingestWebhookRequestSchema = z.strictObject({
  providerId: z.enum(INTEGRATION_PROVIDERS),
  eventId: z.string().min(1).max(300),
  eventType: z.string().min(1).max(120),
  payload: z.unknown(),
});
export type IngestWebhookRequest = z.infer<typeof ingestWebhookRequestSchema>;
