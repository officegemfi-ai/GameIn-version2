import { QueryClient } from '@tanstack/react-query';
import { scopes } from './keys';

/** Postgres's code for a statement it cancelled: here, a read that ran into the API's time limit. */
const TIME_LIMIT = '57014';

/**
 * Whether a failed read is worth asking for again.
 *
 * The Supabase client already retries reads on its own when they can't reach the server (status 0) or the server says
 * "busy" (503, 520): three more tries over seven seconds. Retrying those here as well multiplied the two (twelve
 * requests and a 24-second spinner before a screen admitted anything was wrong), so they are left to it. A refusal or
 * a bad request (4xx, or one of the database's own error codes) won't succeed by asking again either. What's left, a
 * server error the client doesn't retry (500, 502, 504), gets two more tries.
 *
 * With one exception: a read the database stopped at its time limit (code 57014: eight seconds signed in, three for a
 * visitor). Asked again it does the same work and stops at the same place, so two more tries were sixteen more
 * seconds of the database's time from every tab that hit the limit, at the moment it had none to spare. That is how
 * a slow patch becomes an outage. The screen says it couldn't load and offers "try again".
 */
export function retryable(failureCount: number, error: unknown): boolean {
  const e = error as { status?: number; code?: string } | null;
  const status = e && typeof e.status === 'number' ? e.status : null;
  if (status === 0 || status === 503 || status === 520) return false;
  if (status !== null && status >= 400 && status < 500) return false;
  if (e && typeof e.code === 'string' && (/^(P0|22|23|42|PGRST)/.test(e.code) || e.code === TIME_LIMIT)) return false;
  return failureCount < 2;
}

/**
 * How long something a screen read is shown again without asking (staleTime). After that it is still shown at once,
 * and refreshed behind it. Three kinds of data:
 *
 *   live      offers, deals, money, messages, to-dos: Realtime marks these stale the moment they change, and so does
 *             the person's own move; the time here only spares a refetch when a screen is opened again.
 *   account   the person's seats and own name: nobody but them changes these, and changing them refreshes them.
 *   bell      the notifications are also the safety net under Realtime: checked on a timer in case it missed
 *             something. Often while Realtime is down; rarely while it's up and doing the job.
 *
 * Public pages (the directory, a creator's page) are "live" here too; what makes them cheap at scale is the CDN in
 * front of them (SYSTEM_DESIGN.md, caching), not a longer memory in each browser.
 */
export const FRESH_FOR = { live: 30_000, account: 5 * 60_000 } as const;
export const BELL_EVERY = { whileLive: 2 * 60_000, otherwise: 30_000 } as const;

export function createQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: FRESH_FOR.live,
        gcTime: 10 * 60_000, // what a screen read is kept for after it's left: going back shows it at once
        retry: retryable,
        refetchOnWindowFocus: true, // coming back to the tab (or a phone waking up) catches up at once
      },
      mutations: { retry: false },
    },
  });
  for (const scope of [scopes.seats, scopes.profile]) client.setQueryDefaults(scope, { staleTime: FRESH_FOR.account });
  return client;
}
