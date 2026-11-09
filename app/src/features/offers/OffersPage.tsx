import { useState } from 'react';
import { Link } from 'react-router';
import { Badge, ButtonLink, Card, Empty, ErrorState, HexAvatar, Loading, Tabs, TimeAgo, TimeLeft } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { errorMessage } from '@/lib/errors';
import { itemsFromJson } from '@/lib/items';
import { formatCents } from '@/lib/money';
import { useSeat } from '@/features/seats/SeatProvider';
import { offerState, useOffers, type OfferListRow } from './api';

type Tab = 'yours' | 'theirs' | 'closed';

function OfferRow({ o, side }: { o: OfferListRow; side: 'brand' | 'creator' }) {
  const st = offerState(o, side);
  const other = side === 'brand' ? o.creator?.display_name : o.brand?.name;
  const n = itemsFromJson(o.items).length;
  return (
    <Link to={`/offers/${o.id}`} className="g-item">
      <HexAvatar name={other} size={40} brand={side === 'creator'} />
      <div className="g-item__main">
        <span className="g-item__title">{o.title}</span>
        <span className="g-item__sub">
          {other} · {n} deliverable{n === 1 ? '' : 's'}
          {o.source === 'package' ? ' · booked package' : o.source === 'pitch' ? ' · pitch' : o.source === 'book_again' ? ' · again' : ''}
        </span>
      </div>
      <div className="g-item__end">
        <span className="g-strong g-num">{formatCents(o.amount_cents)}</span>
        <span className="g-row" style={{ gap: 8 }}>
          {st.open && o.expires_at ? (
            <span className="g-tiny g-muted"><TimeLeft until={o.expires_at} /></span>
          ) : o.last_version_at ? (
            <span className="g-tiny g-muted"><TimeAgo at={o.last_version_at} /></span>
          ) : null}
          <Badge tone={st.tone}>{st.label}</Badge>
        </span>
      </div>
    </Link>
  );
}

export default function OffersPage() {
  const seat = useSeat();
  const q = useOffers(seat);
  const all = q.data ?? [];
  const groups: Record<Tab, OfferListRow[]> = { yours: [], theirs: [], closed: [] };
  for (const o of all) {
    const st = offerState(o, seat.side);
    groups[st.yourTurn ? 'yours' : st.open ? 'theirs' : 'closed'].push(o);
  }
  const [tab, setTab] = useState<Tab | null>(null);
  const current: Tab = tab ?? (groups.yours.length || !groups.theirs.length ? 'yours' : 'theirs');

  const empty: Record<Tab, string> = {
    yours: 'Nothing waits on you.',
    theirs: seat.side === 'brand' ? 'No offers out. Send one from a creator’s page.' : 'No pitches out.',
    closed: 'Accepted, declined and expired offers show up here.',
  };

  return (
    <div className="g-page">
      <PageHeader
        title="Offers"
        subtitle="Each reply restarts the clock: 24 hours to answer (72 for a pitch), up to 8 changes."
        actions={
          seat.side === 'brand' ? (
            <ButtonLink to="/discover" variant="primary" icon="discover">find a creator</ButtonLink>
          ) : (
            <ButtonLink to="/offers/new" variant="primary" icon="plus">pitch a brand</ButtonLink>
          )
        }
      />
      <Tabs
        label="Offers"
        value={current}
        onChange={setTab}
        tabs={[
          { id: 'yours', label: 'your turn', count: groups.yours.length },
          { id: 'theirs', label: 'waiting on them', count: 0 },
          { id: 'closed', label: 'closed' },
        ]}
      />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={errorMessage(q.error)} retry={() => void q.refetch()} />
      ) : groups[current].length === 0 ? (
        <Card>
          <Empty title={empty[current]} />
        </Card>
      ) : (
        <Card flush>
          <div className="g-list g-list--pad" role="list">
            {groups[current].map((o) => (
              <OfferRow key={o.id} o={o} side={seat.side} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
