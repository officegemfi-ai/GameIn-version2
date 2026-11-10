import { useState } from 'react';
import { Link } from 'react-router';
import { Badge, ButtonLink, Card, Empty, HexAvatar, Loading, QueryError, ShowMore, Tabs, TimeAgo, TimeLeft } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { itemsFromJson } from '@/lib/items';
import type { OfferTab } from '@/lib/keys';
import { formatCents } from '@/lib/money';
import { loadedRows } from '@/lib/paging';
import { MAX_COUNTERS, OFFER_HOURS, PITCH_HOURS } from '@/lib/rules';
import { useTodoCounts } from '@/features/dashboard/api';
import { badgeCounts } from '@/features/dashboard/todos';
import { useSeat } from '@/features/seats/SeatProvider';
import { useOffers, type OfferListRow } from './api';
import { offerState } from './model';

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
  const [picked, setPicked] = useState<OfferTab | null>(null);
  // The two open tabs are asked for at once: which one the page opens on depends on both. The closed one, which is
  // where an account's history piles up, only when it is opened.
  const yours = useOffers(seat, 'yours');
  const theirs = useOffers(seat, 'theirs');
  const lists = { yours, theirs, closed: useOffers(seat, 'closed', { enabled: picked === 'closed' }) };
  const rows = { yours: loadedRows(yours.data), theirs: loadedRows(theirs.data), closed: loadedRows(lists.closed.data) };
  // until the person picks: what waits on them, unless nothing does and something waits on the other side
  const deciding = picked === null && (yours.isPending || theirs.isPending) && !yours.isLoadingError && !theirs.isLoadingError;
  const current: OfferTab = picked ?? (rows.yours.length || !rows.theirs.length ? 'yours' : 'theirs');
  const q = lists[current];
  // how many wait on this seat: the same count the navigation shows, counted by the database
  const waiting = badgeCounts(useTodoCounts(seat).data).offers;

  const empty: Record<OfferTab, string> = {
    yours: 'Nothing waits on you.',
    theirs: seat.side === 'brand' ? 'No offers out. Send one from a creator’s page.' : 'No pitches out.',
    closed: 'Accepted, declined and expired offers show up here.',
  };

  return (
    <div className="g-page">
      <PageHeader
        title="Offers"
        subtitle={`Each reply restarts the clock: ${OFFER_HOURS} hours to answer (${PITCH_HOURS} for a pitch), up to ${MAX_COUNTERS} changes.`}
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
        onChange={setPicked}
        tabs={[
          { id: 'yours', label: 'your turn', count: waiting },
          { id: 'theirs', label: 'waiting on them', count: 0 },
          { id: 'closed', label: 'closed' },
        ]}
      />
      {deciding || q.isPending ? (
        <Loading />
      ) : q.isLoadingError ? (
        <QueryError query={q} />
      ) : rows[current].length === 0 ? (
        <Card>
          <Empty title={empty[current]} />
        </Card>
      ) : (
        <Card flush>
          <div className="g-list g-list--pad" role="list">
            {rows[current].map((o) => (
              <OfferRow key={o.id} o={o} side={seat.side} />
            ))}
          </div>
          <ShowMore list={q} />
        </Card>
      )}
    </div>
  );
}
