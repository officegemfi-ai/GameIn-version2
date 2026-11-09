import { Link } from 'react-router';
import { Badge, ButtonLink, Card, Empty, ErrorState, Icon, Loading, Stat, TimeLeft } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { errorMessage } from '@/lib/errors';
import { formatCents } from '@/lib/money';
import { dueLabel } from '@/lib/time';
import type { Seat, TodoRow } from '@/lib/types';
import { useSeat } from '@/features/seats/SeatProvider';
import { useDeals, dealHeadline, type DealListRow } from '@/features/deals/api';
import { useMyPackages } from '@/features/packages/api';
import { useWallet } from '@/features/wallet/api';
import { useBrandMoney } from '@/features/payments/api';
import { useReadyDeliverables, useTodos } from './api';

interface Task {
  key: string;
  chip: string;
  tone: 'mint' | 'coral' | 'amber' | 'neutral';
  text: React.ReactNode;
  to: string;
  amount?: number | null;
}

function todoTask(t: TodoRow): Task | null {
  const amount = t.amount_cents;
  switch (t.kind) {
    case 'answer_offer':
      return { key: 'o' + t.ref_id, chip: 'offer', tone: 'mint', to: `/offers/${t.ref_id}`, amount, text: <>Answer <b className="g-strong">{t.title}</b>{t.due_at ? <span className="g-muted"> · <TimeLeft until={t.due_at} /></span> : null}</> };
    case 'answer_counter':
    case 'answer_pitch':
      return { key: 'o' + t.ref_id, chip: t.kind === 'answer_pitch' ? 'pitch' : 'counter', tone: 'mint', to: `/offers/${t.ref_id}`, amount, text: <>Answer <b className="g-strong">{t.title}</b>{t.due_at ? <span className="g-muted"> · <TimeLeft until={t.due_at} /></span> : null}</> };
    case 'review_proof':
      return { key: 'p' + t.ref_id, chip: 'proof', tone: 'amber', to: `/proofs/${t.ref_id}`, amount, text: <>Review proof for <b className="g-strong">{t.title}</b></> };
    case 'unread_messages':
      return { key: 'm' + t.ref_id, chip: 'message', tone: 'neutral', to: `/messages/${t.ref_id}`, text: 'Unread messages' };
    case 'answer_renewal':
      return { key: 'r' + t.ref_id, chip: 'renew', tone: 'neutral', to: '/deals', amount, text: <>Renewal for <b className="g-strong">{t.title}</b></> };
    default:
      return null;
  }
}

function TaskList({ tasks, empty }: { tasks: Task[]; empty: string }) {
  if (tasks.length === 0) return <p className="g-muted">{empty}</p>;
  return (
    <div className="g-list">
      {tasks.map((t) => (
        <Link key={t.key} to={t.to} className="g-item g-task">
          <Badge tone={t.tone}>{t.chip}</Badge>
          <span className="g-item__main g-task__text">{t.text}</span>
          {t.amount != null ? <span className="g-strong g-num">{formatCents(t.amount)}</span> : null}
          <Icon name="chevronRight" width={16} height={16} />
        </Link>
      ))}
    </div>
  );
}

