// Whose an offer, a deal or a conversation is. Each has exactly two parties, a brand and a creator, and one account
// can hold several seats (its creator profile, any number of brands). A page about one of them only makes sense from
// a seat that is a party to it: from any other seat the "your turn" and the buttons would be someone else's.
import type { Seat, Side } from '@/lib/types';

/** The two parties, as offers, deals and conversations name them. */
export interface Parties {
  brand_id: string | null;
  creator_id: string | null;
}

/** Whether this seat is one of the two parties. */
export const isParty = (seat: Pick<Seat, 'side' | 'id'>, of: Parties): boolean => (seat.side === 'brand' ? seat.id === of.brand_id : seat.id === of.creator_id);

/** The account's seats that are a party (none, one, or both when one person sits on both sides). */
export const partySeats = (seats: Seat[], of: Parties): Seat[] => seats.filter((s) => isParty(s, of));

/**
 * The seat a notification about an event was meant for, among the account's seats. The database tells the side that
 * didn't make the move (a move by nobody, like an expiry, tells both). When both of the account's seats were told,
 * the one being acted from wins.
 */
export function notifiedSeat(seats: Seat[], event: Parties & { actor_side: Side | null }, current: Pick<Seat, 'side' | 'id'>): Seat | null {
  const told = partySeats(seats, event).filter((s) => s.side !== event.actor_side);
  return told.find((s) => s.side === current.side && s.id === current.id) ?? told[0] ?? null;
}
