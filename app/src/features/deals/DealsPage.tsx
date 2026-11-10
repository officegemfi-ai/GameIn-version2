import { useState } from 'react';
import { Link } from 'react-router';
import { Badge, Card, Empty, HexAvatar, Loading, Progress, QueryError, Tabs } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatCents } from '@/lib/money';
import { useSeat } from '@/features/seats/SeatProvider';
import { useDeals, type DealListRow } from './api';
import { dealHeadline, isActiveDeal, isFinishedDeal, owesFunding } from './model';

function DealRow({ d, side }: { d: DealListRow; side: 'brand' | 'creator' }) {
  const other = side === 'brand' ? d.creator?.display_name : d.brand?.name;
  const done = d.deliverables.filter((x) => x.status === 'done').length;
  const review = d.deliverables.filter((x) => x.status === 'in_review').length;
  const owes = side === 'brand' && owesFunding(d);
  return (
    <Link to={`/deals/${d.id}`} className="g-item">
      <HexAvatar name={other} size={40} brand={side === 'creator'} />
      <div className="g-item__main">
        <span className="g-item__title">{d.title}</span>
        <span className="g-item__sub">{other} · {dealHeadline(d.money, d.status, side)}</span>
        <div className="g-deal__progress">
          <Progress value={done} max={d.deliverables.length} label={`${done} of ${d.deliverables.length} delivered`} />
          <span className="g-tiny g-muted">{done}/{d.deliverables.length}</span>
        </div>
      </div>
      <div className="g-item__end">
        <span className="g-strong g-num">{formatCents(d.money?.total_cents)}</span>
        {owes ? <Badge tone="coral">fund</Badge> : side === 'brand' && review ? <Badge tone="amber">{review} to review</Badge> : side === 'creator' && review ? <Badge tone="amber">in review</Badge> : null}
      </div>
    </Link>
  );
}

export default function DealsPage() {
  const seat = useSeat();
  const q = useDeals(seat);
  const [tab, setTab] = useState<'active' | 'done'>('active');
  const rows = (q.data ?? []).filter(tab === 'active' ? isActiveDeal : isFinishedDeal);
  const activeCount = (q.data ?? []).filter(isActiveDeal).length;
  return (
    <div className="g-page">
      <PageHeader title="Deals" subtitle="Accepted offers: the money in escrow, the work delivered, what’s been released." />
      <Tabs label="Deals" value={tab} onChange={setTab} tabs={[{ id: 'active', label: 'active', count: activeCount }, { id: 'done', label: 'complete' }]} />
      {q.isPending ? (
        <Loading />
      ) : q.isLoadingError ? (
        <QueryError query={q} />
      ) : rows.length === 0 ? (
        <Card>
          <Empty title={tab === 'active' ? 'No active deals' : 'No completed deals yet'}>
            {tab === 'active' ? 'A deal starts when an offer is accepted.' : 'Deals show up here once everything is released.'}
          </Empty>
        </Card>
      ) : (
        <Card flush>
          <div className="g-list g-list--pad">
            {rows.map((d) => (
              <DealRow key={d.id} d={d} side={seat.side} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
