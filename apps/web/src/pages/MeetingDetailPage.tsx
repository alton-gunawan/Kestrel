/**
 * Meeting detail (US-3..US-5): tabs Overview / Agenda / Outcomes / Follow-up.
 * Shows real audit trail, real proposals for this meeting, honest states.
 */
import { useParams, Link } from 'react-router';
import { useState } from 'react';
import { Text, TextArea, Dialog, DialogHeader, useToast } from '@astryxdesign/core';
import { api } from '../api/client';
import type { MeetingDetail as MeetingDetailEntity, AuditEvent, Proposal } from '../api/client';
import { useAsync, formatDateTime, formatRelative } from '../ui/helpers';
import { PageHeader, LoadingState, ErrorState, EmptyStateInline, StatusChip } from '../ui/components';
import { sx } from '../ui/sx';
import * as styles from '../styles/app.styles';

type TabKey = 'overview' | 'agenda' | 'outcomes' | 'followup';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'agenda', label: 'Agenda' },
  { key: 'outcomes', label: 'Outcomes' },
  { key: 'followup', label: 'Follow-up' },
];

export function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<TabKey>('overview');
  const detail = useAsync<MeetingDetailEntity>(
    () => api.meeting(id ?? ''),
    [id],
  );
  const activity = useAsync<AuditEvent[]>(
    async () => (await api.activity({ meetingId: id ?? '' })).events,
    [id],
  );
  const proposals = useAsync<Proposal[]>(
    async () => (await api.proposals({ baseMeetingId: id ?? '' })).proposals,
    [id],
  );

  if (detail.loading) return <LoadingState label="Loading meeting" />;
  if (detail.error !== null || detail.data === null) {
    return (
      <ErrorState
        message={detail.error ?? 'Not found'}
        errorCode={detail.errorCode}
        onRetry={detail.reload}
      />
    );
  }

  const m = detail.data;

  return (
    <div className={sx(styles.page)}>
      <PageHeader
        title={m.title}
        subtitle={`${formatDateTime(m.startAt)} · ${m.durationMinutes} min · revision ${m.revision}`}
        actions={<StatusChip status={m.status} />}
      />
      {m.projectId !== null && (
        <div style={{ marginBottom: 12 }}>
          <Link to={`/projects/${m.projectId}`}>
            <Text size="sm">Project {m.projectId} →</Text>
          </Link>
        </div>
      )}

      <div className={sx(styles.tabBar)} role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={sx(styles.tab.root, tab === t.key && styles.tab.selected)}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className={sx(styles.detailGrid)}>
          <Text weight="semibold">Purpose</Text>
          <Text size="sm">{m.purpose === '' ? '—' : m.purpose}</Text>
          <Text weight="semibold">Participants</Text>
          {m.participants.map((p) => (
            <div key={p.participantId} className={sx(styles.metaRow)}>
              <Text size="sm">
                {p.participantId} · {p.role} · {p.response}
              </Text>
            </div>
          ))}
          <Text weight="semibold">Decisions ({m.decisions.length})</Text>
          {m.decisions.length === 0 ? (
            <EmptyStateInline message="No decisions recorded yet." />
          ) : (
            m.decisions.map((d) => (
              <div key={d.id} className={sx(styles.cardRow)}>
                <div className={sx(styles.cardRowMain)}>
                  <Text weight="semibold">{d.title}</Text>
                  <Text size="sm">{d.outcome}</Text>
                  <Text size="2xs" color="secondary">
                    {formatDateTime(d.recordedAt)}
                  </Text>
                </div>
              </div>
            ))
          )}
          <Text weight="semibold">Action items ({m.actions.length})</Text>
          {m.actions.length === 0 ? (
            <EmptyStateInline message="No action items yet." />
          ) : (
            m.actions.map((a) => (
              <div key={a.id} className={sx(styles.cardRow)}>
                <div className={sx(styles.cardRowMain)}>
                  <Text weight="semibold">{a.title}</Text>
                  <Text size="sm" color="secondary">
                    owner {a.ownerParticipantId}
                    {a.dueAt !== null ? ` · due ${formatRelative(a.dueAt)}` : ''}
                  </Text>
                </div>
                <StatusChip status={a.status} />
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'agenda' && (
        <div className={sx(styles.detailGrid)}>
          {m.agenda.length === 0 ? (
            <EmptyStateInline message="No agenda items. Prepare a proposal to add them." />
          ) : (
            m.agenda.map((item, index) => (
              <div key={item.id} className={sx(styles.cardRow)}>
                <div className={sx(styles.cardRowMain)}>
                  <Text weight="semibold">
                    {index + 1}. {item.title}
                  </Text>
                  <Text size="2xs" color="secondary">
                    source: {item.source}
                  </Text>
                </div>
                <StatusChip status={item.status} />
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'outcomes' && (
        <div className={sx(styles.detailGrid)}>
          <Text size="sm" color="secondary">
            Outcomes can be recorded once the meeting is in outcome-capture state
            (in_progress or completed).
          </Text>
          <Text weight="semibold">Decisions</Text>
          {m.decisions.length === 0 ? (
            <EmptyStateInline message="Nothing recorded." />
          ) : (
            m.decisions.map((d) => (
              <div key={d.id} className={sx(styles.cardRow)}>
                <div className={sx(styles.cardRowMain)}>
                  <Text weight="semibold">{d.title}</Text>
                  <Text size="sm">{d.outcome}</Text>
                </div>
              </div>
            ))
          )}
          <Text weight="semibold">Action items</Text>
          {m.actions.length === 0 ? (
            <EmptyStateInline message="Nothing recorded." />
          ) : (
            m.actions.map((a) => (
              <div key={a.id} className={sx(styles.cardRow)}>
                <div className={sx(styles.cardRowMain)}>
                  <Text weight="semibold">{a.title}</Text>
                </div>
                <StatusChip status={a.status} />
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'followup' && (
        <div className={sx(styles.detailGrid)}>
          <Text weight="semibold">Follow-ups ({m.followUps.length})</Text>
          {m.followUps.length === 0 ? (
            <EmptyStateInline message="No follow-ups. Use schedule_followup (agent) or the API." />
          ) : (
            m.followUps.map((f) => (
              <div key={f.id} className={sx(styles.cardRow)}>
                <div className={sx(styles.cardRowMain)}>
                  <Text size="sm">{f.scheduledAt !== null ? formatDateTime(f.scheduledAt) : 'Unscheduled'}</Text>
                  <Text size="2xs" color="secondary">
                    {f.targetMeetingId !== null ? `target: ${f.targetMeetingId}` : 'no target meeting yet'}
                  </Text>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <div style={{ marginTop: 28 }}>
        <Text size="lg" weight="semibold">
          Activity (audit trail)
        </Text>
        {activity.loading && <LoadingState label="Loading activity" />}
        {activity.error !== null && <ErrorState message={activity.error} errorCode={activity.errorCode} />}
        {activity.data !== null &&
          (activity.data.length === 0 ? (
            <EmptyStateInline message="No audit events yet." />
          ) : (
            <div className={sx(styles.sectionGap)} style={{ marginTop: 8 }}>
              {activity.data.map((e) => (
                <div key={e.id} className={sx(styles.metaRow)}>
                  <Text size="2xs">
                    <strong>{e.action}</strong> · {e.actorType} ({e.actorRef}) · {e.channel} ·{' '}
                    {formatDateTime(e.createdAt)}
                  </Text>
                </div>
              ))}
            </div>
          ))}

        <Text size="lg" weight="semibold">
          Proposals for this meeting
        </Text>
        {proposals.loading && <LoadingState label="Loading proposals" />}
        {proposals.data !== null &&
          (proposals.data.length === 0 ? (
            <EmptyStateInline message="No proposals touch this meeting." />
          ) : (
            <div className={sx(styles.sectionGap)} style={{ marginTop: 8 }}>
              {proposals.data.map((p) => (
                <Link key={p.id} to="/proposals" style={{ textDecoration: 'none' }}>
                  <div className={sx(styles.cardRow)}>
                    <div className={sx(styles.cardRowMain)}>
                      <Text size="sm" weight="semibold">
                        {p.kind} · {p.rationale.slice(0, 80)}
                        {p.rationale.length > 80 ? '…' : ''}
                      </Text>
                      <Text size="2xs" color="secondary">
                        {p.createdByActorType} · {formatRelative(p.createdAt)}
                      </Text>
                    </div>
                    <StatusChip status={p.status} />
                  </div>
                </Link>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}

export { Dialog, DialogHeader, TextArea, useToast };
