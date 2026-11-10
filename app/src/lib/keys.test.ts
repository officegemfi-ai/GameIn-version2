import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { affected, isTotal, keys, scopes, TOTALS } from './keys';

describe('query keys', () => {
  it('never give a search the featured list’s key (they hold different shapes of data)', () => {
    expect(keys.creators('featured')).not.toEqual(keys.featuredCreators());
    expect(keys.creators('')).not.toEqual(keys.featuredCreators());
  });

  it('keep every key of a kind under that kind’s scope, so marking the scope stale reaches them all', () => {
    const client = new QueryClient();
    const seat = { side: 'creator' as const, id: 'c1', name: 'Nova', role: null };
    for (const key of [keys.creators('nova'), keys.featuredCreators(), keys.wallet('c1'), keys.walletLines('c1'), keys.deals(seat, 'active'), keys.deals(seat, 'done'), keys.activeDealCount(seat), keys.dealsToFund('b1'), keys.readyDeliverables('c1'), keys.conversations(seat), keys.conversationWith('b1', 'c1'),
      keys.offers(seat, 'yours'), keys.offers(seat, 'closed'), keys.thread('t1'), keys.thread('t1', 400), keys.todos(seat), keys.todoCounts(seat)]) {
      client.setQueryData(key, 1);
    }
    for (const scope of [scopes.creators, scopes.wallet, scopes.deals, scopes.conversations, scopes.offers, scopes.thread, scopes.todos, scopes.todoCounts]) {
      void client.invalidateQueries({ queryKey: scope, refetchType: 'none' });
    }
    expect(client.getQueryCache().getAll().every((q) => q.state.isInvalidated)).toBe(true);
  });

  it('say what a change touches, the same way for a move and for Realtime', () => {
    expect(affected.deal('d1')).toEqual([['deals'], ['deal', 'd1'], ['todos'], ['todo-counts'], ['wallet'], ['brand-money'], ['payments']]);
    expect(affected.deal(null)).toContainEqual(['deal']);
    expect(affected.offer('o1')).toEqual([['offers'], ['offer', 'o1'], ['todos'], ['todo-counts']]);
    expect(affected.thread(null)).toEqual([['thread'], ['conversations'], ['todos'], ['todo-counts']]);
    expect(affected.waiting()).toEqual([['todos'], ['todo-counts']]);
    expect(affected.packages('c1')).toEqual([['packages', 'c1'], ['creator'], ['creators']]);
  });

  it('refresh a creator’s wallet and its history together', () => {
    const client = new QueryClient();
    client.setQueryData(keys.walletLines('c1'), []);
    void client.invalidateQueries({ queryKey: keys.wallet('c1'), refetchType: 'none' });
    expect(client.getQueryState(keys.walletLines('c1'))?.isInvalidated).toBe(true);
  });

  it('refresh every length of a thread when its conversation changes', () => {
    // a thread is cached by how many lines were asked for; a new message reaches whichever is on show
    const client = new QueryClient();
    client.setQueryData(keys.thread('t1', 200), 1);
    client.setQueryData(keys.thread('t1', 400), 1);
    client.setQueryData(keys.thread('t2', 200), 1);
    void client.invalidateQueries({ queryKey: keys.thread('t1'), refetchType: 'none' });
    expect(client.getQueryState(keys.thread('t1', 200))?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.thread('t1', 400))?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.thread('t2', 200))?.isInvalidated).toBe(false);
  });

  it('keep the list of what waits on a seat and its counts apart: they hold different shapes of data', () => {
    const seat = { side: 'brand' as const, id: 'b1', name: 'Volt', role: null };
    expect(keys.todos(seat)[0]).not.toBe(keys.todoCounts(seat)[0]);
    expect(isTotal(keys.todoCounts(seat))).toBe(true);
    expect(isTotal(keys.todos(seat))).toBe(false);
    expect(TOTALS.map((k) => k[0])).toEqual(['todo-counts', 'brand-money', 'wallet']);
  });
});
