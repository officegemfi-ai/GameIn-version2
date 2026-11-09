import { useQuery } from '@tanstack/react-query';
import { useAction } from '@/app/useAction';
import { must } from '@/lib/db';
import { itemsToJson } from '@/lib/items';
import { affected, keys } from '@/lib/keys';
import { supabase } from '@/lib/supabase';
import type { Item } from '@/lib/types';

/** A creator's own packages, listed and hidden (row-level security shows hidden ones only to their creator). */
export function useMyPackages(creatorId: string | null) {
  return useQuery({
    queryKey: keys.packages(creatorId ?? 'none'),
    queryFn: () => must(supabase.from('packages').select('*').eq('creator_id', creatorId!).order('active', { ascending: false }).order('created_at')),
    enabled: !!creatorId,
  });
}

export interface PackageInput {
  id?: string;
  creatorId: string;
  title: string;
  code: string;
  description: string;
  priceCents: number;
  lengthLabel: string;
  items: Item[];
}

export function useSavePackage() {
  return useAction(
    async (p: PackageInput) => {
      const row = {
        title: p.title.trim(),
        code: p.code.trim() || null,
        description: p.description.trim(),
        price_cents: p.priceCents,
        length_label: p.lengthLabel.trim() || null,
        items: itemsToJson(p.items),
      };
      if (p.id) await must(supabase.from('packages').update(row).eq('id', p.id));
      else await must(supabase.from('packages').insert({ ...row, creator_id: p.creatorId, active: true }));
    },
    { invalidate: (_r, p) => affected.packages(p.creatorId), success: (_r, p) => (p.id ? 'Package saved.' : 'Package added. Brands can book it now.') },
  );
}

export function useSetPackageActive() {
  return useAction(
    (v: { id: string; creatorId: string; active: boolean }) => must(supabase.from('packages').update({ active: v.active }).eq('id', v.id)),
    { invalidate: (_r, v) => affected.packages(v.creatorId), success: (_r, v) => (v.active ? 'Package listed.' : 'Package hidden. Brands can’t book it now.') },
  );
}
