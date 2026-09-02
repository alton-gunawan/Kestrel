/**
 * REST API routes. Handlers: parse → authorize (session) → service call →
 * serialize. All domain decisions live in services. Idempotency keys are
 * enforced on mutating endpoints (D-017).
 */
import type { FastifyInstance } from 'fastify';
import {
  AppError,
  createMeetingRequestSchema,
  updateMeetingRequestSchema,
  meetingStatusTransitionRequestSchema,
  addAgendaItemRequestSchema,
  updateAgendaItemRequestSchema,
  recordDecisionRequestSchema,
  createActionItemRequestSchema,
  updateActionItemRequestSchema,
  createFollowUpRequestSchema,
  createProposalRequestSchema,
  reviseProposalRequestSchema,
  rejectProposalRequestSchema,
  executeProposalRequestSchema,
  searchSlotsRequestSchema,
  checkSlotRequestSchema,
  resetDemoRequestSchema,
  sessionRequestSchema,
  meetingsFilterSchema,
  verifyMeetingStateInputSchema,
} from '@meetingops/contracts';
import type { Repos } from '../repositories/types.js';
import type { Env } from '../config/env.js';
import type { DbHandle } from '../db/client.js';
import { requireUser, createSession, setSessionCookie } from '../auth/session.js';
import { MeetingService, AgendaService, DecisionService, ActionItemService, FollowUpService, OverviewService, AvailabilityService } from '../services/meetingService.js';
import { ProposalService } from '../services/proposalService.js';
import { hashString } from '../ids.js';
import { runSeed, resetToGoldenDemo } from '../seed/goldenDemo.js';
import { withTransaction } from '../db/client.js';
import { createRepos } from '../repositories/drizzle.js';

interface RouteOptions {
  readonly env: Env;
  readonly repos: Repos;
  readonly db: DbHandle;
}

/**
 * Build the actor context for a request: user from the server-side session;
 * channel from the non-authoritative X-MeetingOps-Channel header (D-011).
 * The channel is audit metadata only — it never grants authorization.
 */
function actorCtx(request: { id: string; headers: Record<string, string | string[] | undefined> }, userId: string) {
  const raw = request.headers['x-meetingops-channel'];
  const channelRaw = Array.isArray(raw) ? raw[0] : raw;
  const channel = channelRaw === 'webmcp' ? 'webmcp' : 'ui';
  return { userId, requestId: request.id, channel } as const;
}

