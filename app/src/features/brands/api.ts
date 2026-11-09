import { useQuery } from '@tanstack/react-query';
import { must, one } from '@/lib/db';
import { keys } from '@/lib/keys';
import { supabase } from '@/lib/supabase';
import { cleanSearch } from '@/features/creators/api';

/** Brands by name, for a creator choosing who to pitch (brands are public). */
export function useBrandSearch(search: string) {
  const s = cleanSearch(search);
  return useQuery({
    queryKey: keys.brands(s),
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
