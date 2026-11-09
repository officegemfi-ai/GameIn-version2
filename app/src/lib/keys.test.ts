import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { affected, keys, scopes } from './keys';

describe('query keys', () => {
  it('never give a search the featured list’s key (they hold different shapes of data)', () => {
    expect(keys.creators('featured')).not.toEqual(keys.featuredCreators());
    expect(keys.creators('')).not.toEqual(keys.featuredCreators());
  });

  it('keep every key of a kind under that kind’s scope, so marking the scope stale reaches them all', () => {
    const client = new QueryClient();
    const seat = { side: 'creator' as const, id: 'c1', name: 'Nova', role: null };
    for (const key of [keys.creators('nova'), keys.featuredCreators(), keys.wallet('c1'), keys.walletLines('c1'), keys.deals(seat), keys.readyDeliverables('c1'), keys.conversations(seat), keys.conversationWith('b1', 'c1')]) {
      client.setQueryData(key, 1);
    }
    for (const scope of [scopes.creators, scopes.wallet, scopes.deals, scopes.conversations]) {
      void client.invalidateQueries({ queryKey: scope, refetchType: 'none' });
    }
    expect(client.getQueryCache().getAll().every((q) => q.state.isInvalidated)).toBe(true);
  });

  it('say what a change touches, the same way for a move and for Realtime', () => {
    expect(affected.deal('d1')).toEqual([['deals'], ['deal', 'd1'], ['todos'], ['wallet'], ['brand-money'], ['payments']]);
    expect(affected.deal(null)).toContainEqual(['deal']);
    expect(affected.offer('o1')).toEqual([['offers'], ['offer', 'o1'], ['todos']]);
    expect(affected.thread(null)).toEqual([['thread'], ['conversations'], ['todos']]);
    expect(affected.packages('c1')).toEqual([['packages', 'c1'], ['creator'], ['creators']]);
  });

  it('refresh a creator’s wallet and its history together', () => {
    const client = new QueryClient();
    client.setQueryData(keys.walletLines('c1'), []);
    void client.invalidateQueries({ queryKey: keys.wallet('c1'), refetchType: 'none' });
    expect(client.getQueryState(keys.walletLines('c1'))?.isInvalidated).toBe(true);
  });
});
