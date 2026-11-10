import { Link } from 'react-router';
import { Badge, Button, Card, Empty, Loading, Notice, QueryError, ShowMore, Skeleton, Stat } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatCents } from '@/lib/money';
import { loadedRows } from '@/lib/paging';
import { formatDate } from '@/lib/time';
import { useSeat } from '@/features/seats/SeatProvider';
import { useSimulatePayment } from '@/features/deals/api';
import { paymentStatus } from '@/features/deals/model';
import { useBrandMoney, useBrandPayments } from './api';

export default function PaymentsPage() {
  const seat = useSeat();
  const brandId = seat.side === 'brand' ? seat.id : null;
  const money = useBrandMoney(brandId);
  const payments = useBrandPayments(brandId);
  const rows = loadedRows(payments.data);
  const simulate = useSimulatePayment();

  if (!brandId) {
    return (
      <div className="g-page">
        <PageHeader title="Payments" />
        <Empty title="Payments belong to brands">Switch to a brand from the top bar. Creators see their money under Wallet.</Empty>
      </div>
    );
  }
  const m = money.data;
  return (
    <div className="g-page">
      <PageHeader title="Payments" subtitle={`${seat.name}’s money in escrow, and every payment into it.`} />
      {/* the figures only once they're known: a request that failed or hasn't answered isn't "$0.00" */}
      {money.isLoadingError ? (
        <QueryError query={money} />
      ) : money.isPending ? (
        <div className="g-grid-4" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} height={104} />
          ))}
        </div>
      ) : (
        <div className="g-grid-4">
          <Stat label="In escrow" value={formatCents(m?.in_escrow_cents)} tone="mint" note="released when you approve" />
          <Stat label="To fund" value={formatCents(m?.not_funded_cents)} tone={(m?.not_funded_cents ?? 0) > 0 ? 'coral' : undefined} note="accepted, not funded yet" />
          <Stat label="Released" value={formatCents(m?.released_cents)} note="paid to creators" />
          <Stat label="Paid" value={formatCents(m?.paid_cents)} note={`incl. ${formatCents(m?.fees_cents)} in fees`} />
        </div>
      )}
      <Notice>Test mode: cards succeed at once and bank payments clear when you mark them. Nothing is charged.</Notice>
      <Card title="Payments" flush>
        {payments.isPending ? (
          <Loading />
        ) : payments.isLoadingError ? (
          <QueryError query={payments} />
        ) : rows.length === 0 ? (
          <Empty title="No payments yet">You fund escrow from a deal once the creator accepts.</Empty>
        ) : (
          <div className="g-scrollx">
            <table className="g-table g-table--stack">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Deal</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th className="g-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const clearing = p.status === 'processing' || p.status === 'awaiting_wire';
                  const st = paymentStatus(p.status);
                  return (
                    <tr key={p.id}>
                      <td className="g-nowrap" data-label="Date">{formatDate(p.created_at)}<div className="g-tiny g-faint">{p.reference}</div></td>
                      <td data-label="Deal">
                        {p.deal ? <Link to={`/deals/${p.deal.id}`}>{p.deal.title}</Link> : null}
                        <div className="g-tiny g-muted">{p.deal?.creator?.display_name}</div>
                      </td>
                      <td data-label="Method">{p.method_label}</td>
                      <td data-label="Status">
                        <div className="g-row-wrap">
                          <Badge tone={st.tone}>{st.label}</Badge>
                          {clearing && p.provider === 'simulated' ? (
                            <Button size="sm" variant="ghost" loading={simulate.isPending && simulate.variables?.paymentId === p.id} onClick={() => simulate.mutate({ dealId: p.deal_id, paymentId: p.id, outcome: 'cleared' })}>
                              mark cleared (test)
                            </Button>
                          ) : null}
                        </div>
                      </td>
                      <td className="g-right g-num" data-label="Total">
                        <span className="g-strong">{formatCents(p.total_cents)}</span>
                        <div className="g-tiny g-muted">{formatCents(p.base_cents)} + {formatCents(p.fee_cents)} fee</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <ShowMore list={payments} />
          </div>
        )}
      </Card>
    </div>
  );
}
