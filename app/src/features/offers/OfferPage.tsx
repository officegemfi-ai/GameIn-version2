import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Badge, Button, ButtonLink, Card, Dialog, ErrorState, Loading, Notice, TextAreaField, TimeAgo, TimeLeft } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { errorMessage } from '@/lib/errors';
import { dealDays, itemsFromJson } from '@/lib/items';
import { centsToInput, formatCents, parseDollars } from '@/lib/money';
import { useSeat } from '@/features/seats/SeatProvider';
import { useConversationWith } from '@/features/messages/api';
import { TermsForm, termsProblem, type Terms } from './TermsForm';
import { offerState, useAcceptOffer, useCounterOffer, useDeclineOffer, useOffer, useWithdrawOffer } from './api';

export default function OfferPage() {
  const { id = '' } = useParams();
  const seat = useSeat();
  const navigate = useNavigate();
  const q = useOffer(id);
  const accept = useAcceptOffer();
  const counter = useCounterOffer();
  const decline = useDeclineOffer();
  const withdraw = useWithdrawOffer();
  const [dialog, setDialog] = useState<'accept' | 'counter' | 'decline' | 'withdraw' | null>(null);
  const [terms, setTerms] = useState<Terms>({ title: '', amount: '', items: [], note: '' });
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const conversation = useConversationWith(q.data?.offer.brand_id ?? null, q.data?.offer.creator_id ?? null);

  if (q.isPending) return <Loading />;
  if (q.isError) {
    return (
      <div className="g-page">
        <PageHeader title="Offer" back={{ to: '/offers', label: 'offers' }} />
        <ErrorState error={errorMessage(q.error)} retry={() => void q.refetch()} />
      </div>
    );
  }
  const { offer: o, versions } = q.data;
  const side = seat.side;
  const st = offerState(o, side);
  const items = itemsFromJson(o.items);
  const brandName = o.brand?.name ?? 'The brand';
  const creatorName = o.creator?.display_name ?? 'The creator';
  const other = side === 'brand' ? creatorName : brandName;
  const canWithdraw = st.open && !st.yourTurn && o.last_by_side === side;
  const busy = accept.isPending || counter.isPending || decline.isPending || withdraw.isPending;

  const openCounter = () => {
    setTerms({ title: o.title ?? '', amount: centsToInput(o.amount_cents), items: items.length ? items : [{ label: '' }], note: '' });
    setProblem(null);
    setDialog('counter');
  };

  return (
    <div className="g-page g-page--narrow">
      <PageHeader
        back={{ to: '/offers', label: 'offers' }}
        title={o.title}
        subtitle={
          <>
            {brandName} → {creatorName}
            {o.source === 'package' ? ' · a booked package' : o.source === 'pitch' ? ` · pitched by ${creatorName}` : ''}
          </>
        }
        actions={<Badge tone={st.tone}>{st.label}</Badge>}
      />

      {st.yourTurn && o.expires_at ? (
        <Notice tone="mint">
          <b className="g-strong">Your turn.</b> Accept, counter or decline: <TimeLeft until={o.expires_at} /> to answer, then the offer expires.
        </Notice>
      ) : st.open && o.expires_at ? (
        <Notice tone="amber">
          Waiting on {other}: <TimeLeft until={o.expires_at} /> to answer.
        </Notice>
      ) : o.status === 'accepted' && o.deal_id ? (
        <Notice tone="mint" action={<ButtonLink to={`/deals/${o.deal_id}`} variant="primary" size="sm">open the deal</ButtonLink>}>
          Accepted {o.accepted_at ? <TimeAgo at={o.accepted_at} /> : null}. {side === 'brand' ? 'Fund escrow so the creator can start.' : 'The brand funds escrow next; then you can start.'}
        </Notice>
      ) : o.close_reason ? (
        <Notice>Declined: “{o.close_reason}”</Notice>
      ) : null}

      <Card title="The terms" actions={<span className="g-tiny g-muted">version {o.versions} · {o.changes_left ?? 0} change{o.changes_left === 1 ? '' : 's'} left</span>}>
        <div className="g-stack">
          <div className="g-row-wrap">
            <span className="g-terms__amount">{formatCents(o.amount_cents)}</span>
            {o.previous_amount_cents != null && o.previous_amount_cents !== o.amount_cents ? (
              <span className="g-muted">was {formatCents(o.previous_amount_cents)}</span>
            ) : null}
            <span className="g-muted">· plus 5% brand fee when funded · about {dealDays(items)} days</span>
          </div>
          <ol className="g-terms__items">
            {items.map((it, i) => (
              <li key={i}>
                <span>{it.label}</span>
                <span className="g-muted">{it.days ?? 7} days</span>
              </li>
            ))}
          </ol>
          {o.note ? <p className="g-quote g-pre">“{o.note}”<span className="g-muted"> — {o.last_by_side === 'brand' ? brandName : creatorName}</span></p> : null}
        </div>
        {st.yourTurn || canWithdraw ? (
          <div className="g-row-wrap g-terms__actions">
            {st.yourTurn ? (
              <>
                <Button variant="primary" onClick={() => setDialog('accept')} disabled={busy}>accept offer</Button>
                <Button onClick={openCounter} disabled={busy || (o.changes_left ?? 0) <= 0}>counter</Button>
                <Button variant="danger" onClick={() => { setReason(''); setDialog('decline'); }} disabled={busy}>decline</Button>
              </>
            ) : (
              <Button variant="danger" onClick={() => setDialog('withdraw')} disabled={busy}>withdraw</Button>
            )}
          </div>
        ) : null}
      </Card>

      <Card title="History" actions={conversation.data ? <Link to={`/messages/${conversation.data}`} className="g-small">message {other}</Link> : null}>
        <ol className="g-history">
          {[...versions].reverse().map((v, i, arr) => {
            const prev = arr[i + 1];
            const by = v.by_side === 'brand' ? brandName : creatorName;
            return (
              <li key={v.version}>
                <div className="g-between">
                  <span>
                    <b className="g-strong">{by}</b> {v.version === 1 ? (v.by_side === 'brand' ? 'offered' : 'pitched') : 'countered with'}{' '}
                    <b className="g-strong g-num">{formatCents(v.amount_cents)}</b>
                    {prev && prev.amount_cents !== v.amount_cents ? <span className="g-muted"> (was {formatCents(prev.amount_cents)})</span> : null}
                  </span>
                  <span className="g-tiny g-muted"><TimeAgo at={v.created_at} /></span>
                </div>
                {v.note ? <p className="g-muted g-small g-pre">“{v.note}”</p> : null}
              </li>
            );
          })}
        </ol>
      </Card>

      <Dialog
        open={dialog === 'accept'}
        onClose={() => setDialog(null)}
        busy={accept.isPending}
        title="Accept this offer?"
        description={`${formatCents(o.amount_cents)} for ${items.length} deliverable${items.length === 1 ? '' : 's'}. The deal starts now: ${side === 'brand' ? 'you fund escrow next.' : `${brandName} funds escrow next, then you deliver.`}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)} disabled={accept.isPending}>cancel</Button>
            <Button variant="primary" loading={accept.isPending} onClick={() => accept.mutate({ offerId: o.id!, as: side }, { onSuccess: (dealId) => navigate(`/deals/${dealId}`) })}>
              accept {formatCents(o.amount_cents)}
            </Button>
          </>
        }
      />

      <Dialog
        open={dialog === 'counter'}
        onClose={() => setDialog(null)}
        busy={counter.isPending}
        wide
        title="Counter-offer"
        description={`Change the price or the deliverables. ${other} then has 24 hours to answer.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)} disabled={counter.isPending}>cancel</Button>
            <Button
              variant="primary"
              loading={counter.isPending}
              onClick={() => {
                const p = termsProblem(terms, false);
                if (p) return setProblem(p);
                counter.mutate({ offerId: o.id!, as: side, amountCents: parseDollars(terms.amount)!, items: terms.items, note: terms.note }, { onSuccess: () => setDialog(null) });
              }}
            >
              send counter
            </Button>
          </>
        }
      >
        {problem ? <Notice tone="coral">{problem}</Notice> : null}
        <TermsForm value={terms} onChange={setTerms} withTitle={false} notePlaceholder="Why this works better" />
      </Dialog>

      <Dialog
        open={dialog === 'decline'}
        onClose={() => setDialog(null)}
        busy={decline.isPending}
        title="Decline this offer?"
        description="The offer closes. You can still message each other."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)} disabled={decline.isPending}>cancel</Button>
            <Button variant="danger" loading={decline.isPending} onClick={() => decline.mutate({ offerId: o.id!, as: side, reason }, { onSuccess: () => setDialog(null) })}>
              decline
            </Button>
          </>
        }
      >
        <TextAreaField label="Reason (optional, they’ll see it)" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
      </Dialog>

      <Dialog
        open={dialog === 'withdraw'}
        onClose={() => setDialog(null)}
        busy={withdraw.isPending}
        title="Withdraw your offer?"
        description={`${other} won’t be able to accept it any more.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)} disabled={withdraw.isPending}>keep it</Button>
            <Button variant="danger" loading={withdraw.isPending} onClick={() => withdraw.mutate({ offerId: o.id!, as: side }, { onSuccess: () => setDialog(null) })}>
              withdraw
            </Button>
          </>
        }
      />
    </div>
  );
}
