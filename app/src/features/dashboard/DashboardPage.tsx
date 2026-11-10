import { Link } from 'react-router';
import { Badge, ButtonLink, Card, Empty, Icon, Loading, QueryError, Stat } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatCents } from '@/lib/money';
import { loadedRows } from '@/lib/paging';
import { dueLabel } from '@/lib/time';
import type { Seat, Side } from '@/lib/types';
import { useSeat } from '@/features/seats/SeatProvider';
import { useDeals, useDealsToFund, type DealListRow, type DealToFund } from '@/features/deals/api';
import { dealHeadline, owesFunding } from '@/features/deals/model';
import { useMyPackages } from '@/features/packages/api';
import { useWalletSummary } from '@/features/wallet/api';
import { useBrandMoney } from '@/features/payments/api';
import { useReadyDeliverables, useTodoCounts, useTodos } from './api';
import { todoTasks, totalWaiting, type Task } from './todos';

type ReadyDeliverable = NonNullable<ReturnType<typeof useReadyDeliverables>['data']>[number];

/** A funded deliverable waiting for the creator's proof (or new proof, after changes were asked for). */
function deliverTask(dl: ReadyDeliverable): Task {
  const redo = dl.status === 'changes_requested';
  return {
    key: 'd' + dl.id,
    chip: redo ? 'redo' : 'deliver',
    tone: redo ? 'coral' : 'mint',
    to: `/deals/${dl.deal_id}`,
    amount: dl.amount_cents,
    text: (
      <>
        {redo ? 'Send new proof for ' : 'Deliver '}
        <b className="g-strong">{dl.label}</b>
        <span className="g-muted"> · {dl.deal_title}{dl.due_on ? `, ${dueLabel(dl.due_on)}` : ''}</span>
      </>
    ),
  };
}

/** A deal the brand still has to put money into. */
function fundTask(d: DealToFund): Task {
  return {
    key: 'f' + d.id,
    chip: 'fund',
    tone: 'coral',
    to: `/deals/${d.id}`,
    amount: d.money?.not_funded_cents,
    text: <>Fund <b className="g-strong">{d.title}</b><span className="g-muted"> so {d.creator?.display_name} can start</span></>,
  };
}

function TaskList({ tasks, empty, more }: { tasks: Task[]; empty: string; more: number }) {
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
      {more > 0 ? (
        <p className="g-muted g-small g-task__more">
          and {more.toLocaleString('en-US')} more: see <Link to="/offers">offers</Link>, <Link to="/deals">deals</Link> and <Link to="/messages">messages</Link>
        </p>
      ) : null}
    </div>
  );
}

/** The first few of the seat's running deals (the first page of the deals page's "active" tab: one request for both). */
function ActiveDeals({ deals, side }: { deals: DealListRow[]; side: Side }) {
  const active = deals.slice(0, 5);
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

/** Both dashboards end the same way: what needs this seat, and its deals under way. */
function NeedsYou({ tasks, empty, more, deals, side }: { tasks: Task[]; empty: string; more: number; deals: DealListRow[]; side: Side }) {
  return (
    <div className="g-grid-2">
      <Card title="Needs you">
        <TaskList tasks={tasks} empty={empty} more={more} />
      </Card>
      <ActiveDeals deals={deals} side={side} />
    </div>
  );
}

/**
 * How many more things wait on a seat than its dashboard lists: the database's count (when it has answered) less the
 * to-dos on show. The dashboard lists the first few; the pages behind the links have them all.
 */
function moreWaiting(counted: Parameters<typeof totalWaiting>[0], shown: number): number {
  return counted ? Math.max(0, totalWaiting(counted) - shown) : 0;
}

/** What a dashboard waits for before it says anything: one of its requests. */
interface Needed {
  isPending: boolean;
  isLoadingError: boolean;
  error: unknown;
  refetch: () => unknown;
}

/**
 * A dashboard states things (your balance, your deals, what needs you), so it shows nothing until every request those
 * come from has answered, and says so when one couldn't load. Without this a request that failed, or was just slower
 * than the others, read as a fact: "$0.00 available", "No active deals", "Book your first creator".
 * Returns what to show instead of the dashboard, or null when everything is in.
 */
function waitFor(needed: Needed[], title: string) {
  const failed = needed.find((q) => q.isLoadingError);
  if (failed) {
    return (
      <div className="g-page">
        <PageHeader title={title} />
        <QueryError query={failed} />
      </div>
    );
  }
  return needed.some((q) => q.isPending) ? <Loading /> : null;
}

function CreatorDashboard({ seat }: { seat: Seat }) {
  const todos = useTodos(seat);
  const counts = useTodoCounts(seat);
  const wallet = useWalletSummary(seat.id);
  const ready = useReadyDeliverables(seat.id);
  const deals = useDeals(seat, 'active');
  const packages = useMyPackages(seat.id);
  const waiting = waitFor([todos, deals, wallet, ready], `Hi, ${seat.name}`);
  if (waiting) return waiting;
  const w = wallet.data;
  const waitingOnYou = todoTasks(todos.data);
  const tasks = [...waitingOnYou, ...(ready.data ?? []).map(deliverTask)];
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
      <NeedsYou tasks={tasks} empty="You’re all caught up." more={moreWaiting(counts.data, waitingOnYou.length)} deals={loadedRows(deals.data)} side="creator" />
    </div>
  );
}

function BrandDashboard({ seat }: { seat: Seat }) {
  const todos = useTodos(seat);
  const counts = useTodoCounts(seat);
  const money = useBrandMoney(seat.id);
  const deals = useDeals(seat, 'active');
  const toFund = useDealsToFund(seat.id);
  const waiting = waitFor([todos, deals, money, toFund], seat.name);
  if (waiting) return waiting;
  const m = money.data;
  const waitingOnYou = todoTasks(todos.data);
  const tasks = [...(toFund.data ?? []).filter(owesFunding).map(fundTask), ...waitingOnYou];
  // a brand with any deal at all has money committed to it: the total is zero only before the first one
  const noDeals = (m?.total_cents ?? 0) === 0;
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
      <NeedsYou tasks={tasks} empty="Nothing waits on you." more={moreWaiting(counts.data, waitingOnYou.length)} deals={loadedRows(deals.data)} side="brand" />
    </div>
  );
}

export default function DashboardPage() {
  const seat = useSeat();
  return seat.side === 'creator' ? <CreatorDashboard seat={seat} /> : <BrandDashboard seat={seat} />;
}