export function registerRoutes(app: FastifyInstance, options: RouteOptions): void {
  const { env, repos, db } = options;

  const meetingService = new MeetingService(repos);
  const agendaService = new AgendaService(repos);
  const decisionService = new DecisionService(repos);
  const actionItemService = new ActionItemService(repos);
  const followUpService = new FollowUpService(repos);
  const overviewService = new OverviewService(repos);
  const availabilityService = new AvailabilityService(repos);
  const proposalService = new ProposalService(db);

  /** Enforce idempotency on a mutation; returns a replay if one exists. */
  async function checkIdempotency(
    userId: string,
    endpoint: string,
    key: string | undefined,
    body: unknown,
  ): Promise<{ replay: boolean; response?: unknown }> {
    if (!key) return { replay: false };
    const requestHash = hashString(JSON.stringify(body ?? null));
    const existing = await repos.idempotency.find(userId, key);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new AppError(
          'IDEMPOTENCY_CONFLICT',
          'This idempotency key was already used with a different request',
        );
      }
      return { replay: true, response: existing.responseJson };
    }
    void endpoint;
    return { replay: false };
  }

  async function storeIdempotency(
    userId: string,
    endpoint: string,
    key: string | undefined,
    body: unknown,
    response: unknown,
    statusCode: number,
  ): Promise<void> {
    if (!key) return;
    await repos.idempotency.insert({
      actorUserId: userId,
      idempotencyKey: key,
      endpoint,
      requestHash: hashString(JSON.stringify(body ?? null)),
      responseJson: response,
      statusCode,
    });
  }

  /* ------------------------------- health -------------------------------- */

  app.get('/api/health', async (_request, reply) => {
    const started = Date.now();
    let database = 'ok';
    try {
      await db.sql`select 1`;
    } catch {
      database = 'unavailable';
    }
    const ok = database === 'ok';
    reply.status(ok ? 200 : 503).send({
      status: ok ? 'ok' : 'degraded',
      service: 'meetingops-api',
      database,
      latencyMs: Date.now() - started,
      requestId: _request.id,
    });
  });

  app.get('/api/health/live', async () => ({ status: 'ok' }));

  /* ------------------------------- session ------------------------------- */

  app.post('/api/session', async (request, reply) => {
    const body = sessionRequestSchema.parse(request.body);
    const { cookie } = await createSession(repos, body.userId);
    setSessionCookie(reply, cookie);
    const user = await repos.users.findById(body.userId);
    reply.status(200).send({ user });
  });

  app.delete('/api/session', async (request, reply) => {
    const auth = await requireUser(repos, request);
    await db.sql`update sessions set revoked = true where id = ${auth.sessionId}`;
    reply.header('set-cookie', 'meetingops_session=; Path=/; HttpOnly; Max-Age=0');
    reply.status(204).send();
  });

  app.get('/api/session', async (request, reply) => {
    try {
      const auth = await requireUser(repos, request);
      const user = await repos.users.findById(auth.userId);
      const participant = await repos.participants.findByUserId(auth.userId);
      reply.send({ user, participant });
    } catch {
      reply.send({ user: null, participant: null });
    }
  });

  app.get('/api/users', async (request) => {
    await requireUser(repos, request);
    return { users: await repos.users.listAll() };
  });

  /* ------------------------------ overview ------------------------------- */

  app.get('/api/overview', async (request) => {
    const auth = await requireUser(repos, request);
    const overview = await overviewService.getTodayOverview(actorCtx(request, auth.userId));
    return overview;
  });

  /* ------------------------------ meetings ------------------------------- */

  app.get('/api/meetings', async (request) => {
    const auth = await requireUser(repos, request);
    const query = request.query as Record<string, string | undefined>;
    const filter = meetingsFilterSchema.safeParse(query.filter ?? 'all');
    const now = new Date();
    const todayStr = new Date(Date.now() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
    let from: string | undefined;
    let to: string | undefined;
    let statuses: string[] | undefined;
    if (filter.success && filter.data === 'today') {
      from = todayStr;
      to = todayStr;
    } else if (filter.success && filter.data === 'week') {
      from = todayStr;
      to = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    } else if (filter.success && filter.data === 'attention') {
      statuses = ['draft', 'proposed', 'needs_followup'];
    }
    const meetings = await meetingService.listMeetings(
      actorCtx(request, auth.userId),
      {
        ...(from !== undefined ? { from } : {}),
        ...(to !== undefined ? { to } : {}),
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(statuses !== undefined ? { statuses: statuses as ('draft' | 'proposed' | 'needs_followup')[] } : {}),
      },
    );
    // Attach participants + agenda counts for list rows.
    const details = await Promise.all(meetings.map((m) => repos.meetings.findDetail(m.id)));
    return { meetings: details.filter((d): d is NonNullable<typeof d> => d !== null) };
  });

  app.get('/api/meetings/:id', async (request) => {
    const auth = await requireUser(repos, request);
    const { id } = request.params as { id: string };
    return meetingService.getMeeting(actorCtx(request, auth.userId), id);
  });

  app.post('/api/meetings', async (request, reply) => {
    const auth = await requireUser(repos, request);
    const body = createMeetingRequestSchema.parse(request.body);
    const idem = await checkIdempotency(auth.userId, 'POST /api/meetings', body.idempotencyKey, body);
    if (idem.replay) {
      reply.status(200).send(idem.response);
      return;
    }
    const meeting = await meetingService.createMeeting(
      actorCtx(request, auth.userId),
      {
        title: body.title,
        purpose: body.purpose,
        projectId: body.projectId ?? null,
        startAt: body.startAt,
        durationMinutes: body.durationMinutes,
        participants: body.participants,
        ...(body.agenda !== undefined ? { agenda: body.agenda } : {}),
      },
    );
    const response = { meeting };
    await storeIdempotency(auth.userId, 'POST /api/meetings', body.idempotencyKey, body, response, 201);
    reply.status(201).send(response);
  });

  app.patch('/api/meetings/:id', async (request) => {
    const auth = await requireUser(repos, request);
    const { id } = request.params as { id: string };
    const body = updateMeetingRequestSchema.parse(request.body);
    const idem = await checkIdempotency(auth.userId, `PATCH /api/meetings/${id}`, body.idempotencyKey, body);
    if (idem.replay) return idem.response;
    const meeting = await meetingService.updateMeeting(
      actorCtx(request, auth.userId),
      id,
      {
        expectedRevision: body.expectedRevision,
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.purpose !== undefined ? { purpose: body.purpose } : {}),
        ...(body.projectId !== undefined ? { projectId: body.projectId } : {}),
        ...(body.startAt !== undefined ? { startAt: body.startAt } : {}),
        ...(body.durationMinutes !== undefined ? { durationMinutes: body.durationMinutes } : {}),
        ...(body.participants !== undefined ? { participants: body.participants } : {}),
      },
    );
    // INV-8: material meeting change invalidates live proposals for it.
    await proposalService.supersedeLiveForMeetingChange(id, request.id);
    const response = { meeting };
    await storeIdempotency(auth.userId, `PATCH /api/meetings/${id}`, body.idempotencyKey, body, response, 200);
    return response;
  });

  app.post('/api/meetings/:id/status', async (request) => {
    const auth = await requireUser(repos, request);
    const { id } = request.params as { id: string };
    const body = meetingStatusTransitionRequestSchema.parse(request.body);
    const idem = await checkIdempotency(auth.userId, `POST /api/meetings/${id}/status`, body.idempotencyKey, body);
    if (idem.replay) return idem.response;
    const meeting = await meetingService.transitionStatus(
      actorCtx(request, auth.userId),
      id,
      { expectedRevision: body.expectedRevision, status: body.status },
    );
    const response = { meeting };
    await storeIdempotency(auth.userId, `POST /api/meetings/${id}/status`, body.idempotencyKey, body, response, 200);
    return response;
  });

  /* ------------------------------ agenda --------------------------------- */

  app.post('/api/meetings/:id/agenda-items', async (request, reply) => {
    const auth = await requireUser(repos, request);
    const { id } = request.params as { id: string };
    const body = addAgendaItemRequestSchema.parse(request.body);
    const idem = await checkIdempotency(auth.userId, `POST /api/meetings/${id}/agenda-items`, body.idempotencyKey, body);
    if (idem.replay) {
      reply.status(200).send(idem.response);
      return;
    }
    const item = await agendaService.addItem(
      actorCtx(request, auth.userId),
      id,
      {
        title: body.title,
        source: body.source,
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        expectedRevision: body.expectedRevision,
      },
    );
    const response = { item };
    await storeIdempotency(auth.userId, `POST /api/meetings/${id}/agenda-items`, body.idempotencyKey, body, response, 201);
    reply.status(201).send(response);
  });

  app.patch('/api/agenda-items/:itemId', async (request) => {
    const auth = await requireUser(repos, request);
    const { itemId } = request.params as { itemId: string };
    const body = updateAgendaItemRequestSchema.parse(request.body);
    const idem = await checkIdempotency(auth.userId, `PATCH /api/agenda-items/${itemId}`, body.idempotencyKey, body);
    if (idem.replay) return idem.response;
    // meetingId is required for revision + audit; accept it in the body.
    const meetingId = (request.body as { meetingId?: string }).meetingId;
    if (!meetingId) throw new AppError('VALIDATION_ERROR', 'meetingId is required');
    const item = await agendaService.updateItem(
      actorCtx(request, auth.userId),
      itemId,
      {
        meetingId,
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        expectedRevision: body.expectedRevision,
      },
    );
    const response = { item };
    await storeIdempotency(auth.userId, `PATCH /api/agenda-items/${itemId}`, body.idempotencyKey, body, response, 200);
    return response;
  });

  /* ---------------------------- outcomes --------------------------------- */

  app.post('/api/meetings/:id/decisions', async (request, reply) => {
    const auth = await requireUser(repos, request);
    const { id } = request.params as { id: string };
    const body = recordDecisionRequestSchema.parse(request.body);
    const idem = await checkIdempotency(auth.userId, `POST /api/meetings/${id}/decisions`, body.idempotencyKey, body);
    if (idem.replay) {
      reply.status(200).send(idem.response);
      return;
    }
    const decision = await decisionService.record(
      actorCtx(request, auth.userId),
      id,
      { title: body.title, outcome: body.outcome },
    );
    const response = { decision };
    await storeIdempotency(auth.userId, `POST /api/meetings/${id}/decisions`, body.idempotencyKey, body, response, 201);
    reply.status(201).send(response);
  });

  app.post('/api/meetings/:id/actions', async (request, reply) => {
    const auth = await requireUser(repos, request);
    const { id } = request.params as { id: string };
    const body = createActionItemRequestSchema.parse(request.body);
    const idem = await checkIdempotency(auth.userId, `POST /api/meetings/${id}/actions`, body.idempotencyKey, body);
    if (idem.replay) {
      reply.status(200).send(idem.response);
      return;
    }
    const action = await actionItemService.create(
      actorCtx(request, auth.userId),
      {
        meetingId: id,
        title: body.title,
        ownerParticipantId: body.ownerParticipantId,
        projectId: body.projectId ?? null,
        dueAt: body.dueAt ?? null,
      },
    );
    const response = { action };
    await storeIdempotency(auth.userId, `POST /api/meetings/${id}/actions`, body.idempotencyKey, body, response, 201);
    reply.status(201).send(response);
  });

  app.patch('/api/actions/:id', async (request) => {
    const auth = await requireUser(repos, request);
    const { id } = request.params as { id: string };
    const body = updateActionItemRequestSchema.parse(request.body);
    const idem = await checkIdempotency(auth.userId, `PATCH /api/actions/${id}`, body.idempotencyKey, body);
    if (idem.replay) return idem.response;
    const action = await actionItemService.update(
      actorCtx(request, auth.userId),
      id,
      {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.ownerParticipantId !== undefined ? { ownerParticipantId: body.ownerParticipantId } : {}),
        ...(body.dueAt !== undefined ? { dueAt: body.dueAt } : {}),
      },
    );
    const response = { action };
    await storeIdempotency(auth.userId, `PATCH /api/actions/${id}`, body.idempotencyKey, body, response, 200);
    return response;
  });

  app.get('/api/actions', async (request) => {
    const auth = await requireUser(repos, request);
    const query = request.query as Record<string, string | undefined>;
    const actions = await actionItemService.listOpen(
      actorCtx(request, auth.userId),
      {
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.meetingId ? { meetingId: query.meetingId } : {}),
      },
    );
    return { actions };
  });

  /* ---------------------------- follow-ups ------------------------------- */

  app.post('/api/follow-ups', async (request, reply) => {
    const auth = await requireUser(repos, request);
    const body = createFollowUpRequestSchema.parse(request.body);
    const idem = await checkIdempotency(auth.userId, 'POST /api/follow-ups', body.idempotencyKey, body);
    if (idem.replay) {
      reply.status(200).send(idem.response);
      return;
    }
    const followUp = await followUpService.create(
      actorCtx(request, auth.userId),
      {
        sourceMeetingId: body.sourceMeetingId,
        targetMeetingId: body.targetMeetingId ?? null,
        scheduledAt: body.scheduledAt ?? null,
      },
    );
    const response = { followUp };
    await storeIdempotency(auth.userId, 'POST /api/follow-ups', body.idempotencyKey, body, response, 201);
    reply.status(201).send(response);
  });

  app.get('/api/follow-ups', async (request) => {
    await requireUser(repos, request);
    const query = request.query as Record<string, string | undefined>;
    if (query.sourceMeetingId) {
      return {
        followUps: await repos.followUps.listBySourceMeeting(query.sourceMeetingId),
      };
    }
    return { followUps: await repos.followUps.listAll() };
  });

  /* ----------------------------- proposals ------------------------------- */

  app.get('/api/proposals', async (request) => {
    await requireUser(repos, request);
    const query = request.query as Record<string, string | undefined>;
    const proposals = await repos.proposals.list({
      ...(query.status ? { status: query.status as 'pending' } : {}),
      ...(query.baseMeetingId ? { baseMeetingId: query.baseMeetingId } : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
    });
    return { proposals };
  });

  app.get('/api/proposals/:id', async (request) => {
    await requireUser(repos, request);
    const { id } = request.params as { id: string };
    const proposal = await repos.proposals.findById(id);
    if (!proposal) throw new AppError('NOT_FOUND', `Proposal ${id} not found`);
    return { proposal };
  });

  app.post('/api/proposals', async (request, reply) => {
    const auth = await requireUser(repos, request);
    const body = createProposalRequestSchema.parse(request.body);
    const proposal = await proposalService.createProposal(
      actorCtx(request, auth.userId),
      { kind: body.kind, payload: body.payload, rationale: body.rationale },
    );
    reply.status(201).send({ proposal });
  });

  app.post('/api/proposals/:id/revise', async (request) => {
    const auth = await requireUser(repos, request);
    const { id } = request.params as { id: string };
    const body = reviseProposalRequestSchema.parse(request.body);
    const proposal = await proposalService.reviseProposal(
      actorCtx(request, auth.userId),
      id,
      body.changes,
      body.rationale,
    );
    return { proposal };
  });

  /** Human-only approval (FR-3). Channel enforcement is inside the service. */
  app.post('/api/proposals/:id/approve', async (request) => {
    const auth = await requireUser(repos, request);
    rejectApprovalSpoofing(request);
    const proposal = await proposalService.approve(
      actorCtx(request, auth.userId),
      request.params ? (request.params as { id: string }).id : '',
    );
    return { proposal };
  });

  app.post('/api/proposals/:id/reject', async (request) => {
    const auth = await requireUser(repos, request);
    rejectApprovalSpoofing(request);
    const body = rejectProposalRequestSchema.parse(request.body);
    const proposal = await proposalService.reject(
      actorCtx(request, auth.userId),
      (request.params as { id: string }).id,
      body.reason,
    );
    return { proposal };
  });

  app.post('/api/proposals/:id/execute', async (request) => {
    const auth = await requireUser(repos, request);
    const body = executeProposalRequestSchema.parse(request.body);
    const idem = await checkIdempotency(auth.userId, 'execute-proposal', body.idempotencyKey, { proposalId: (request.params as { id: string }).id });
    if (idem.replay) return idem.response;
    const result = await proposalService.executeProposal(
      actorCtx(request, auth.userId),
      (request.params as { id: string }).id,
    );
    const response = { proposal: result.proposal, verification: result.verification };
    await storeIdempotency(auth.userId, 'execute-proposal', body.idempotencyKey, { proposalId: (request.params as { id: string }).id }, response, 200);
    return response;
  });

  app.post('/api/verify-meeting', async (request) => {
    const auth = await requireUser(repos, request);
    const body = verifyMeetingStateInputSchema.parse(request.body);
    const report = await proposalService.verifyMeetingState(
      actorCtx(request, auth.userId),
      body.meetingId,
      body.expectations,
    );
    return { verification: report };
  });

  /* --------------------------- availability ------------------------------ */

  app.post('/api/availability/search', async (request) => {
    const auth = await requireUser(repos, request);
    const body = searchSlotsRequestSchema.parse(request.body);
    const result = await availabilityService.findSlots(
      actorCtx(request, auth.userId),
      body,
    );
    return result;
  });

  app.post('/api/availability/check', async (request) => {
    const auth = await requireUser(repos, request);
    const body = checkSlotRequestSchema.parse(request.body);
    const result = await availabilityService.checkSlot(
      actorCtx(request, auth.userId),
      body,
    );
    return result;
  });

  app.get('/api/participants', async (request) => {
    await requireUser(repos, request);
    return { participants: await repos.participants.listAll() };
  });

  app.get('/api/projects', async (request) => {
    await requireUser(repos, request);
    const projects = await repos.projects.listAll();
    const withContext = await Promise.all(
      projects.map(async (project) => {
        const [meetings, actions] = await Promise.all([
          repos.meetings.list({ projectId: project.id }),
          repos.actions.listOpen({ projectId: project.id }),
        ]);
        return { ...project, openActionCount: actions.length, meetingCount: meetings.length };
      }),
    );
    return { projects: withContext };
  });

  app.get('/api/projects/:id', async (request) => {
    await requireUser(repos, request);
    const { id } = request.params as { id: string };
    const project = await repos.projects.findById(id);
    if (!project) throw new AppError('NOT_FOUND', `Project ${id} not found`);
    const meetings = await repos.meetings.list({ projectId: id });
    const actions = await repos.actions.listOpen({ projectId: id });
    const decisions = (await db.sql`select d.* from decisions d join meetings m on m.id = d.meeting_id where m.project_id = ${id} order by d.recorded_at desc limit 20`);
    return { project, meetings, actions, decisions };
  });

  /* ------------------------------ activity ------------------------------- */

  app.get('/api/decisions', async (request) => {
    await requireUser(repos, request);
    const query = request.query as Record<string, string | undefined>;
    if (query.meetingId) {
      const rows = await db.sql`select * from decisions where meeting_id = ${query.meetingId} order by recorded_at desc limit 50`;
      return { decisions: rows };
    }
    if (query.projectId) {
      const rows = await db.sql`select d.* from decisions d join meetings m on m.id = d.meeting_id where m.project_id = ${query.projectId} order by d.recorded_at desc limit 50`;
      return { decisions: rows };
    }
    const rows = await db.sql`select * from decisions order by recorded_at desc limit 50`;
    return { decisions: rows };
  });

  app.get('/api/activity', async (request) => {
    await requireUser(repos, request);
    const query = request.query as Record<string, string | undefined>;
    if (query.meetingId) {
      return {
        events: await repos.audit.listByEntity('meeting', query.meetingId, 50),
      };
    }
    if (query.proposalId) {
      return {
        events: await repos.audit.listByEntity('proposal', query.proposalId, 50),
      };
    }
    return { events: await repos.audit.listAll(50) };
  });

  /* --------------------------- demo seed/reset --------------------------- */

  app.post('/api/demo/reset', async (request, reply) => {
    resetDemoRequestSchema.parse(request.body ?? {});
    await resetToGoldenDemo(env.DATABASE_URL);
    const { sessionId, cookie } = await createSession(repos, env.DEMO_USER_ID);
    void sessionId;
    setSessionCookie(reply, cookie);
    reply.send({ ok: true, message: 'Golden demo state restored' });
  });

  app.post('/api/demo/seed', async () => {
    await runSeed(env.DATABASE_URL, { reset: false });
    return { ok: true };
  });

  void withTransaction;
  void createRepos;
}

/**
 * Defense-in-depth for the approval boundary: if any client (agent or script)
 * tries to smuggle approval fields into an approval/rejection request, reject
 * it loudly. Approval identity comes from the session, not the body.
 */
function rejectApprovalSpoofing(request: { body?: unknown }): void {
  if (request.body === null || request.body === undefined) return;
  if (typeof request.body !== 'object') return;
  const body = request.body as Record<string, unknown>;
  const spoofed = Object.keys(body).filter((k) => /approv/i.test(k) || k === 'status');
  if (spoofed.length > 0) {
    throw new AppError(
      'APPROVAL_FORBIDDEN',
      'Approval state cannot be supplied by the client; it is recorded by the application',
      { rejectedFields: spoofed },
    );
  }
}
