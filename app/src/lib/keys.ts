import type { QueryKey } from '@tanstack/react-query';
import type { Seat } from './types';

// The query cache's vocabulary, in one place.
//
//   keys      the exact key of each query. Seat-scoped lists include the seat, so switching seats never shows the
//             other seat's cached rows. Every key starts with its kind (the first element), and kinds never share a
//             first element with a different data shape.
//   scopes    one kind of query, all of them: what to mark stale when the exact one isn't known.
//   affected  what one change touches. Realtime (lib/realtime.ts) and every move (features/*/api.ts) mark these
//             stale, so the person who moved and the person watching see the same screens refresh.

/** The tabs of the offers page: what waits on this seat, what waits on the other side, what is over. */
export type OfferTab = 'yours' | 'theirs' | 'closed';
/** The tabs of the deals page. */
export type DealTab = 'active' | 'done';

export const keys = {
  seats: (userId: string) => ['seats', userId] as const,
  profile: (userId: string) => ['profile', userId] as const,
  /** The first few things that wait on a seat (the dashboard's list). */
  todos: (seat: Seat) => ['todos', seat.side, seat.id] as const,
  /** How many things of each kind wait on a seat (the navigation's badges, a tab's count). */
  todoCounts: (seat: Seat) => ['todo-counts', seat.side, seat.id] as const,
  /** One tab of a seat's offers, a page at a time. */
  offers: (seat: Seat, tab: OfferTab) => ['offers', seat.side, seat.id, tab] as const,
  offer: (id: string) => ['offer', id] as const,
  /** One tab of a seat's deals, a page at a time. */
  deals: (seat: Seat, tab: DealTab) => ['deals', seat.side, seat.id, tab] as const,
  /** How many deals a seat has running (the tab's count). Under the tab's own key: it changes when the tab does. */
  activeDealCount: (seat: Seat) => ['deals', seat.side, seat.id, 'active', 'count'] as const,
  /** A brand's running deals that still need money put in (under 'deals': they change with every deal). */
  dealsToFund: (brandId: string) => ['deals', 'to-fund', brandId] as const,
  /** A creator's deliverables that are funded and waiting for proof (under 'deals': they change with every deal). */
  readyDeliverables: (creatorId: string) => ['deals', 'ready', creatorId] as const,
  deal: (id: string) => ['deal', id] as const,
  proofDeal: (proofId: string) => ['proof-deal', proofId] as const,
  conversations: (seat: Seat) => ['conversations', seat.side, seat.id] as const,
  conversationWith: (brandId: string | null, creatorId: string | null) => ['conversations', 'pair', brandId, creatorId] as const,
  /** A conversation's newest lines: as many as the person has asked to see. */
  thread: (conversationId: string, lines?: number) => (lines === undefined ? (['thread', conversationId] as const) : (['thread', conversationId, lines] as const)),
  wallet: (creatorId: string) => ['wallet', creatorId] as const,
  walletLines: (creatorId: string) => ['wallet', creatorId, 'lines'] as const,
  brandMoney: (brandId: string) => ['brand-money', brandId] as const,
  payments: (brandId: string) => ['payments', brandId] as const,
  notifications: (userId: string) => ['notifications', userId] as const,
  creators: (search: string) => ['creators', 'search', search] as const,
  featuredCreators: () => ['creators', 'featured'] as const,
  creator: (handle: string) => ['creator', handle.toLowerCase()] as const,
  myCreator: (creatorId: string) => ['my-creator', creatorId] as const,
  packages: (creatorId: string) => ['packages', creatorId] as const,
  brands: (search: string) => ['brands', search] as const,
  brand: (brandId: string) => ['brand', brandId] as const,
};

export const scopes = {
  offers: ['offers'],
  offer: ['offer'],
  deals: ['deals'],
  deal: ['deal'],
  todos: ['todos'],
  todoCounts: ['todo-counts'],
  wallet: ['wallet'],
  brandMoney: ['brand-money'],
  payments: ['payments'],
  conversations: ['conversations'],
  thread: ['thread'],
  notifications: ['notifications'],
  creators: ['creators'],
  creator: ['creator'],
  brands: ['brands'],
  seats: ['seats'],
  profile: ['profile'],
} as const satisfies Record<string, QueryKey>;

/** The kinds of query Realtime keeps fresh: what the polling fallback refreshes while Realtime is down. */
export const LIVE_SCOPES: readonly QueryKey[] = [
  scopes.offers, scopes.offer, scopes.deals, scopes.deal, scopes.todos, scopes.todoCounts, scopes.wallet, scopes.brandMoney,
  scopes.payments, scopes.conversations, scopes.thread, scopes.notifications,
];

/**
 * The kinds that are a total over everything a seat has (how many things wait on it, its money across every deal):
 * the only reads whose cost grows with the account. When changes arrive in a burst these catch up every few seconds
 * rather than after each one (lib/realtime.ts); a person's own move still refreshes them at once.
 */
export const TOTALS: readonly QueryKey[] = [scopes.todoCounts, scopes.brandMoney, scopes.wallet];
const totalKinds = new Set(TOTALS.map((s) => s[0]));
/** Whether a query is one of the totals. */
export const isTotal = (queryKey: QueryKey): boolean => totalKinds.has(queryKey[0] as string);

/** What waits on a seat: the list and its counts. */
const waiting: QueryKey[] = [scopes.todos, scopes.todoCounts];

export const affected = {
  /** A deal, or any of its rows (milestones, deliverables, proofs, releases, renewals, ratings, payments). */
  deal: (dealId: string | null): QueryKey[] => [
    scopes.deals,
    dealId ? keys.deal(dealId) : scopes.deal,
    ...waiting,
    scopes.wallet,
    scopes.brandMoney,
    scopes.payments,
  ],
  /** An offer or one of its versions. */
  offer: (offerId: string | null): QueryKey[] => [scopes.offers, offerId ? keys.offer(offerId) : scopes.offer, ...waiting],
  /** A conversation's messages or how far someone has read it. */
  thread: (conversationId: string | null): QueryKey[] => [conversationId ? keys.thread(conversationId) : scopes.thread, scopes.conversations, ...waiting],
  /** What waits on a seat, when nothing else about the change is known. */
  waiting: (): QueryKey[] => [...waiting],
  /** A creator's packages: their own list and every public view of the creator. */
  packages: (creatorId: string): QueryKey[] => [keys.packages(creatorId), scopes.creator, scopes.creators],
  /** A creator's profile: their settings and every public view of them. */
  creatorProfile: (creatorId: string): QueryKey[] => [keys.myCreator(creatorId), scopes.creator, scopes.creators],
};
