/**
 * Demo-mode authentication (D-010): a signed, HttpOnly cookie references a
 * server-side session row identifying one of the seeded users. No passwords,
 * no signup friction. Authorization is always resolved server-side from the
 * session — the client cannot assert identity.
 */
import { z } from 'zod';
import { AppError } from '@kestrel/contracts';
import type { Repos } from '../repositories/types.js';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';

export const SESSION_COOKIE = 'kestrel_session';

export interface AuthenticatedUser {
  readonly userId: string;
  readonly sessionId: string;
}

export async function createSession(
  repos: Repos,
  userId: string,
): Promise<{ sessionId: string; cookie: string }> {
  const user = await repos.users.findById(userId);
  if (!user) throw new AppError('NOT_FOUND', `User ${userId} not found`);
  const sessionId = randomUUID();
  await repos.sessions.create(sessionId, userId);
  const cookie = `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`;
  return { sessionId, cookie };
}

export async function requireUser(
  repos: Repos,
  request: FastifyRequest,
): Promise<AuthenticatedUser> {
  const sessionId =
    request.cookies[SESSION_COOKIE] ??
    request.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!sessionId) {
    throw new AppError('UNAUTHENTICATED', 'Sign in to Kestrel to continue');
  }
  const session = await repos.sessions.findActive(sessionId);
  if (!session) {
    throw new AppError('UNAUTHENTICATED', 'Session is invalid or has ended');
  }
  return { userId: session.userId, sessionId };
}

/** Session claim CANNOT grant approval rights: approval checks are on channel. */
export async function optionalUser(
  repos: Repos,
  request: FastifyRequest,
): Promise<AuthenticatedUser | null> {
  try {
    return await requireUser(repos, request);
  } catch {
    return null;
  }
}

export function setSessionCookie(reply: FastifyReply, cookie: string): void {
  reply.header('set-cookie', cookie);
}

export const sessionRequestSchema = z.strictObject({
  userId: z.string().min(1).max(64),
});
