/**
 * Audit trail (INV-10, FR-6, US-12). Every successful mutation writes an
 * audit event transactionally with the mutation itself (see D-026 and the
 * release checklist: "Audit events are written transactionally with
 * mutations").
 */
import type { ActorType, AuditEvent } from '@meetingops/contracts';

export type AuditChannel = 'ui' | 'webmcp' | 'system';

export interface AuditEventInput {
  readonly actorType: ActorType;
  readonly actorRef: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly requestId?: string;
  readonly before?: unknown;
  readonly after?: unknown;
  readonly channel: AuditChannel;
}

export interface AuditRecorder {
  record(event: AuditEventInput): Promise<void>;
  listByEntity(entityType: string, entityId: string, limit?: number): Promise<AuditEvent[]>;
  listAll(limit?: number): Promise<AuditEvent[]>;
}
