import { useEffect, useState } from 'react';
import { timeAgo, timeLeft, toDate } from '@/lib/time';

/** The current time, updated every `ms`, for countdowns and "5 min ago". */
export function useNow(ms = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
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
