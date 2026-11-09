import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { must, one } from '@/lib/db';
import { keys } from '@/lib/keys';
import { supabase } from '@/lib/supabase';
import type { Json, Platform } from '@/lib/types';

const CARD = 'id, handle, display_name, bio, avatar_url, platforms, packages(id, title, price_cents, active)';
// only the columns signed-out visitors may read (the owner's account id stays private)
const PROFILE = 'id, handle, display_name, bio, avatar_url, platforms, created_at, packages(*)';
export const PAGE_SIZE = 24;

/** Search text that's safe inside a PostgREST filter: letters, digits, spaces, dots, dashes, underscores. */
export function cleanSearch(text: string): string {
  return text.replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 60);
}

async function fetchCreatorsPage(search: string, page: number) {
  let q = supabase
    .from('creators')
    .select(CARD)
    .not('handle', 'like', 'deleted-%')
    .order('display_name')
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
  if (search) q = q.or(`display_name.ilike.%${search}%,handle.ilike.%${search}%`);
  return must(q);
}

export type CreatorCardRow = Awaited<ReturnType<typeof fetchCreatorsPage>>[number];

/** The creator directory, 24 at a time (public: anyone can browse). */
export function useCreators(search: string) {
  const s = cleanSearch(search);
  return useInfiniteQuery({
    queryKey: keys.creators(s),
    queryFn: ({ pageParam }) => fetchCreatorsPage(s, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.length === PAGE_SIZE ? all.length : undefined),
  });
}

/** A few creators for the landing page. */
export function useFeaturedCreators() {
  return useQuery({ queryKey: ['creators', 'featured'], queryFn: () => fetchCreatorsPage('', 0).then((r) => r.filter((c) => c.packages.some((p) => p.active)).slice(0, 6)) });
}

async function fetchCreator(handle: string) {
  const exact = handle.replace(/[\\%_]/g, (c) => '\\' + c);
  return one(supabase.from('creators').select(PROFILE).ilike('handle', exact).maybeSingle(), 'That creator');
}

export type CreatorProfile = Awaited<ReturnType<typeof fetchCreator>>;

/** One creator's public page: profile and packages (their own inactive ones too, when it's them). */
export function useCreator(handle: string) {
  return useQuery({ queryKey: keys.creator(handle), queryFn: () => fetchCreator(handle) });
}

/** A creator profile by id: the signed-in creator's own, for settings and their packages page. */
export function useCreatorById(id: string | null) {
  return useQuery({
    queryKey: keys.myCreator(id ?? 'none'),
    queryFn: () => one(supabase.from('creators').select('*').eq('id', id!).maybeSingle(), 'Your creator profile'),
    enabled: !!id,
  });
}

/** Platforms from the profile's JSON: [{ platform: 'twitch', followers: '350K' }]. */
export function platformsOf(json: Json | null | undefined): Platform[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((p) =>
    p && typeof p === 'object' && !Array.isArray(p) && typeof p.platform === 'string'
      ? [{ platform: p.platform, followers: typeof p.followers === 'string' ? p.followers : undefined }]
      : [],
  );
}

/** The lowest price among a creator's active packages, for "from $59.99". */
export function fromPrice(packages: { price_cents: number; active: boolean }[]): number | null {
  const prices = packages.filter((p) => p.active).map((p) => p.price_cents);
  return prices.length ? Math.min(...prices) : null;
}
