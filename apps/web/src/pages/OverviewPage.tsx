/**
 * Overview page: answers "what needs my attention?" (US-1, DEMO-3).
 */
import { Link } from 'react-router';
import { Text, Button } from '@astryxdesign/core';
import { api } from '../api/client';
import type { Overview } from '../api/client';
import { useAsync, formatDateTime, formatRelative } from '../ui/helpers';
import { PageHeader, LoadingState, ErrorState, EmptyStateInline, StatusChip } from '../ui/components';
import { sx } from '../ui/sx';
import * as styles from '../styles/app.styles';

export function OverviewPage() {
  const overview = useAsync<Overview>(() => api.overview(), []);

  return (
    <div className={sx(styles.page)}>
      <PageHeader
        title="Overview"
        subtitle="What needs attention today"
        actions={
          <Button label="Refresh" variant="secondary" size="sm" onClick={overview.reload} />
        }
      />

      {overview.loading && <LoadingState label="Loading overview" />}
      {overview.error !== null && (
        <ErrorState message={overview.error} errorCode={overview.errorCode} onRetry={overview.reload} />
      )}

      {overview.data !== null && (
        <>
          <div className={sx(styles.statGrid)}>
            <div className={sx(styles.statCard)}>
              <div className={sx(styles.statValue)}>{overview.data.overdueActions.length}</div>
              <div className={sx(styles.statLabel)}>Overdue actions</div>
            </div>
            <div className={sx(styles.statCard)}>
              <div className={sx(styles.statValue)}>{overview.data.needsPreparation.length}</div>
              <div className={sx(styles.statLabel)}>Meetings needing preparation</div>
            </div>
            <div className={sx(styles.statCard)}>
              <div className={sx(styles.statValue)}>{overview.data.pendingProposalsCount}</div>
              <div className={sx(styles.statLabel)}>Pending proposals</div>
            </div>
            <div className={sx(styles.statCard)}>
              <div className={sx(styles.statValue)}>{overview.data.today}</div>
              <div className={sx(styles.statLabel)}>Today (server date)</div>
            </div>
          </div>

          <div className={sx(styles.sectionGap)}>
            <Text size="lg" weight="semibold">
              Next meeting
            </Text>
            {overview.data.nextMeeting === null ? (
              <EmptyStateInline message="No upcoming meetings this week." />
            ) : (
              <Link to={`/meetings/${overview.data.nextMeeting.id}`} style={{ textDecoration: 'none' }}>
                <div className={sx(styles.cardRow)}>
                  <div className={sx(styles.cardRowMain)}>
                    <Text weight="semibold">{overview.data.nextMeeting.title}</Text>
                    <Text size="sm" color="secondary">
                      {formatDateTime(overview.data.nextMeeting.startAt)} ·{' '}
                      {formatRelative(overview.data.nextMeeting.startAt)} ·{' '}
                      {overview.data.nextMeeting.durationMinutes} min
                    </Text>
                  </div>
                  <StatusChip status={overview.data.nextMeeting.status} />
                </div>
              </Link>
            )}

            <Text size="lg" weight="semibold">
              Overdue actions
            </Text>
            {overview.data.overdueActions.length === 0 ? (
              <EmptyStateInline message="Nothing overdue. 🎉" />
            ) : (
              overview.data.overdueActions.map((action) => (
                <Link key={action.id} to={`/meetings/${action.meetingId}`} style={{ textDecoration: 'none' }}>
                  <div className={sx(styles.cardRow)}>
                    <div className={sx(styles.cardRowMain)}>
                      <Text weight="semibold">{action.title}</Text>
                      <Text size="sm" color="secondary">
                        due {action.dueAt !== null ? formatRelative(action.dueAt) : '—'}
                      </Text>
                    </div>
                    <StatusChip status={action.status} />
                  </div>
                </Link>
              ))
            )}

            <Text size="lg" weight="semibold">
              Needs preparation
            </Text>
            {overview.data.needsPreparation.length === 0 ? (
              <EmptyStateInline message="All upcoming meetings have agendas." />
            ) : (
              overview.data.needsPreparation.map((m) => (
                <Link key={m.meetingId} to={`/meetings/${m.meetingId}`} style={{ textDecoration: 'none' }}>
                  <div className={sx(styles.cardRow)}>
                    <div className={sx(styles.cardRowMain)}>
                      <Text weight="semibold">{m.meetingTitle}</Text>
                      <Text size="sm" color="secondary">
                        {m.agendaCount} agenda item{m.agendaCount === 1 ? '' : 's'}
                      </Text>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
