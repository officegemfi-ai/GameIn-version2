import { useState } from 'react';
import { Link } from 'react-router';
import { ActionDialog, Button, Card, Empty, Loading, Notice, QueryError, Segmented, Stat, TextField } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { centsToInput, formatCents, instantPayoutFee, parseDollars } from '@/lib/money';
import { FEE_PERCENT, INSTANT_PAYOUT_PERCENT } from '@/lib/rules';
import { formatDate } from '@/lib/time';
import { useSeat } from '@/features/seats/SeatProvider';
import { useRequestPayout, useWalletLines, useWalletSummary } from './api';

const LINE_LABEL: Record<string, string> = { release: 'Released', fee: `GameIn fee (${FEE_PERCENT}%)`, payout: 'Payout to bank', instant_payout: 'Instant payout' };

function PayoutDialog({ creatorId, available, onClose }: { creatorId: string; available: number; onClose: () => void }) {
  const payout = useRequestPayout();
  const [amount, setAmount] = useState(centsToInput(available));
  const [speed, setSpeed] = useState<'standard' | 'instant'>('standard');
  const cents = parseDollars(amount);
  const fee = speed === 'instant' && cents ? instantPayoutFee(cents) : 0;
  const problem = cents == null || cents <= 0 ? 'Enter an amount' : cents > available ? `You can pay out up to ${formatCents(available)}` : cents - fee <= 0 ? 'Too small to cover the instant fee' : null;
  return (
    <ActionDialog
      onClose={onClose}
      pending={payout.isPending}
      title="Pay out"
      description="From your available balance to your bank. Test mode: no money moves."
      action={<>pay out {cents ? formatCents(cents - fee) : ''}</>}
      disabled={!!problem}
      onAction={() => payout.mutate({ creatorId, amountCents: cents!, instant: speed === 'instant' }, { onSuccess: onClose })}
    >
      <TextField label="Amount" prefix="$" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} error={amount && problem ? problem : null} hint={`Available: ${formatCents(available)}`} />
      <div className="g-stack-sm">
        <span className="g-field__label">Speed</span>
        <Segmented label="Speed" value={speed} onChange={setSpeed} options={[{ value: 'standard', label: 'weekly · free' }, { value: 'instant', label: `instant · ${INSTANT_PAYOUT_PERCENT}%` }]} />
        {speed === 'instant' && cents ? <span className="g-field__hint">Fee {formatCents(fee)}; you receive {formatCents(cents - fee)}.</span> : null}
      </div>
    </ActionDialog>
  );
}

export default function WalletPage() {
  const seat = useSeat();
  const creatorId = seat.side === 'creator' ? seat.id : null;
  const summary = useWalletSummary(creatorId);
  const lines = useWalletLines(creatorId);
  const [paying, setPaying] = useState(false);

  if (!creatorId) {
    return (
      <div className="g-page">
        <PageHeader title="Wallet" />
        <Empty title="The wallet belongs to your creator profile">Brands see their escrow and payments under Payments.</Empty>
      </div>
    );
  }
  if (summary.isPending || lines.isPending) return <Loading />;
  if (summary.isError || lines.isError) return <QueryError query={summary.isError ? summary : lines} />;
  const w = summary.data;
  const available = w?.available_cents ?? 0;

  return (
    <div className="g-page">
      <PageHeader title="Wallet" subtitle={`Money released to you from escrow, less GameIn’s ${FEE_PERCENT}%.`} actions={<Button variant="primary" icon="coin" disabled={available <= 0} onClick={() => setPaying(true)}>pay out</Button>} />
      <div className="g-grid-4">
        <Stat label="Available" value={formatCents(available)} tone="mint" note="ready to pay out" />
        <Stat label="In escrow" value={formatCents(w?.in_escrow_cents)} note="yours once approved" />
        <Stat label="Earned" value={formatCents(w?.earned_cents)} note={`after ${formatCents(w?.fees_cents)} in fees`} />
        <Stat label="Paid out" value={formatCents(w?.paid_out_cents)} note={w?.payouts_pending_cents ? `${formatCents(w.payouts_pending_cents)} on its way` : 'to your bank'} />
      </div>
      <Notice>Test mode: payouts are simulated. Once payments go live you’ll connect a bank account through Stripe.</Notice>
      <Card title="History" flush>
        {lines.data.length === 0 ? (
          <Empty title="Nothing yet">Releases from your deals show up here.</Empty>
        ) : (
          <div className="g-scrollx">
            <table className="g-table g-table--fit">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>What</th>
                  <th className="g-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lines.data.map((l, i) => (
                  <tr key={`${l.kind}-${l.release_id ?? l.payout_id}-${i}`}>
                    <td className="g-nowrap">{l.at ? formatDate(l.at) : ''}</td>
                    <td>
                      <span className="g-strong">{LINE_LABEL[l.kind ?? ''] ?? l.kind}</span>
                      {l.title ? (
                        <div className="g-tiny g-muted">
                          {l.deal_id ? <Link to={`/deals/${l.deal_id}`}>{l.title}</Link> : l.title}
                          {l.deliverable ? ` · ${l.deliverable}` : ''}
                        </div>
                      ) : null}
                    </td>
                    <td className={`g-right g-num g-strong${(l.amount_cents ?? 0) > 0 ? ' g-mint' : ''}`}>
                      {(l.amount_cents ?? 0) > 0 ? '+' : ''}
                      {formatCents(l.amount_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {paying ? <PayoutDialog creatorId={creatorId} available={available} onClose={() => setPaying(false)} /> : null}
    </div>
  );
}
