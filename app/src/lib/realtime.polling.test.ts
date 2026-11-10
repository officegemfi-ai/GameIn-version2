import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';

// a Realtime that connects when the test says so: until then the app refreshes what's on show on a timer
let report: (status: string) => void = () => {};
vi.mock('./supabase', () => {
  const channel = {
    on: () => channel,
    subscribe: (cb: (status: string) => void) => {
      report = cb;
      return channel;
    },
  };
  return { supabase: { channel: () => channel, removeChannel: () => Promise.resolve('ok') } };
});

const { liveState, startRealtime } = await import('./realtime');

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('refreshing on a timer while Realtime is down', () => {
  it('lets a refresh that is still on its way land, instead of starting it over every tick', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // the deals list: the first answer is quick, every later one takes 12 seconds (a poor connection)
    let asked = 0;
    const queryFn = vi.fn(() => {
      asked += 1;
      const n = asked;
      return new Promise<string>((resolve) => setTimeout(() => resolve(`answer ${n}`), n === 1 ? 10 : 12_000));
    });
    const observer = new QueryObserver(client, { queryKey: ['deals', 'brand', 'b1'], queryFn });
    const stopWatching = observer.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(50);
    expect(observer.getCurrentResult().data).toBe('answer 1');

    const stop = startRealtime('user-1', client, { pollMs: 5000, connectTimeoutMs: 6000 });
    report('CHANNEL_ERROR');
    expect(liveState.get()).toBe('polling');

    await vi.advanceTimersByTimeAsync(5000); // first tick: a refresh sets off
    expect(queryFn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000); // two more ticks while it's still on its way
    // each tick used to cancel it and start another: on a connection slower than the tick none ever landed
    expect(queryFn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2500); // 12 s after it set off
    expect(observer.getCurrentResult().data).toBe('answer 2');

    stop();
    stopWatching();
    client.clear();
  });

  it('leaves a screen that couldn’t load with its error, and keeps refreshing one that shows older data', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // a deal that never loaded, and a deals list that loaded once and has failed to refresh since
    const neverLoaded = vi.fn(() => Promise.reject(new Error('Failed to fetch')));
    let listAsked = 0;
    const list = vi.fn(() => (++listAsked === 1 ? Promise.resolve('deals') : Promise.reject(new Error('Failed to fetch'))));
    const deal = new QueryObserver(client, { queryKey: ['deal', 'd1'], queryFn: neverLoaded });
    const deals = new QueryObserver(client, { queryKey: ['deals', 'brand', 'b1'], queryFn: list });
    const stops = [deal.subscribe(() => {}), deals.subscribe(() => {})];
    await vi.advanceTimersByTimeAsync(10);
    expect(deal.getCurrentResult()).toMatchObject({ isLoadingError: true, isPending: false });

    const stop = startRealtime('user-1', client, { pollMs: 5000, connectTimeoutMs: 6000 });
    report('CHANNEL_ERROR');
    await vi.advanceTimersByTimeAsync(15_100); // three ticks
    // asked again every tick, its error turned back into a spinner and its "try again" button came and went
    expect(neverLoaded).toHaveBeenCalledTimes(1);
    expect(deal.getCurrentResult().isLoadingError).toBe(true);
    // the list still has something on screen: it keeps trying, quietly
    expect(list).toHaveBeenCalledTimes(4);
    expect(deals.getCurrentResult()).toMatchObject({ data: 'deals', isLoadingError: false });

    // Realtime connects at last: everything on show is asked for again, the screen that couldn't load included
    report('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(10);
    expect(neverLoaded).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenCalledTimes(5);
    stop();
    stops.forEach((s) => s());
    client.clear();
  });

  it('catches up when Realtime connects after a slow start, and not after a clean one', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const deal = vi.fn(() => Promise.resolve('deal'));
    const stopWatching = new QueryObserver(client, { queryKey: ['deal', 'd1'], queryFn: deal }).subscribe(() => {});
    await vi.advanceTimersByTimeAsync(10);

    // a clean start: connected before the fallback was needed, nothing to catch up on
    let stop = startRealtime('user-1', client, { pollMs: 5000, connectTimeoutMs: 6000 });
    await vi.advanceTimersByTimeAsync(800);
    report('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(10);
    expect(liveState.get()).toBe('live');
    expect(deal).toHaveBeenCalledTimes(1);
    stop();

    // a slow start: the fallback refreshes on its timer until Realtime is there
    stop = startRealtime('user-1', client, { pollMs: 5000, connectTimeoutMs: 6000 });
    await vi.advanceTimersByTimeAsync(6000 + 5000 + 100); // the wait for Realtime, then the fallback's first tick
    expect(liveState.get()).toBe('polling');
    expect(deal).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4000); // four seconds after that tick, a change the tick was too early for...
    report('SUBSCRIBED'); // ...and Realtime, which only tells of changes from now on
    await vi.advanceTimersByTimeAsync(10);
    // it used to stop the timer and ask nothing: whatever changed since the last tick stayed unseen
    expect(deal).toHaveBeenCalledTimes(3);
    expect(liveState.get()).toBe('live');
    await vi.advanceTimersByTimeAsync(20_000); // and the timer has stopped
    expect(deal).toHaveBeenCalledTimes(3);
    stop();
    stopWatching();
    client.clear();
  });

  it('refreshes only what Realtime would have: not the directory, not the account’s seats', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const live = vi.fn(() => Promise.resolve('deal'));
    const directory = vi.fn(() => Promise.resolve('creators'));
    const stops = [
      new QueryObserver(client, { queryKey: ['deal', 'd1'], queryFn: live }).subscribe(() => {}),
      new QueryObserver(client, { queryKey: ['creators', 'search', ''], queryFn: directory }).subscribe(() => {}),
    ];
    await vi.advanceTimersByTimeAsync(10);
    const stop = startRealtime('user-1', client, { pollMs: 5000, connectTimeoutMs: 6000 });
    report('TIMED_OUT');
    await vi.advanceTimersByTimeAsync(5100);
    expect(live).toHaveBeenCalledTimes(2);
    expect(directory).toHaveBeenCalledTimes(1);
    stop();
    stops.forEach((s) => s());
    client.clear();
  });
});
