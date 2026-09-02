/**
 * Actions across projects (US-9): open/blocked actions with status change.
 */
import { Link } from 'react-router';
import { Text, Button } from '@astryxdesign/core';
import { api } from '../api/client';
import type { ActionItem } from '../api/client';
import { useAsync, formatRelative } from '../ui/helpers';
import { PageHeader, LoadingState, ErrorState, EmptyStateInline, StatusChip } from '../ui/components';
import { sx } from '../ui/sx';
import * as styles from '../styles/app.styles';

export function ActionsPage() {
  const actions = useAsync<ActionItem[]>(async () => (await api.actions()).actions, []);

  async function markDone(action: ActionItem): Promise<void> {
    await api.updateActionItem(action.id, {
      status: 'done',
      meetingId: action.meetingId,
      idempotencyKey: `done-${action.id}`,
    });
    actions.reload();
  }

  return (
    <div className={sx(styles.page)}>
      <PageHeader title="Actions" subtitle="Open and blocked action items across projects" />
      {actions.loading && <LoadingState label="Loading actions" />}
      {actions.error !== null && (
        <ErrorState message={actions.error} errorCode={actions.errorCode} onRetry={actions.reload} />
      )}
      {actions.data !== null &&
        (actions.data.length === 0 ? (
          <EmptyStateInline message="No open actions." />
        ) : (
          <div className={sx(styles.sectionGap)}>
            {actions.data.map((a) => (
              <div key={a.id} className={sx(styles.cardRow)}>
                <div className={sx(styles.cardRowMain)}>
                  <Link to={`/meetings/${a.meetingId}`} style={{ textDecoration: 'none' }}>
                    <Text weight="semibold">{a.title}</Text>
                  </Link>
                  <Text size="sm" color="secondary">
                    {a.dueAt !== null ? `due ${formatRelative(a.dueAt)}` : 'no due date'} · owner{' '}
                    {a.ownerParticipantId}
                  </Text>
                </div>
                <div className={sx(styles.metaRow)}>
                  <StatusChip status={a.status} />
                  {a.status !== 'done' && (
                    <Button label="Mark done" size="sm" variant="secondary" onClick={() => void markDone(a)} />
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
