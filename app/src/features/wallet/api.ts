import { useQuery } from '@tanstack/react-query';
import { useAction } from '@/app/useAction';
import { maybe, must } from '@/lib/db';
import { keys } from '@/lib/keys';
import { formatCents } from '@/lib/money';
import { supabase } from '@/lib/supabase';

/** The creator's balances (creator_wallet: available = releases less payouts), for the wallet and the dashboard. */
export function useWalletSummary(creatorId: string | null) {
  return useQuery({
    queryKey: keys.wallet(creatorId ?? 'none'),
    queryFn: () => maybe(supabase.from('creator_wallet').select('*').eq('creator_id', creatorId!).maybeSingle()),
    enabled: !!creatorId,
  });
}

/** The wallet's history: its last 100 lines (releases, fees, payouts), newest first. */
export function useWalletLines(creatorId: string | null) {
  return useQuery({
    queryKey: keys.walletLines(creatorId ?? 'none'),
    // newest first; a release and its fee share one moment, so the kind settles their order (the release, then its
    // fee) instead of leaving it to chance from one refresh to the next
    queryFn: () =>
      must(supabase.from('wallet_lines').select('*').eq('creator_id', creatorId!).order('at', { ascending: false }).order('kind', { ascending: false }).limit(100)),
    enabled: !!creatorId,
  });
}

export function useRequestPayout() {
  return useAction(
    (v: { creatorId: string; amountCents: number; instant: boolean }) =>
      must(supabase.rpc('request_payout', { p_creator: v.creatorId, p_amount_cents: v.amountCents, p_instant: v.instant })),
    { invalidate: (_r, v) => [keys.wallet(v.creatorId)], success: (_r, v) => `Payout of ${formatCents(v.amountCents)} sent. In test mode it’s paid at once.` }, // keys.wallet also covers its lines
  );
}
