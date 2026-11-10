import { useQuery } from '@tanstack/react-query';
import { useAction } from '@/app/useAction';
import { maybe, must } from '@/lib/db';
import { keys } from '@/lib/keys';
import { pageRange, usePagedList } from '@/lib/paging';
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

async function fetchWalletLinesPage(creatorId: string, page: number) {
  const [from, to] = pageRange(page);
  return must(
    supabase
      .from('wallet_lines')
      .select('*')
      .eq('creator_id', creatorId)
      // newest first; a release and its fee share one moment, so the kind settles their order (the release, then its
      // fee), and the ids settle anything else: "show more" must never repeat a line or skip one
      .order('at', { ascending: false })
      .order('kind', { ascending: false })
      .order('release_id', { ascending: false, nullsFirst: false })
      .order('payout_id', { ascending: false, nullsFirst: false })
      .range(from, to),
  );
}

/** The wallet's history (releases, fees, payouts), newest first, a page at a time. */
export function useWalletLines(creatorId: string | null) {
  return usePagedList(keys.walletLines(creatorId ?? 'none'), (page) => fetchWalletLinesPage(creatorId!, page), { enabled: !!creatorId });
}

export function useRequestPayout() {
  return useAction(
    (v: { creatorId: string; amountCents: number; instant: boolean }) =>
      must(supabase.rpc('request_payout', { p_creator: v.creatorId, p_amount_cents: v.amountCents, p_instant: v.instant })),
    { invalidate: (_r, v) => [keys.wallet(v.creatorId)], success: (_r, v) => `Payout of ${formatCents(v.amountCents)} sent. In test mode it’s paid at once.` }, // keys.wallet also covers its lines
  );
}
