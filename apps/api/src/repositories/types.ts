/**
 * Repository types and interfaces (ports). Services depend only on these;
 * Drizzle/PostgreSQL details live in ./drizzle/*.
 */
import type {
  ActionItem,
  AgendaItem,
  AuditEvent,
  Decision,
  FollowUp,
  Meeting,
  MeetingParticipant,
  Participant,
  Proposal,
  ProposalKind,
  ProposalStatus,
  Project,
  User,
} from '@kestrel/contracts';
import type { AuditChannel, AuditEventInput } from '../domain/audit.js';

export interface MeetingFilter {
  readonly from?: string;
  readonly to?: string;
  readonly projectId?: string;
  readonly statuses?: readonly Meeting['status'][];
}

export interface MeetingDetail extends Meeting {
  readonly participants: readonly MeetingParticipant[];
  readonly agenda: readonly AgendaItem[];
  readonly decisions: readonly Decision[];
  readonly actions: readonly ActionItem[];
  readonly followUps: readonly FollowUp[];
}

export interface CreateMeetingData {
  readonly id: string;
  readonly title: string;
  readonly purpose: string;
  readonly projectId: string | null;
  readonly startAt: Date;
  readonly durationMinutes: number;
  readonly status: Meeting['status'];
  readonly createdBy: string;
  readonly participants: readonly { participantId: string; role: 'organizer' | 'attendee' }[];
  readonly agenda?: readonly { title: string; source: AgendaItem['source'] }[];
}

export interface UpdateMeetingFields {
  readonly title?: string;
  readonly purpose?: string;
  readonly projectId?: string | null;
  readonly startAt?: Date;
  readonly durationMinutes?: number;
  readonly status?: Meeting['status'];
}

export interface MeetingRevisionConflict {
  readonly currentRevision: number;
}

export interface UserRepository {
  listAll(): Promise<User[]>;
  findById(id: string): Promise<User | null>;
}

export interface ParticipantRepository {
  listAll(): Promise<Participant[]>;
  findByIds(ids: readonly string[]): Promise<Participant[]>;
  findByUserId(userId: string): Promise<Participant | null>;
}

export interface ProjectRepository {
  listAll(): Promise<Project[]>;
  findById(id: string): Promise<Project | null>;
}

export interface MeetingRepository {
  findById(id: string): Promise<Meeting | null>;
  findDetail(id: string): Promise<MeetingDetail | null>;
  list(filter: MeetingFilter): Promise<Meeting[]>;
  listIdsForParticipantBetween(participantId: string, from: Date, to: Date): Promise<Meeting[]>;
  create(data: CreateMeetingData): Promise<Meeting>;
  /** Atomic optimistic update; throws MeetingRevisionConflictError on revision mismatch. */
  updateWithRevision(
    id: string,
    expectedRevision: number,
    fields: UpdateMeetingFields,
  ): Promise<Meeting>;
  replaceParticipants(
    meetingId: string,
    participants: readonly { participantId: string; role: 'organizer' | 'attendee' }[],
  ): Promise<void>;
  participantIds(meetingId: string): Promise<string[]>;
  nextAgendaSortOrder(meetingId: string): Promise<number>;
  addAgendaItem(
    meetingId: string,
    item: { title: string; source: AgendaItem['source']; sortOrder: number },
  ): Promise<AgendaItem>;
  updateAgendaItem(
    itemId: string,
    fields: { title?: string; status?: AgendaItem['status']; sortOrder?: number },
  ): Promise<AgendaItem>;
  deleteAgendaItem(itemId: string): Promise<void>;
}

export class MeetingRevisionConflictError extends Error {
  constructor(readonly currentRevision: number) {
    super(`Meeting revision mismatch (current: ${currentRevision})`);
    this.name = 'MeetingRevisionConflictError';
  }
}

export class MissingEntityError extends Error {
  constructor(readonly entity: string, readonly id: string) {
    super(`${entity} ${id} not found`);
    this.name = 'MissingEntityError';
  }
}

export interface DecisionRepository {
  listAll(limit?: number): Promise<Decision[]>;
  listByMeeting(meetingId: string): Promise<Decision[]>;
  listByProject(projectId: string, limit?: number): Promise<Decision[]>;
  insert(decision: {
    id: string;
    meetingId: string;
    title: string;
    outcome: string;
    recordedAt: Date;
  }): Promise<Decision>;
}

export interface ActionItemRepository {
  findById(id: string): Promise<ActionItem | null>;
  listByMeeting(meetingId: string): Promise<ActionItem[]>;
  listOpen(filter: { projectId?: string }): Promise<ActionItem[]>;
  insert(action: {
    id: string;
    meetingId: string;
    projectId: string | null;
    title: string;
    ownerParticipantId: string | null;
    dueAt: Date | null;
  }): Promise<ActionItem>;
  update(
    id: string,
    fields: {
      title?: string;
      status?: ActionItem['status'];
      ownerParticipantId?: string | null;
      dueAt?: Date | null;
    },
  ): Promise<ActionItem>;
}

export interface FollowUpRepository {
  listBySourceMeeting(meetingId: string): Promise<FollowUp[]>;
  listAll(limit?: number): Promise<FollowUp[]>;
  insert(followUp: {
    id: string;
    sourceMeetingId: string;
    targetMeetingId: string | null;
    proposedAt: Date;
    scheduledAt: Date | null;
  }): Promise<FollowUp>;
  update(id: string, fields: { status?: FollowUp['status']; targetMeetingId?: string | null; scheduledAt?: Date | null }): Promise<FollowUp>;
}

