import { describe, expect, it } from 'vitest';
import { LIVE_SCOPES } from './keys';
import { keysFor, WATCHED_TABLES } from './realtime';

describe('which screens a changed row affects', () => {
  it('maps every table the database publishes', () => {
    for (const table of WATCHED_TABLES) expect(keysFor(table, {}).length).toBeGreaterThan(0);
    expect(keysFor('ledger_entries', {})).toEqual([]);
  });

  it('targets the one deal a deal row belongs to, and the lists around it', () => {
    const k = keysFor('proofs', { id: 'p1', deal_id: 'd1' });
    expect(k).toContainEqual(['deal', 'd1']);
    expect(k).toContainEqual(['deals']);
    expect(k).toContainEqual(['todos']);
    expect(k).toContainEqual(['wallet']);
    expect(keysFor('deals', { id: 'd2' })).toContainEqual(['deal', 'd2']);
  });

  it('targets the one thread a message belongs to', () => {
    expect(keysFor('messages', { conversation_id: 'c1' })).toEqual([['thread', 'c1'], ['conversations'], ['todos'], ['todo-counts']]);
  });

  it('falls back to the whole kind when the row carries no id (a delete)', () => {
    expect(keysFor('offer_versions', null)).toContainEqual(['offer']);
    expect(keysFor('payments', {})).toContainEqual(['deal']);
  });

  it('listens to the event log instead of every table a move changes', () => {
    // one row per move, with what it was about: fifteen subscriptions a person became four
    expect([...WATCHED_TABLES]).toEqual(['events', 'messages', 'conversation_reads', 'notifications']);
    const released = keysFor('events', { id: 9, kind: 'payment_released', brand_id: 'b1', creator_id: 'c1', deal_id: 'd1', offer_id: null });
    expect(released).toEqual(expect.arrayContaining([['deal', 'd1'], ['deals'], ['todos'], ['todo-counts'], ['wallet'], ['brand-money'], ['payments'], ['thread']]));
    expect(released).not.toContainEqual(['offer']);
    const countered = keysFor('events', { id: 10, kind: 'offer_countered', brand_id: 'b1', creator_id: 'c1', offer_id: 'o1', deal_id: null });
    expect(countered).toEqual(expect.arrayContaining([['offer', 'o1'], ['offers'], ['todos'], ['thread']]));
    expect(countered).not.toContainEqual(['deals']);
    // accepting an offer makes a deal: both
    const accepted = keysFor('events', { id: 11, kind: 'offer_accepted', offer_id: 'o1', deal_id: 'd2' });
    expect(accepted).toEqual(expect.arrayContaining([['offer', 'o1'], ['deal', 'd2'], ['deals'], ['offers']]));
    // the first event between a brand and a creator opens their conversation
    expect(keysFor('events', { id: 12, kind: 'offer_sent', offer_id: 'o2' })).toContainEqual(['conversations']);
    // a payout is about no deal: the wallet
    expect(keysFor('events', { id: 13, kind: 'payout_paid', creator_id: 'c1', offer_id: null, deal_id: null })).toContainEqual(['wallet']);
  });

  it('has the polling fallback refresh exactly the kinds Realtime would', () => {
    const fromRealtime = new Set(WATCHED_TABLES.flatMap((t) => keysFor(t, {}).map((k) => k[0])));
    expect(new Set(LIVE_SCOPES.map((k) => k[0]))).toEqual(fromRealtime);
  });
});
