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
    expect(keysFor('messages', { conversation_id: 'c1' })).toEqual([['thread', 'c1'], ['conversations'], ['todos']]);
  });

  it('falls back to the whole kind when the row carries no id (a delete)', () => {
    expect(keysFor('offer_versions', null)).toContainEqual(['offer']);
    expect(keysFor('payments', {})).toContainEqual(['deal']);
  });

  it('has the polling fallback refresh exactly the kinds Realtime would', () => {
    const fromRealtime = new Set(WATCHED_TABLES.flatMap((t) => keysFor(t, {}).map((k) => k[0])));
    expect(new Set(LIVE_SCOPES.map((k) => k[0]))).toEqual(fromRealtime);
  });
});
