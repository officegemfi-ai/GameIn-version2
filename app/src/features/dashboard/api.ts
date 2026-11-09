import { useQuery } from '@tanstack/react-query';
import { must } from '@/lib/db';
import { keys } from '@/lib/keys';
import { supabase } from '@/lib/supabase';
import type { Seat, TodoRow } from '@/lib/types';

/** What waits on this seat (the todos view): offers to answer, proof to review, renewals, unread threads. */
export function useTodos(seat: Seat) {
  return useQuery({
    queryKey: keys.todos(seat),
    queryFn: () =>
      must(
        supabase
          .from('todos')
          .select('*')
          .eq('side', seat.side)
          .eq(seat.side === 'brand' ? 'brand_id' : 'creator_id', seat.id),
      ),
  });
}

/** A creator's deliverables whose money is in escrow and that still need proof: ready to deliver. */
export function useReadyDeliverables(creatorId: string | null) {
  return useQuery({
    queryKey: ['deals', 'ready', creatorId],
    enabled: !!creatorId,
    queryFn: () =>
      must(
        supabase
          .from('deliverables')
          .select('id, label, due_on, amount_cents, status, deal:deals!inner(id, title, creator_id, brand:brands(name)), milestone:milestones!inner(status)')
          .eq('deal.creator_id', creatorId!)
          .eq('milestone.status', 'in_escrow')
          .in('status', ['upcoming', 'changes_requested'])
          .order('due_on', { ascending: true, nullsFirst: false })
          .limit(20),
      ),
  });
}

export interface TodoCounts {
  offers: number;
  proofs: number;
  messages: number;
  renewals: number;
}

export function countTodos(rows: TodoRow[] | undefined): TodoCounts {
  const c: TodoCounts = { offers: 0, proofs: 0, messages: 0, renewals: 0 };
  for (const r of rows ?? []) {
    if (r.kind === 'answer_offer' || r.kind === 'answer_counter' || r.kind === 'answer_pitch') c.offers++;
    else if (r.kind === 'review_proof') c.proofs++;
    else if (r.kind === 'unread_messages') c.messages++;
    else if (r.kind === 'answer_renewal') c.renewals++;
  }
  return c;
}
