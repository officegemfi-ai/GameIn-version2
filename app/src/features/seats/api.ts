import { supabase } from '@/lib/supabase';
import type { Seat } from '@/lib/types';

/** Every seat the signed-in account can act from (my_seats): the creator profile first, then brands by name. */
export async function fetchSeats(): Promise<Seat[]> {
  const { data, error } = await supabase.from('my_seats').select('*');
  if (error) throw error;
  const seats = (data ?? []).flatMap((r): Seat[] => {
    const id = r.side === 'brand' ? r.brand_id : r.creator_id;
    return r.side && id ? [{ side: r.side, id, name: r.name ?? '', role: r.role ?? null }] : [];
  });
  // the creator profile first, then brands by name
  return seats.sort((a, b) => (a.side === b.side ? a.name.localeCompare(b.name) : a.side === 'creator' ? -1 : 1));
}
