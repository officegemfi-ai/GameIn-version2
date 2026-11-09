import { useSyncExternalStore } from 'react';
import { timeAgo, timeLeft, toDate } from '@/lib/time';

// One clock per pace, shared by every label that ticks at it: a list of 100 "5 min ago" labels runs one timer, not
// 100, and they all move together. A clock runs only while something on screen uses it.
interface Clock {
  now: Date;
  timer?: number;
  listeners: Set<() => void>;
}
const clocks = new Map<number, Clock>();

function clockFor(ms: number): Clock {
  let clock = clocks.get(ms);
  if (!clock) {
    clock = { now: new Date(), listeners: new Set() };
    clocks.set(ms, clock);
  }
  return clock;
}

function subscribe(ms: number, listener: () => void): () => void {
  const clock = clockFor(ms);
  clock.listeners.add(listener);
  if (clock.timer === undefined) {
    clock.timer = window.setInterval(() => {
      clock.now = new Date();
      clock.listeners.forEach((l) => l());
    }, ms);
  }
  return () => {
    clock.listeners.delete(listener);
    if (clock.listeners.size === 0) {
      window.clearInterval(clock.timer);
      clock.timer = undefined;
    }
  };
}

function snapshot(ms: number): Date {
  const clock = clockFor(ms);
  // a clock that isn't running catches up before it's read again (the same Date until then, as React needs)
  if (clock.timer === undefined && Date.now() - clock.now.getTime() >= ms) clock.now = new Date();
  return clock.now;
}

/** The current time, updated every `ms`, for countdowns and "5 min ago". */
export function useNow(ms = 30_000): Date {
  return useSyncExternalStore(
    (listener) => subscribe(ms, listener),
    () => snapshot(ms),
  );
}

export function TimeAgo({ at }: { at: string }) {
  const now = useNow(60_000);
  return <time dateTime={at} title={toDate(at).toLocaleString()}>{timeAgo(at, now)}</time>;
}

/** "5 h 12 min left", or what to say once the time is up. */
export function TimeLeft({ until, ended = 'expired', suffix = ' left' }: { until: string; ended?: string; suffix?: string }) {
  const now = useNow(30_000);
  const left = timeLeft(until, now);
  return <time dateTime={until}>{left ? left + suffix : ended}</time>;
}
