/**
 * Integration provider abstraction — ports (interfaces), organized by
 * capability, never by vendor (docs/…Integration_Abstraction section 5).
 *
 * Rules (shared with the direction doc):
 * - Methods that write to an external system are approval-aware at the
 *   application layer; the port itself never bypasses domain invariants.
 * - Raw provider outputs are UNTRUSTED inputs until validated + mapped to
 *   canonical Kestrel concepts (TranscriptInput, CalendarContext,
 *   ExternalReference, …).
 * - A provider never writes directly to the database.
 */
import type {
  CalendarContext,
  IntegrationProviderId,
  ProviderCapability,
  TranscriptInput,
} from '@kestrel/contracts';

/* ------------------------------- catalog -------------------------------- */

export interface ProviderMeta {
  readonly providerId: IntegrationProviderId;
  readonly displayName: string;
  readonly description: string;
  readonly capabilities: readonly ProviderCapability[];
  /** Demo adapters are deterministic, local, and clearly labeled (doc 9.1). */
  readonly demo: boolean;
}

/* --------------------------- capability ports --------------------------- */

export interface CalendarProvider {
  readonly meta: ProviderMeta;
  /**
   * Busy/availability context for a date range. `source` distinguishes the
   * local (seeded/demo) calendar domain model from a real external calendar.
   */
  getCalendarContext(input: {
    dateFrom: string;
    dateTo: string;
  }): Promise<CalendarContext>;
  /** Availability over participants' calendars (demo: local domain model). */
  findAvailability(input: {
    durationMinutes: number;
    dateFrom: string;
    dateTo: string;
    participantIds: readonly string[];
  }): Promise<{ startAt: string; endAt: string }[]>;
  /**
   * Explicit external write. The application layer only calls this after
   * human approval; it returns the provider-side event id + URL.
   */
  createEvent(input: {
    summary: string;
    startAt: string;
    endAt: string;
  }): Promise<{ externalEventId: string; externalUrl: string | null }>;
  updateEvent(input: {
    externalEventId: string;
    summary?: string;
    startAt?: string;
    endAt?: string;
  }): Promise<{ externalEventId: string; externalUrl: string | null }>;
}

export interface MeetingIntelligenceProvider {
  readonly meta: ProviderMeta;
  getMeeting(externalMeetingId: string): Promise<{ id: string; title: string }>;
  getTranscript(externalMeetingId: string): Promise<TranscriptInput>;
  getSummary(externalMeetingId: string): Promise<string>;
  getActionItems(externalMeetingId: string): Promise<TranscriptInput['rawActionItems']>;
  /** Returns a provider-side subscription id; webhook delivery is ingested by the app. */
  subscribeWebhook(input: { webhookUrl: string; externalMeetingId?: string }): Promise<{ subscriptionId: string }>;
}

export interface CommunicationProvider {
  readonly meta: ProviderMeta;
  /** Consequential external delivery — application layer gates on approval. */
  sendNotification(input: {
    recipient: string;
    subject: string;
    body: string;
  }): Promise<{ externalMessageId: string }>;
  sendFollowUp(input: {
    recipient: string;
    subject: string;
    body: string;
  }): Promise<{ externalMessageId: string }>;
}

export interface ProjectProvider {
  readonly meta: ProviderMeta;
  getProjectContext(projectKey: string): Promise<{
    key: string;
    name: string;
    issues: { id: string; title: string; status: string }[];
  }>;
  getIssues(filter: { projectKey: string; limit?: number }): Promise<{ id: string; title: string; status: string }[]>;
  /** Write only from approved Kestrel actions (doc 5.1). */
  createLinkedIssue(input: {
    projectKey: string;
    title: string;
    description: string;
  }): Promise<{ externalIssueId: string; externalUrl: string | null }>;
}

export interface MeetingPlatformProvider {
  readonly meta: ProviderMeta;
  createMeeting(input: {
    title: string;
    startAt: string;
    durationMinutes: number;
  }): Promise<{ externalMeetingId: string; joinUrl: string | null }>;
  getMeeting(externalMeetingId: string): Promise<{ id: string; title: string; joinUrl: string | null }>;
  getJoinLink(externalMeetingId: string): Promise<{ joinUrl: string | null }>;
}

export interface AutomationProvider {
  readonly meta: ProviderMeta;
  emitEvent(input: { eventType: string; payload: unknown }): Promise<{ accepted: boolean }>;
  registerRecipe(input: {
    name: string;
    trigger: string;
    actions: readonly unknown[];
  }): Promise<{ recipeId: string }>;
}

/** Union of every capability port (used by the registry). */
export type AnyProvider =
  | CalendarProvider
  | MeetingIntelligenceProvider
  | CommunicationProvider
  | ProjectProvider
  | MeetingPlatformProvider
  | AutomationProvider;