function ActiveDeals({ deals, side }: { deals: DealListRow[]; side: Seat['side'] }) {
  const active = deals.filter((d) => d.status === 'awaiting_funding' || d.status === 'in_progress').slice(0, 5);
  return (
    <Card title="Active deals" actions={<Link className="g-small" to="/deals">see all</Link>}>
      {active.length === 0 ? (
        <p className="g-muted">No active deals.</p>
      ) : (
        <div className="g-list">
          {active.map((d) => (
            <Link key={d.id} to={`/deals/${d.id}`} className="g-item">
              <span className="g-item__main">
                <span className="g-item__title">{d.title}</span>
                <span className="g-item__sub">{side === 'brand' ? d.creator?.display_name : d.brand?.name} · {dealHeadline(d.money, d.status, side)}</span>
              </span>
              <span className="g-strong g-num">{formatCents(d.money?.total_cents)}</span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

function CreatorDashboard({ seat }: { seat: Seat }) {
  const todos = useTodos(seat);
  const wallet = useWallet(seat.id);
  const ready = useReadyDeliverables(seat.id);
  const deals = useDeals(seat);
  const packages = useMyPackages(seat.id);
  if (todos.isPending || deals.isPending) return <Loading />;
  if (todos.isError) return <ErrorState error={errorMessage(todos.error)} retry={() => void todos.refetch()} />;
  const w = wallet.data?.wallet;
  const tasks: Task[] = [
    ...(todos.data ?? []).map(todoTask).filter((t): t is Task => !!t),
    ...(ready.data ?? []).map((dl) => ({
      key: 'd' + dl.id,
      chip: dl.status === 'changes_requested' ? 'redo' : 'deliver',
      tone: (dl.status === 'changes_requested' ? 'coral' : 'mint') as Task['tone'],
      to: `/deals/${dl.deal.id}`,
      amount: dl.amount_cents,
      text: (
        <>
          {dl.status === 'changes_requested' ? 'Send new proof for ' : 'Deliver '}
          <b className="g-strong">{dl.label}</b>
          <span className="g-muted"> · {dl.deal.title}{dl.due_on ? `, ${dueLabel(dl.due_on)}` : ''}</span>
        </>
      ),
    })),
  ];
  return (
    <div className="g-page">
      <PageHeader title={`Hi, ${seat.name}`} subtitle="What needs you, and where your money is." actions={<ButtonLink to="/offers/new" icon="plus">pitch a brand</ButtonLink>} />
      <div className="g-grid-4">
        <Stat label="Available" value={formatCents(w?.available_cents)} tone="mint" note={<Link to="/wallet">open wallet</Link>} />
        <Stat label="In escrow" value={formatCents(w?.in_escrow_cents)} note="yours once approved" />
        <Stat label="Earned" value={formatCents(w?.earned_cents)} note="all time, after fees" />
      </div>
      {packages.data && packages.data.length === 0 ? (
        <Card tone="mint">
          <div className="g-between">
            <div className="g-stack-sm">
              <h2>Add your first package</h2>
              <p className="g-muted">A package is a ready-made deal brands can book in one step.</p>
            </div>
            <ButtonLink to="/packages" variant="primary">add a package</ButtonLink>
          </div>
        </Card>
      ) : null}
      <div className="g-grid-2">
        <Card title="Needs you">
          <TaskList tasks={tasks} empty="You’re all caught up." />
        </Card>
        <ActiveDeals deals={deals.data ?? []} side="creator" />
      </div>
    </div>
  );
}

function BrandDashboard({ seat }: { seat: Seat }) {
  const todos = useTodos(seat);
  const money = useBrandMoney(seat.id);
  const deals = useDeals(seat);
  if (todos.isPending || deals.isPending) return <Loading />;
  if (todos.isError) return <ErrorState error={errorMessage(todos.error)} retry={() => void todos.refetch()} />;
  const m = money.data;
  const fund: Task[] = (deals.data ?? [])
    .filter((d) => (d.money?.not_funded_cents ?? 0) > 0 && d.status !== 'cancelled')
    .map((d) => ({ key: 'f' + d.id, chip: 'fund', tone: 'coral', to: `/deals/${d.id}`, amount: d.money?.not_funded_cents, text: <>Fund <b className="g-strong">{d.title}</b><span className="g-muted"> so {d.creator?.display_name} can start</span></> }));
  const tasks: Task[] = [...fund, ...(todos.data ?? []).map(todoTask).filter((t): t is Task => !!t)];
  const noDeals = (deals.data ?? []).length === 0;
  return (
    <div className="g-page">
      <PageHeader title={seat.name} subtitle="You’re the brand. Offers, escrow and proof, shared live with each creator." actions={<ButtonLink to="/discover" variant="primary" icon="discover">find a creator</ButtonLink>} />
      <div className="g-grid-4">
        <Stat label="In escrow" value={formatCents(m?.in_escrow_cents)} tone="mint" note="released per approved proof" />
        <Stat label="To fund" value={formatCents(m?.not_funded_cents)} tone={(m?.not_funded_cents ?? 0) > 0 ? 'coral' : undefined} note="accepted, waiting on payment" />
        <Stat label="Clearing" value={formatCents(m?.clearing_cents)} note="bank and wire payments" />
        <Stat label="Released" value={formatCents(m?.released_cents)} note={<Link to="/payments">see payments</Link>} />
      </div>
      {noDeals ? (
        <Card tone="mint">
          <Empty title="Book your first creator" action={<ButtonLink to="/discover" variant="primary">discover creators</ButtonLink>}>
            Book a package as it is, or send your own terms. You only fund escrow once they accept.
          </Empty>
        </Card>
      ) : null}
      <div className="g-grid-2">
        <Card title="Needs you">
          <TaskList tasks={tasks} empty="Nothing waits on you." />
        </Card>
        <ActiveDeals deals={deals.data ?? []} side="brand" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const seat = useSeat();
  return seat.side === 'creator' ? <CreatorDashboard seat={seat} /> : <BrandDashboard seat={seat} />;
}
