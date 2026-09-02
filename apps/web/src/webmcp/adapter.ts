/**
 * WebMCP tool adapter: binds the 20 catalog tool definitions to real API
 * execution via document.modelContext.registerTool. This is the only place
 * WebMCP tools are born; nothing fakes execution or verification.
 *
 * Safety model (docs/02_WEBMCP_SPEC.md):
 * - No `approve_proposal` tool exists. Approval is a human UI action.
 * - Executing mutating tools without an approved proposalId returns the
 *   server's PROPOSAL_NOT_APPROVED error — surfaced verbatim, not masked.
 * - Tool results use the { ok, data | error, context } envelope.
 */
import { getToolDefinition, REQUIRED_TOOL_NAMES, type ToolDefinition } from '@meetingops/contracts';

import { callToolApi } from './results';

/* ---------------------- JSON-Schema conversion ------------------------- */
/* The catalog carries JSON Schemas derived from the Zod input schemas. We
   re-use them so the browser schema and server schema cannot drift. */

function catalogSchemaToWebMcp(schema: Record<string, unknown>): object {
  // ModelContextTool.inputSchema is the same JSON Schema dialect; pass a
  // deep copy so callers cannot mutate catalog state.
  return structuredClone(schema) as object;
}

/* ------------------------------ executors ------------------------------ */

type Executor = (input: Record<string, unknown>) => Promise<unknown>;

const executors: Record<string, Executor> = {
  /* ------------------------------ reads ------------------------------ */
  get_today_overview: () => callToolApi('GET', '/api/overview'),
  get_meeting: (i) => callToolApi('GET', `/api/meetings/${encodeURIComponent(String(i.meetingId))}`),
  get_calendar_context: (i) =>
    callToolApi('GET', `/api/meetings?filter=all&from=${encodeURIComponent(String(i.dateFrom))}&to=${encodeURIComponent(String(i.dateTo))}`),
  find_available_slots: (i) =>
    callToolApi('POST', '/api/availability/search', {
      participantIds: i.participantIds,
      dateFrom: i.dateFrom,
      dateTo: i.dateTo,
      durationMinutes: i.durationMinutes,
    }),
  get_project_context: (i) => callToolApi('GET', `/api/projects/${encodeURIComponent(String(i.projectId))}`),
  get_open_actions: (i) => {
    const params = new URLSearchParams();
    if (typeof i.projectId === 'string') params.set('projectId', i.projectId);
    if (typeof i.meetingId === 'string') params.set('meetingId', i.meetingId);
    const qs = params.toString();
    return callToolApi('GET', `/api/actions${qs ? `?${qs}` : ''}`);
  },
  get_decisions: (i) => {
    const params = new URLSearchParams();
    if (typeof i.meetingId === 'string') params.set('meetingId', i.meetingId);
    if (typeof i.projectId === 'string') params.set('projectId', i.projectId);
    const qs = params.toString();
    return callToolApi('GET', `/api/decisions${qs ? `?${qs}` : ''}`);
  },
  get_meeting_activity: (i) => callToolApi('GET', `/api/activity?meetingId=${encodeURIComponent(String(i.meetingId))}`),

  /* ---------------------------- proposals ---------------------------- */
  prepare_meeting_proposal: (i) =>
    callToolApi('POST', '/api/proposals', {
      kind: 'meeting_create',
      rationale: String(i.rationale),
      payload: {
        kind: 'meeting_create',
        payload: {
          title: i.title,
          purpose: i.purpose,
          projectId: i.projectId,
          startAt: i.startAt,
          durationMinutes: i.durationMinutes,
          participants: i.participants,
          agenda: i.agenda,
        },
      },
    }),
  update_meeting_proposal: (i) =>
    callToolApi('POST', `/api/proposals/${encodeURIComponent(String(i.proposalId))}/revise`, {
      changes: i.changes,
      rationale: String(i.rationale),
    }),
  prepare_agenda_proposal: (i) =>
    callToolApi('POST', '/api/proposals', {
      kind: 'agenda',
      rationale: String(i.rationale),
      payload: {
        kind: 'agenda',
        payload: { meetingId: i.meetingId, items: i.items },
      },
    }),
  prepare_followup_proposal: (i) =>
    callToolApi('POST', '/api/proposals', {
      kind: 'followup',
      rationale: String(i.rationale),
      payload: {
        kind: 'followup',
        payload: {
          sourceMeetingId: i.sourceMeetingId,
          proposedScheduledAt: i.proposedScheduledAt,
          note: i.note,
        },
      },
    }),

  /* ------------------- approval-gated executions --------------------- */
  create_meeting: (i) =>
    callToolApi('POST', `/api/proposals/${encodeURIComponent(String(i.proposalId))}/execute`, {
      idempotencyKey: String(i.idempotencyKey),
    }),
  update_meeting: (i) =>
    callToolApi('POST', `/api/proposals/${encodeURIComponent(String(i.proposalId))}/execute`, {
      idempotencyKey: String(i.idempotencyKey),
    }),
  create_agenda_item: (i) =>
    callToolApi('POST', `/api/proposals/${encodeURIComponent(String(i.proposalId))}/execute`, {
      idempotencyKey: String(i.idempotencyKey),
    }),
  schedule_followup: (i) =>
    callToolApi('POST', `/api/proposals/${encodeURIComponent(String(i.proposalId))}/execute`, {
      idempotencyKey: String(i.idempotencyKey),
    }),

  /* -------------------- propose-or-execute (D-004) ------------------- */
  record_decision: (i) =>
    i.proposalId !== undefined
      ? callToolApi('POST', `/api/proposals/${encodeURIComponent(String(i.proposalId))}/execute`, {
          idempotencyKey: String(i.idempotencyKey),
        })
      : callToolApi('POST', `/api/proposals`, {
          kind: 'outcome',
          rationale: String(i.rationale),
          payload: {
            kind: 'outcome',
            payload: {
              op: 'record_decision',
              meetingId: i.meetingId,
              title: i.title,
              outcome: i.outcome,
            },
          },
        }),
  create_action_item: (i) =>
    i.proposalId !== undefined
      ? callToolApi('POST', `/api/proposals/${encodeURIComponent(String(i.proposalId))}/execute`, {
          idempotencyKey: String(i.idempotencyKey),
        })
      : callToolApi('POST', '/api/proposals', {
          kind: 'outcome',
          rationale: String(i.rationale),
          payload: {
            kind: 'outcome',
            payload: {
              op: 'create_action_item',
              meetingId: i.meetingId,
              title: i.title,
              ownerParticipantId: i.ownerParticipantId,
              projectId: i.projectId,
              dueAt: i.dueAt,
            },
          },
        }),
  assign_action_item: (i) =>
    i.proposalId !== undefined
      ? callToolApi('POST', `/api/proposals/${encodeURIComponent(String(i.proposalId))}/execute`, {
          idempotencyKey: String(i.idempotencyKey),
        })
      : callToolApi('POST', '/api/proposals', {
          kind: 'outcome',
          rationale: String(i.rationale),
          payload: {
            kind: 'outcome',
            payload: {
              op: 'assign_action_item',
              actionItemId: i.actionItemId,
              ownerParticipantId: i.ownerParticipantId,
              dueAt: i.dueAt,
            },
          },
        }),

  /* ---------------------------- verify ------------------------------- */
  verify_meeting_state: (i) =>
    callToolApi('POST', '/api/verify-meeting', {
      meetingId: i.meetingId,
      expectations: i.expectations,
    }),
};

