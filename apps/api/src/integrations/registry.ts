/**
 * Provider registry — the only place provider instances are born.
 *
 * Providers are constructed with their capability dependencies (repositories
 * / services), never with direct database handles. The registry exposes:
 * - the provider catalog (user-facing Integrations UI),
 * - capability lookup ("who provides calendar?"),
 * - instance lookup by providerId.
 */
import type { IntegrationProviderId, ProviderCapability } from '@kestrel/contracts';
import type { Repos } from '../repositories/types.js';
import type { AnyProvider, ProviderMeta } from './types.js';
import { GoogleCalendarDemoProvider, GOOGLE_CALENDAR_DEMO_META } from './providers/googleCalendarDemo.js';
import { FathomDemoProvider, FATHOM_DEMO_META } from './providers/fathomDemo.js';
import { AvailabilityService } from '../services/meetingService.js';

export class ProviderRegistry {
  private readonly providers: Map<IntegrationProviderId, AnyProvider>;

  constructor(repos: Repos) {
    const availability = new AvailabilityService(repos);
    this.providers = new Map<IntegrationProviderId, AnyProvider>([
      [
        'google_calendar',
        new GoogleCalendarDemoProvider({
          busyProvider: async (dateFrom, dateTo) => {
            // Local domain model: existing meetings in the range → busy.
            const meetings = await repos.meetings.list({
              from: dateFrom,
              to: dateTo,
            });
            return meetings
              .filter((m) => m.status !== 'cancelled')
              .map((m) => ({
                startAt: m.startAt,
                endAt: new Date(Date.parse(m.startAt) + m.durationMinutes * 60_000).toISOString(),
                title: m.title,
              }));
          },
          slotsProvider: async (input) => {
            const result = await availability.findSlots(
              { userId: 'system', requestId: 'integration', channel: 'system' },
              input,
            );
            return result.slots;
          },
        }),
      ],
      [
        'fathom',
        new FathomDemoProvider(),
      ],
    ]);
  }

  catalog(): ProviderMeta[] {
    return [...this.providers.values()].map((p) => p.meta);
  }

  get(providerId: IntegrationProviderId): AnyProvider | undefined {
    return this.providers.get(providerId);
  }

  has(providerId: IntegrationProviderId): boolean {
    return this.providers.has(providerId);
  }

  byCapability(capability: ProviderCapability): ProviderMeta[] {
    return this.catalog().filter((m) => m.capabilities.includes(capability));
  }

  /** Catalog entry for providers that are declared but not implemented yet. */
  static declaredButUnimplemented(): ProviderMeta[] {
    return [
      {
        providerId: 'slack',
        displayName: 'Slack',
        description: 'Communication: notifications and follow-up delivery (P1). Not implemented in MVP.',
        capabilities: ['communication'],
        demo: false,
      },
      {
        providerId: 'linear',
        displayName: 'Linear',
        description: 'Project: issue context and approved action execution (P1). Not implemented in MVP.',
        capabilities: ['project'],
        demo: false,
      },
      {
        providerId: 'microsoft_outlook',
        displayName: 'Microsoft Outlook',
        description: 'Alternative calendar provider (P1/P2). Not implemented in MVP.',
        capabilities: ['calendar'],
        demo: false,
      },
      {
        providerId: 'fireflies',
        displayName: 'Fireflies.ai',
        description: 'Alternative meeting intelligence provider (P1/P2). Not implemented in MVP.',
        capabilities: ['meeting_intelligence'],
        demo: false,
      },
      {
        providerId: 'zoom',
        displayName: 'Zoom',
        description: 'Meeting platform capability (P2). Not implemented in MVP.',
        capabilities: ['meeting_platform'],
        demo: false,
      },
      {
        providerId: 'zapier',
        displayName: 'Zapier',
        description: 'Automation: long-tail integrations (P2+). Not implemented in MVP.',
        capabilities: ['automation'],
        demo: false,
      },
    ];
  }
}

export { GOOGLE_CALENDAR_DEMO_META, FATHOM_DEMO_META };
