import { useState } from 'react';
import { ActionDialog, Badge, Button, Card, Notice, TextAreaField, TimeAgo } from '@/components/ui';
import { formatCents } from '@/lib/money';
import { CONFIRM_RELEASE_CENTS, UNDO_SECONDS } from '@/lib/rules';
import { dueLabel, shortDate } from '@/lib/time';
import type { DeliverableRow, MilestoneRow, ProofRow, Side } from '@/lib/types';
import { ProofDialog, ProofEvidence, ReleaseTimer } from './Proof';
import { useApproveProof, useRequestChanges, type DealDetail } from './api';
import { MILESTONE_STATUS, deliverableStatus, latestProofs } from './model';

type Names = Record<Side, string>;
type Release = DealDetail['releases'][number];

interface ItemProps {
  dealId: string;
  dl: DeliverableRow;
  milestone: MilestoneRow | undefined;
  proof: ProofRow | undefined;
  release: Release | undefined;
  side: Side;
  names: Names;
  approving: boolean;
  onSendProof: () => void;
  onApprove: (proof: ProofRow) => void;
  onRequestChanges: (proof: ProofRow) => void;
}

/** One deliverable: its share of the money, where it stands, its proof, and the moves on it. */
function DeliverableItem({ dealId, dl, milestone, proof, release, side, names, approving, onSendProof, onApprove, onRequestChanges }: ItemProps) {
  const inEscrow = milestone?.status === 'in_escrow';
  const canDeliver = side === 'creator' && inEscrow && (dl.status === 'upcoming' || dl.status === 'changes_requested');
  const funding = milestone ? MILESTONE_STATUS[milestone.status] : null;
  const state = deliverableStatus(dl.status, inEscrow);
  return (
    <li className="g-deliv" id={proof ? `proof-${proof.id}` : undefined}>
      <div className="g-between">
        <b className="g-strong">{dl.label}</b>
        <span className="g-strong g-num">{formatCents(dl.amount_cents)}</span>
      </div>
      <div className="g-row-wrap g-small">
        {dl.status !== 'done' && dl.due_on ? (
          // work that isn't funded can't be late: the creator can't start it yet
          <span className="g-muted">{inEscrow ? dueLabel(dl.due_on) : `due ${shortDate(dl.due_on)}`}</span>
        ) : null}
        {dl.done_at ? <span className="g-muted">released <TimeAgo at={dl.done_at} /></span> : null}
        {funding && dl.status !== 'done' ? <Badge tone={funding.tone}>{funding.label}</Badge> : null}
        <Badge tone={state.tone}>{state.label}</Badge>
      </div>
      {proof && proof.status !== 'released' ? <ProofEvidence proof={proof} /> : null}
      {proof?.status === 'changes_requested' ? (
        <Notice tone="coral">
          {names.brand} asked for changes{proof.changes_note ? `: “${proof.changes_note}”` : '.'} {side === 'creator' ? 'Send new proof when it’s ready.' : ''}
        </Notice>
      ) : null}
      {proof?.status === 'releasing' ? <ReleaseTimer dealId={dealId} proof={proof} canUndo={side === 'brand'} /> : null}
      {release ? (
        <p className="g-small g-muted">
          {side === 'creator'
            ? `${formatCents(release.net_cents)} released to your wallet (${formatCents(release.gross_cents)} less the ${formatCents(release.fee_cents)} fee).`
            : `${formatCents(release.gross_cents)} released to ${names.creator}.`}
        </p>
      ) : null}
      <div className="g-row-wrap">
        {canDeliver ? (
          <Button variant="primary" size="sm" icon="upload" onClick={onSendProof}>
            {dl.status === 'changes_requested' ? 'send new proof' : 'send proof'}
          </Button>
        ) : null}
        {side === 'brand' && proof?.status === 'in_review' ? (
          <>
            <Button variant="primary" size="sm" icon="check" loading={approving} onClick={() => onApprove(proof)}>
              approve & release {formatCents(proof.value_cents)}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onRequestChanges(proof)}>request changes</Button>
          </>
        ) : null}
      </div>
    </li>
  );
}

/** The deal's deliverables, and the dialogs behind their moves: proof, approval of a large release, changes. */
export function Deliverables({ deal: d, side, names }: { deal: DealDetail; side: Side; names: Names }) {
  const approve = useApproveProof();
  const changes = useRequestChanges();
  const [proofFor, setProofFor] = useState<DeliverableRow | null>(null);
  const [changesFor, setChangesFor] = useState<ProofRow | null>(null);
  const [changesNote, setChangesNote] = useState('');
  const [confirmRelease, setConfirmRelease] = useState<ProofRow | null>(null);
  const proofs = latestProofs(d.proofs);
  const milestoneOf = new Map(d.milestones.map((x) => [x.id, x]));
  const releaseOf = new Map(d.releases.map((r) => [r.proof_id, r]));

  const approveProof = (p: ProofRow) => {
    if (p.value_cents >= CONFIRM_RELEASE_CENTS) return setConfirmRelease(p);
    approve.mutate({ dealId: d.id, proofId: p.id });
  };

  return (
    <>
      <Card title="Deliverables" actions={<span className="g-tiny g-muted">each releases its share when approved</span>}>
        <ol className="g-delivs">
          {d.deliverables.map((dl) => {
            const proof = proofs.get(dl.id);
            return (
              <DeliverableItem
                key={dl.id}
                dealId={d.id}
                dl={dl}
                milestone={milestoneOf.get(dl.milestone_id)}
                proof={proof}
                release={proof ? releaseOf.get(proof.id) : undefined}
                side={side}
                names={names}
                approving={!!proof && approve.isPending && approve.variables?.proofId === proof.id}
                onSendProof={() => setProofFor(dl)}
                onApprove={approveProof}
                onRequestChanges={(p) => {
                  setChangesNote('');
                  setChangesFor(p);
                }}
              />
            );
          })}
        </ol>
      </Card>

      {proofFor ? <ProofDialog dealId={d.id} deliverable={proofFor} brandName={names.brand} onClose={() => setProofFor(null)} /> : null}
      {changesFor ? (
        <ActionDialog
          onClose={() => setChangesFor(null)}
          pending={changes.isPending}
          title="Request changes"
          description={`${names.creator} sees your note and sends new proof. The money stays in escrow.`}
          variant="danger"
          action="request changes"
          onAction={() => changes.mutate({ dealId: d.id, proofId: changesFor.id, note: changesNote }, { onSuccess: () => setChangesFor(null) })}
        >
          <TextAreaField label="What needs to change" value={changesNote} maxLength={2000} onChange={(e) => setChangesNote(e.target.value)} autoFocus />
        </ActionDialog>
      ) : null}
      {confirmRelease ? (
        <ActionDialog
          onClose={() => setConfirmRelease(null)}
          pending={approve.isPending}
          title={`Release ${formatCents(confirmRelease.value_cents)}?`}
          description={`This pays ${names.creator} from escrow. You’ll have ${UNDO_SECONDS} seconds to undo.`}
          action="approve & release"
          onAction={() => approve.mutate({ dealId: d.id, proofId: confirmRelease.id }, { onSuccess: () => setConfirmRelease(null) })}
        />
      ) : null}
    </>
  );
}
