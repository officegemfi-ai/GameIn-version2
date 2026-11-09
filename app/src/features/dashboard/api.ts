import { useQuery } from '@tanstack/react-query';
import { must } from '@/lib/db';
import { keys } from '@/lib/keys';
import { supabase } from '@/lib/supabase';
import { seatColumn, type Seat } from '@/lib/types';

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
          .eq(seatColumn(seat), seat.id),
      ),
  });
}

/** A creator's deliverables whose money is in escrow and that still need proof: ready to deliver. */
export function useReadyDeliverables(creatorId: string | null) {
  return useQuery({
    queryKey: keys.readyDeliverables(creatorId ?? 'none'),
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
