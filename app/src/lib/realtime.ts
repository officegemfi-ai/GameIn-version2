import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { affected, LIVE_SCOPES, scopes } from './keys';
import { supabase } from './supabase';

// Following the database. One Realtime channel per signed-in person listens to the tables the database publishes
// (row-level security decides which rows each person hears about). Each changed row marks the queries it affects as
// stale, and only the screens on show refetch. If Realtime can't connect, the screens on show refetch every few
// seconds until it's back.

export const WATCHED_TABLES = [
  'offers', 'offer_versions', 'deals', 'milestones', 'deliverables', 'proofs', 'releases', 'renewals', 'ratings',
  'messages', 'conversation_reads', 'events', 'notifications', 'payouts', 'payments',
] as const;

type RowLike = Record<string, unknown> | null | undefined;

/** The query keys (prefixes) a changed row affects. A delete may carry no ids: then the whole kind is affected. */
export function keysFor(table: string, row: RowLike): QueryKey[] {
  const id = (k: string): string | null => (row && typeof row[k] === 'string' ? (row[k] as string) : null);
  switch (table) {
    case 'offers':
      return [...affected.offer(id('id')), scopes.deals];
    case 'offer_versions':
      return affected.offer(id('offer_id'));
    case 'deals':
      return affected.deal(id('id'));
    case 'milestones':
    case 'deliverables':
    case 'proofs':
    case 'releases':
    case 'renewals':
    case 'ratings':
    case 'payments':
      return affected.deal(id('deal_id'));
    case 'payouts':
      return [scopes.wallet];
    case 'messages':
    case 'conversation_reads':
      return affected.thread(id('conversation_id'));
    case 'events':
      return [scopes.thread];
    case 'notifications':
      return [scopes.notifications];
    default:
      return [];
  }
}

// When Realtime last brought in a notification (this browser's clock). A notification arrives together with the rows
// it's about, so the bell can tell which screens have refreshed since (features/notifications/NotificationBell.tsx).
let notifiedAt = 0;
export const lastNotificationAt = (): number => notifiedAt;

// --- the connection's state, for the dot in the top bar --------------------------------------------------------------
export type LiveState = 'off' | 'connecting' | 'live' | 'polling';
let state: LiveState = 'off';
const listeners = new Set<() => void>();
function setState(next: LiveState) {
  if (next === state) return;
  state = next;
  listeners.forEach((l) => l());
}
export const liveState = {
  get: (): LiveState => state,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
};

declare global {
  interface Window {
    /** Tests can make the fallback refetching quicker (tests/e2e/support.ts). */
    __gameinRealtime?: RealtimeOptions;
  }
}

export interface RealtimeOptions {
  /** How often the screens on show refetch while Realtime is down. */
  pollMs?: number;
  /** How long to wait for Realtime before falling back to refetching. */
  connectTimeoutMs?: number;
}

let starts = 0;

/** Starts following the database for one person; returns the function that stops it. */
export function startRealtime(userId: string, queryClient: QueryClient, options: RealtimeOptions = {}): () => void {
  const { pollMs = 5000, connectTimeoutMs = 6000 } = options;
  const pending = new Map<string, QueryKey>();
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  let poll: ReturnType<typeof setInterval> | undefined;
  let subscribedBefore = false;
  let stopped = false; // removing the channel reports CLOSED: that mustn't start polling for someone signed out

  // a move changes several rows at once: their keys are gathered for a moment and invalidated together
  const flush = () => {
    flushTimer = undefined;
    for (const queryKey of pending.values()) void queryClient.invalidateQueries({ queryKey });
    pending.clear();
  };
  const queue = (list: QueryKey[]) => {
    for (const k of list) pending.set(JSON.stringify(k), k);
    flushTimer ??= setTimeout(flush, 120);
  };
  // what Realtime would have refreshed (offers, deals, money, messages...), not the directory or the account's seats
  const liveKinds = new Set(LIVE_SCOPES.map((s) => s[0]));
  const refetchActive = () => void queryClient.invalidateQueries({ refetchType: 'active', predicate: (q) => liveKinds.has(q.queryKey[0]) });
  const startPolling = () => {
    if (poll || stopped) return;
    setState('polling');
    poll = setInterval(refetchActive, pollMs);
  };
  const stopPolling = () => {
    if (poll) clearInterval(poll);
    poll = undefined;
  };

  setState('connecting');
  // a fresh topic each time: a channel being removed is never handed back for reuse (React's dev mode starts twice)
  const channel = supabase.channel(`gamein:${userId}:${++starts}`);
  for (const table of WATCHED_TABLES) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
      const row = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
      if (table === 'notifications') notifiedAt = Date.now();
      queue(keysFor(table, row as RowLike));
    });
  }
  const fallback = setTimeout(() => {
    if (state !== 'live') startPolling();
  }, connectTimeoutMs);
  channel.subscribe((status) => {
    if (stopped) return;
    if (status === 'SUBSCRIBED') {
      stopPolling();
      setState('live');
      if (subscribedBefore) refetchActive(); // back after a drop: catch up on what changed meanwhile
      subscribedBefore = true;
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      startPolling();
    }
  });

  return () => {
    stopped = true;
    clearTimeout(fallback);
    if (flushTimer) clearTimeout(flushTimer);
    stopPolling();
    void supabase.removeChannel(channel);
    setState('off');
  };
}
