import type { Seat } from './types';

// Every query key in one place. Seat-scoped lists include the seat, so switching seats never shows the other seat's
// cached rows. Realtime invalidates by these prefixes (lib/realtime.ts).
export const keys = {
  seats: (userId: string) => ['seats', userId] as const,
  profile: (userId: string) => ['profile', userId] as const,
  todos: (seat: Seat) => ['todos', seat.side, seat.id] as const,
  offers: (seat: Seat) => ['offers', seat.side, seat.id] as const,
  offer: (id: string) => ['offer', id] as const,
  deals: (seat: Seat) => ['deals', seat.side, seat.id] as const,
  deal: (id: string) => ['deal', id] as const,
  conversations: (seat: Seat) => ['conversations', seat.side, seat.id] as const,
  thread: (conversationId: string) => ['thread', conversationId] as const,
  wallet: (creatorId: string) => ['wallet', creatorId] as const,
  brandMoney: (brandId: string) => ['brand-money', brandId] as const,
  payments: (brandId: string) => ['payments', brandId] as const,
  notifications: (userId: string) => ['notifications', userId] as const,
  creators: (search: string) => ['creators', search] as const,
  creator: (handle: string) => ['creator', handle.toLowerCase()] as const,
  myCreator: (creatorId: string) => ['my-creator', creatorId] as const,
  packages: (creatorId: string) => ['packages', creatorId] as const,
  brands: (search: string) => ['brands', search] as const,
  brand: (brandId: string) => ['brand', brandId] as const,
};
