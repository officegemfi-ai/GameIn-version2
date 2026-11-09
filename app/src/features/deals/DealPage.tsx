import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Badge, Button, Card, Dialog, ErrorState, Icon, Loading, Notice, Stat, TextAreaField, TimeAgo } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { errorMessage } from '@/lib/errors';
import { formatCents } from '@/lib/money';
import { dueLabel, formatDate, shortDate } from '@/lib/time';
import type { DeliverableRow, ProofRow } from '@/lib/types';
import { useSeat } from '@/features/seats/SeatProvider';
import { useConversationWith } from '@/features/messages/api';
import { FundDialog } from './FundDialog';
import { ProofDialog, ProofEvidence, ReleaseTimer } from './Proof';
import { RateDeal } from './RateDeal';
import { MILESTONE_LABEL, useApproveProof, useBookAgain, useDeal, useRequestChanges, useSimulatePayment, type DealDetail } from './api';

const DEAL_STATUS = { awaiting_funding: { label: 'awaiting funding', tone: 'coral' }, in_progress: { label: 'in progress', tone: 'mint' }, completed: { label: 'complete', tone: 'neutral' }, cancelled: { label: 'cancelled', tone: 'neutral' } } as const;

function deliverableBadge(dl: DeliverableRow, inEscrow: boolean) {
  switch (dl.status) {
    case 'in_review':
      return <Badge tone="amber">in review</Badge>;
    case 'changes_requested':
      return <Badge tone="coral">changes requested</Badge>;
    case 'done':
      return <Badge tone="mint">done</Badge>;
    default:
      return inEscrow ? <Badge tone="mint">ready to deliver</Badge> : <Badge>upcoming</Badge>;
  }
}

/** The latest proof for each deliverable. */
function latestProofs(d: DealDetail): Map<string, ProofRow> {
  const out = new Map<string, ProofRow>();
  for (const p of [...d.proofs].sort((a, b) => a.submitted_at.localeCompare(b.submitted_at))) out.set(p.deliverable_id, p);
  return out;
}

