// The parts of a deal page that only one side sees: the brand's payments into escrow, the creator's "book again".
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Badge, Button, Card, TextAreaField } from '@/components/ui';
import { formatCents } from '@/lib/money';
import { PITCH_HOURS } from '@/lib/rules';
import { formatDate } from '@/lib/time';
import { useBookAgain, type DealDetail } from './api';
import { paymentStatus } from './model';

/** The brand's payments into this deal's escrow (row-level security shows payments to the brand only). */
export function DealPayments({ payments }: { payments: DealDetail['payments'] }) {
  return (
    <Card title="Payments" flush>
      <div className="g-scrollx">
        <table className="g-table g-table--stack">
          <thead>
            <tr>
              <th>Date</th>
              <th>Method</th>
              <th>Status</th>
              <th className="g-right">Escrow</th>
              <th className="g-right">Fee</th>
              <th className="g-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => {
              const st = paymentStatus(p.status);
              return (
                <tr key={p.id}>
                  <td data-label="Date">{formatDate(p.created_at)}<div className="g-tiny g-faint">{p.reference}</div></td>
                  <td data-label="Method">{p.method_label}</td>
                  <td data-label="Status"><Badge tone={st.tone}>{st.label}</Badge></td>
                  <td className="g-right g-num" data-label="Escrow">{formatCents(p.base_cents)}</td>
                  <td className="g-right g-num g-muted" data-label="Fee">{formatCents(p.fee_cents)}</td>
                  <td className="g-right g-num g-strong" data-label="Total">{formatCents(p.total_cents)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** After a deal, the creator can send the brand the same deal again, as a new offer. */
export function BookAgain({ dealId, brandName }: { dealId: string; brandName: string }) {
  const navigate = useNavigate();
  const again = useBookAgain();
  const [note, setNote] = useState('Same package again? Happy to run it back.');
  return (
    <Card title={`Work with ${brandName} again`}>
      <div className="g-stack">
        <p className="g-muted">{`Send them the same deal as a new offer. They have ${PITCH_HOURS} hours to answer.`}</p>
        <TextAreaField label="Note" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
        <div>
          <Button variant="primary" loading={again.isPending} onClick={() => again.mutate({ dealId, note }, { onSuccess: (offerId) => navigate(`/offers/${offerId}`) })}>
            offer it again
          </Button>
        </div>
      </div>
    </Card>
  );
}
