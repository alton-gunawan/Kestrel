/**
 * Stable error codes shared by the REST API and the WebMCP tool result
 * contract. Codes are machine-readable and must never change meaning once
 * released. See docs/03_DOMAIN_DATA_API.md ("Stable error codes") and
 * docs/02_WEBMCP_SPEC.md (failure result shape).
 */
export const ERROR_CODES = [
  // Request problems
  'VALIDATION_ERROR',
  'UNKNOWN_FIELD',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'RATE_LIMITED',
  // Domain state problems
  'CONFLICT',
  'STALE_REVISION',
  'INVALID_STATE',
  'INVALID_TIME',
  // Approval / proposal safety
  'PROPOSAL_NOT_APPROVED',
  'PROPOSAL_NOT_PENDING',
  'STALE_PROPOSAL',
  'PROPOSAL_SUPERSEDED',
  'PROPOSAL_ALREADY_EXECUTED',
  'PROPOSAL_REJECTED',
  'APPROVAL_FORBIDDEN',
  'VERIFICATION_FAILED',
  // Idempotency
  'IDEMPOTENCY_CONFLICT',
  'IDEMPOTENT_REPLAY',
  // Infrastructure
  'UNAVAILABLE',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
}

/** HTTP status mapping. Centralized so API + WebMCP error surfaces agree. */
export const HTTP_STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNKNOWN_FIELD: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  RATE_LIMITED: 429,
  CONFLICT: 409,
  STALE_REVISION: 409,
  INVALID_STATE: 409,
  INVALID_TIME: 422,
  PROPOSAL_NOT_APPROVED: 409,
  PROPOSAL_NOT_PENDING: 409,
  STALE_PROPOSAL: 409,
  PROPOSAL_SUPERSEDED: 409,
  PROPOSAL_ALREADY_EXECUTED: 409,
  PROPOSAL_REJECTED: 409,
  APPROVAL_FORBIDDEN: 403,
  VERIFICATION_FAILED: 500,
  IDEMPOTENCY_CONFLICT: 409,
  IDEMPOTENT_REPLAY: 200,
  UNAVAILABLE: 503,
  INTERNAL: 500,
};

/** A structured, safe-to-serialize domain error. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }

  toJSON(): { code: ErrorCode; message: string; details?: Record<string, unknown> } {
    return {
      code: this.code,
      message: this.message,
      ...(this.details !== undefined ? { details: this.details } : {}),
    };
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
