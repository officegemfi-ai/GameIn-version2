import { useQuery } from '@tanstack/react-query';
import { maybe, must } from '@/lib/db';
import { keys } from '@/lib/keys';
import { pageRange, usePagedList } from '@/lib/paging';
import { supabase } from '@/lib/supabase';

/** A brand's money across its deals (brand_money). */
export function useBrandMoney(brandId: string | null) {
  return useQuery({
    queryKey: keys.brandMoney(brandId ?? 'none'),
    queryFn: () => maybe(supabase.from('brand_money').select('*').eq('brand_id', brandId!).maybeSingle()),
    enabled: !!brandId,
  });
}

async function fetchPaymentsPage(brandId: string, page: number) {
  const [from, to] = pageRange(page);
  return must(
    supabase
      .from('payments')
      .select('*, deal:deals(id, title, creator:creators(display_name))')
      .eq('brand_id', brandId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to),
  );
}

/** The brand's payments into escrow, newest first, a page at a time. */
export function useBrandPayments(brandId: string | null) {
  return usePagedList(keys.payments(brandId ?? 'none'), (page) => fetchPaymentsPage(brandId!, page), { enabled: !!brandId });
}
