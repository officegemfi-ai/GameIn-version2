import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ActionDialog, Button, Notice, TextAreaField } from '@/components/ui';
import { itemsFromJson } from '@/lib/items';
import { centsToInput, formatCents, parseDollars } from '@/lib/money';
import { OFFER_HOURS } from '@/lib/rules';
import type { Side } from '@/lib/types';
import { TermsForm, termsProblem, type Terms } from './TermsForm';
import { useAcceptOffer, useCounterOffer, useDeclineOffer, useWithdrawOffer, type OfferDetail } from './api';
import { offerState } from './model';

type Move = 'accept' | 'counter' | 'decline' | 'withdraw';

/** The moves on an offer (accept, counter, decline when it's your turn; withdraw your own), each behind its dialog. */
export function OfferActions({ offer: o, side, other }: { offer: OfferDetail['offer']; side: Side; other: string }) {
  const navigate = useNavigate();
  const accept = useAcceptOffer();
  const counter = useCounterOffer();
  const decline = useDeclineOffer();
  const withdraw = useWithdrawOffer();
  const [dialog, setDialog] = useState<Move | null>(null);
  const [terms, setTerms] = useState<Terms>({ title: '', amount: '', items: [], note: '' });
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const st = offerState(o, side);
  const items = itemsFromJson(o.items);
  const canWithdraw = st.open && !st.yourTurn && o.last_by_side === side;
  const busy = accept.isPending || counter.isPending || decline.isPending || withdraw.isPending;
  const close = () => setDialog(null);

  const openCounter = () => {
    setTerms({ title: o.title ?? '', amount: centsToInput(o.amount_cents), items: items.length ? items : [{ label: '' }], note: '' });
    setProblem(null);
    setDialog('counter');
  };
  const sendCounter = () => {
    const p = termsProblem(terms, false);
    if (p) return setProblem(p);
    setProblem(null); // the terms are fine now: an earlier complaint mustn't stay up while (or after) this is sent
    counter.mutate({ offerId: o.id!, as: side, amountCents: parseDollars(terms.amount)!, items: terms.items, note: terms.note }, { onSuccess: close });
  };

  return (
    <>
      {st.yourTurn || canWithdraw ? (
        <div className="g-row-wrap g-terms__actions">
          {st.yourTurn ? (
            <>
              <Button variant="primary" onClick={() => setDialog('accept')} disabled={busy}>accept offer</Button>
              <Button onClick={openCounter} disabled={busy || (o.changes_left ?? 0) <= 0}>counter</Button>
              <Button variant="danger" onClick={() => { setReason(''); setDialog('decline'); }} disabled={busy}>decline</Button>
            </>
          ) : (
            <Button variant="danger" onClick={() => setDialog('withdraw')} disabled={busy}>withdraw</Button>
          )}
        </div>
      ) : null}

      <ActionDialog
        open={dialog === 'accept'}
        onClose={close}
        pending={accept.isPending}
        title="Accept this offer?"
        description={`${formatCents(o.amount_cents)} for ${items.length} deliverable${items.length === 1 ? '' : 's'}. The deal starts now: ${side === 'brand' ? 'you fund escrow next.' : `${o.brand?.name ?? 'The brand'} funds escrow next, then you deliver.`}`}
        action={`accept ${formatCents(o.amount_cents)}`}
        onAction={() => accept.mutate({ offerId: o.id!, as: side }, { onSuccess: (dealId) => navigate(`/deals/${dealId}`) })}
      />

      <ActionDialog
        open={dialog === 'counter'}
        onClose={close}
        pending={counter.isPending}
        wide
        title="Counter-offer"
        description={`Change the price or the deliverables. ${other} then has ${OFFER_HOURS} hours to answer.`}
        action="send counter"
        onAction={sendCounter}
      >
        {problem ? <Notice tone="coral">{problem}</Notice> : null}
        <TermsForm value={terms} onChange={setTerms} withTitle={false} notePlaceholder="Why this works better" />
      </ActionDialog>

      <ActionDialog
        open={dialog === 'decline'}
        onClose={close}
        pending={decline.isPending}
        title="Decline this offer?"
        description="The offer closes. You can still message each other."
        variant="danger"
        action="decline"
        onAction={() => decline.mutate({ offerId: o.id!, as: side, reason }, { onSuccess: close })}
      >
        <TextAreaField label="Reason (optional, they’ll see it)" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
      </ActionDialog>

      <ActionDialog
        open={dialog === 'withdraw'}
        onClose={close}
        pending={withdraw.isPending}
        title="Withdraw your offer?"
        description={`${other} won’t be able to accept it any more.`}
        variant="danger"
        cancelLabel="keep it"
        action="withdraw"
        onAction={() => withdraw.mutate({ offerId: o.id!, as: side }, { onSuccess: close })}
      />
    </>
  );
}
