import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { keys } from '@/lib/keys';
import { supabase } from '@/lib/supabase';
import type { Seat } from '@/lib/types';
import { useAuth } from '@/features/auth/AuthProvider';

// The seats the signed-in person can act from (my_seats): their creator profile and every brand they work for. One is
// the current seat; every seat-scoped query carries it in its key, so switching seats shows the other side at once.

const STORAGE_KEY = 'gamein.seat';

async function fetchSeats(): Promise<Seat[]> {
  const { data, error } = await supabase.from('my_seats').select('*');
  if (error) throw error;
  const seats = (data ?? []).flatMap((r): Seat[] => {
    const id = r.side === 'brand' ? r.brand_id : r.creator_id;
    return r.side && id ? [{ side: r.side, id, name: r.name ?? '', role: r.role ?? null }] : [];
  });
  // the creator profile first, then brands by name
  return seats.sort((a, b) => (a.side === b.side ? a.name.localeCompare(b.name) : a.side === 'creator' ? -1 : 1));
}

const seatKey = (s: Pick<Seat, 'side' | 'id'>) => `${s.side}:${s.id}`;

function remembered(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

interface SeatState {
  seats: Seat[];
  seat: Seat | null;
  loading: boolean;
  error: unknown;
  setSeat: (seat: Pick<Seat, 'side' | 'id'>) => void;
  creatorSeat: Seat | null;
  brandSeats: Seat[];
  refresh: () => Promise<Seat[]>;
}

const SeatContext = createContext<SeatState | null>(null);

export function SeatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const query = useQuery({ queryKey: keys.seats(user?.id ?? 'none'), queryFn: fetchSeats, enabled: !!user });
  const [chosen, setChosen] = useState<string | null>(remembered);
  const seats = useMemo(() => query.data ?? [], [query.data]);
  const seat = useMemo(() => seats.find((s) => seatKey(s) === chosen) ?? seats[0] ?? null, [seats, chosen]);

  // keep the remembered seat valid (a seat can disappear, e.g. after leaving a brand)
  useEffect(() => {
    if (seat && seatKey(seat) !== chosen) setChosen(seatKey(seat));
  }, [seat, chosen]);

  const setSeat = useCallback((s: Pick<Seat, 'side' | 'id'>) => {
    const k = seatKey(s);
    setChosen(k);
    try {
      localStorage.setItem(STORAGE_KEY, k);
    } catch {
      /* storage may be blocked; the choice still holds for this visit */
    }
  }, []);

  const { refetch } = query;
  const refresh = useCallback(async () => (await refetch()).data ?? [], [refetch]);

  const value = useMemo<SeatState>(
    () => ({
      seats,
      seat,
      loading: !!user && query.isPending,
      error: query.error,
      setSeat,
      creatorSeat: seats.find((s) => s.side === 'creator') ?? null,
      brandSeats: seats.filter((s) => s.side === 'brand'),
      refresh,
    }),
    [seats, seat, user, query.isPending, query.error, setSeat, refresh],
  );
  return <SeatContext.Provider value={value}>{children}</SeatContext.Provider>;
}

export function useSeats(): SeatState {
  const v = useContext(SeatContext);
  if (!v) throw new Error('useSeats needs <SeatProvider>');
  return v;
}

/** The current seat (inside RequireSeat, where there always is one). */
export function useSeat(): Seat {
  const { seat } = useSeats();
  if (!seat) throw new Error('useSeat is for pages behind RequireSeat');
  return seat;
}
