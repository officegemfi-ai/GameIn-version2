import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Badge, Button, Icon, Loading, Notice, QueryError, Stat } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatCents } from '@/lib/money';
import { FEE_PERCENT } from '@/lib/rules';
import { formatDate } from '@/lib/time';
import type { Side } from '@/lib/types';
import { useSeat } from '@/features/seats/SeatProvider';
import { useConversationWith } from '@/features/messages/api';
import { BookAgain, DealPayments } from './DealExtras';
import { Deliverables } from './Deliverables';
import { FundDialog } from './FundDialog';
import { RateDeal } from './RateDeal';
import { useDeal, useSimulatePayment, type DealDetail } from './api';
import { DEAL_STATUS } from './model';

type Names = Record<Side, string>;

/** The deal's money at a glance. */
function DealStats({ deal: d, side }: { deal: DealDetail; side: Side }) {
  const m = d.money;
  const notFunded = m.not_funded_cents ?? 0;
  const done = d.deliverables.filter((x) => x.status === 'done').length;
  return (
    <div className="g-grid-4">
      <Stat label="Deal" value={formatCents(m.total_cents)} note={`${done} of ${d.deliverables.length} delivered`} />
      <Stat label="In escrow" value={formatCents(m.in_escrow_cents)} tone="mint" note="waiting on approval" />
      <Stat label="Released" value={formatCents(m.released_cents)} note={side === 'creator' ? `to you, less ${FEE_PERCENT}%` : 'to the creator'} />
      {notFunded > 0 ? (
        <Stat label="Not funded" value={formatCents(notFunded)} tone="coral" note={side === 'brand' ? 'fund it so the work can start' : 'the brand funds this next'} />
      ) : (
        <Stat label="Clearing" value={formatCents(m.clearing_cents)} note="bank or wire on its way" />
      )}
    </div>
  );
}

/** What the deal needs from whom right now: funding, payments that are clearing, or that it's done. */
function DealNotices({ deal: d, side, names }: { deal: DealDetail; side: Side; names: Names }) {
  const simulate = useSimulatePayment();
  const [funding, setFunding] = useState(false);
  const m = d.money;
  const notFunded = m.not_funded_cents ?? 0;
  const clearing = d.payments.filter((p) => p.status === 'processing' || p.status === 'awaiting_wire');
  return (
    <>
      {side === 'brand' && notFunded > 0 && d.status !== 'cancelled' ? (
        <Notice tone="coral" action={<Button variant="primary" onClick={() => setFunding(true)}>fund escrow</Button>}>
          <b className="g-strong">Fund {formatCents(notFunded)}</b> so {names.creator} can deliver. You approve each part before it’s released.
        </Notice>
      ) : null}
      {side === 'creator' && notFunded > 0 && (m.in_escrow_cents ?? 0) === 0 && (m.clearing_cents ?? 0) === 0 ? (
        <Notice tone="amber">Waiting on {names.brand} to fund escrow. You can deliver as soon as the money is in escrow.</Notice>
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
      {funding ? <FundDialog deal={d} onClose={() => setFunding(false)} /> : null}
    </>
  );
}

export default function DealPage() {
  const { id = '' } = useParams();
  const seat = useSeat();
  const q = useDeal(id);
  const conversation = useConversationWith(q.data?.brand_id ?? null, q.data?.creator_id ?? null);

  if (q.isPending) return <Loading />;
  if (q.isError) {
    return (
      <div className="g-page">
        <PageHeader title="Deal" back={{ to: '/deals', label: 'deals' }} />
        <QueryError query={q} />
      </div>
    );
  }
  const d = q.data;
  const side = seat.side;
  const names: Names = { brand: d.brand?.name ?? 'The brand', creator: d.creator?.display_name ?? 'The creator' };
  const status = DEAL_STATUS[d.status];

  return (
    <div className="g-page">
      <PageHeader
        back={{ to: '/deals', label: 'deals' }}
        title={d.title}
        subtitle={
          <>
            {names.brand} × <Link to={`/c/${d.creator?.handle ?? ''}`}>{names.creator}</Link> · started {formatDate(d.created_at)}
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
      <DealStats deal={d} side={side} />
      <DealNotices deal={d} side={side} names={names} />
      <Deliverables deal={d} side={side} names={names} />
      {side === 'brand' && d.payments.length > 0 ? <DealPayments payments={d.payments} /> : null}
      {d.status === 'completed' ? <RateDeal deal={d} side={side} /> : null}
      {d.status === 'completed' && side === 'creator' ? <BookAgain dealId={d.id} brandName={names.brand} /> : null}
    </div>
  );
}
