import { QueryClient } from '@tanstack/react-query';

// A refused move or a bad request won't succeed by asking again; a network blip might
function retryable(failureCount: number, error: unknown): boolean {
  const e = error as { status?: number; code?: string } | null;
  if (e && typeof e.status === 'number' && e.status >= 400 && e.status < 500) return false;
  if (e && typeof e.code === 'string' && /^(P0001|23|42|PGRST)/.test(e.code)) return false;
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
