import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { Badge, ButtonLink, Card, Loading, Notice, QueryError, TimeAgo, TimeLeft } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { dealDays, itemDays, itemsFromJson } from '@/lib/items';
import { formatCents } from '@/lib/money';
import { FEE_PERCENT } from '@/lib/rules';
import type { Side } from '@/lib/types';
import { OtherSeat } from '@/features/seats/OtherSeat';
import { isParty } from '@/features/seats/party';
import { useSeat } from '@/features/seats/SeatProvider';
import { useConversationWith } from '@/features/messages/api';
import { OfferActions } from './OfferActions';
import { useOffer, type OfferDetail } from './api';
import { offerState } from './model';

type Offer = OfferDetail['offer'];

/** Whose turn it is and how long is left, or how the offer ended. */
function OfferNotice({ offer: o, side, other }: { offer: Offer; side: Side; other: string }) {
  const st = offerState(o, side);
  if (st.yourTurn && o.expires_at) {
    return (
      <Notice tone="mint">
        <b className="g-strong">Your turn.</b> Accept, counter or decline: <TimeLeft until={o.expires_at} /> to answer, then the offer expires.
      </Notice>
    );
  }
  if (st.open && o.expires_at) {
    return (
      <Notice tone="amber">
        Waiting on {other}: <TimeLeft until={o.expires_at} /> to answer.
      </Notice>
    );
  }
  if (o.status === 'accepted' && o.deal_id) {
    return (
      <Notice tone="mint" action={<ButtonLink to={`/deals/${o.deal_id}`} variant="primary" size="sm">open the deal</ButtonLink>}>
        Accepted {o.accepted_at ? <TimeAgo at={o.accepted_at} /> : null}. {side === 'brand' ? 'Fund escrow so the creator can start.' : 'The brand funds escrow next; then you can start.'}
      </Notice>
    );
  }
  if (o.close_reason) return <Notice>Declined: “{o.close_reason}”</Notice>;
  return null;
}

/** The current terms: price, deliverables, the last note, and the moves. */
function OfferTerms({ offer: o, side, names, other }: { offer: Offer; side: Side; names: Record<Side, string>; other: string }) {
  const items = itemsFromJson(o.items);
  return (
    <Card title="The terms" actions={<span className="g-tiny g-muted">version {o.versions} · {o.changes_left ?? 0} change{o.changes_left === 1 ? '' : 's'} left</span>}>
      <div className="g-stack">
        <div className="g-row-wrap">
          <span className="g-terms__amount">{formatCents(o.amount_cents)}</span>
          {o.previous_amount_cents != null && o.previous_amount_cents !== o.amount_cents ? (
            <span className="g-muted">was {formatCents(o.previous_amount_cents)}</span>
          ) : null}
          <span className="g-muted">{`· plus ${FEE_PERCENT}% brand fee when funded · about `}{dealDays(items)} days</span>
        </div>
        <ol className="g-terms__items">
          {items.map((it, i) => (
            <li key={i}>
              <span>{it.label}</span>
              <span className="g-muted">{itemDays(it)} days</span>
            </li>
          ))}
        </ol>
        {o.note ? <p className="g-quote g-pre">“{o.note}”<span className="g-muted"> — {o.last_by_side ? names[o.last_by_side] : names.creator}</span></p> : null}
      </div>
      <OfferActions offer={o} side={side} other={other} />
    </Card>
  );
}

/** Every version of the terms, newest first. */
function OfferHistory({ versions, names, messageLink }: { versions: OfferDetail['versions']; names: Record<Side, string>; messageLink: ReactNode }) {
  return (
    <Card title="History" actions={messageLink}>
      <ol className="g-history">
        {[...versions].reverse().map((v, i, arr) => {
          const prev = arr[i + 1];
          return (
            <li key={v.version}>
              <div className="g-between">
                <span>
                  <b className="g-strong">{names[v.by_side]}</b> {v.version === 1 ? (v.by_side === 'brand' ? 'offered' : 'pitched') : 'countered with'}{' '}
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
  );
}

export default function OfferPage() {
  const { id = '' } = useParams();
  const seat = useSeat();
  const q = useOffer(id);
  const conversation = useConversationWith(q.data?.offer.brand_id ?? null, q.data?.offer.creator_id ?? null);

  if (q.isPending) return <Loading />;
  if (q.isLoadingError) {
    return (
      <div className="g-page">
        <PageHeader title="Offer" back={{ to: '/offers', label: 'offers' }} />
        <QueryError query={q} />
      </div>
    );
  }
  const { offer: o, versions } = q.data;
  const side = seat.side;
  const st = offerState(o, side);
  const names: Record<Side, string> = { brand: o.brand?.name ?? 'The brand', creator: o.creator?.display_name ?? 'The creator' };
  const other = side === 'brand' ? names.creator : names.brand;

  // opened from a seat that isn't a party to this offer (a notification or a link for another of the account's
  // seats): "your turn" and the moves below would be someone else's
  if (!isParty(seat, o)) {
    return (
      <div className="g-page g-page--narrow">
        <PageHeader back={{ to: '/offers', label: 'offers' }} title={o.title} subtitle={`${names.brand} → ${names.creator}`} />
        <OtherSeat what="offer" of={o} />
      </div>
    );
  }

  return (
    <div className="g-page g-page--narrow">
      <PageHeader
        back={{ to: '/offers', label: 'offers' }}
        title={o.title}
        subtitle={
          <>
            {names.brand} → {names.creator}
            {o.source === 'package' ? ' · a booked package' : o.source === 'pitch' ? ` · pitched by ${names.creator}` : ''}
          </>
        }
        actions={<Badge tone={st.tone}>{st.label}</Badge>}
      />
      <OfferNotice offer={o} side={side} other={other} />
      <OfferTerms offer={o} side={side} names={names} other={other} />
      <OfferHistory
        versions={versions}
        names={names}
        messageLink={conversation.data ? <Link to={`/messages/${conversation.data}`} className="g-small">message {other}</Link> : null}
      />
    </div>
  );
}
