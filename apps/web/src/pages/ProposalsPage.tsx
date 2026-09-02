/**
 * Proposal review queue (US-6, US-7, FR-3): the human-control surface.
 * Shows the full payload diff, lifecycle state, and Reject / Revise /
 * Approve / Execute actions. Approval state is server-owned; these buttons
 * call the human-only endpoints.
 */
import { useState } from 'react';
import { Text, Button, TextArea, Dialog, DialogHeader, useToast } from '@astryxdesign/core';
import { Check, X, PencilSimple, Play } from '@phosphor-icons/react';
import { api, ApiError } from '../api/client';
import type { Proposal } from '../api/client';
import { useAsync, formatDateTime, formatRelative } from '../ui/helpers';
import { PageHeader, LoadingState, ErrorState, EmptyStateInline, StatusChip } from '../ui/components';
import { sx } from '../ui/sx';
import * as styles from '../styles/app.styles';

const LIVE_STATUSES = ['pending', 'approved'];

function describePayload(p: Proposal): string {
  return JSON.stringify(p.payload, null, 2);
}

export function ProposalsPage() {
  const proposals = useAsync<Proposal[]>(async () => {
    const result = await api.proposals({});
    return result.proposals;
  }, []);
  const toast = useToast();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Proposal | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [revising, setRevising] = useState<Proposal | null>(null);
  const [revisionText, setRevisionText] = useState('');
  const [lastVerification, setLastVerification] = useState<string | null>(null);

  async function approve(p: Proposal): Promise<void> {
    setBusyId(p.id);
    try {
      await api.approveProposal(p.id);
      toast({ body: 'Proposal approved. Execute it to apply the change.', type: 'info' });
      proposals.reload();
    } catch (err) {
      toast({
        body: err instanceof ApiError ? `${err.code}: ${err.message}` : 'Approve failed',
        type: 'error',
      });
    } finally {
      setBusyId(null);
    }
  }

  async function reject(): Promise<void> {
    if (rejecting === null) return;
    setBusyId(rejecting.id);
    try {
      await api.rejectProposal(rejecting.id, rejectReason.trim() === '' ? 'Rejected without a stated reason' : rejectReason.trim());
      toast({ body: 'Proposal rejected.', type: 'info' });
      setRejecting(null);
      setRejectReason('');
      proposals.reload();
    } catch (err) {
      toast({
        body: err instanceof ApiError ? `${err.code}: ${err.message}` : 'Reject failed',
        type: 'error',
      });
    } finally {
      setBusyId(null);
    }
  }

  async function revise(): Promise<void> {
    if (revising === null) return;
    setBusyId(revising.id);
    try {
      // Revision text updates the rationale; structural edits re-run the
      // prepare flow in the UI (v1 scope: time-only edits encoded as JSON).
      let changes: unknown = {};
      try {
        changes = JSON.parse(revisionText) as unknown;
      } catch {
        toast({ body: 'Revision must be JSON, e.g. {"startAt":"2026-09-03T17:30:00.000Z"}', type: 'error' });
        setBusyId(null);
        return;
      }
      await api.reviseProposal(revising.id, {
        changes,
        rationale: `Human revision of ${revising.id}`,
      });
      toast({ body: 'Revision created — the previous proposal is superseded.', type: 'info' });
      setRevising(null);
      setRevisionText('');
      proposals.reload();
    } catch (err) {
      toast({
        body: err instanceof ApiError ? `${err.code}: ${err.message}` : 'Revise failed',
        type: 'error',
      });
    } finally {
      setBusyId(null);
    }
  }

  async function execute(p: Proposal): Promise<void> {
    setBusyId(p.id);
    try {
      // Key derives from the proposal id: replays of the same execution share a key.
      const result = await api.executeProposal(p.id, `ui-exec-${p.id}`);
      const report = result.verification;
      if (report !== null && report !== undefined) {
        const summary = report.checks
          .map((c) => `${c.name}: ${c.pass ? 'PASS' : 'FAIL'}`)
          .join(' · ');
        setLastVerification(`${report.ok ? 'VERIFIED' : 'VERIFICATION FAILED'} — ${summary}`);
      }
      toast({
        body: report !== null && report !== undefined && report.ok ? 'Executed and verified.' : 'Execution finished — check verification.',
        type: report !== null && report !== undefined && report.ok ? 'info' : 'error',
      });
      proposals.reload();
    } catch (err) {
      toast({
        body: err instanceof ApiError ? `${err.code}: ${err.message}` : 'Execute failed',
        type: 'error',
      });
    } finally {
      setBusyId(null);
    }
  }

  const live = (proposals.data ?? []).filter((p) => LIVE_STATUSES.includes(p.status));
  const history = (proposals.data ?? []).filter((p) => !LIVE_STATUSES.includes(p.status));

  return (
    <div className={sx(styles.page)}>
      <PageHeader
        title="Proposals"
        subtitle="Agent-proposed, human-approved. Nothing executes without approval here."
      />

      {lastVerification !== null && (
        <div style={{ marginBottom: 12 }}>
          <Text size="sm" weight="semibold">
            Last verification: {lastVerification}
          </Text>
        </div>
      )}

      {proposals.loading && <LoadingState label="Loading proposals" />}
      {proposals.error !== null && (
        <ErrorState message={proposals.error} errorCode={proposals.errorCode} onRetry={proposals.reload} />
      )}

      {proposals.data !== null && (
        <>
          <Text size="lg" weight="semibold">
            Needs review ({live.length})
          </Text>
          {live.length === 0 ? (
            <EmptyStateInline message="No pending or approved proposals. The queue is clear." />
          ) : (
            <div className={sx(styles.sectionGap)} style={{ marginTop: 8 }}>
              {live.map((p) => (
                <ProposalCard
                  key={p.id}
                  p={p}
                  busy={busyId === p.id}
                  onApprove={() => void approve(p)}
                  onReject={() => setRejecting(p)}
                  onRevise={() => setRevising(p)}
                  onExecute={() => void execute(p)}
                />
              ))}
            </div>
          )}

          <Text size="lg" weight="semibold">
            History ({history.length})
          </Text>
          {history.length === 0 ? (
            <EmptyStateInline message="No past proposals." />
          ) : (
            <div className={sx(styles.sectionGap)} style={{ marginTop: 8 }}>
              {history.map((p) => (
                <ProposalCard key={p.id} p={p} busy={false} readOnly />
              ))}
            </div>
          )}
        </>
      )}

      <Dialog isOpen={rejecting !== null} onOpenChange={(open) => !open && setRejecting(null)}>
        {rejecting !== null && (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <DialogHeader title="Reject proposal" />
            <Text size="sm" color="secondary">A reason is recorded in the audit trail.</Text>
            <TextArea
              label="Rejection reason"
              isLabelHidden
              value={rejectReason}
              onChange={(value: string) => setRejectReason(value)}
              placeholder="Why is this being rejected?"
              rows={3}
            />
            <div className={sx(styles.metaRow)}>
              <Button label="Cancel" variant="secondary" onClick={() => setRejecting(null)} />
              <Button label="Reject proposal" variant="primary" onClick={() => void reject()} />
            </div>
          </div>
        )}
      </Dialog>

      <Dialog isOpen={revising !== null} onOpenChange={(open) => !open && setRevising(null)}>
        {revising !== null && (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <DialogHeader title="Revise proposal" />
            <Text size="sm" color="secondary">
              Provide a JSON changes object. Creates a new pending proposal and supersedes this one.
            </Text>
            <TextArea
              label="Revision changes JSON"
              isLabelHidden
              value={revisionText}
              onChange={(value: string) => setRevisionText(value)}
              placeholder='{"startAt": "2026-09-03T17:30:00.000Z"}'
              rows={4}
            />
            <div className={sx(styles.metaRow)}>
              <Button label="Cancel" variant="secondary" onClick={() => setRevising(null)} />
              <Button label="Create revision" variant="primary" onClick={() => void revise()} />
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function ProposalCard({
  p,
  busy,
  readOnly = false,
  onApprove,
  onReject,
  onRevise,
  onExecute,
}: {
  p: Proposal;
  busy: boolean;
  readOnly?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onRevise?: () => void;
  onExecute?: () => void;
}): React.ReactNode {
  return (
    <div style={{ border: '1px solid #e2e6ec', borderRadius: 12, padding: 16, background: '#fff' }}>
      <div className={sx(styles.pageHeader)}>
        <div className={sx(styles.cardRowMain)}>
          <div className={sx(styles.metaRow)}>
            <Text weight="semibold">{p.kind}</Text>
            <StatusChip status={p.status} />
            <Text size="2xs" color="secondary">
              {p.createdByActorType} · {formatRelative(p.createdAt)}
              {p.approvedAt !== null ? ` · approved ${formatDateTime(p.approvedAt)}` : ''}
              {p.executedAt !== null ? ` · executed ${formatDateTime(p.executedAt)}` : ''}
            </Text>
          </div>
          <Text size="sm">{p.rationale}</Text>
        </div>
      </div>

      <div className={sx(styles.diffBox)}>{describePayload(p)}</div>


      {p.supersededById !== null && (
        <div style={{ marginTop: 8 }}>
          <Text size="sm" color="secondary">
            Superseded by {p.supersededById}
          </Text>
        </div>
      )}
      {p.verification !== null && p.verification !== undefined && Object.keys(p.verification).length > 0 && (
        <div style={{ marginTop: 8 }}>
          <Text size="sm" weight="semibold">
            Verification — {(p.verification as { ok: boolean }).ok ? 'passed' : 'failed'}:
          </Text>
          <ul className={sx(styles.verifyList)}>
            {((p.verification as { checks?: Array<{ name: string; pass: boolean; expected?: unknown; actual?: unknown }> }).checks ?? []).map((c) => (
              <li key={c.name} className={sx(c.pass ? styles.verifyPass : styles.verifyFail)}>
                {c.pass ? '✓' : '✗'} {c.name} (expected: {JSON.stringify(c.expected)}, actual:{' '}
                {JSON.stringify(c.actual)})
              </li>
            ))}
          </ul>
        </div>
      )}

      {!readOnly && p.status === 'pending' && (
        <div className={sx(styles.metaRow)} style={{ marginTop: 12 }}>
          <Button
            label="Approve"
            icon={<Check />}
            variant="primary"
            size="sm"
            isDisabled={busy}
            onClick={onApprove}
          />
          <Button label="Reject" icon={<X />} variant="secondary" size="sm" isDisabled={busy} onClick={onReject} />
          <Button
            label="Edit"
            icon={<PencilSimple />}
            variant="secondary"
            size="sm"
            isDisabled={busy}
            onClick={onRevise}
          />
        </div>
      )}
      {!readOnly && p.status === 'approved' && (
        <div className={sx(styles.metaRow)} style={{ marginTop: 12 }}>
          <Button
            label="Execute approved change"
            icon={<Play />}
            variant="primary"
            size="sm"
            isDisabled={busy}
            onClick={onExecute}
          />
        </div>
      )}
    </div>
  );
}
