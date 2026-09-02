/**
 * Shared small components: PageHeader, status Badge mapping, ErrorState,
 * LoadingState, EmptyState wrappers (all app states per UX-12).
 */
import type { ReactNode } from 'react';
import { Text, Spinner, Button } from '@astryxdesign/core';
import { WarningCircle } from '@phosphor-icons/react';
import { sx } from './sx';
import * as styles from '../styles/app.styles';

const STATUS_COLORS: Record<string, { fg: string; bg: string }> = {
  scheduled: { fg: '#1a5cff', bg: '#e7efff' },
  draft: { fg: '#5a6472', bg: '#eef1f5' },
  proposed: { fg: '#8a5a00', bg: '#fdf1d7' },
  needs_followup: { fg: '#8a5a00', bg: '#fdf1d7' },
  completed: { fg: '#0a6b3d', bg: '#e3f6ec' },
  cancelled: { fg: '#8a1f2b', bg: '#fbe4e7' },
  pending: { fg: '#8a5a00', bg: '#fdf1d7' },
  approved: { fg: '#0a6b3d', bg: '#e3f6ec' },
  rejected: { fg: '#8a1f2b', bg: '#fbe4e7' },
  superseded: { fg: '#5a6472', bg: '#eef1f5' },
  executed: { fg: '#0a6b3d', bg: '#e3f6ec' },
  failed: { fg: '#8a1f2b', bg: '#fbe4e7' },
  open: { fg: '#1a5cff', bg: '#e7efff' },
  blocked: { fg: '#8a1f2b', bg: '#fbe4e7' },
  done: { fg: '#0a6b3d', bg: '#e3f6ec' },
};

export function StatusChip({ status }: { status: string }): ReactNode {
  const colors = STATUS_COLORS[status] ?? { fg: '#1a1d23', bg: '#eef1f5' };
  return (
    <span
      style={{
        color: colors.fg,
        background: colors.bg,
        fontSize: 12,
        fontWeight: 600,
        borderRadius: 999,
        padding: '2px 10px',
        whiteSpace: 'nowrap',
      }}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}): ReactNode {
  return (
    <div className={sx(styles.pageHeader)}>
      <div>
        <Text size="xl" weight="bold">
          {title}
        </Text>
        {subtitle !== undefined && (
          <div>
            <Text size="sm" color="secondary">
              {subtitle}
            </Text>
          </div>
        )}
      </div>
      {actions !== undefined && <div className={sx(styles.metaRow)}>{actions}</div>}
    </div>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }): ReactNode {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '24px 0' }}>
      <Spinner size="sm" label={label} />
      <Text size="sm" color="secondary">
        {label}
      </Text>
    </div>
  );
}

export function ErrorState({
  message,
  errorCode,
  onRetry,
}: {
  message: string;
  errorCode?: string | null;
  onRetry?: () => void;
}): ReactNode {
  return (
    <div
      role="alert"
      style={{
        border: '1px solid #f3c2c7',
        background: '#fdf1f2',
        color: '#8a1f2b',
        borderRadius: 10,
        padding: '14px 16px',
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      <WarningCircle size={18} />
      <div style={{ flex: 1, minWidth: 200 }}>
        <strong>{errorCode ?? 'Error'}</strong> — {message}
      </div>
      {onRetry !== undefined && (
        <Button
          label="Retry"
          size="sm"
          variant="secondary"
          onClick={onRetry}
        />
      )}
    </div>
  );
}

export function EmptyStateInline({ message }: { message: string }): ReactNode {
  return (
    <div style={{ padding: '20px 0', color: '#5a6472' }}>
      <Text size="sm">{message}</Text>
    </div>
  );
}
