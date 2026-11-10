import { describe, expect, it } from 'vitest';
import type { Seat } from '@/lib/types';
import { isParty, notifiedSeat, partySeats } from './party';

const shock: Seat = { side: 'creator', id: 'c-shock', name: 'Instant Shock', role: null };
const voltedge: Seat = { side: 'brand', id: 'b-volt', name: 'VOLTEDGE', role: 'owner' };
const gridfuel: Seat = { side: 'brand', id: 'b-grid', name: 'GRIDFUEL', role: 'owner' };
const hypercore: Seat = { side: 'brand', id: 'b-hyper', name: 'HYPERCORE', role: 'owner' };
const seats = [shock, gridfuel, hypercore, voltedge];

describe('whose an offer or a deal is', () => {
  const gridfuelToTesty = { brand_id: 'b-grid', creator_id: 'c-testy' };
  const hypercoreToShock = { brand_id: 'b-hyper', creator_id: 'c-shock' };

  it('is the brand’s and the creator’s, and no other seat’s, even another seat of the same account', () => {
    expect(isParty(gridfuel, gridfuelToTesty)).toBe(true);
    expect(isParty(voltedge, gridfuelToTesty)).toBe(false); // a brand, but not this offer's brand
    expect(isParty(shock, gridfuelToTesty)).toBe(false); // a creator, but not this offer's creator
    expect(isParty({ side: 'creator', id: 'b-grid' }, gridfuelToTesty)).toBe(false); // an id only counts on its own side
  });

  it('finds the account’s seats that are a party: one, both, or none', () => {
    expect(partySeats(seats, gridfuelToTesty)).toEqual([gridfuel]);
    expect(partySeats(seats, hypercoreToShock)).toEqual([shock, hypercore]);
    expect(partySeats(seats, { brand_id: 'b-other', creator_id: 'c-other' })).toEqual([]);
    expect(partySeats(seats, { brand_id: null, creator_id: 'c-shock' })).toEqual([shock]); // a payout: no brand
  });
});

describe('which seat a notification was meant for', () => {
  it('is the side that didn’t make the move', () => {
    // GRIDFUEL countered Instant Shock's pitch: the creator was told
    expect(notifiedSeat(seats, { brand_id: 'b-grid', creator_id: 'c-shock', actor_side: 'brand' }, voltedge)).toBe(shock);
    // a creator countered HYPERCORE: the brand was told
    expect(notifiedSeat(seats, { brand_id: 'b-hyper', creator_id: 'c-testy', actor_side: 'creator' }, shock)).toBe(hypercore);
  });

  it('prefers the seat being acted from when a move by nobody told both of the account’s seats', () => {
    const expired = { brand_id: 'b-hyper', creator_id: 'c-shock', actor_side: null };
    expect(notifiedSeat(seats, expired, hypercore)).toBe(hypercore);
    expect(notifiedSeat(seats, expired, shock)).toBe(shock);
    expect(notifiedSeat(seats, expired, voltedge)).toBe(shock); // neither: the first of the two
  });

  it('is nobody’s seat when the account isn’t the side that was told', () => {
    expect(notifiedSeat(seats, { brand_id: 'b-other', creator_id: 'c-other', actor_side: 'brand' }, shock)).toBeNull();
    expect(notifiedSeat([voltedge], { brand_id: 'b-volt', creator_id: 'c-testy', actor_side: 'brand' }, voltedge)).toBeNull();
  });
});
