import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';

// Lists come a page at a time. The database is asked for what a screen shows, in an order it has an index for, never
// for "everything this seat has": that grows with the account, is cut off without a word at the API's 1,000 rows, and
// is what made a busy account's pages time out (SYSTEM_DESIGN.md). "Show more" asks for the next page.

/** How many rows a list shows before "show more". */
export const PAGE = 25;

/** The rows page `page` covers, for supabase-js's `.range(from, to)` (both ends included). */
export function pageRange(page: number, size: number = PAGE): [number, number] {
  return [page * size, page * size + size - 1];
}

/**
 * The page to ask for after `last`, or undefined when there is nothing more: a page that came back short was the end.
 * (A full last page can also be the end; "show more" then brings an empty page and goes away.)
 */
export function nextPage(last: readonly unknown[], pagesSoFar: readonly unknown[], size: number = PAGE): number | undefined {
  return last.length === size ? pagesSoFar.length : undefined;
}

/** Every row loaded so far, in order. */
export function loadedRows<T>(data: { pages: T[][] } | undefined): T[] {
  return data?.pages.flat() ?? [];
}

/**
 * A list read a page at a time. Refreshing it (a move, a change arriving over Realtime) asks again for the pages on
 * show, so what was scrolled to stays put.
 */
export function usePagedList<T>(queryKey: QueryKey, fetchPage: (page: number) => Promise<T[]>, { enabled = true, size = PAGE }: { enabled?: boolean; size?: number } = {}) {
  return useInfiniteQuery({
    queryKey,
    enabled,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: 0,
    getNextPageParam: (last: T[], all: T[][]) => nextPage(last, all, size),
  });
}

/** What "show more" needs from a paged list. */
export interface MoreToShow {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
}
