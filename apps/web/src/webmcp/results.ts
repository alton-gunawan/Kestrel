/**
 * Tool result envelope for every MeetingOps WebMCP tool.
 * Success: { ok: true, data, context: { requestId } }
 * Failure: { ok: false, error: { code, message, details? }, context: { requestId } }
 * No fabricated state: data is exactly what the API returned.
 */
import { ApiError, apiFetch, type Channel } from '../api/client';

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string; details?: unknown };
  context: { requestId?: string; channel: Channel };
}

export async function callToolApi<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<ToolResult> {
  try {
    const data = await apiFetch<T>(method, path, body, 'webmcp');
    return { ok: true, data, context: { channel: 'webmcp' } };
  } catch (err) {
    if (err instanceof ApiError) {
      return {
        ok: false,
        error: { code: err.code, message: err.message, details: err.details },
        context: { channel: 'webmcp' },
      };
    }
    return {
      ok: false,
      error: { code: 'UNAVAILABLE', message: 'MeetingOps API is unreachable' },
      context: { channel: 'webmcp' },
    };
  }
}

/** JSON Schema helper: closed objects (additionalProperties: false). */
export function obj(properties: Record<string, unknown>, required: string[] = []): object {
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
}

export const str = (description: string): object => ({ type: 'string', description });
export const num = (description: string): object => ({ type: 'number', description });
export const bool = (description: string): object => ({ type: 'boolean', description });
export const arr = (items: object, description: string): object => ({
  type: 'array',
  items,
  description,
});
