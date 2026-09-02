/**
 * Settings (US-12): WebMCP status details, tool list, demo reset.
 */
import { useState } from 'react';
import { Text, Button, useToast } from '@astryxdesign/core';
import { api } from '../api/client';
import { useWebmcpStatus } from '../webmcp/status';
import { PageHeader, LoadingState, ErrorState } from '../ui/components';
import { sx } from '../ui/sx';
import * as styles from '../styles/app.styles';

export function SettingsPage() {
  const status = useWebmcpStatus();
  const toast = useToast();
  const [resetting, setResetting] = useState(false);

  async function resetDemo(): Promise<void> {
    setResetting(true);
    try {
      const result = await api.resetDemo();
      toast({ body: result.message, type: 'info' });
      setTimeout(() => window.location.assign('/'), 600);
    } catch {
      toast({ body: 'Reset failed — check the API is running.', type: 'error' });
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className={sx(styles.page)}>
      <PageHeader title="Settings" subtitle="Agent integration and demo controls" />

      <Text size="lg" weight="semibold">
        WebMCP status
      </Text>
      {!status.ready && <LoadingState label="Registering tools" />}
      {status.ready && (
        <div className={sx(styles.sectionGap)} style={{ marginTop: 8 }}>
          <Text size="sm">
            Mode:{' '}
            <strong>
              {status.mode === 'native'
                ? 'native document.modelContext'
                : status.mode === 'polyfill'
                  ? 'labeled dev polyfill (D-013) — native interoperability NOT verified here'
                  : 'unavailable'}
            </strong>
          </Text>
          <Text size="sm">Registered tools ({status.registeredTools.length}):</Text>
          <div className={sx(styles.diffBox)}>
            {status.registeredTools.length === 0 ? 'none' : status.registeredTools.join('\n')}
          </div>
          {status.errors.length > 0 && (
            <div>
              <ErrorState message={status.errors.join('; ')} errorCode="WEBMCP" />
            </div>
          )}
          <Text size="2xs" color="secondary">
            Approval is never a tool: proposals can only be approved by a human in the Proposals
            view. Agents can propose and execute-approved only.
          </Text>
        </div>
      )}

      <div style={{ marginTop: 28 }}>
        <Text size="lg" weight="semibold">
          Golden demo
        </Text>
        <div className={sx(styles.sectionGap)} style={{ marginTop: 8 }}>
          <Text size="sm" color="secondary">
            Reset restores the deterministic demo dataset (Launch project, Alex/Sarah/Daniel,
            blockers, pricing decision) anchored to this week's Monday. Audit events are part of the
            dataset and are reset too.
          </Text>
          <div>
            <Button label="Reset demo data" variant="secondary" isDisabled={resetting} onClick={() => void resetDemo()} />
          </div>
        </div>
      </div>
    </div>
  );
}
