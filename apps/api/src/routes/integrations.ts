/**
 * Integration REST routes (docs Integration Abstraction section 7):
 * catalog, connect, disconnect, sync, activity, webhook ingestion.
 * Handlers stay thin: parse → authorize → service → serialize. Provider
 * writes never bypass domain invariants; webhook payloads are untrusted.
 */
import type { FastifyInstance } from 'fastify';
import {
  AppError,
  INTEGRATION_PROVIDERS,
  connectIntegrationRequestSchema,
  disconnectIntegrationRequestSchema,
  syncIntegrationRequestSchema,
  ingestWebhookRequestSchema,
  type IntegrationProviderId,
} from '@kestrel/contracts';
import type { Repos } from '../repositories/types.js';
import type { DbHandle } from '../db/client.js';
import { requireUser } from '../auth/session.js';
import { IntegrationService } from '../services/integrationService.js';
import { requestActorCtx, SYSTEM_CONTEXT } from '../services/actorContext.js';
import { hashString } from '../ids.js';

export function registerIntegrationRoutes(app: FastifyInstance, options: { repos: Repos; db: DbHandle }): void {
  const { repos, db } = options;

  /* ------------------------------- catalog -------------------------------- */

  app.get('/api/integrations', async (request) => {
    const auth = await requireUser(repos, request);
    const service = new IntegrationService(repos);
    return service.catalog(requestActorCtx(request, auth.userId));
  });

  /* ------------------------------- connect -------------------------------- */

  app.post('/api/integrations/connect', async (request, reply) => {
    const auth = await requireUser(repos, request);
    const body = connectIntegrationRequestSchema.parse(request.body);
    // Idempotency: same key + same provider → replay; different payload → conflict.
    const requestHash = hashString(JSON.stringify({ providerId: body.providerId }));
    const existing = await repos.idempotency.find(auth.userId, body.idempotencyKey);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new AppError('IDEMPOTENCY_CONFLICT', 'This idempotency key was already used with a different request');
      }
      reply.status(200).send(existing.responseJson);
      return;
    }
    const service = new IntegrationService(repos);
    const connection = await service.connect(requestActorCtx(request, auth.userId), {
      providerId: body.providerId,
      scopes: body.scopes,
      config: body.config,
    });
    const response = { connection };
    await repos.idempotency.insert({
      actorUserId: auth.userId,
      idempotencyKey: body.idempotencyKey,
      endpoint: 'connect-integration',
      requestHash,
      responseJson: response,
      statusCode: 200,
    });
    reply.status(200).send(response);
  });

  /* ------------------------------ disconnect ------------------------------ */

  app.post('/api/integrations/:connectionId/disconnect', async (request) => {
    const auth = await requireUser(repos, request);
    const body = disconnectIntegrationRequestSchema.parse(request.body);
    const { connectionId } = request.params as { connectionId: string };
    const service = new IntegrationService(repos);
    const connection = await service.disconnect(requestActorCtx(request, auth.userId), connectionId);
    await repos.idempotency.insert({
      actorUserId: auth.userId,
      idempotencyKey: body.idempotencyKey,
      endpoint: `disconnect-integration:${connectionId}`,
      requestHash: hashString(JSON.stringify({ connectionId })),
      responseJson: { connection },
      statusCode: 200,
    });
    return { connection };
  });

  /* --------------------------------- sync --------------------------------- */

  app.post('/api/integrations/:connectionId/sync', async (request) => {
    const auth = await requireUser(repos, request);
    const body = syncIntegrationRequestSchema.parse(request.body);
    const { connectionId } = request.params as { connectionId: string };
    const service = new IntegrationService(repos);
    const result = await service.sync(requestActorCtx(request, auth.userId), connectionId);
    await repos.idempotency.insert({
      actorUserId: auth.userId,
      idempotencyKey: body.idempotencyKey,
      endpoint: `sync-integration:${connectionId}`,
      requestHash: hashString(JSON.stringify({ connectionId })),
      responseJson: result,
      statusCode: 200,
    });
    return result;
  });

  /* ------------------------------- activity ------------------------------- */

  app.get('/api/integrations/activity', async (request) => {
    const auth = await requireUser(repos, request);
    const query = request.query as Record<string, string | undefined>;
    const service = new IntegrationService(repos);
    const events = await service.activity(requestActorCtx(request, auth.userId), query.connectionId);
    return { events };
  });

  /* ----------------------------- webhook ingest --------------------------- */

  /**
   * Provider webhook endpoint — UNTRUSTED input. No user session is required
   * (the provider calls us), but a connected connection must exist for the
   * provider, and ingestion is idempotent per (providerId, sourceEventId).
   * Raw transcript never becomes committed state (doc section 8).
   */
  app.post('/api/integrations/webhooks/:providerId', async (request) => {
    const { providerId } = request.params as { providerId: string };
    if (!(INTEGRATION_PROVIDERS as readonly string[]).includes(providerId)) {
      throw new AppError('VALIDATION_ERROR', `Unknown provider ${providerId}`);
    }
    const body = ingestWebhookRequestSchema.parse(request.body);
    const service = new IntegrationService(repos);
    const ctx = { ...SYSTEM_CONTEXT, requestId: request.id };
    const result = await service.ingestWebhook(ctx, {
      providerId: providerId as IntegrationProviderId,
      eventId: body.eventId,
      eventType: body.eventType,
      payload: body.payload,
    });
    // Keep the DB handle referenced so the route closure owns what it uses.
    void db;
    return result;
  });
}
