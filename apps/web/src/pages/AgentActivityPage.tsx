/**
 * Agent activity (US-10): REAL audit events only — read from the audit log,
 * never fabricated. Tab "decisions" shows the decisions feed.
 */
import { Link } from 'react-router';
import { Text } from '@astryxdesign/core';
import { api } from '../api/client';
import type { AuditEvent, Decision } from '../api/client';
import { useAsync, formatDateTime } from '../ui/helpers';
import { PageHeader, LoadingState, ErrorState, EmptyStateInline } from '../ui/components';
import { sx } from '../ui/sx';
import * as styles from '../styles/app.styles';

export function AgentActivityPage({ tab }: { tab: 'activity' | 'decisions' }): React.ReactNode {
  const events = useAsync<AuditEvent[]>(async () => (await api.activity()).events, []);
  const decisions = useAsync<Decision[]>(async () => (await api.decisions()).decisions, []);

  return (
    <div className={sx(styles.page)}>
      <PageHeader
        title={tab === 'activity' ? 'Agent activity' : 'Decisions'}
        subtitle={
          tab === 'activity'
            ? 'Real audit trail — every agent and human action recorded at the API. No fabricated entries.'
            : 'Recorded decisions, newest first.'
        }
      />

      {tab === 'activity' && (
        <>
          {events.loading && <LoadingState label="Loading audit trail" />}
          {events.error !== null && (
            <ErrorState message={events.error} errorCode={events.errorCode} onRetry={events.reload} />
          )}
          {events.data !== null &&
            (events.data.length === 0 ? (
              <EmptyStateInline message="No audit events yet." />
            ) : (
              <div className={sx(styles.sectionGap)}>
                {events.data.map((e) => (
                  <div key={e.id} className={sx(styles.cardRow)}>
                    <div className={sx(styles.cardRowMain)}>
                      <Text size="sm" weight="semibold">
                        {e.action}
                      </Text>
                      <Text size="2xs" color="secondary">
                        actor {e.actorType} ({e.actorRef}) · channel {e.channel} · {e.entityType}{' '}
                        {e.entityId}
                        {e.requestId !== null ? ` · req ${e.requestId.slice(0, 12)}` : ''}
                      </Text>
                    </div>
                    <Text size="2xs" color="secondary">
                      {formatDateTime(e.createdAt)}
                    </Text>
                  </div>
                ))}
              </div>
            ))}
        </>
      )}

      {tab === 'decisions' && (
        <>
          {decisions.loading && <LoadingState label="Loading decisions" />}
          {decisions.error !== null && (
            <ErrorState message={decisions.error} errorCode={decisions.errorCode} onRetry={decisions.reload} />
          )}
          {decisions.data !== null &&
            (decisions.data.length === 0 ? (
              <EmptyStateInline message="No decisions recorded yet." />
            ) : (
              <div className={sx(styles.sectionGap)}>
                {decisions.data.map((d) => (
                  <Link key={d.id} to={`/meetings/${d.meetingId}`} style={{ textDecoration: 'none' }}>
                    <div className={sx(styles.cardRow)}>
                      <div className={sx(styles.cardRowMain)}>
                        <Text weight="semibold">{d.title}</Text>
                        <Text size="sm">{d.outcome}</Text>
                        <Text size="2xs" color="secondary">
                          {formatDateTime(d.recordedAt)}
                        </Text>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ))}
        </>
      )}
    </div>
  );
}
