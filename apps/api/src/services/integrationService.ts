/**
 * Integration application service — the single entry point for the
 * Integrations UI and any future WebMCP integration tools. It is the ONLY
 * place that talks to providers; routes stay thin (docs/03: no business
 * rules in route handlers).
 *
 * Honesty rules (doc sections 13–14):
 * - Demo adapters are clearly labeled; we never claim a real external side
 *   effect happened (createEvent is simulated and recorded as such).
 * - Webhook ingestion is idempotent per (providerId, sourceEventId) and
 *   auditable; raw transcript NEVER becomes committed Decision/ActionItem —
 *   it becomes proposal-ready analysis that requires human approval.
 * - Provider failures surface as explicit errors (never fake success).
 */
import {
  AppError,
  INTEGRATION_PROVIDERS,
  PROVIDER_CAPABILITIES,
  type IntegrationProviderId,
} from '@kestrel/contracts';
import type { Repos } from '../repositories/types.js';
import { idFactory } from '../ids.js';
import { ProviderRegistry } from '../integrations/registry.js';
import { analyzeTranscript, parseTranscriptInput, payloadHash } from '../integrations/canonical.js';
import type { ActorContext } from './actorContext.js';
import { actorRefFor, actorTypeFor } from './actorContext.js';
import type { IntegrationConnectionRecord } from '../repositories/types.js';
import type { ProviderMeta } from '../integrations/types.js';

export interface ConnectInput {
  readonly providerId: IntegrationProviderId;
  readonly scopes?: readonly string[];
  readonly config?: Record<string, unknown>;
}

export class IntegrationService {
  constructor(private readonly repos: Repos) {}

  private registry(): ProviderRegistry {
    return new ProviderRegistry(this.repos);
  }

  private async auditIntegration(
    ctx: ActorContext,
    action: string,
    entityId: string,
    after: unknown,
  ): Promise<void> {
    await this.repos.audit.record({
      actorType: actorTypeFor(ctx),
      actorRef: actorRefFor(ctx),
      action,
      entityType: 'integration',
      entityId,
      requestId: ctx.requestId,
      after,
      channel: ctx.channel,
    });
  }

  /* ------------------------------ catalog -------------------------------- */

  /** Provider catalog for the user-facing Integrations UI. */
  async catalog(ctx: ActorContext): Promise<{
    providers: (ProviderMeta & { connection: IntegrationConnectionRecord | null })[];
  }> {
    const registry = this.registry();
    const implemented = registry.catalog();
    const declared = ProviderRegistry.declaredButUnimplemented().filter(
      (m) => !implemented.some((i) => i.providerId === m.providerId),
    );
    const connections = await this.repos.integrations.listConnections();
    // Attach the live connection per provider for the UI cards.
    const providers = [...implemented, ...declared].map((meta) => {
      const conn = connections.find((c) => c.providerId === meta.providerId) ?? null;
      return { ...meta, connection: conn };
    });
    await this.auditIntegration(ctx, 'integration.catalog', 'catalog', { providerCount: providers.length });
    return { providers };
  }

  /* ------------------------------ connect -------------------------------- */

  async connect(ctx: ActorContext, input: ConnectInput): Promise<IntegrationConnectionRecord> {
    const registry = this.registry();
    const provider = registry.get(input.providerId);
    if (!provider) {
      throw new AppError('NOT_FOUND', `Provider ${input.providerId} is not implemented in this build`);
    }
    const meta = provider.meta;

    // One connection per provider (simple MVP model; documented).
    const existing = await this.repos.integrations.findConnectionByProvider(input.providerId);
    if (existing && existing.status === 'connected') {
      throw new AppError('CONFLICT', `Provider ${input.providerId} is already connected`);
    }

    const scopes = [...(input.scopes ?? [])];
    const id = existing?.id ?? idFactory('icn');
    const connection = existing
      ? await this.repos.integrations.updateConnectionStatus(id, 'connected', {
          connectedAt: new Date(),
          config: input.config ?? existing.config ?? undefined,
        })
      : await this.repos.integrations.insertConnection({
          id,
          providerId: meta.providerId,
          capability: meta.capabilities[0] ?? 'automation',
          displayName: meta.displayName,
          scopes,
          config: input.config ?? null,
        });

    await this.repos.integrations.recordEvent({
      id: idFactory('iev'),
      connectionId: id,
      providerId: meta.providerId,
      eventType: 'connected',
      status: 'ok',
      summary: `${meta.displayName} connected${meta.demo ? ' (demo adapter)' : ''}`,
      details: { scopes, demo: meta.demo },
    });
    await this.auditIntegration(ctx, 'integration.connect', id, {
      providerId: meta.providerId,
      demo: meta.demo,
      scopes,
    });
    return connection;
  }

