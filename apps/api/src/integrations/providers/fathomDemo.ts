/**
 * Demo MeetingIntelligenceProvider (Fathom) — deterministic, local.
 *
 * Proves the meeting-intelligence lifecycle (transcript/summary/action items
 * + webhook subscription) WITHOUT a real Fathom account. Raw outputs are
 * UNTRUSTED until validated by the ingestion pipeline (canonical.ts).
 * Webhook delivery is simulated: the app's webhook ingestion endpoint is the
 * same one a real provider would call.
 */
import type { MeetingIntelligenceProvider } from '../types.js';
import type { TranscriptInput } from '@kestrel/contracts';

export const FATHOM_DEMO_META = {
  providerId: 'fathom',
  displayName: 'Fathom',
  description:
    'Meeting intelligence: transcript, summary, action items, webhook delivery. Demo adapter — no real Fathom account or recording is accessed.',
  capabilities: ['meeting_intelligence'],
  demo: true,
} as const;

/** Deterministic demo transcript for the golden scenario's launch review. */
export function demoTranscript(externalMeetingId: string): TranscriptInput {
  const nowIso = new Date().toISOString();
  return {
    providerId: 'fathom',
    externalMeetingId,
    meetingTitle: 'Launch review',
    startedAt: nowIso,
    endedAt: nowIso,
    transcript:
      'Reviewing launch blockers. Payment integration still blocked on the billing provider. ' +
      'Data migration is 80% complete. Pricing was already decided last week.',
    summary:
      'Payment integration blocker remains open; data migration nearly complete. ' +
      'Pricing is decided and must not be reopened.',
    rawActionItems: [
      { title: 'Resolve payment integration blocker', ownerName: 'Sarah Chen', dueLabel: 'Friday' },
      { title: 'Finish data migration', ownerName: 'Daniel Osei', dueLabel: 'Friday' },
    ],
    rawDecisions: [
      { title: 'Pricing model', outcome: 'Usage-based pricing approved with launch discount — do not reopen.' },
    ],
    metadata: { demo: true, source: 'fathom-demo-adapter' },
  };
}

export class FathomDemoProvider implements MeetingIntelligenceProvider {
  readonly meta = FATHOM_DEMO_META;

  async getMeeting(externalMeetingId: string) {
    return { id: externalMeetingId, title: 'Launch review' };
  }

  async getTranscript(externalMeetingId: string): Promise<TranscriptInput> {
    return demoTranscript(externalMeetingId);
  }

  async getSummary(externalMeetingId: string): Promise<string> {
    return demoTranscript(externalMeetingId).summary ?? '';
  }

  async getActionItems(externalMeetingId: string) {
    return demoTranscript(externalMeetingId).rawActionItems;
  }

  async subscribeWebhook(input: { webhookUrl: string }) {
    // Simulated subscription; real delivery would hit our webhook endpoint.
    return { subscriptionId: `demo_fathom_sub_${input.webhookUrl.length}` };
  }
}