export interface ProposalRepository {
  insert(
    proposal: {
      id: string;
      kind: ProposalKind;
      payload: unknown;
      rationale: string;
      projectId: string | null;
      baseMeetingId: string | null;
      baseMeetingRevision: number | null;
      createdByActorType: 'human' | 'agent' | 'system';
      createdByActorRef: string;
      createdByUserId: string | null;
    },
  ): Promise<Proposal>;
  findById(id: string): Promise<Proposal | null>;
  /** Live (pending/approved) proposals for a scope key — used for supersede rules. */
  listLiveByKindAndBase(kind: ProposalKind, baseKey: { projectId: string | null } | { baseMeetingId: string }): Promise<Proposal[]>;
  list(filter: { status?: ProposalStatus; baseMeetingId?: string; projectId?: string; limit?: number }): Promise<Proposal[]>;
  setStatus(id: string, status: ProposalStatus, extra: {
    approvedByUserId?: string;
    supersededById?: string;
    executedAt?: Date;
    verification?: unknown;
    rejectedAt?: Date;
    executionError?: unknown;
  }): Promise<Proposal>;
  replacePayload(id: string, payload: unknown): Promise<Proposal>;
}

export interface AuditRepository {
  record(event: AuditEventInput): Promise<void>;
  recordInTransaction(event: AuditEventInput): Promise<void>;
  listByEntity(entityType: string, entityId: string, limit?: number): Promise<AuditEvent[]>;
  listAll(limit?: number): Promise<AuditEvent[]>;
}

export interface IdempotencyRepository {
  find(actorUserId: string, key: string): Promise<{
    requestHash: string;
    responseJson: unknown;
    statusCode: number;
  } | null>;
  insert(record: {
    actorUserId: string;
    idempotencyKey: string;
    endpoint: string;
    requestHash: string;
    responseJson: unknown;
    statusCode: number;
  }): Promise<void>;
}

export interface SessionRepository {
  create(id: string, userId: string): Promise<void>;
  findActive(id: string): Promise<{ userId: string } | null>;
  touch(id: string): Promise<void>;
}

/* ------------------------------ integrations ----------------------------- */

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface IntegrationConnectionRecord {
  id: string;
  providerId: string;
  capability: string;
  status: ConnectionStatus;
  displayName: string;
  scopes: string[];
  config: Record<string, unknown> | null;
  lastSyncAt: string | null;
  lastError: { code: string; message: string; at: string } | null;
  connectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationEventRecord {
  id: string;
  connectionId: string;
  providerId: string;
  eventType: string;
  status: 'ok' | 'error';
  summary: string;
  details: unknown;
  occurredAt: string;
}

export interface ExternalReferenceRecord {
  id: string;
  providerId: string;
  externalId: string;
  externalUrl: string | null;
  referenceType: string;
  entityType: string;
  entityId: string;
  payload: unknown;
  createdAt: string;
}

export interface IngestionRecordRow {
  id: string;
  providerId: string;
  sourceEventId: string;
  sourceEventType: string;
  receivedAt: string;
  payloadHash: string;
  status: 'processed' | 'duplicate' | 'failed';
  outputEntityType: string | null;
  outputEntityId: string | null;
  error: { code: string; message: string } | null;
  createdAt: string;
}

export interface IntegrationRepository {
  listConnections(): Promise<IntegrationConnectionRecord[]>;
  findConnection(id: string): Promise<IntegrationConnectionRecord | null>;
  findConnectionByProvider(providerId: string): Promise<IntegrationConnectionRecord | null>;
  insertConnection(conn: {
    id: string;
    providerId: string;
    capability: string;
    displayName: string;
    scopes: string[];
    config: Record<string, unknown> | null;
  }): Promise<IntegrationConnectionRecord>;
  updateConnectionStatus(
    id: string,
    status: ConnectionStatus,
    extra?: {
      connectedAt?: Date;
      lastSyncAt?: Date;
      lastError?: { code: string; message: string; at: string } | null;
      config?: Record<string, unknown>;
    },
  ): Promise<IntegrationConnectionRecord>;
  recordEvent(event: {
    id: string;
    connectionId: string;
    providerId: string;
    eventType: string;
    status: 'ok' | 'error';
    summary: string;
    details?: unknown;
    occurredAt?: Date;
  }): Promise<IntegrationEventRecord>;
  listEvents(connectionId: string, limit?: number): Promise<IntegrationEventRecord[]>;
  listAllEvents(limit?: number): Promise<IntegrationEventRecord[]>;
  insertExternalReference(ref: {
    id: string;
    providerId: string;
    externalId: string;
    externalUrl: string | null;
    referenceType: string;
    entityType: string;
    entityId: string;
    payload?: unknown;
  }): Promise<ExternalReferenceRecord>;
  listExternalReferences(filter: { entityType?: string; entityId?: string }): Promise<ExternalReferenceRecord[]>;
  findIngestion(providerId: string, sourceEventId: string): Promise<IngestionRecordRow | null>;
  insertIngestion(rec: {
    id: string;
    providerId: string;
    sourceEventId: string;
    sourceEventType: string;
    payloadHash: string;
    status: 'processed' | 'duplicate' | 'failed';
    outputEntityType?: string | null;
    outputEntityId?: string | null;
    error?: { code: string; message: string } | null;
  }): Promise<IngestionRecordRow>;
}

export interface TransactionalRepos {
  meetings: MeetingRepository;
  decisions: DecisionRepository;
  actions: ActionItemRepository;
  followUps: FollowUpRepository;
  proposals: ProposalRepository;
  audit: AuditRepository;
  participants: ParticipantRepository;
  projects: ProjectRepository;
  users: UserRepository;
  idempotency: IdempotencyRepository;
  sessions: SessionRepository;
  integrations: IntegrationRepository;
}

/** A repository bundle bound to either the pool or an open transaction. */
export type Repos = TransactionalRepos;

export type { AuditChannel };
