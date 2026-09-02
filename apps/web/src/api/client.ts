/**
 * Typed API client. One channel per client instance ('ui' | 'webmcp') is sent
 * as the X-Kestrel-Channel header (audit classification only — D-011).
 * Errors surface as ApiError with the server's stable code.
 */
export type Channel = 'ui' | 'webmcp';

export interface ApiErrorShape {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  constructor(status: number, error: ApiErrorShape) {
    super(error.message);
    this.name = 'ApiError';
    this.code = error.code;
    this.status = status;
    this.details = error.details;
  }
}

export async function apiFetch<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  channel: Channel = 'ui',
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-kestrel-channel': channel,
    },
    credentials: 'same-origin',
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!response.ok) {
    const err = (json.error ?? { code: 'INTERNAL', message: 'Request failed' }) as ApiErrorShape;
    throw new ApiError(response.status, err);
  }
  return json as T;
}

/* ---------------------------- response types --------------------------- */
/* Entity shapes come from @kestrel/contracts; these are the wire shapes. */

import type {
  ActionItem,
  AgendaItem,
  AuditEvent,
  Decision,
  FollowUp,
  Meeting,
  MeetingParticipant,
  Participant,
  Project,
  Proposal,
  User,
  VerificationReport,
} from '@kestrel/contracts';

export type {
  ActionItem,
  AgendaItem,
  AuditEvent,
  Decision,
  FollowUp,
  Meeting,
  MeetingParticipant,
  Participant,
  Project,
  Proposal,
  User,
  VerificationReport,
};

/** Wire shape of GET /api/meetings/:id (repositories MeetingDetail). */
export interface MeetingDetail extends Meeting {
  participants: MeetingParticipant[];
  agenda: AgendaItem[];
  decisions: Decision[];
  actions: ActionItem[];
  followUps: FollowUp[];
}

export interface Overview {
  today: string;
  weekStart: string;
  weekEnd: string;
  nextMeeting: Meeting | null;
  needsPreparation: Array<{ meetingId: string; meetingTitle: string; agendaCount: number }>;
  overdueActions: ActionItem[];
  pendingDecisionsCount: number;
  pendingProposalsCount: number;
}

export interface Slot {
  startAt: string;
  endAt: string;
  participantIds: string[];
}

export interface SlotSearchResult {
  slots: Slot[];
  gridMinutes: number;
  window: { dateFrom: string; dateTo: string };
  consideredParticipantIds: string[];
}

