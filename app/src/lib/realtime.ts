import type { Query, QueryClient, QueryKey } from '@tanstack/react-query';
import { affected, isTotal, LIVE_SCOPES, scopes } from './keys';
import { supabase } from './supabase';

// Following the database. One Realtime channel per signed-in person listens to four tables (row-level security
// decides which rows each person hears about). Each new row marks the queries it affects as stale, and only the
// screens on show refetch. If Realtime can't connect, the screens on show refetch every few seconds until it's back;
// when it connects after that, they refetch once more to catch up.
//
// How often. The first change refreshes the screen at once. When changes keep arriving (a busy brand's team, a
// lively conversation) a screen refreshes at most once a second, and the totals (badge counts, money across every
// deal: the reads whose cost grows with the account) at most every five seconds. Without that, every change from
// anyone became a round of requests from every open tab: the busier an account, the more it asked, without limit.
//
// Why four. Every move on an offer, a deal or money writes one row to the event log, naming the offer or deal it was
// about, in the same transaction as the rows it changed: that one row says which screens to refresh. The tables
// behind it used to be listened to one by one (fifteen subscriptions a person), and Realtime checks every changed row
// against every listener's access: one release changed seven rows, so it cost seven checks per person online where
// one says the same. Messages, read marks and notifications don't go through the event log, so they are listened to
// directly.
export const WATCHED_TABLES = ['events', 'messages', 'conversation_reads', 'notifications'] as const;

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
    case 'events': {
      // a line in the pair's conversation (the first one opens it), and whatever it was about
      const offer = id('offer_id');
      const deal = id('deal_id');
      const about: QueryKey[] = [scopes.thread, scopes.conversations];
      // not a whole row (a delete carries none): anything may have changed
      if (!row || typeof row.kind !== 'string') return [...about, ...affected.offer(null), ...affected.deal(null)];
      if (offer) about.push(...affected.offer(offer));
      if (deal) about.push(...affected.deal(deal));
      // money that belongs to no deal: a payout asked for, paid or failed
      if (!offer && !deal) about.push(scopes.wallet);
      return about;
    }
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
  /** How long changes are gathered before the screens refresh: one move changes several rows at once. */
  settleMs?: number;
  /** The least time between two refreshes of the screens on show, while changes keep arriving. */
  gapMs?: number;
  /** The same for the totals (TOTALS in lib/keys.ts). */
  totalsGapMs?: number;
}

/**
 * Gathers the keys changes affect and marks them stale together: `settleMs` after the first change, then no more
 * often than every `gapMs` while changes keep coming. Nothing is dropped: what arrives between two refreshes waits
 * for the next one.
 */
function gatherer(queryClient: QueryClient, settleMs: number, gapMs: number) {
  const pending = new Map<string, QueryKey>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastAt = Number.NEGATIVE_INFINITY;
  const flush = () => {
    timer = undefined;
    lastAt = Date.now();
    for (const queryKey of pending.values()) void queryClient.invalidateQueries({ queryKey });
    pending.clear();
  };
  return {
    add(key: QueryKey) {
      pending.set(JSON.stringify(key), key);
      timer ??= setTimeout(flush, Math.max(settleMs, lastAt + gapMs - Date.now()));
    },
    stop() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      pending.clear();
    },
  };
}

let starts = 0;

/** Starts following the database for one person; returns the function that stops it. */
export function startRealtime(userId: string, queryClient: QueryClient, options: RealtimeOptions = {}): () => void {
  const { pollMs = 5000, connectTimeoutMs = 6000, settleMs = 120, gapMs = 1000, totalsGapMs = 5000 } = options;
  let poll: ReturnType<typeof setInterval> | undefined;
  let subscribedBefore = false;
  let stopped = false; // removing the channel reports CLOSED: that mustn't start polling for someone signed out

  const screens = gatherer(queryClient, settleMs, gapMs);
  const totals = gatherer(queryClient, settleMs, totalsGapMs);
  const queue = (list: QueryKey[]) => {
    for (const k of list) (isTotal(k) ? totals : screens).add(k);
  };
  // what Realtime would have refreshed (offers, deals, money, messages...), not the directory or the account's seats
  const liveKinds = new Set(LIVE_SCOPES.map((s) => s[0]));
  const isLive = (q: Query) => liveKinds.has(q.queryKey[0]);
  // Realtime is (back) on: a refresh already on its way may have left before the change it missed, so it starts over
  const refetchActive = () => void queryClient.invalidateQueries({ refetchType: 'active', predicate: isLive });
  // A tick while Realtime is down. Nothing is known to have changed, so:
  //   * a refresh still on its way is left to land (starting it over every tick meant that on a connection slower
  //     than the tick none ever did);
  //   * a screen that couldn't load at all keeps its error and its "try again" (asking again every tick only swapped
  //     the message for a spinner and back). Coming back online, back to the tab, or Realtime returning asks again.
  const couldNotLoad = (q: Query) => q.state.status === 'error' && q.state.data === undefined;
  const pollActive = () =>
    void queryClient.invalidateQueries({ refetchType: 'active', predicate: (q) => isLive(q) && !couldNotLoad(q) }, { cancelRefetch: false });
  const startPolling = () => {
    if (poll || stopped) return;
    setState('polling');
    poll = setInterval(pollActive, pollMs);
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
      // Realtime tells of changes from now on, not of what it missed. That is caught up on here: after a drop, and
      // after a slow start that the fallback covered meanwhile (its last tick can be seconds old, and it leaves the
      // screens that couldn't load alone).
      const catchUp = subscribedBefore || poll !== undefined;
      stopPolling();
      setState('live');
      if (catchUp) refetchActive();
      subscribedBefore = true;
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      startPolling();
    }
  });

  return () => {
    stopped = true;
    clearTimeout(fallback);
    screens.stop();
    totals.stop();
    stopPolling();
    void supabase.removeChannel(channel);
    setState('off');
  };
}
