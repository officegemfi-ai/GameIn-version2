import { useQuery } from '@tanstack/react-query';
import { useAction } from '@/app/useAction';
import { must, one } from '@/lib/db';
import { affected, keys, scopes } from '@/lib/keys';
import { PITCH_HOURS, UNDO_SECONDS } from '@/lib/rules';
import { uploadProof } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { seatColumn, type PaymentMethod, type Seat, type Side } from '@/lib/types';

const LIST = 'id, title, status, type, created_at, ends_on, brand:brands(id, name, slug), creator:creators(id, display_name, handle), deliverables(status, due_on)';
const DETAIL = '*, brand:brands(id, name, slug), creator:creators(id, display_name, handle), milestones(*), deliverables(*), proofs(*), releases(*), ratings(*), payments(*)';

async function fetchDeals(seat: Seat) {
  const column = seatColumn(seat);
  const [deals, money] = await Promise.all([
    must(supabase.from('deals').select(LIST).eq(column, seat.id).order('created_at', { ascending: false }).limit(200)),
    must(supabase.from('deal_money').select('*').eq(column, seat.id)),
  ]);
  const byId = new Map(money.map((m) => [m.deal_id, m]));
  return deals.map((d) => ({ ...d, money: byId.get(d.id) ?? null }));
}
export type DealListRow = Awaited<ReturnType<typeof fetchDeals>>[number];

/** This seat's deals, newest first, each with its money (deal_money: the same figures on both seats). */
export function useDeals(seat: Seat) {
  return useQuery({ queryKey: keys.deals(seat), queryFn: () => fetchDeals(seat) });
}

async function fetchDeal(id: string) {
  const [deal, money] = await Promise.all([
    one(
      supabase
        .from('deals')
        .select(DETAIL)
        .eq('id', id)
        .maybeSingle(),
      'That deal',
    ),
    one(supabase.from('deal_money').select('*').eq('deal_id', id).maybeSingle(), 'That deal'),
  ]);
  const bySeq = <T extends { seq: number }>(a: T[]) => [...a].sort((x, y) => x.seq - y.seq);
  return { ...deal, milestones: bySeq(deal.milestones), deliverables: bySeq(deal.deliverables), payments: bySeq(deal.payments), money };
}
export type DealDetail = Awaited<ReturnType<typeof fetchDeal>>;

/** One deal with everything both parties may see (payments only reach the brand: row-level security). */
export function useDeal(id: string) {
  return useQuery({ queryKey: keys.deal(id), queryFn: () => fetchDeal(id) });
}

/** Which deal a proof belongs to (notification links point at proofs). */
export function useProofDeal(proofId: string) {
  return useQuery({
    queryKey: keys.proofDeal(proofId),
    queryFn: () => one(supabase.from('proofs').select('deal_id').eq('id', proofId).maybeSingle(), 'That proof'),
  });
}

// --- moves -------------------------------------------------------------------------------------------------------
// a move on a deal also writes an event, which shows in the pair's conversation
const dealKeys = (dealId: string) => [...affected.deal(dealId), scopes.thread];

export function useFund() {
  return useAction(
    (v: { dealId: string; method: PaymentMethod; scope: 'next' | 'all' }) =>
      must(supabase.rpc('fund_milestones', { p_deal: v.dealId, p_method: v.method, p_scope: v.scope })),
    { invalidate: (_r, v) => dealKeys(v.dealId) },
  );
}

export function useSimulatePayment() {
  return useAction(
    (v: { dealId: string; paymentId: string; outcome: 'cleared' | 'failed' }) =>
      must(supabase.rpc('simulate_payment', { p_payment: v.paymentId, p_outcome: v.outcome })),
    { invalidate: (_r, v) => dealKeys(v.dealId), success: (_r, v) => (v.outcome === 'cleared' ? 'Payment cleared: the money is in escrow.' : 'Payment marked as failed. Fund those milestones again.') },
  );
}

export function useSubmitProof() {
  return useAction(
    async (v: { dealId: string; deliverableId: string; link: string; file: File | null; note: string }) => {
      const path = v.file ? await uploadProof(v.dealId, v.file) : null;
      return must(
        supabase.rpc('submit_proof', {
          p_deliverable: v.deliverableId,
          p_link_url: v.link.trim() || undefined,
          p_file_path: path ?? undefined,
          p_note: v.note.trim(),
        }),
      );
    },
    { invalidate: (_r, v) => dealKeys(v.dealId), success: 'Proof sent. The brand reviews it next.' },
  );
}

/** Approving starts the undo window (UNDO_SECONDS); the money releases when it ends. */
export function useApproveProof() {
  return useAction(
    (v: { dealId: string; proofId: string }) => must(supabase.rpc('approve_proof', { p_proof: v.proofId, p_undo_seconds: UNDO_SECONDS })),
    { invalidate: (_r, v) => dealKeys(v.dealId) },
  );
}

export function useUndoApproval() {
  return useAction(
    (v: { dealId: string; proofId: string }) => must(supabase.rpc('undo_approval', { p_proof: v.proofId })),
    { invalidate: (_r, v) => dealKeys(v.dealId), success: 'Approval undone. The proof is back in review.' },
  );
}

export function useFinalizeRelease() {
  return useAction(
    (v: { dealId: string; proofId: string }) => must(supabase.rpc('finalize_release', { p_proof: v.proofId })),
    { invalidate: (_r, v) => dealKeys(v.dealId), quiet: true },
  );
}

export function useRequestChanges() {
  return useAction(
    (v: { dealId: string; proofId: string; note: string }) => must(supabase.rpc('request_changes', { p_proof: v.proofId, p_note: v.note })),
    { invalidate: (_r, v) => dealKeys(v.dealId), success: 'Changes requested. The creator can send new proof.' },
  );
}

export function useRateDeal() {
  return useAction(
    (v: { dealId: string; as: Side; score: number; comment: string }) =>
      must(supabase.rpc('rate_deal', { p_deal: v.dealId, p_as: v.as, p_score: v.score, p_comment: v.comment })),
    { invalidate: (_r, v) => dealKeys(v.dealId), success: 'Thanks for rating.' },
  );
}

export function useBookAgain() {
  return useAction(
    (v: { dealId: string; note: string }) => must(supabase.rpc('book_again', { p_deal: v.dealId, p_note: v.note })),
    { invalidate: () => [scopes.offers, scopes.todos], success: `Sent. The brand has ${PITCH_HOURS} hours to answer.` },
  );
}
