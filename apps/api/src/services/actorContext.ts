/**
 * Execution context: who is acting, through which channel. The user comes
 * from the server-side session; the channel is non-authoritative metadata
 * used only for audit/actor classification (D-011). Authorization NEVER
 * depends on it — the channel cannot grant permissions the session lacks.
 */
export type Channel = 'ui' | 'webmcp' | 'system';

export interface ActorContext {
  /** Authenticated user id (from signed session cookie, server-side only). */
  readonly userId: string;
  readonly requestId: string;
  readonly channel: Channel;
}

export function actorTypeFor(ctx: ActorContext): 'human' | 'agent' | 'system' {
  if (ctx.channel === 'webmcp') return 'agent';
  if (ctx.channel === 'system') return 'system';
  return 'human';
}

export function actorRefFor(ctx: ActorContext): string {
  return `user:${ctx.userId}`;
}

/** Context for internal deterministic checks (never audits, never authorizes). */
export const SYSTEM_CONTEXT: ActorContext = {
  userId: 'system',
  requestId: 'internal',
  channel: 'system',
};

/**
 * Build the actor context for an HTTP request: user from the server-side
 * session; channel from the non-authoritative X-MeetingOps-Channel header
 * (D-011). The channel is audit metadata only — it never grants
 * authorization.
 */
export function requestActorCtx(
  request: { id: string; headers: Record<string, string | string[] | undefined> },
  userId: string,
): ActorContext {
  const raw = request.headers['x-meetingops-channel'];
  const channelRaw = Array.isArray(raw) ? raw[0] : raw;
  const channel: Channel = channelRaw === 'webmcp' ? 'webmcp' : 'ui';
  return { userId, requestId: request.id, channel };
}
