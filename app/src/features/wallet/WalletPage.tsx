import { useState } from 'react';
import { Link } from 'react-router';
import { Button, Card, Dialog, Empty, ErrorState, Loading, Notice, Segmented, Stat, TextField } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { errorMessage } from '@/lib/errors';
import { centsToInput, formatCents, instantPayoutFee, parseDollars } from '@/lib/money';
import { formatDate } from '@/lib/time';
import { useSeat } from '@/features/seats/SeatProvider';
import { useRequestPayout, useWallet } from './api';

const LINE_LABEL: Record<string, string> = { release: 'Released', fee: 'GameIn fee (5%)', payout: 'Payout to bank', instant_payout: 'Instant payout' };

function PayoutDialog({ creatorId, available, onClose }: { creatorId: string; available: number; onClose: () => void }) {
  const payout = useRequestPayout();
  const [amount, setAmount] = useState(centsToInput(available));
  const [speed, setSpeed] = useState<'standard' | 'instant'>('standard');
  const cents = parseDollars(amount);
  const fee = speed === 'instant' && cents ? instantPayoutFee(cents) : 0;
  const problem = cents == null || cents <= 0 ? 'Enter an amount' : cents > available ? `You can pay out up to ${formatCents(available)}` : cents - fee <= 0 ? 'Too small to cover the instant fee' : null;
  return (
    <Dialog
      open
      onClose={onClose}
      busy={payout.isPending}
      title="Pay out"
      description="From your available balance to your bank. Test mode: no money moves."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={payout.isPending}>cancel</Button>
          <Button variant="primary" disabled={!!problem} loading={payout.isPending} onClick={() => payout.mutate({ creatorId, amountCents: cents!, instant: speed === 'instant' }, { onSuccess: onClose })}>
            pay out {cents ? formatCents(cents - fee) : ''}
          </Button>
        </>
      }
    >
      <TextField label="Amount" prefix="$" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} error={amount && problem ? problem : null} hint={`Available: ${formatCents(available)}`} />
      <div className="g-stack-sm">
        <span className="g-field__label">Speed</span>
        <Segmented label="Speed" value={speed} onChange={setSpeed} options={[{ value: 'standard', label: 'weekly · free' }, { value: 'instant', label: 'instant · 1.5%' }]} />
        {speed === 'instant' && cents ? <span className="g-field__hint">Fee {formatCents(fee)}; you receive {formatCents(cents - fee)}.</span> : null}
      </div>
    </Dialog>
  );
}

export default function WalletPage() {
  const seat = useSeat();
  const creatorId = seat.side === 'creator' ? seat.id : null;
  const q = useWallet(creatorId);
  const [paying, setPaying] = useState(false);

  if (!creatorId) {
    return (
      <div className="g-page">
        <PageHeader title="Wallet" />
        <Empty title="The wallet belongs to your creator profile">Brands see their escrow and payments under Payments.</Empty>
      </div>
    );
  }
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={errorMessage(q.error)} retry={() => void q.refetch()} />;
  const w = q.data.wallet;
  const available = w?.available_cents ?? 0;

  return (
    <div className="g-page">
      <PageHeader title="Wallet" subtitle="Money released to you from escrow, less GameIn’s 5%." actions={<Button variant="primary" icon="coin" disabled={available <= 0} onClick={() => setPaying(true)}>pay out</Button>} />
      <div className="g-grid-4">
        <Stat label="Available" value={formatCents(available)} tone="mint" note="ready to pay out" />
        <Stat label="In escrow" value={formatCents(w?.in_escrow_cents)} note="yours once approved" />
        <Stat label="Earned" value={formatCents(w?.earned_cents)} note={`after ${formatCents(w?.fees_cents)} in fees`} />
        <Stat label="Paid out" value={formatCents(w?.paid_out_cents)} note={w?.payouts_pending_cents ? `${formatCents(w.payouts_pending_cents)} on its way` : 'to your bank'} />
      </div>
      <Notice>Test mode: payouts are simulated. Once payments go live you’ll connect a bank account through Stripe.</Notice>
      <Card title="History" flush>
        {q.data.lines.length === 0 ? (
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
                {q.data.lines.map((l, i) => (
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