  /* ------------------------------ disconnect ----------------------------- */

  async disconnect(ctx: ActorContext, connectionId: string): Promise<IntegrationConnectionRecord> {
    const conn = await this.repos.integrations.findConnection(connectionId);
    if (!conn) throw new AppError('NOT_FOUND', `Connection ${connectionId} not found`);
    const updated = await this.repos.integrations.updateConnectionStatus(connectionId, 'disconnected', {
      connectedAt: undefined,
      lastError: null,
    });
    await this.repos.integrations.recordEvent({
      id: idFactory('iev'),
      connectionId,
      providerId: conn.providerId as IntegrationProviderId,
      eventType: 'disconnected',
      status: 'ok',
      summary: `${conn.displayName} disconnected`,
      details: { reason: 'user_disconnect' },
    });
    // Canonical local state is retained (doc section 7: Disconnect revokes
    // access and keeps local canonical state per policy).
    await this.auditIntegration(ctx, 'integration.disconnect', connectionId, {
      providerId: conn.providerId,
    });
    return updated;
  }

  /* -------------------------------- sync --------------------------------- */

  /** Trigger a provider sync; returns a real outcome report. */
  async sync(ctx: ActorContext, connectionId: string): Promise<{
    connection: IntegrationConnectionRecord;
    result: { ok: boolean; summary: string; events?: readonly unknown[] };
  }> {
    const conn = await this.repos.integrations.findConnection(connectionId);
    if (!conn) throw new AppError('NOT_FOUND', `Connection ${connectionId} not found`);
    if (conn.status !== 'connected') {
      throw new AppError('INVALID_STATE', `Connection ${connectionId} is not connected (${conn.status})`);
    }
    const registry = this.registry();
    const provider = registry.get(conn.providerId as IntegrationProviderId);
    if (!provider) throw new AppError('NOT_FOUND', `Provider ${conn.providerId} not implemented`);

    let result: { ok: boolean; summary: string; events?: readonly unknown[] };
    try {
      if (conn.capability === 'calendar' && 'getCalendarContext' in provider) {
        const today = new Date().toISOString().slice(0, 10);
        const ctxData = await provider.getCalendarContext({ dateFrom: today, dateTo: today });
        result = {
          ok: true,
          summary: `Synced ${ctxData.busyIntervals.length} busy interval(s) from ${conn.displayName} (${ctxData.source === 'local' ? 'local demo calendar model' : 'external'})`,
          events: ctxData.busyIntervals,
        };
      } else if (conn.capability === 'meeting_intelligence' && 'getTranscript' in provider) {
        // Demo: fetch the seeded demo transcript for the golden scenario.
        const transcript = await provider.getTranscript('demo_launch_review');
        const analysis = analyzeTranscript(transcript);
        result = {
          ok: true,
          summary: `Synced transcript for "${transcript.meetingTitle}": ${analysis.decisions.length} decision(s), ${analysis.actionItems.length} action item(s) extracted (proposal-ready, awaiting human review)`,
          events: analysis.actionItems,
        };
      } else {
        throw new AppError('INVALID_STATE', `Capability ${conn.capability} sync is not implemented for this provider`);
      }
      await this.repos.integrations.updateConnectionStatus(connectionId, 'connected', {
        lastSyncAt: new Date(),
        lastError: null,
      });
      await this.repos.integrations.recordEvent({
        id: idFactory('iev'),
        connectionId,
        providerId: conn.providerId as IntegrationProviderId,
        eventType: 'sync.completed',
        status: 'ok',
        summary: result.summary,
        details: result,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.repos.integrations.updateConnectionStatus(connectionId, 'error', {
        lastError: { code: 'SYNC_FAILED', message, at: new Date().toISOString() },
      });
      await this.repos.integrations.recordEvent({
        id: idFactory('iev'),
        connectionId,
        providerId: conn.providerId as IntegrationProviderId,
        eventType: 'sync.failed',
        status: 'error',
        summary: `Sync failed: ${message}`,
        details: { error: message },
      });
      throw new AppError('UNAVAILABLE', `Provider sync failed: ${message}`);
    }

    await this.auditIntegration(ctx, 'integration.sync', connectionId, {
      providerId: conn.providerId,
      ok: result.ok,
      summary: result.summary,
    });
    const after = await this.repos.integrations.findConnection(connectionId);
    if (!after) throw new AppError('INTERNAL', 'Connection disappeared during sync');
    return { connection: after, result };
  }

  /* --------------------------- webhook ingestion ------------------------- */

  /**
   * Idempotent ingestion of a provider webhook (untrusted input).
   * Raw transcript → validated TranscriptInput → proposal-ready analysis.
   * NEVER commits Decision/ActionItem directly (doc section 8: raw
   * transcript does not directly create decisions or action items).
   */
  async ingestWebhook(
    ctx: ActorContext,
    input: {
      providerId: IntegrationProviderId;
      eventId: string;
      eventType: string;
      payload: unknown;
    },
  ): Promise<{
    status: 'processed' | 'duplicate' | 'failed';
    analysis?: ReturnType<typeof analyzeTranscript>;
    summary: string;
  }> {
    // A provider may only deliver webhooks when the user has connected it
    // (honest activity + FK integrity: events reference a real connection).
    const connection = await this.repos.integrations.findConnectionByProvider(input.providerId);
    if (!connection || connection.status !== 'connected') {
      throw new AppError(
        'INVALID_STATE',
        `Webhook from ${input.providerId} ignored: provider is not connected`,
      );
    }

    // Idempotency first (unique (providerId, sourceEventId) in DB).
    const existing = await this.repos.integrations.findIngestion(input.providerId, input.eventId);
    if (existing) {
      return {
        status: 'duplicate',
        summary: `Duplicate webhook ${input.providerId}/${input.eventId} ignored (first processed at ${existing.receivedAt})`,
      };
    }
    const hash = payloadHash(input.payload);

    let transcript;
    try {
      // Parse + validate raw payload as a canonical TranscriptInput.
      transcript = parseTranscriptInput(input.payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.repos.integrations.insertIngestion({
        id: idFactory('ing'),
        providerId: input.providerId,
        sourceEventId: input.eventId,
        sourceEventType: input.eventType,
        payloadHash: hash,
        status: 'failed',
        error: { code: 'INVALID_PAYLOAD', message },
      });
      throw new AppError('VALIDATION_ERROR', `Invalid webhook payload: ${message}`);
    }

    const analysis = analyzeTranscript(transcript);
    const ingestion = await this.repos.integrations.insertIngestion({
      id: idFactory('ing'),
      providerId: input.providerId,
      sourceEventId: input.eventId,
      sourceEventType: input.eventType,
      payloadHash: hash,
      status: 'processed',
      outputEntityType: 'transcript',
      outputEntityId: transcript.externalMeetingId,
    });
    await this.repos.integrations.insertExternalReference({
      id: idFactory('xrf'),
      providerId: input.providerId,
      externalId: transcript.externalMeetingId,
      externalUrl: null,
      referenceType: 'transcript',
      entityType: 'transcript',
      entityId: ingestion.id,
      payload: { title: transcript.meetingTitle },
    });
    // Activity + audit (real events only).
    await this.repos.integrations.recordEvent({
      id: idFactory('iev'),
      connectionId: connection.id,
      providerId: input.providerId,
      eventType: 'webhook.received',
      status: 'ok',
      summary: `Ingested ${input.eventType} from ${input.providerId}: ${analysis.decisions.length} decision(s), ${analysis.actionItems.length} action item(s)`,
      details: { eventId: input.eventId },
    });
    await this.auditIntegration(ctx, 'integration.ingest', ingestion.id, {
      providerId: input.providerId,
      eventId: input.eventId,
      decisions: analysis.decisions.length,
      actionItems: analysis.actionItems.length,
    });

    return {
      status: 'processed',
      analysis,
      summary: `Webhook processed: ${analysis.decisions.length} decision(s) and ${analysis.actionItems.length} action item(s) extracted as proposal-ready analysis (awaiting human review)`,
    };
  }

  /* ------------------------------- activity ------------------------------ */

  async activity(ctx: ActorContext, connectionId?: string): Promise<unknown[]> {
    const events = connectionId
      ? await this.repos.integrations.listEvents(connectionId)
      : await this.repos.integrations.listAllEvents();
    await this.auditIntegration(ctx, 'integration.activity', connectionId ?? 'all', { eventCount: events.length });
    return events;
  }

  /** WebMCP read surface: stable, minimal integration status. */
  async getIntegrationStatus(ctx: ActorContext): Promise<{
    providers: ReturnType<ProviderRegistry['catalog']>;
    connections: IntegrationConnectionRecord[];
    recentEvents: unknown[];
  }> {
    const registry = this.registry();
    const providers = registry.catalog();
    const connections = await this.repos.integrations.listConnections();
    const recentEvents = await this.repos.integrations.listAllEvents(10);
    await this.auditIntegration(ctx, 'integration.status', 'status', {
      providerCount: providers.length,
      connectionCount: connections.length,
    });
    return { providers, connections, recentEvents };
  }
}

export { INTEGRATION_PROVIDERS, PROVIDER_CAPABILITIES };
