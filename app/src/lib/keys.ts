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

export const keys = {
  seats: (userId: string) => ['seats', userId] as const,
  profile: (userId: string) => ['profile', userId] as const,
  todos: (seat: Seat) => ['todos', seat.side, seat.id] as const,
  offers: (seat: Seat) => ['offers', seat.side, seat.id] as const,
  offer: (id: string) => ['offer', id] as const,
  deals: (seat: Seat) => ['deals', seat.side, seat.id] as const,
  /** A creator's deliverables that are funded and waiting for proof (under 'deals': they change with every deal). */
  readyDeliverables: (creatorId: string) => ['deals', 'ready', creatorId] as const,
  deal: (id: string) => ['deal', id] as const,
  proofDeal: (proofId: string) => ['proof-deal', proofId] as const,
  conversations: (seat: Seat) => ['conversations', seat.side, seat.id] as const,
  conversationWith: (brandId: string | null, creatorId: string | null) => ['conversations', 'pair', brandId, creatorId] as const,
  thread: (conversationId: string) => ['thread', conversationId] as const,
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
  wallet: ['wallet'],
  brandMoney: ['brand-money'],
  payments: ['payments'],
  conversations: ['conversations'],
  thread: ['thread'],
  notifications: ['notifications'],
  creators: ['creators'],
  creator: ['creator'],
} as const satisfies Record<string, QueryKey>;

/** The kinds of query Realtime keeps fresh: what the polling fallback refreshes while Realtime is down. */
export const LIVE_SCOPES: readonly QueryKey[] = [
  scopes.offers, scopes.offer, scopes.deals, scopes.deal, scopes.todos, scopes.wallet, scopes.brandMoney, scopes.payments,
  scopes.conversations, scopes.thread, scopes.notifications,
];

export const affected = {
  /** A deal, or any of its rows (milestones, deliverables, proofs, releases, renewals, ratings, payments). */
  deal: (dealId: string | null): QueryKey[] => [
    scopes.deals,
    dealId ? keys.deal(dealId) : scopes.deal,
    scopes.todos,
    scopes.wallet,
    scopes.brandMoney,
    scopes.payments,
  ],
  /** An offer or one of its versions. */
  offer: (offerId: string | null): QueryKey[] => [scopes.offers, offerId ? keys.offer(offerId) : scopes.offer, scopes.todos],
  /** A conversation's messages or how far someone has read it. */
  thread: (conversationId: string | null): QueryKey[] => [conversationId ? keys.thread(conversationId) : scopes.thread, scopes.conversations, scopes.todos],
  /** A creator's packages: their own list and every public view of the creator. */
  packages: (creatorId: string): QueryKey[] => [keys.packages(creatorId), scopes.creator, scopes.creators],
  /** A creator's profile: their settings and every public view of them. */
  creatorProfile: (creatorId: string): QueryKey[] => [keys.myCreator(creatorId), scopes.creator, scopes.creators],
};
