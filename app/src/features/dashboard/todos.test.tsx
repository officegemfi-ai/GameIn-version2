import { describe, expect, it } from 'vitest';
import type { TodoRow } from '@/lib/types';
import { countTodos, todoTask, todoTasks } from './todos';

const todo = (kind: string, extra: Partial<TodoRow> = {}): TodoRow =>
  ({ kind, ref_id: 'r1', title: 'Launch week', amount_cents: 30000, due_at: null, brand_id: null, creator_id: null, side: 'creator', ...extra }) as TodoRow;

describe('to-dos', () => {
  it('count toward the navigation badge each kind belongs to', () => {
    const rows = ['answer_offer', 'answer_counter', 'answer_pitch', 'review_proof', 'unread_messages', 'answer_renewal', 'something_new'].map((k) => todo(k));
    expect(countTodos(rows)).toEqual({ offers: 3, proofs: 1, messages: 1, renewals: 1 });
    expect(countTodos(undefined)).toEqual({ offers: 0, proofs: 0, messages: 0, renewals: 0 });
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
