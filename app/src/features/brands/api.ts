import { useQuery } from '@tanstack/react-query';
import { useAction } from '@/app/useAction';
import { must, one } from '@/lib/db';
import { keys } from '@/lib/keys';
import { supabase } from '@/lib/supabase';
import { cleanSearch } from '@/features/creators/api';

const BRAND = 'id, name, slug, verified';
const BRANDS_SHOWN = 20;

/** Brands by name, for a creator choosing who to pitch: the first few in name order, or the ones a search finds. */
export function useBrandSearch(search: string, { enabled = true }: { enabled?: boolean } = {}) {
  const s = cleanSearch(search);
  return useQuery({
    queryKey: keys.brands(s),
    enabled,
    queryFn: () =>
      s
        ? must(supabase.rpc('search_brands', { p_q: s, p_limit: BRANDS_SHOWN }, { get: true }).select(BRAND).order('name').order('id'))
        : must(supabase.from('brands').select(BRAND).order('name').order('id').limit(BRANDS_SHOWN)),
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
/** The web name the database makes from a brand's name when it isn't given one (create_brand). */
const derivedSlug = (name: string): string => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const SLUG = /^[a-z0-9-]{2,40}$/;

/** Seven characters that stand for a text: the same for the same text, different for nearly every other (FNV-1a). */
function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36).padStart(7, '0');
}

/**
 * The web name to ask for, when the database's own wouldn't pass its rule (2 to 40 of a-z, 0-9 and dashes); undefined
 * when its own is fine, which leaves every name that already worked exactly as it was.
 *
 * A brand name can be 80 characters and in any script; the web name made from it can't. "The Really Long Named
 * Esports Energy Drink Company" makes one of 50 characters, "任天堂" makes none, "X" makes one character: all three were
 * refused with a message about a "web name" the form never asked for. A long one is cut to fit; one with too little
 * to go on gets a neutral start. Either ends in a fingerprint of the name, so two different names never end up with
 * one web name (which the database would refuse as "taken"), and the same name twice still does.
 */
export function brandSlug(name: string): string | undefined {
  const own = derivedSlug(name);
  if (SLUG.test(own)) return undefined;
  if (own.length > 40) return `${own.slice(0, 32).replace(/-+$/, '')}-${fingerprint(own)}`;
  return `${own || 'brand'}-${fingerprint(name.trim().toLowerCase())}`;
}

/** A new brand, owned by the signed-in account (create_brand); its id. */
export async function createBrand(name: string): Promise<string> {
  return must(supabase.rpc('create_brand', { p_name: name.trim(), p_slug: brandSlug(name) }));
}

/** Renames a brand (its owners and admins only: row-level security). */
export function useSaveBrandName(brandId: string, onSaved?: () => void) {
  return useAction((name: string) => must(supabase.from('brands').update({ name: name.trim() }).eq('id', brandId)), {
    invalidate: () => [keys.brand(brandId)],
    success: 'Brand saved.',
    onSuccess: () => onSaved?.(),
  });
}
