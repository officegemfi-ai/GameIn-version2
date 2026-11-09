import { useState } from 'react';
import { Button, Dialog, Notice, Segmented, useToast } from '@/components/ui';
import { formatCents, fundingFee } from '@/lib/money';
import type { PaymentMethod } from '@/lib/types';
import { useFund, type DealDetail } from './api';

const METHODS: { value: PaymentMethod; label: string; note: string }[] = [
  { value: 'card', label: 'card', note: 'In escrow at once.' },
  { value: 'bank', label: 'bank', note: 'ACH: clears in 1 to 3 business days.' },
  { value: 'wire', label: 'wire', note: 'Escrow funds when the wire arrives.' },
];

/**
 * The brand funds the next milestone or everything remaining. The fee preview uses the database's formula (5% of
 * the deal's running total, rounded once); the database charges the exact amount.
 */
export function FundDialog({ deal, onClose }: { deal: DealDetail; onClose: () => void }) {
  const fund = useFund();
  const toast = useToast();
  const pending = deal.milestones.filter((m) => m.status === 'pending');
  const [scope, setScope] = useState<'next' | 'all'>(pending.length > 1 ? 'next' : 'all');
  const [method, setMethod] = useState<PaymentMethod>('card');
  const live = deal.payments.filter((p) => p.status !== 'failed');
  const basis = live.reduce((s, p) => s + p.base_cents, 0);
  const feesBefore = live.reduce((s, p) => s + p.fee_cents, 0);
  const chosen = scope === 'all' ? pending : pending.slice(0, 1);
  const base = chosen.reduce((s, m) => s + m.amount_cents, 0);
  const fee = fundingFee(basis, feesBefore, base);
  const total = base + fee;

  return (
    <Dialog
      open
      onClose={onClose}
      busy={fund.isPending}
      title="Fund escrow"
      description={`The money waits with GameIn until you approve ${deal.creator?.display_name ?? 'the creator'}’s proof. Test mode: nothing is charged.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={fund.isPending}>cancel</Button>
          <Button
            variant="primary"
            loading={fund.isPending}
            disabled={chosen.length === 0}
            onClick={() =>
              fund.mutate(
                { dealId: deal.id, method, scope },
                {
                  onSuccess: () => {
                    toast.info(method === 'card' ? `Escrow funded: ${formatCents(base)} is in escrow.` : 'Payment started. Escrow funds when it clears.');
                    onClose();
                  },
                },
              )
            }
          >
            fund {formatCents(total)}
          </Button>
        </>
      }
    >
      {pending.length > 1 ? (
        <div className="g-stack-sm">
          <span className="g-field__label">What to fund</span>
          <Segmented
            label="What to fund"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'next', label: `next: ${formatCents(pending[0].amount_cents)}` },
              { value: 'all', label: `everything: ${formatCents(pending.reduce((s, m) => s + m.amount_cents, 0))}` },
            ]}
          />
        </div>
      ) : null}
      <div className="g-stack-sm">
        <span className="g-field__label">Pay by</span>
        <Segmented label="Pay by" value={method} onChange={setMethod} options={METHODS.map((m) => ({ value: m.value, label: m.label }))} />
        <span className="g-field__hint">{METHODS.find((m) => m.value === method)?.note}</span>
      </div>
      <table className="g-table g-fundsum">
        <tbody>
          {chosen.map((m) => (
            <tr key={m.id}>
              <td>{m.label}</td>
              <td className="g-right g-num">{formatCents(m.amount_cents)}</td>
            </tr>
          ))}
          <tr>
            <td className="g-muted">GameIn brand fee (5%)</td>
            <td className="g-right g-num g-muted">{formatCents(fee)}</td>
          </tr>
          <tr className="g-fundsum__total">
            <td>Total</td>
            <td className="g-right g-num">{formatCents(total)}</td>
          </tr>
        </tbody>
      </table>
      {method !== 'card' ? <Notice tone="amber">In test mode you mark the payment as cleared yourself, from the deal’s payments.</Notice> : null}
    </Dialog>
  );
}
