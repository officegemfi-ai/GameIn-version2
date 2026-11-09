import { Navigate, Outlet, useLocation } from 'react-router';
import { ErrorState, Loading } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSeats } from '@/features/seats/SeatProvider';

/** Signed-in pages: anyone else goes to sign in, and comes back here after. */
export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/sign-in" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}

/** Pages that act as a seat: someone with no creator profile and no brand yet sets one up first. */
export function RequireSeat() {
  const { seat, loading, error, refresh } = useSeats();
  if (loading) return <Loading />;
  if (error && !seat) {
    return (
      <div className="g-public__narrow">
        <ErrorState error={errorMessage(error)} retry={() => void refresh()} />
      </div>
    );
  }
  if (!seat) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

/** The landing page and the sign-in forms: someone already signed in goes to their dashboard. */
export function SignedOutOnly() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from.startsWith('/') ? from : '/dashboard'} replace />;
  }
  return <Outlet />;
}