/* --------------------------- registration ------------------------------ */

export interface WebmcpRegistrationResult {
  mode: 'native' | 'polyfill' | 'unavailable';
  registeredTools: string[];
  errors: string[];
}

export function isWebmcpNativelySupported(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof (document as { modelContext?: unknown }).modelContext === 'object' &&
    (document as { modelContext?: unknown }).modelContext !== null &&
    typeof (window as { __MEETINGOPS_WEBMCP_POLYFILL?: true }).__MEETINGOPS_WEBMCP_POLYFILL === 'undefined'
  );
}

export async function registerAllTools(): Promise<WebmcpRegistrationResult> {
  const errors: string[] = [];
  const registeredTools: string[] = [];

  const modelContext = document.modelContext;
  if (!modelContext) {
    return { mode: 'unavailable', registeredTools, errors: ['document.modelContext is not available'] };
  }

  for (const name of REQUIRED_TOOL_NAMES) {
    const def = getToolDefinition(name) as ToolDefinition;
    if (!def) {
      errors.push(`No catalog definition for tool ${name}`);
      continue;
    }
    const executor = executors[name];
    if (!executor) {
      errors.push(`No executor bound for tool ${name}`);
      continue;
    }
    const tool: WebMCP.ModelContextTool = {
      name: def.name,
      title: def.title,
      description: def.description,
      inputSchema: catalogSchemaToWebMcp(def.inputSchema),
      annotations: { ...def.annotations },
      execute: (inputObject: Record<string, unknown>) => executor(inputObject),
    };
    try {
      await modelContext.registerTool(tool);
      registeredTools.push(def.name);
    } catch (err) {
      errors.push(`registerTool(${def.name}) failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    mode: isWebmcpNativelySupported() ? 'native' : 'polyfill',
    registeredTools,
    errors,
  };
}
