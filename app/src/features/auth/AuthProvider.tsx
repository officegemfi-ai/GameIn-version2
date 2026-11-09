import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Session, User } from '@supabase/supabase-js';
import { startRealtime } from '@/lib/realtime';
import { supabase } from '@/lib/supabase';

interface AuthState {
  session: Session | null;
  user: User | null;
  /** True until the saved session has been read. */
  loading: boolean;
  /** True after arriving from a password-reset link, until a new password is set. */
  recovering: boolean;
  endRecovery: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setLoading(false);
    });
    // only state changes in here: Supabase asks callers not to await its own calls inside this callback
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setLoading(false);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'SIGNED_OUT') queryClient.clear();
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [queryClient]);

  // follow the database for as long as someone is signed in
  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    return startRealtime(userId, queryClient, window.__gameinRealtime);
  }, [userId, queryClient]);

  const value = useMemo<AuthState>(
    () => ({ session, user: session?.user ?? null, loading, recovering, endRecovery: () => setRecovering(false) }),
    [session, loading, recovering],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth needs <AuthProvider>');
  return v;
}

/** The signed-in person (inside RequireAuth). */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('useUser is for signed-in pages');
  return user;
}
