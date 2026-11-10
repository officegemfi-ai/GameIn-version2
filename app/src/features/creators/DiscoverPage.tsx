import { useState } from 'react';
import { Button, Empty, Icon, QueryError, Skeleton } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useSeat } from '@/features/seats/SeatProvider';
import { CreatorCard } from './CreatorCard';
import { useCreators } from './api';

export default function DiscoverPage() {
  const seat = useSeat();
  const [text, setText] = useState('');
  const search = useDebouncedValue(text);
  const q = useCreators(search);
  const creators = q.data?.pages.flat() ?? [];

  return (
    <div className="g-page">
      <PageHeader
        title="Discover creators"
        subtitle={seat.side === 'brand' ? 'Book a package as it is, or send a custom offer. Your money waits in escrow until you approve the work.' : 'See who else is on GameIn and what they offer.'}
      />
      <label className="g-search">
        <Icon name="discover" />
        <span className="g-visually-hidden">Search creators</span>
        <input className="g-input" type="search" placeholder="Search by name or handle" value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {q.isPending ? (
        <div className="g-grid-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} height={190} />)}</div>
      ) : q.isLoadingError ? (
        <QueryError query={q} />
      ) : creators.length === 0 ? (
        <Empty title={search ? `No creators match “${search}”` : 'No creators yet'}>Try another name or handle.</Empty>
      ) : (
        <>
          <div className="g-grid-3">
            {creators.map((c) => (
              <CreatorCard key={c.id} creator={c} />
            ))}
          </div>
          {q.hasNextPage ? (
            <div className="g-row" style={{ justifyContent: 'center' }}>
              <Button onClick={() => void q.fetchNextPage()} loading={q.isFetchingNextPage}>show more</Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
