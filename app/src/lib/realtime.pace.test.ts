import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';

// a Realtime whose rows the test sends: each table's handler is kept, and called with a row as Realtime would
const handlers = new Map<string, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => void>();
vi.mock('./supabase', () => {
  const channel = {
    on: (_kind: string, filter: { table: string }, handler: (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => void) => {
      handlers.set(filter.table, handler);
      return channel;
    },
    subscribe: (cb: (status: string) => void) => {
      cb('SUBSCRIBED');
      return channel;
    },
  };
  return { supabase: { channel: () => channel, removeChannel: () => Promise.resolve('ok') } };
});

const { startRealtime } = await import('./realtime');

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** A query on show, counting how often it is asked for. */
function onShow(client: QueryClient, queryKey: readonly unknown[]) {
  const asked = vi.fn(() => Promise.resolve('rows'));
  const stop = new QueryObserver(client, { queryKey, queryFn: asked }).subscribe(() => {});
  return { asked, stop };
}

const message = (seq: number) => ({ new: { id: `m${seq}`, conversation_id: 'c1', seq }, old: {} });
const release = (id: number) => ({ new: { id, kind: 'payment_released', deal_id: 'd1', offer_id: null, brand_id: 'b1', creator_id: 'cr1' }, old: {} });

describe('how often the screens refresh when changes keep arriving', () => {
  it('refreshes at once for one change, and at most once a second during a burst, dropping nothing', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const thread = onShow(client, ['thread', 'c1', 200]);
    await vi.advanceTimersByTimeAsync(10);
    expect(thread.asked).toHaveBeenCalledTimes(1);
    const stop = startRealtime('user-1', client);

    // one message: on screen within a moment
    handlers.get('messages')!(message(1));
    await vi.advanceTimersByTimeAsync(150);
    expect(thread.asked).toHaveBeenCalledTimes(2);

    // twenty more over the next two seconds (a lively conversation): two or three refreshes, not twenty
    for (let i = 0; i < 20; i++) {
      handlers.get('messages')!(message(2 + i));
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(thread.asked.mock.calls.length).toBeLessThanOrEqual(4);
    // ...and the last of them is not lost: once things go quiet the screen has asked again after it arrived
    const before = thread.asked.mock.calls.length;
    handlers.get('messages')!(message(99));
    await vi.advanceTimersByTimeAsync(1200);
    expect(thread.asked.mock.calls.length).toBe(before + 1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(thread.asked.mock.calls.length).toBe(before + 1); // nothing arrived: nothing asked

    stop();
    thread.stop();
    client.clear();
  });

  it('lets the totals (badge counts, money across every deal) catch up every five seconds, while the deal itself keeps pace', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const deal = onShow(client, ['deal', 'd1']);
    const counts = onShow(client, ['todo-counts', 'brand', 'b1']);
    const money = onShow(client, ['brand-money', 'b1']);
    const wallet = onShow(client, ['wallet', 'cr1']);
    await vi.advanceTimersByTimeAsync(10);
    const stop = startRealtime('user-1', client);

    // a busy brand: a release every 400 ms for ten seconds
    for (let i = 0; i < 25; i++) {
      handlers.get('events')!(release(i));
      await vi.advanceTimersByTimeAsync(400);
    }
    // the first one refreshed everything at once; after that the deal about once a second, the totals every five
    expect(deal.asked.mock.calls.length).toBeGreaterThanOrEqual(9);
    expect(deal.asked.mock.calls.length).toBeLessThanOrEqual(12);
    for (const total of [counts, money, wallet]) {
      expect(total.asked.mock.calls.length).toBeGreaterThanOrEqual(3); // on show, the first release, then every 5 s
      expect(total.asked.mock.calls.length).toBeLessThanOrEqual(4);
    }
    // quiet again: the totals take in the last releases within five seconds
    const settled = counts.asked.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5200);
    expect(counts.asked.mock.calls.length).toBeGreaterThanOrEqual(settled);
    expect(counts.asked.mock.calls.length).toBeLessThanOrEqual(settled + 1);

    stop();
    for (const q of [deal, counts, money, wallet]) q.stop();
    client.clear();
  });

  it('stops asking the moment the person signs out, with changes still waiting their turn', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const counts = onShow(client, ['todo-counts', 'brand', 'b1']);
    await vi.advanceTimersByTimeAsync(10);
    const stop = startRealtime('user-1', client);
    handlers.get('events')!(release(1));
    await vi.advanceTimersByTimeAsync(150);
    handlers.get('events')!(release(2)); // waits for the totals' next turn
    stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(counts.asked).toHaveBeenCalledTimes(2);
    counts.stop();
    client.clear();
  });
});
