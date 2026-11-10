import { useQuery } from '@tanstack/react-query';
import { useAction } from '@/app/useAction';
import { must, one } from '@/lib/db';
import { affected, keys } from '@/lib/keys';
import { pageRange, usePagedList } from '@/lib/paging';
import { supabase } from '@/lib/supabase';
import type { Json, Platform } from '@/lib/types';

const CARD = 'id, handle, display_name, bio, avatar_url, platforms, packages(id, title, price_cents, active)';
// only the columns signed-out visitors may read (the owner's account id stays private)
const PROFILE = 'id, handle, display_name, bio, avatar_url, platforms, created_at, packages(*)';
const PAGE_SIZE = 24;

/** Search text as it's sent: letters, digits, spaces, dots, dashes, underscores (what names and handles are made of). */
export function cleanSearch(text: string): string {
  return text.replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 60);
}

/** The directory in name order, a page at a time; then by id, so two creators with one name keep one order. */
async function fetchDirectoryPage(page: number) {
  const [from, to] = pageRange(page, PAGE_SIZE);
  return must(supabase.from('creators').select(CARD).not('handle', 'like', 'deleted-%').order('display_name').order('id').range(from, to));
}
export type CreatorCardRow = Awaited<ReturnType<typeof fetchDirectoryPage>>[number];

/**
 * A search of the directory, in the same order and the same pages. Its own request (search_creators), because finding
 * the matches is a different job from reading a list in order: asked as "the directory, filtered", the database
 * walked the whole directory looking for 24 matches whenever the name was a rare one.
 */
async function fetchSearchPage(search: string, page: number): Promise<CreatorCardRow[]> {
  return must(
    supabase
      .rpc('search_creators', { p_q: search, p_limit: PAGE_SIZE, p_offset: page * PAGE_SIZE }, { get: true })
      .select(CARD)
      .order('display_name')
      .order('id'),
  );
}

/** The creator directory, or a search of it, 24 at a time. */
export function useCreators(search: string, { enabled = true }: { enabled?: boolean } = {}) {
  const s = cleanSearch(search);
  return usePagedList(keys.creators(s), (page) => (s ? fetchSearchPage(s, page) : fetchDirectoryPage(page)), { enabled, size: PAGE_SIZE });
}

/**
 * A few creators for the landing page: the first six, by name, who have a package a brand can book. The database
 * picks them (an inner join on listed packages); picking them out of the directory's first page stopped finding any
 * once enough creators without packages had signed up ahead of them in the alphabet.
 */
async function fetchFeaturedCreators(): Promise<CreatorCardRow[]> {
  return must(
    supabase
      .from('creators')
      .select('id, handle, display_name, bio, avatar_url, platforms, packages!inner(id, title, price_cents, active)')
      .eq('packages.active', true)
      .not('handle', 'like', 'deleted-%')
      .order('display_name')
      .order('id')
      .limit(6),
  );
}

export function useFeaturedCreators() {
  return useQuery({ queryKey: keys.featuredCreators(), queryFn: fetchFeaturedCreators });
}

/** What a handle can be (creators.handle): anything else in an address can't be anyone's page. */
const HANDLE = /^[A-Za-z0-9_.-]{2,32}$/;

async function fetchCreator(handle: string) {
  // not asked at all for something that can't be a handle: "*" and "%" are wildcards to the search underneath
  if (!HANDLE.test(handle)) throw Object.assign(new Error('That creator wasn’t found. Check the address.'), { status: 404 });
  const exact = handle.replace(/[\\%_]/g, (c) => '\\' + c);
  return one(supabase.from('creators').select(PROFILE).ilike('handle', exact).maybeSingle(), 'That creator');
}

/** One creator's public page: profile and packages (their own inactive ones too, when it's them). */
export function useCreator(handle: string, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: keys.creator(handle), queryFn: () => fetchCreator(handle), enabled });
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

// --- moves -------------------------------------------------------------------------------------------------------
/** A new creator profile for the signed-in account (create_creator_profile); its id. */
export async function createCreatorProfile(handle: string, displayName: string): Promise<string> {
  return must(supabase.rpc('create_creator_profile', { p_handle: handle.trim(), p_display_name: displayName.trim() }));
}

export interface CreatorProfileInput {
  displayName: string;
  handle: string;
  bio: string;
  platforms: Platform[];
}

/** A profile as the database keeps it: trimmed, without empty platform rows or blank follower counts. */
export function creatorProfileRow(p: CreatorProfileInput) {
  return {
    display_name: p.displayName.trim(),
    handle: p.handle.trim(),
    bio: p.bio.trim(),
    platforms: p.platforms.filter((x) => x.platform).map((x) => ({ platform: x.platform, ...(x.followers?.trim() ? { followers: x.followers.trim() } : {}) })),
  };
}

export function useSaveCreatorProfile(creatorId: string, onSaved?: () => void) {
  return useAction((p: CreatorProfileInput) => must(supabase.from('creators').update(creatorProfileRow(p)).eq('id', creatorId)), {
    invalidate: () => affected.creatorProfile(creatorId),
    success: 'Creator profile saved.',
    onSuccess: () => onSaved?.(),
  });
}
