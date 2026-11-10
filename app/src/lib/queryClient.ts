import { QueryClient } from '@tanstack/react-query';

/**
 * Whether a failed read is worth asking for again.
 *
 * The Supabase client already retries reads on its own when they can't reach the server (status 0) or the server says
 * "busy" (503, 520): three more tries over seven seconds. Retrying those here as well multiplied the two (twelve
 * requests and a 24-second spinner before a screen admitted anything was wrong), so they are left to it. A refusal or
 * a bad request (4xx, or one of the database's own error codes) won't succeed by asking again either. What's left, a
 * server error the client doesn't retry (500, 502, 504), gets two more tries.
 */
export function retryable(failureCount: number, error: unknown): boolean {
  const e = error as { status?: number; code?: string } | null;
  const status = e && typeof e.status === 'number' ? e.status : null;
  if (status === 0 || status === 503 || status === 520) return false;
  if (status !== null && status >= 400 && status < 500) return false;
  if (e && typeof e.code === 'string' && /^(P0|22|23|42|PGRST)/.test(e.code)) return false;
  return failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000, // Realtime marks data stale the moment it changes; this only spares refetches on remount
        gcTime: 10 * 60_000,
        retry: retryable,
        refetchOnWindowFocus: true, // coming back to the tab (or a phone waking up) catches up at once
      },
      mutations: { retry: false },
    },
  });
}
