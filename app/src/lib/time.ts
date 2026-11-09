const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const shortFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** A calendar date from the database ('2026-11-13') at local midnight; timestamps are parsed as they are. */
export function toDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + 'T00:00:00') : new Date(value);
}

/** "Nov 13, 2026" */
export const formatDate = (value: string | Date): string => dateFmt.format(toDate(value));

/** "Nov 13" this year, "Nov 13, 2025" otherwise */
export function shortDate(value: string | Date, now = new Date()): string {
  const d = toDate(value);
  return d.getFullYear() === now.getFullYear() ? shortFmt.format(d) : dateFmt.format(d);
}

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", then the date */
export function timeAgo(value: string | Date, now = new Date()): string {
  const ms = now.getTime() - toDate(value).getTime();
  if (ms < MIN) return 'just now';
  if (ms < HOUR) return `${Math.floor(ms / MIN)} min ago`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)} h ago`;
  if (ms < 2 * DAY) return 'yesterday';
  if (ms < 7 * DAY) return `${Math.floor(ms / DAY)} days ago`;
  return shortDate(value, now);
}

/** A message's time: "2:05 PM" today, "Nov 13, 2:05 PM" otherwise */
export function messageTime(value: string | Date, now = new Date()): string {
  const d = toDate(value);
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? timeFmt.format(d) : `${shortDate(d, now)}, ${timeFmt.format(d)}`;
}

/** Time left until a deadline: "2 days 3 h", "5 h 12 min", "4 min", or null once it has passed. */
export function timeLeft(until: string | Date, now = new Date()): string | null {
  const ms = toDate(until).getTime() - now.getTime();
  if (ms <= 0) return null;
  if (ms >= 2 * DAY) return `${Math.floor(ms / DAY)} days ${Math.floor((ms % DAY) / HOUR)} h`;
  if (ms >= HOUR) return `${Math.floor(ms / HOUR)} h ${Math.floor((ms % HOUR) / MIN)} min`;
  return `${Math.max(1, Math.ceil(ms / MIN))} min`;
}

/** A due date relative to today: "due today", "due tomorrow", "due Nov 13", "2 days late" */
export function dueLabel(due: string, now = new Date()): string {
  const d = toDate(due);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((d.getTime() - today.getTime()) / DAY);
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  if (days < 0) return days === -1 ? '1 day late' : `${-days} days late`;
  return `due ${shortDate(d, now)}`;
}
