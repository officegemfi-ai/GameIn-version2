import type { Enums, Tables } from './database.types';

export type { Json } from './database.types';

export type Side = Enums<'side'>;
export type BrandRole = Enums<'brand_role'>;
export type DealStatus = Enums<'deal_status'>;
export type MilestoneStatus = Enums<'milestone_status'>;
export type DeliverableStatus = Enums<'deliverable_status'>;
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

export type PackageRow = Tables<'packages'>;
export type OfferBoardRow = Tables<'offer_board'>;
export type DealRow = Tables<'deals'>;
export type DealMoneyRow = Tables<'deal_money'>;
export type MilestoneRow = Tables<'milestones'>;
export type DeliverableRow = Tables<'deliverables'>;
export type ProofRow = Tables<'proofs'>;
export type TodoRow = Tables<'todos'>;

/** The other side of a deal. */
export const otherSide = (side: Side): Side => (side === 'brand' ? 'creator' : 'brand');

/** The column that holds a seat's id on rows shared by both sides (deals, offers, conversations, to-dos). */
export const seatColumn = (seat: Pick<Seat, 'side'>) => (seat.side === 'brand' ? 'brand_id' : 'creator_id');
