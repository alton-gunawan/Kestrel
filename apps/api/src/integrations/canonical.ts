/**
 * Canonical mapping — converts provider-specific objects into canonical
 * Kestrel concepts (doc section 5: the domain model never knows
 * "Fathom Action Items"; provider objects map to TranscriptInput, Decision,
 * ActionItem, FollowUp, ExternalReference).
 *
 * Raw provider outputs are UNTRUSTED. Every mapping step validates with Zod
 * and never produces committed business state by itself — it produces
 * proposal-ready inputs that still require human review/approval.
 */
import {
  calendarContextSchema,
  transcriptInputSchema,
  type CalendarContext,
  type TranscriptInput,
} from '@kestrel/contracts';

/** Parse + validate an untrusted meeting-intelligence webhook payload. */
export function parseTranscriptInput(raw: unknown): TranscriptInput {
  const parsed = transcriptInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new TypeError(`Invalid meeting-intelligence payload: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
  }
  return parsed.data;
}

/** Parse + validate an untrusted calendar context payload. */
export function parseCalendarContext(raw: unknown): CalendarContext {
  const parsed = calendarContextSchema.safeParse(raw);
  if (!parsed.success) {
    throw new TypeError(`Invalid calendar context payload: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
  }
  return parsed.data;
}

/** Proposal-ready extraction from a validated transcript (analysis layer). */
export interface TranscriptAnalysis {
  readonly decisions: readonly { title: string; outcome: string }[];
  readonly actionItems: readonly { title: string; ownerHint?: string; dueLabel?: string }[];
  readonly summary: string | null;
}

/**
 * Deterministic analysis of a transcript into proposal-ready outcomes.
 * This is NOT committed state — it feeds proposals that a human reviews.
 * Raw text is treated as data, never as instructions (prompt-injection
 * boundary): titles/outcomes are bounded and rendered as inert text.
 */
export function analyzeTranscript(input: TranscriptInput): TranscriptAnalysis {
  return {
    decisions: input.rawDecisions.map((d) => ({
      title: d.title.slice(0, 200),
      outcome: d.outcome.slice(0, 4000),
    })),
    actionItems: input.rawActionItems.map((a) => ({
      title: a.title.slice(0, 200),
      ownerHint: a.ownerName ? a.ownerName.slice(0, 120) : undefined,
      dueLabel: a.dueLabel ? a.dueLabel.slice(0, 120) : undefined,
    })),
    summary: input.summary,
  };
}

/** Deterministic hash for idempotent webhook ingestion (FNV-1a variant). */
export function payloadHash(payload: unknown): string {
  let hash = 0x811c9dc5;
  const input = JSON.stringify(payload ?? null);
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
