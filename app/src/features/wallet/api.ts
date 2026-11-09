import { useQuery } from '@tanstack/react-query';
import { useAction } from '@/app/useAction';
import { maybe, must } from '@/lib/db';
import { keys } from '@/lib/keys';
import { formatCents } from '@/lib/money';
import { supabase } from '@/lib/supabase';

async function fetchWallet(creatorId: string) {
  const [wallet, lines] = await Promise.all([
    maybe(supabase.from('creator_wallet').select('*').eq('creator_id', creatorId).maybeSingle()),
    must(supabase.from('wallet_lines').select('*').eq('creator_id', creatorId).order('at', { ascending: false }).limit(100)),
  ]);
  return { wallet, lines };
}

/** The creator's wallet (creator_wallet: available = releases less payouts) and its last 100 lines. */
export function useWallet(creatorId: string | null) {
  return useQuery({ queryKey: keys.wallet(creatorId ?? 'none'), queryFn: () => fetchWallet(creatorId!), enabled: !!creatorId });
}

export function useRequestPayout() {
  return useAction(
    (v: { creatorId: string; amountCents: number; instant: boolean }) =>
      must(supabase.rpc('request_payout', { p_creator: v.creatorId, p_amount_cents: v.amountCents, p_instant: v.instant })),
    { invalidate: (_r, v) => [keys.wallet(v.creatorId)], success: (_r, v) => `Payout of ${formatCents(v.amountCents)} sent. In test mode it’s paid at once.` },
  );
}
