import { useQuery } from '@tanstack/react-query';
import { useAction } from '@/app/useAction';
import { must, one } from '@/lib/db';
import { keys } from '@/lib/keys';
import { supabase } from '@/lib/supabase';
import { cleanSearch } from '@/features/creators/api';

/** Brands by name, for a creator choosing who to pitch (brands are public). */
export function useBrandSearch(search: string, { enabled = true }: { enabled?: boolean } = {}) {
  const s = cleanSearch(search);
  return useQuery({
    queryKey: keys.brands(s),
    enabled,
    queryFn: () => {
      let q = supabase.from('brands').select('id, name, slug, verified').order('name').limit(20);
      if (s) q = q.or(`name.ilike.%${s}%,slug.ilike.%${s}%`);
      return must(q);
    },
  });
}

export function useBrand(brandId: string | null) {
  return useQuery({
    queryKey: keys.brand(brandId ?? 'none'),
    queryFn: () => one(supabase.from('brands').select('*').eq('id', brandId!).maybeSingle(), 'That brand'),
    enabled: !!brandId,
  });
}

// --- moves -------------------------------------------------------------------------------------------------------
/** A new brand, owned by the signed-in account (create_brand); its id. */
export async function createBrand(name: string): Promise<string> {
  return must(supabase.rpc('create_brand', { p_name: name.trim() }));
}

/** Renames a brand (its owners and admins only: row-level security). */
export function useSaveBrandName(brandId: string, onSaved?: () => void) {
  return useAction((name: string) => must(supabase.from('brands').update({ name: name.trim() }).eq('id', brandId)), {
    invalidate: () => [keys.brand(brandId)],
    success: 'Brand saved.',
    onSuccess: () => onSaved?.(),
  });
}
