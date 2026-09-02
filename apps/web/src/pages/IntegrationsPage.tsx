/**
 * Integrations page — user-facing provider management (doc sections 5–7).
 *
 * Shows provider cards grouped by capability, a connect flow that explains
 * scopes before connecting, per-provider sync status + last error, real
 * activity, and disconnect. All state comes from the server; nothing here
 * fakes success. Demo adapters are clearly labeled (doc 9.1).
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Text, Button, useToast } from '@astryxdesign/core';
import {
  CalendarDots,
  Brain,
  ChatCircle,
  FolderOpen,
  VideoCamera,
  Lightning,
  Plug,
  Plugs,
  ArrowsClockwise,
  CheckCircle,
  WarningCircle,
  Info,
} from '@phosphor-icons/react';
import { api, type IntegrationProviderView, type IntegrationEventView } from '../api/client';
import { PageHeader, LoadingState, ErrorState } from '../ui/components';
import { useAsync } from '../ui/helpers';
import { sx } from '../ui/sx';
import * as styles from '../styles/app.styles';

const CAPABILITY_LABEL: Record<string, string> = {
  calendar: 'Calendar',
  meeting_intelligence: 'Meeting intelligence',
  communication: 'Communication',
  project: 'Project systems',
  meeting_platform: 'Meeting platform',
  automation: 'Automation',
};

const CAPABILITY_ICON: Record<string, ReactNode> = {
  calendar: <CalendarDots size={20} />,
  meeting_intelligence: <Brain size={20} />,
  communication: <ChatCircle size={20} />,
  project: <FolderOpen size={20} />,
  meeting_platform: <VideoCamera size={20} />,
  automation: <Lightning size={20} />,
};

function idemKey(): string {
  return `ui-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function IntegrationsPage() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null); // providerId being acted on
  const [connecting, setConnecting] = useState<string | null>(null); // confirm-connect provider

  const state = useAsync<{ providers: IntegrationProviderView[]; events: IntegrationEventView[] }>(
    async () => {
      const data = await api.integrations();
      const evt = await api.integrationActivity();
      return { providers: data.providers, events: evt.events };
    },
    [],
  );
  const { data, loading, error, reload } = state;
  const providers = useMemo(() => data?.providers ?? [], [data]);
  const activity = useMemo(() => data?.events ?? [], [data]);

  const grouped = useMemo(() => {
    const order = ['calendar', 'meeting_intelligence', 'communication', 'project', 'meeting_platform', 'automation'];
    const map = new Map<string, IntegrationProviderView[]>();
    for (const p of providers) {
      const cap = p.capabilities[0] ?? 'automation';
      const list = map.get(cap) ?? [];
      list.push(p);
      map.set(cap, list);
    }
    return order.filter((c) => map.has(c)).map((c) => ({ capability: c, items: map.get(c) ?? [] }));
  }, [providers]);

  async function connect(providerId: string, scopes: string[]): Promise<void> {
    setBusy(providerId);
    try {
      await api.connectIntegration({ providerId, scopes, idempotencyKey: idemKey() });
      toast({ body: `${providerId} connected.`, type: 'info' });
      reload();
    } catch (err) {
      toast({ body: err instanceof Error ? err.message : 'Connect failed', type: 'error' });
    } finally {
      setBusy(null);
      setConnecting(null);
    }
  }

  async function disconnect(providerId: string, connectionId: string): Promise<void> {
    setBusy(providerId);
    try {
      await api.disconnectIntegration(connectionId, idemKey());
      toast({ body: `${providerId} disconnected. Local Kestrel data is retained.`, type: 'info' });
      reload();
    } catch (err) {
      toast({ body: err instanceof Error ? err.message : 'Disconnect failed', type: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function sync(providerId: string, connectionId: string): Promise<void> {
    setBusy(providerId);
    try {
      const result = await api.syncIntegration(connectionId, idemKey());
      toast({ body: result.result.summary, type: 'info' });
      reload();
    } catch (err) {
      toast({ body: err instanceof Error ? err.message : 'Sync failed', type: 'error' });
    } finally {
      setBusy(null);
    }
  }

  if (loading && providers.length === 0) {
    return (
      <div className={sx(styles.page)}>
        <PageHeader title="Integrations" subtitle="Connect Kestrel to external providers" />
        <LoadingState label="Loading integrations…" />
      </div>
    );
  }

  return (
    <div className={sx(styles.page)}>
      <PageHeader
        title="Integrations"
        subtitle="Connect providers to extend Kestrel — calendar, meeting intelligence, communication, project systems. All data stays under your approval."
      />

      {error !== null && <ErrorState message={error} errorCode="INTEGRATIONS" onRetry={reload} />}

      <div
        style={{
          padding: '12px 16px',
          borderRadius: 10,
          border: '1px solid #e2e6ec',
          background: '#f8fafc',
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
          marginBottom: 20,
        }}
      >
        <Info size={18} style={{ marginTop: 2, flexShrink: 0, color: '#1a5cff' }} />
        <Text size="sm" color="secondary">
          Integrations are organized by capability, not vendor. Provider data is{' '}
          <strong>untrusted input</strong>: transcripts and external events become proposals for your
          review — they are never committed without human approval. Demo adapters are labeled{' '}
          <strong>demo</strong> and never claim a real external side effect.
        </Text>
      </div>

      {grouped.map((group) => (
        <section key={group.capability} style={{ marginBottom: 26 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ color: '#1a5cff', display: 'inline-flex' }}>
              {CAPABILITY_ICON[group.capability]}
            </span>
            <Text size="lg" weight="semibold">
              {CAPABILITY_LABEL[group.capability] ?? group.capability}
            </Text>
          </div>
          <div className={sx(styles.sectionGap)}>
            {group.items.map((p) => (
              <ProviderCard
                key={p.providerId}
                provider={p}
                busy={busy === p.providerId}
                connecting={connecting === p.providerId}
                onConnect={() => setConnecting(p.providerId)}
                onConfirmConnect={() => void connect(p.providerId, defaultScopes(p.capabilities[0] ?? 'automation'))}
                onCancelConnect={() => setConnecting(null)}
                onSync={() => p.connection && void sync(p.providerId, p.connection.id)}
                onDisconnect={() => p.connection && void disconnect(p.providerId, p.connection.id)}
              />
            ))}
          </div>
        </section>
      ))}

      <section style={{ marginTop: 30, borderTop: '1px solid #e2e6ec', paddingTop: 20 }}>
        <Text size="lg" weight="semibold">
          Integration Activity
        </Text>
        <Text size="sm" color="secondary">
          Real events recorded by the server — syncs, connects, webhook ingestion. No simulated logs.
        </Text>
        <div className={sx(styles.sectionGap)} style={{ marginTop: 8 }}>
          {activity.length === 0 && <Text size="sm" color="secondary">No integration activity yet.</Text>}
          {activity.map((e) => (
            <div
              key={e.id}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                padding: '10px 14px',
                border: '1px solid #e2e6ec',
                borderRadius: 10,
                background: e.status === 'error' ? '#fdf1f2' : '#fff',
              }}
            >
              <span style={{ marginTop: 2, color: e.status === 'error' ? '#8a1f2b' : '#0a6b3d' }}>
                {e.status === 'error' ? <WarningCircle size={18} /> : <CheckCircle size={18} />}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text size="sm" weight="semibold">
                  {e.eventType}
                </Text>
                <Text size="sm" color="secondary">{e.summary}</Text>
                <Text size="2xs" color="secondary">{new Date(e.occurredAt).toLocaleString()}</Text>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function defaultScopes(capability: string): string[] {
  switch (capability) {
    case 'calendar':
      return ['calendar.readonly'];
    case 'meeting_intelligence':
      return ['transcript.readonly'];
    case 'communication':
      return ['notify.send'];
    case 'project':
      return ['issues.readonly'];
    default:
      return ['basic'];
  }
}

function ProviderCard({
  provider,
  busy,
  connecting,
  onConnect,
  onConfirmConnect,
  onCancelConnect,
  onSync,
  onDisconnect,
}: {
  provider: IntegrationProviderView;
  busy: boolean;
  connecting: boolean;
  onConnect: () => void;
  onConfirmConnect: () => void;
  onCancelConnect: () => void;
  onSync: () => void;
  onDisconnect: () => void;
}) {
  const conn = provider.connection;
  const connected = conn?.status === 'connected';
  const errored = conn?.status === 'error';
  return (
    <div
      style={{
        border: '1px solid #e2e6ec',
        borderRadius: 12,
        background: '#fff',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text size="base" weight="semibold">{provider.displayName}</Text>
            {provider.demo && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#8a5a00',
                  background: '#fdf1d7',
                  borderRadius: 999,
                  padding: '1px 8px',
                }}
              >
                DEMO
              </span>
            )}
            {connected && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#0a6b3d',
                  background: '#e3f6ec',
                  borderRadius: 999,
                  padding: '1px 8px',
                }}
              >
                CONNECTED
              </span>
            )}
            {errored && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#8a1f2b',
                  background: '#fbe4e7',
                  borderRadius: 999,
                  padding: '1px 8px',
                }}
              >
                ERROR
              </span>
            )}
          </div>
          <Text size="sm" color="secondary" style={{ marginTop: 4 }}>
            {provider.description}
          </Text>
          <Text size="2xs" color="secondary" style={{ marginTop: 4 }}>
            Capability: {provider.capabilities.map((c) => CAPABILITY_LABEL[c] ?? c).join(', ')}
            {conn?.lastSyncAt ? ` · Last sync ${new Date(conn.lastSyncAt).toLocaleString()}` : ''}
          </Text>
          {conn?.lastError && (
            <div style={{ marginTop: 6, color: '#8a1f2b', fontSize: 12.5 }}>
              <WarningCircle size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              {conn.lastError.code}: {conn.lastError.message}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {!connected && !connecting && (
            <Button
              label="Connect"
              icon={<Plug />}
              size="sm"
              isDisabled={busy}
              onClick={onConnect}
            />
          )}
          {connecting && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
              <Text size="2xs" color="secondary">
                Scopes requested: {defaultScopes(provider.capabilities[0] ?? 'automation').join(', ')}
              </Text>
              <div style={{ display: 'flex', gap: 6 }}>
                <Button label="Cancel" size="sm" variant="secondary" onClick={onCancelConnect} />
                <Button label="Confirm Connect" size="sm" isDisabled={busy} onClick={onConfirmConnect} />
              </div>
            </div>
          )}
          {connected && (
            <>
              <Button
                label={busy ? 'Syncing…' : 'Sync'}
                icon={<ArrowsClockwise />}
                size="sm"
                variant="secondary"
                isDisabled={busy}
                onClick={onSync}
              />
              <Button
                label="Disconnect"
                icon={<Plugs />}
                size="sm"
                variant="secondary"
                isDisabled={busy}
                onClick={onDisconnect}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
