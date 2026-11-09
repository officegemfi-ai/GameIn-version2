import { describe, expect, it } from 'vitest';
import { dueLabel, messageTime, timeAgo, timeLeft, toDate } from './time';

const now = new Date('2026-11-09T12:00:00');

describe('time', () => {
  it('reads calendar dates as local midnight', () => {
    expect(toDate('2026-11-13').getHours()).toBe(0);
    expect(toDate('2026-11-13').getDate()).toBe(13);
  });

  it('says how long ago', () => {
    expect(timeAgo(new Date(now.getTime() - 20_000), now)).toBe('just now');
    expect(timeAgo(new Date(now.getTime() - 5 * 60_000), now)).toBe('5 min ago');
    expect(timeAgo(new Date(now.getTime() - 3 * 3600_000), now)).toBe('3 h ago');
    expect(timeAgo(new Date(now.getTime() - 30 * 3600_000), now)).toBe('yesterday');
    expect(timeAgo(new Date(now.getTime() - 4 * 86400_000), now)).toBe('4 days ago');
    expect(timeAgo('2026-10-01T12:00:00', now)).toBe('Oct 1');
    expect(timeAgo('2025-10-01T12:00:00', now)).toBe('Oct 1, 2025');
  });

  it('counts down to a deadline', () => {
    expect(timeLeft(new Date(now.getTime() + 3 * 86400_000 + 2 * 3600_000), now)).toBe('3 days 2 h');
    expect(timeLeft(new Date(now.getTime() + 5 * 3600_000 + 12 * 60_000), now)).toBe('5 h 12 min');
    expect(timeLeft(new Date(now.getTime() + 30_000), now)).toBe('1 min');
    expect(timeLeft(new Date(now.getTime() - 1), now)).toBeNull();
  });

  it('says when something is due', () => {
    expect(dueLabel('2026-11-09', now)).toBe('due today');
    expect(dueLabel('2026-11-10', now)).toBe('due tomorrow');
    expect(dueLabel('2026-11-20', now)).toBe('due Nov 20');
    expect(dueLabel('2026-11-08', now)).toBe('1 day late');
    expect(dueLabel('2026-11-06', now)).toBe('3 days late');
  });

  it('shows a message time, with the date when it isn’t today', () => {
    expect(messageTime('2026-11-09T14:05:00', now)).toBe('2:05 PM');
    expect(messageTime('2026-11-02T14:05:00', now)).toBe('Nov 2, 2:05 PM');
  });
});
