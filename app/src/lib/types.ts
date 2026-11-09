import type { Enums, Tables } from './database.types';

export type { Json } from './database.types';

export type Side = Enums<'side'>;
export type BrandRole = Enums<'brand_role'>;
export type OfferStatus = Enums<'offer_status'>;
export type DealStatus = Enums<'deal_status'>;
export type MilestoneStatus = Enums<'milestone_status'>;
export type DeliverableStatus = Enums<'deliverable_status'>;
export type ProofStatus = Enums<'proof_status'>;
export type PaymentMethod = Enums<'payment_method'>;
export type PaymentStatus = Enums<'payment_status'>;

/** One seat the signed-in person can act from: their creator profile, or a brand they work for. */
export interface Seat {
  side: Side;
  id: string;
  name: string;
  role: BrandRole | null;
}

/** A deliverable as offers and packages carry it (the database's items_valid): a name and, optionally, days to do it. */
export interface Item {
  label: string;
  days?: number;
}

/** A platform on a creator's profile, e.g. { platform: 'twitch', followers: '350K' }. */
export interface Platform {
  platform: string;
  followers?: string;
}

export type CreatorRow = Tables<'creators'>;
export type BrandRow = Tables<'brands'>;
export type PackageRow = Tables<'packages'>;
export type OfferBoardRow = Tables<'offer_board'>;
export type OfferVersionRow = Tables<'offer_versions'>;
export type DealRow = Tables<'deals'>;
export type DealMoneyRow = Tables<'deal_money'>;
export type MilestoneRow = Tables<'milestones'>;
export type DeliverableRow = Tables<'deliverables'>;
export type ProofRow = Tables<'proofs'>;
export type PaymentRow = Tables<'payments'>;
export type RatingRow = Tables<'ratings'>;
export type TodoRow = Tables<'todos'>;
export type ConversationRow = Tables<'conversations'>;
export type TimelineRow = Tables<'conversation_timeline'>;
export type WalletRow = Tables<'creator_wallet'>;
export type WalletLineRow = Tables<'wallet_lines'>;
export type PayoutRow = Tables<'payouts'>;
export type BrandMoneyRow = Tables<'brand_money'>;
export type NotificationRow = Tables<'notifications'>;
export type EventRow = Tables<'events'>;

/** The other side of a deal. */
export const otherSide = (side: Side): Side => (side === 'brand' ? 'creator' : 'brand');