export default function DealPage() {
  const { id = '' } = useParams();
  const seat = useSeat();
  const navigate = useNavigate();
  const q = useDeal(id);
  const approve = useApproveProof();
  const changes = useRequestChanges();
  const simulate = useSimulatePayment();
  const again = useBookAgain();
  const [funding, setFunding] = useState(false);
  const [proofFor, setProofFor] = useState<DeliverableRow | null>(null);
  const [changesFor, setChangesFor] = useState<ProofRow | null>(null);
  const [changesNote, setChangesNote] = useState('');
  const [confirmRelease, setConfirmRelease] = useState<ProofRow | null>(null);
  const [againNote, setAgainNote] = useState('Same package again? Happy to run it back.');
  const conversation = useConversationWith(q.data?.brand_id ?? null, q.data?.creator_id ?? null);

  if (q.isPending) return <Loading />;
  if (q.isError) {
    return (
      <div className="g-page">
        <PageHeader title="Deal" back={{ to: '/deals', label: 'deals' }} />
        <ErrorState error={errorMessage(q.error)} retry={() => void q.refetch()} />
      </div>
    );
  }
  const d = q.data;
  const m = d.money;
  const side = seat.side;
  const brandName = d.brand?.name ?? 'The brand';
  const creatorName = d.creator?.display_name ?? 'The creator';
  const proofs = latestProofs(d);
  const milestoneOf = new Map(d.milestones.map((x) => [x.id, x]));
  const releaseOf = new Map(d.releases.map((r) => [r.proof_id, r]));
  const clearing = d.payments.filter((p) => p.status === 'processing' || p.status === 'awaiting_wire');
  const notFunded = m.not_funded_cents ?? 0;
  const status = DEAL_STATUS[d.status];
  const done = d.deliverables.filter((x) => x.status === 'done').length;

  const approveProof = (p: ProofRow) => {
    if (p.value_cents >= 100_000) return setConfirmRelease(p);
    approve.mutate({ dealId: d.id, proofId: p.id });
  };

  return (
    <div className="g-page">
      <PageHeader
        back={{ to: '/deals', label: 'deals' }}
        title={d.title}
        subtitle={
          <>
            {brandName} × <Link to={`/c/${d.creator?.handle ?? ''}`}>{creatorName}</Link> · started {formatDate(d.created_at)}
            {d.ends_on ? ` · runs to ${formatDate(d.ends_on)}` : ''}
          </>
        }
        actions={
          <>
            <Badge tone={status.tone}>{status.label}</Badge>
            {conversation.data ? (
              <Link className="g-btn g-btn--sm" to={`/messages/${conversation.data}`}>
                <Icon name="messages" /> message
              </Link>
            ) : null}
          </>
        }
      />

      <div className="g-grid-4">
        <Stat label="Deal" value={formatCents(m.total_cents)} note={`${done} of ${d.deliverables.length} delivered`} />
        <Stat label="In escrow" value={formatCents(m.in_escrow_cents)} tone="mint" note="waiting on approval" />
        <Stat label="Released" value={formatCents(m.released_cents)} note={side === 'creator' ? 'to you, less 5%' : 'to the creator'} />
        {notFunded > 0 ? (
          <Stat label="Not funded" value={formatCents(notFunded)} tone="coral" note={side === 'brand' ? 'fund it so the work can start' : 'the brand funds this next'} />
        ) : (
          <Stat label="Clearing" value={formatCents(m.clearing_cents)} note="bank or wire on its way" />
        )}
      </div>

      {side === 'brand' && notFunded > 0 && d.status !== 'cancelled' ? (
        <Notice tone="coral" action={<Button variant="primary" onClick={() => setFunding(true)}>fund escrow</Button>}>
          <b className="g-strong">Fund {formatCents(notFunded)}</b> so {creatorName} can deliver. You approve each part before it’s released.
        </Notice>
      ) : null}
      {side === 'creator' && notFunded > 0 && (m.in_escrow_cents ?? 0) === 0 && (m.clearing_cents ?? 0) === 0 ? (
        <Notice tone="amber">Waiting on {brandName} to fund escrow. You can deliver as soon as the money is in escrow.</Notice>
      ) : null}
      {side === 'brand'
        ? clearing.map((p) => (
            <Notice
              key={p.id}
              tone="amber"
              action={
                p.provider === 'simulated' ? (
                  <div className="g-row-wrap">
                    <Button size="sm" variant="primary" loading={simulate.isPending} onClick={() => simulate.mutate({ dealId: d.id, paymentId: p.id, outcome: 'cleared' })}>mark cleared (test)</Button>
                    <Button size="sm" variant="ghost" disabled={simulate.isPending} onClick={() => simulate.mutate({ dealId: d.id, paymentId: p.id, outcome: 'failed' })}>mark failed</Button>
                  </div>
                ) : undefined
              }
            >
              Your {p.method_label} payment of {formatCents(p.total_cents)} is {p.status === 'awaiting_wire' ? 'waiting for the wire' : 'clearing'}. Reference {p.reference}.
            </Notice>
          ))
        : null}
      {d.status === 'completed' ? <Notice tone="mint">Complete. Every deliverable was approved and released.</Notice> : null}

      <Card title="Deliverables" actions={<span className="g-tiny g-muted">each releases its share when approved</span>}>
        <ol className="g-delivs">
          {d.deliverables.map((dl) => {
            const ms = milestoneOf.get(dl.milestone_id);
            const proof = proofs.get(dl.id);
            const inEscrow = ms?.status === 'in_escrow';
            const release = proof ? releaseOf.get(proof.id) : undefined;
            const canDeliver = side === 'creator' && inEscrow && (dl.status === 'upcoming' || dl.status === 'changes_requested');
            const msl = ms ? MILESTONE_LABEL[ms.status] : null;
            return (
              <li key={dl.id} className="g-deliv" id={proof ? `proof-${proof.id}` : undefined}>
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
                  {msl && dl.status !== 'done' ? <Badge tone={msl.tone}>{msl.label}</Badge> : null}
                  {deliverableBadge(dl, inEscrow)}
                </div>
                {proof && proof.status !== 'released' ? <ProofEvidence proof={proof} /> : null}
                {proof?.status === 'changes_requested' ? (
                  <Notice tone="coral">
                    {brandName} asked for changes{proof.changes_note ? `: “${proof.changes_note}”` : '.'} {side === 'creator' ? 'Send new proof when it’s ready.' : ''}
                  </Notice>
                ) : null}
                {proof?.status === 'releasing' ? <ReleaseTimer dealId={d.id} proof={proof} canUndo={side === 'brand'} /> : null}
                {release ? (
                  <p className="g-small g-muted">
                    {side === 'creator'
                      ? `${formatCents(release.net_cents)} released to your wallet (${formatCents(release.gross_cents)} less the ${formatCents(release.fee_cents)} fee).`
                      : `${formatCents(release.gross_cents)} released to ${creatorName}.`}
                  </p>
                ) : null}
                <div className="g-row-wrap">
                  {canDeliver ? (
                    <Button variant="primary" size="sm" icon="upload" onClick={() => setProofFor(dl)}>
                      {dl.status === 'changes_requested' ? 'send new proof' : 'send proof'}
                    </Button>
                  ) : null}
                  {side === 'brand' && proof?.status === 'in_review' ? (
                    <>
                      <Button variant="primary" size="sm" icon="check" loading={approve.isPending && approve.variables?.proofId === proof.id} onClick={() => approveProof(proof)}>
                        approve & release {formatCents(proof.value_cents)}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { setChangesNote(''); setChangesFor(proof); }}>request changes</Button>
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </Card>

      {side === 'brand' && d.payments.length > 0 ? (
        <Card title="Payments" flush>
          <div className="g-scrollx">
            <table className="g-table g-table--stack">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th className="g-right">Escrow</th>
                  <th className="g-right">Fee</th>
                  <th className="g-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {d.payments.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Date">{formatDate(p.created_at)}<div className="g-tiny g-faint">{p.reference}</div></td>
                    <td data-label="Method">{p.method_label}</td>
                    <td data-label="Status"><Badge tone={p.status === 'succeeded' ? 'mint' : p.status === 'failed' ? 'coral' : 'amber'}>{p.status === 'succeeded' ? 'in escrow' : p.status.replace('_', ' ')}</Badge></td>
                    <td className="g-right g-num" data-label="Escrow">{formatCents(p.base_cents)}</td>
                    <td className="g-right g-num g-muted" data-label="Fee">{formatCents(p.fee_cents)}</td>
                    <td className="g-right g-num g-strong" data-label="Total">{formatCents(p.total_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {d.status === 'completed' ? <RateDeal deal={d} side={side} /> : null}

      {d.status === 'completed' && side === 'creator' ? (
        <Card title={`Work with ${brandName} again`}>
          <div className="g-stack">
            <p className="g-muted">Send them the same deal as a new offer. They have 72 hours to answer.</p>
            <TextAreaField label="Note" value={againNote} maxLength={2000} onChange={(e) => setAgainNote(e.target.value)} />
            <div>
              <Button variant="primary" loading={again.isPending} onClick={() => again.mutate({ dealId: d.id, note: againNote }, { onSuccess: (offerId) => navigate(`/offers/${offerId}`) })}>
                offer it again
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {funding ? <FundDialog deal={d} onClose={() => setFunding(false)} /> : null}
      {proofFor ? <ProofDialog dealId={d.id} deliverable={proofFor} brandName={brandName} onClose={() => setProofFor(null)} /> : null}
      {changesFor ? (
        <Dialog
          open
          onClose={() => setChangesFor(null)}
          busy={changes.isPending}
          title="Request changes"
          description={`${creatorName} sees your note and sends new proof. The money stays in escrow.`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setChangesFor(null)} disabled={changes.isPending}>cancel</Button>
              <Button variant="danger" loading={changes.isPending} onClick={() => changes.mutate({ dealId: d.id, proofId: changesFor.id, note: changesNote }, { onSuccess: () => setChangesFor(null) })}>
                request changes
              </Button>
            </>
          }
        >
          <TextAreaField label="What needs to change" value={changesNote} maxLength={2000} onChange={(e) => setChangesNote(e.target.value)} autoFocus />
        </Dialog>
      ) : null}
      {confirmRelease ? (
        <Dialog
          open
          onClose={() => setConfirmRelease(null)}
          busy={approve.isPending}
          title={`Release ${formatCents(confirmRelease.value_cents)}?`}
          description={`This pays ${creatorName} from escrow. You’ll have ${6} seconds to undo.`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmRelease(null)} disabled={approve.isPending}>cancel</Button>
              <Button variant="primary" loading={approve.isPending} onClick={() => approve.mutate({ dealId: d.id, proofId: confirmRelease.id }, { onSuccess: () => setConfirmRelease(null) })}>
                approve & release
              </Button>
            </>
          }
        />
      ) : null}
    </div>
  );
}
