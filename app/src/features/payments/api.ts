import { useQuery } from '@tanstack/react-query';
import { maybe, must } from '@/lib/db';
import { keys } from '@/lib/keys';
import { supabase } from '@/lib/supabase';

/** A brand's money across its deals (brand_money). */
export function useBrandMoney(brandId: string | null) {
  return useQuery({
    queryKey: keys.brandMoney(brandId ?? 'none'),
    queryFn: () => maybe(supabase.from('brand_money').select('*').eq('brand_id', brandId!).maybeSingle()),
    enabled: !!brandId,
  });
}

async function fetchPayments(brandId: string) {
  return must(
    supabase
      .from('payments')
      .select('*, deal:deals(id, title, creator:creators(display_name))')
      .eq('brand_id', brandId)
      .order('created_at', { ascending: false })
      .limit(100),
  );
}
export type BrandPayment = Awaited<ReturnType<typeof fetchPayments>>[number];

/** The brand's payments into escrow, newest first. */
export function useBrandPayments(brandId: string | null) {
  return useQuery({ queryKey: keys.payments(brandId ?? 'none'), queryFn: () => fetchPayments(brandId!), enabled: !!brandId });
}
