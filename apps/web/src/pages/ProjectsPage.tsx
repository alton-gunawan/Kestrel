/**
 * Projects (US-8): list with open-action counts; detail with blockers,
 * decisions, meetings.
 */
import { Link, useParams } from 'react-router';
import { Text } from '@astryxdesign/core';
import { api } from '../api/client';
import { useAsync, formatDateTime } from '../ui/helpers';
import { PageHeader, LoadingState, ErrorState, EmptyStateInline, StatusChip } from '../ui/components';
import { sx } from '../ui/sx';
import * as styles from '../styles/app.styles';

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  openActionCount?: number;
  meetingCount?: number;
}

export function ProjectsPage() {
  const { id } = useParams<{ id: string }>();
  const list = useAsync<ProjectRow[]>(async () => (await api.projects()).projects, []);
  const detail = useAsync<{
    project: ProjectRow;
    meetings: Array<{ id: string; title: string; startAt: string; status: string }>;
    actions: Array<{ id: string; title: string; status: string; dueAt: string | null }>;
    decisions: Array<{ id: string; title: string; outcome: string; recordedAt: string }>;
  }>(() => api.project(id ?? ''), [id]);

  if (id !== undefined) {
    return (
      <div className={sx(styles.page)}>
        <PageHeader title="Project" subtitle={id} />
        {detail.loading && <LoadingState label="Loading project" />}
        {detail.error !== null && (
          <ErrorState message={detail.error} errorCode={detail.errorCode} onRetry={detail.reload} />
        )}
        {detail.data !== null && (
          <div className={sx(styles.sectionGap)}>
            <Text weight="semibold">{detail.data.project.name}</Text>
            <Text size="sm" color="secondary">
              {detail.data.project.description ?? '—'}
            </Text>

            <Text size="lg" weight="semibold">
              Unresolved blockers ({detail.data.actions.length})
            </Text>
            {detail.data.actions.length === 0 ? (
              <EmptyStateInline message="No open or blocked actions." />
            ) : (
              detail.data.actions.map((a) => (
                <div key={a.id} className={sx(styles.cardRow)}>
                  <div className={sx(styles.cardRowMain)}>
                    <Text weight="semibold">{a.title}</Text>
                    <Text size="sm" color="secondary">
                      {a.dueAt !== null ? `due ${formatDateTime(a.dueAt)}` : 'no due date'}
                    </Text>
                  </div>
                  <StatusChip status={a.status} />
                </div>
              ))
            )}

            <Text size="lg" weight="semibold">
              Recent decisions
            </Text>
            {detail.data.decisions.length === 0 ? (
              <EmptyStateInline message="No decisions recorded." />
            ) : (
              detail.data.decisions.map((d) => (
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

            <Text size="lg" weight="semibold">
              Meetings
            </Text>
            {detail.data.meetings.length === 0 ? (
              <EmptyStateInline message="No meetings linked." />
            ) : (
              detail.data.meetings.map((m) => (
                <Link key={m.id} to={`/meetings/${m.id}`} style={{ textDecoration: 'none' }}>
                  <div className={sx(styles.cardRow)}>
                    <div className={sx(styles.cardRowMain)}>
                      <Text weight="semibold">{m.title}</Text>
                      <Text size="sm" color="secondary">
                        {formatDateTime(m.startAt)}
                      </Text>
                    </div>
                    <StatusChip status={m.status} />
                  </div>
                </Link>
              ))
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={sx(styles.page)}>
      <PageHeader title="Projects" subtitle="Goals the meetings roll up to" />
      {list.loading && <LoadingState label="Loading projects" />}
      {list.error !== null && (
        <ErrorState message={list.error} errorCode={list.errorCode} onRetry={list.reload} />
      )}
      {list.data !== null &&
        (list.data.length === 0 ? (
          <EmptyStateInline message="No projects." />
        ) : (
          <div className={sx(styles.sectionGap)}>
            {list.data.map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`} style={{ textDecoration: 'none' }}>
                <div className={sx(styles.cardRow)}>
                  <div className={sx(styles.cardRowMain)}>
                    <Text weight="semibold">{p.name}</Text>
                    <Text size="sm" color="secondary">
                      {p.description ?? '—'}
                    </Text>
                  </div>
                  <div className={sx(styles.metaRow)}>
                    <Text size="sm" color="secondary">
                      {p.openActionCount ?? 0} open · {p.meetingCount ?? 0} meetings
                    </Text>
                    <StatusChip status={p.status} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ))}
    </div>
  );
}
