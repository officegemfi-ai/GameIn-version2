import { describe, expect, it } from 'vitest';
import type { TodoRow } from '@/lib/types';
import { badgeCounts, todoTask, todoTasks, totalWaiting } from './todos';

const todo = (kind: string, extra: Partial<TodoRow> = {}): TodoRow =>
  ({ kind, ref_id: 'r1', title: 'Launch week', amount_cents: 30000, due_at: null, brand_id: null, creator_id: null, side: 'creator', ...extra }) as TodoRow;

describe('to-dos', () => {
  it('count toward the navigation badge each kind belongs to, from what the database counted', () => {
    const counted = [
      { kind: 'answer_offer', n: 2 }, { kind: 'answer_counter', n: 1 }, { kind: 'answer_pitch', n: 40 }, { kind: 'review_proof', n: 1200 },
      { kind: 'unread_messages', n: 3 }, { kind: 'answer_renewal', n: 1 }, { kind: 'something_new', n: 7 },
    ];
    // 1,200 proofs to review is 1,200 on the badge: the list this used to be counted from stopped at 1,000 rows
    expect(badgeCounts(counted)).toEqual({ offers: 43, proofs: 1200, messages: 3, renewals: 1 });
    expect(badgeCounts(undefined)).toEqual({ offers: 0, proofs: 0, messages: 0, renewals: 0 });
    expect(totalWaiting(counted)).toBe(1247);
    expect(totalWaiting([])).toBe(0);
  });

  it('become dashboard tasks that lead to the right place', () => {
    expect(todoTask(todo('answer_counter'))).toMatchObject({ key: 'or1', chip: 'counter', tone: 'mint', to: '/offers/r1', amount: 30000 });
    expect(todoTask(todo('review_proof'))).toMatchObject({ key: 'pr1', chip: 'proof', tone: 'amber', to: '/proofs/r1' });
    expect(todoTask(todo('answer_renewal'))).toMatchObject({ key: 'rr1', chip: 'renew', to: '/deals' });
  });

  it('show no amount for unread messages, and skip kinds this app doesn’t know', () => {
    expect(todoTask(todo('unread_messages'))).not.toHaveProperty('amount');
    expect(todoTask(todo('something_new'))).toBeNull();
    expect(todoTasks([todo('something_new'), todo('answer_offer')]).map((t) => t.chip)).toEqual(['offer']);
  });
});
