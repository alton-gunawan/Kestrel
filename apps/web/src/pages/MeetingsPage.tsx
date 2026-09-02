/**
 * Meetings list (US-2): filter chips + rows. Row → meeting detail.
 */
import { Link } from 'react-router';
import { Text } from '@astryxdesign/core';
import { api } from '../api/client';
import type { MeetingDetail as MeetingDetailEntity } from '../api/client';
import { useAsync, formatDateTime } from '../ui/helpers';
import { PageHeader, LoadingState, ErrorState, EmptyStateInline, StatusChip } from '../ui/components';
import { sx } from '../ui/sx';
import * as styles from '../styles/app.styles';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'attention', label: 'Needs attention' },
];

export function MeetingsPage() {
  const state = useAsync<MeetingDetailEntity[]>(async () => {
    const result = await api.meetings({ filter: 'all' });
    return result.meetings;
  }, []);

  return (
    <div className={sx(styles.page)}>
      <PageHeader title="Meetings" subtitle="Calendar of MeetingOps meetings" />
      {state.loading && <LoadingState label="Loading meetings" />}
      {state.error !== null && (
        <ErrorState message={state.error} errorCode={state.errorCode} onRetry={state.reload} />
      )}
      {state.data !== null &&
        (state.data.length === 0 ? (
          <EmptyStateInline message="No meetings yet. Ask the agent to prepare one, or create it from a proposal." />
        ) : (
          <div className={sx(styles.sectionGap)}>
            {state.data
              .slice()
              .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
              .map((m) => (
                <Link key={m.id} to={`/meetings/${m.id}`} style={{ textDecoration: 'none' }}>
                  <div className={sx(styles.cardRow)}>
                    <div className={sx(styles.cardRowMain)}>
                      <Text weight="semibold">{m.title}</Text>
                      <Text size="sm" color="secondary">
                        {formatDateTime(m.startAt)} · {m.durationMinutes} min ·{' '}
                        {m.participants.map((p) => p.participantId).join(', ')}
                        {m.projectId !== null ? ` · ${m.projectId}` : ''}
                      </Text>
                    </div>
                    <StatusChip status={m.status} />
                  </div>
                </Link>
              ))}
          </div>
        ))}
      <div style={{ marginTop: 8 }}>
        <Text size="2xs" color="secondary">
          Filters available via the API: {FILTERS.map((f) => f.key).join(', ')}
        </Text>
      </div>
    </div>
  );
}