export const api = {
  health: () => apiFetch<{ status: string; database: string }>('GET', '/api/health'),
  session: () => apiFetch<{ user: User | null; participant: Participant | null; demoUsers?: User[] }>('GET', '/api/session'),
  createSession: (userId: string) => apiFetch<{ user: User }>('POST', '/api/session', { userId }),
  endSession: () => apiFetch<void>('DELETE', '/api/session'),

  overview: () => apiFetch<Overview>('GET', '/api/overview'),
  users: () => apiFetch<{ users: User[] }>('GET', '/api/users'),
  participants: () => apiFetch<{ participants: Participant[] }>('GET', '/api/participants'),
  projects: () => apiFetch<{ projects: Project[] }>('GET', '/api/projects'),
  project: (id: string) =>
    apiFetch<{ project: Project; meetings: Meeting[]; actions: ActionItem[]; decisions: Decision[] }>(
      'GET',
      `/api/projects/${encodeURIComponent(id)}`,
    ),

  meetings: (filter: { filter?: string } = {}) =>
    apiFetch<{ meetings: MeetingDetail[] }>(
      'GET',
      `/api/meetings${filter.filter ? `?filter=${encodeURIComponent(filter.filter)}` : ''}`,
    ),
  meeting: (id: string) => apiFetch<MeetingDetail>('GET', `/api/meetings/${encodeURIComponent(id)}`),
  createMeeting: (input: Record<string, unknown>) => apiFetch<{ meeting: Meeting }>('POST', '/api/meetings', input),
  updateMeeting: (id: string, input: Record<string, unknown>) =>
    apiFetch<{ meeting: Meeting }>('PATCH', `/api/meetings/${encodeURIComponent(id)}`, input),
  transitionMeeting: (id: string, input: Record<string, unknown>) =>
    apiFetch<{ meeting: Meeting }>('POST', `/api/meetings/${encodeURIComponent(id)}/status`, input),
  addAgendaItem: (meetingId: string, input: Record<string, unknown>) =>
    apiFetch<{ item: AgendaItem }>('POST', `/api/meetings/${encodeURIComponent(meetingId)}/agenda-items`, input),
  updateAgendaItem: (itemId: string, input: Record<string, unknown>) =>
    apiFetch<{ item: AgendaItem }>('PATCH', `/api/agenda-items/${encodeURIComponent(itemId)}`, input),
  recordDecision: (meetingId: string, input: Record<string, unknown>) =>
    apiFetch<{ decision: Decision }>('POST', `/api/meetings/${encodeURIComponent(meetingId)}/decisions`, input),
  createActionItem: (meetingId: string, input: Record<string, unknown>) =>
    apiFetch<{ action: ActionItem }>('POST', `/api/meetings/${encodeURIComponent(meetingId)}/actions`, input),
  updateActionItem: (id: string, input: Record<string, unknown>) =>
    apiFetch<{ action: ActionItem }>('PATCH', `/api/actions/${encodeURIComponent(id)}`, input),
  actions: (filter: Record<string, string> = {}) =>
    apiFetch<{ actions: ActionItem[] }>(
      'GET',
      `/api/actions?${new URLSearchParams(filter).toString()}`,
    ),

  followUps: (filter: Record<string, string> = {}) =>
    apiFetch<{ followUps: FollowUp[] }>(
      'GET',
      `/api/follow-ups?${new URLSearchParams(filter).toString()}`,
    ),
  createFollowUp: (input: Record<string, unknown>) =>
    apiFetch<{ followUp: FollowUp }>('POST', '/api/follow-ups', input),

  proposals: (filter: Record<string, string> = {}) =>
    apiFetch<{ proposals: Proposal[] }>(
      'GET',
      `/api/proposals?${new URLSearchParams(filter).toString()}`,
    ),
  proposal: (id: string) => apiFetch<{ proposal: Proposal }>('GET', `/api/proposals/${encodeURIComponent(id)}`),
  createProposal: (input: Record<string, unknown>) =>
    apiFetch<{ proposal: Proposal }>('POST', '/api/proposals', input),
  reviseProposal: (id: string, input: Record<string, unknown>) =>
    apiFetch<{ proposal: Proposal }>('POST', `/api/proposals/${encodeURIComponent(id)}/revise`, input),
  approveProposal: (id: string) =>
    apiFetch<{ proposal: Proposal }>('POST', `/api/proposals/${encodeURIComponent(id)}/approve`, {}),
  rejectProposal: (id: string, reason: string) =>
    apiFetch<{ proposal: Proposal }>('POST', `/api/proposals/${encodeURIComponent(id)}/reject`, { reason }),
  executeProposal: (id: string, idempotencyKey: string) =>
    apiFetch<{ proposal: Proposal; verification: VerificationReport | null }>(
      'POST',
      `/api/proposals/${encodeURIComponent(id)}/execute`,
      { idempotencyKey },
    ),
  verifyMeeting: (meetingId: string, expectations: Record<string, unknown>) =>
    apiFetch<{ verification: VerificationReport }>('POST', '/api/verify-meeting', {
      meetingId,
      expectations,
    }),

  searchSlots: (input: Record<string, unknown>) =>
    apiFetch<SlotSearchResult>('POST', '/api/availability/search', input),
  checkSlot: (input: Record<string, unknown>) =>
    apiFetch<{ available: boolean; conflicts: Array<{ reason: string; participantId: string; label?: string }> }>(
      'POST',
      '/api/availability/check',
      input,
    ),

  decisions: (filter: Record<string, string> = {}) =>
    apiFetch<{ decisions: Decision[] }>(
      'GET',
      `/api/decisions?${new URLSearchParams(filter).toString()}`,
    ),

  activity: (filter: Record<string, string> = {}) =>
    apiFetch<{ events: AuditEvent[] }>(
      'GET',
      `/api/activity?${new URLSearchParams(filter).toString()}`,
    ),

  integrations: () => apiFetch<{ providers: IntegrationProviderView[] }>('GET', '/api/integrations'),
  connectIntegration: (input: Record<string, unknown>) =>
    apiFetch<{ connection: IntegrationConnectionView }>('POST', '/api/integrations/connect', input),
  disconnectIntegration: (connectionId: string, idempotencyKey: string) =>
    apiFetch<{ connection: IntegrationConnectionView }>(
      'POST',
      `/api/integrations/${encodeURIComponent(connectionId)}/disconnect`,
      { idempotencyKey },
    ),
  syncIntegration: (connectionId: string, idempotencyKey: string) =>
    apiFetch<{ connection: IntegrationConnectionView; result: { ok: boolean; summary: string } }>(
      'POST',
      `/api/integrations/${encodeURIComponent(connectionId)}/sync`,
      { idempotencyKey },
    ),
  integrationActivity: (connectionId?: string) =>
    apiFetch<{ events: IntegrationEventView[] }>(
      'GET',
      `/api/integrations/activity${connectionId ? `?connectionId=${encodeURIComponent(connectionId)}` : ''}`,
    ),

  resetDemo: () => apiFetch<{ ok: boolean; message: string }>('POST', '/api/demo/reset', {}),
};

/* --------------------------- integration views ---------------------------- */

export interface IntegrationProviderView {
  providerId: string;
  displayName: string;
  description: string;
  capabilities: string[];
  demo: boolean;
  connection: IntegrationConnectionView | null;
}

export interface IntegrationConnectionView {
  id: string;
  providerId: string;
  capability: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  displayName: string;
  scopes: string[];
  config: Record<string, unknown> | null;
  lastSyncAt: string | null;
  lastError: { code: string; message: string; at: string } | null;
  connectedAt: string | null;
}

export interface IntegrationEventView {
  id: string;
  connectionId: string;
  providerId: string;
  eventType: string;
  status: 'ok' | 'error';
  summary: string;
  details: unknown;
  occurredAt: string;
}
