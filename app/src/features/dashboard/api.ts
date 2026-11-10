import { useQuery } from '@tanstack/react-query';
import { must } from '@/lib/db';
import { keys } from '@/lib/keys';
import { supabase } from '@/lib/supabase';
import { seatColumn, type Seat } from '@/lib/types';

/** How many to-dos the dashboard lists. The counts say how many there are in all. */
export const TODOS_SHOWN = 20;

/**
 * The first things that wait on this seat (the todos view): offers to answer, soonest deadline first, then proof to
 * review, renewals, unread threads. A list for a person to act on, so it has an end; how many wait in all comes from
 * useTodoCounts, counted by the database.
 */
export function useTodos(seat: Seat) {
  return useQuery({
    queryKey: keys.todos(seat),
    queryFn: () =>
      must(
        supabase
          .from('todos')
          .select('*')
          .eq('side', seat.side)
          .eq(seatColumn(seat), seat.id)
          .limit(TODOS_SHOWN),
      ),
  });
}

/**
 * How many things of each kind wait on this seat: the navigation's badges and the "your turn" count. Counted by the
 * database (todo_counts). Counting a fetched list instead was right only while the list fit in one answer: the API
 * stops at 1,000 rows without saying so.
 */
export function useTodoCounts(seat: Seat) {
  return useQuery({
    queryKey: keys.todoCounts(seat),
    queryFn: () => must(supabase.rpc('todo_counts', { p_side: seat.side, p_seat: seat.id }, { get: true })),
  });
}

/** A creator's deliverables whose money is in escrow and that still need proof (the ready_deliverables view). */
export function useReadyDeliverables(creatorId: string | null) {
  return useQuery({
    queryKey: keys.readyDeliverables(creatorId ?? 'none'),
    enabled: !!creatorId,
    queryFn: () =>
      must(
        supabase
          .from('ready_deliverables')
          .select('id, label, due_on, amount_cents, status, deal_id, deal_title, brand_name')
          .eq('creator_id', creatorId!)
          .order('due_on', { ascending: true, nullsFirst: false })
          .order('id')
          .limit(TODOS_SHOWN),
      ),
  });
}
