import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Dialog, Icon, Logo, type IconName } from '@/components/ui';
import { liveState } from '@/lib/realtime';
import type { Side } from '@/lib/types';
import { signOut } from '@/features/auth/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { countTodos, useTodos, type TodoCounts } from '@/features/dashboard/api';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { useSeat, useSeats } from '@/features/seats/SeatProvider';
import { SeatSwitcher } from '@/features/seats/SeatSwitcher';
import { PublicShell } from './PublicShell';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  badge?: number;
}

function navFor(side: Side, c: TodoCounts): NavItem[] {
  const shared: NavItem[] = [
    { to: '/dashboard', label: 'Home', icon: 'home' },
    { to: '/offers', label: 'Offers', icon: 'offers', badge: c.offers },
    { to: '/deals', label: 'Deals', icon: 'deals', badge: c.proofs + c.renewals },
    { to: '/messages', label: 'Messages', icon: 'messages', badge: c.messages },
  ];
  return side === 'creator'
    ? [...shared, { to: '/wallet', label: 'Wallet', icon: 'wallet' }, { to: '/packages', label: 'Packages', icon: 'packages' }, { to: '/discover', label: 'Discover', icon: 'discover' }, { to: '/settings', label: 'Settings', icon: 'settings' }]
    : [...shared, { to: '/discover', label: 'Discover', icon: 'discover' }, { to: '/payments', label: 'Payments', icon: 'payments' }, { to: '/settings', label: 'Settings', icon: 'settings' }];
}

function LiveDot() {
  const state = useSyncExternalStore(liveState.subscribe, liveState.get);
  const label = state === 'live' ? 'Live' : state === 'polling' ? 'Reconnecting' : 'Connecting';
  return (
    <span className="g-livedot" data-state={state} title={state === 'live' ? 'Updates arrive as they happen' : 'Checking for updates every few seconds'}>
      <span className="g-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

/** The signed-in app: top bar, sidebar on a computer, bottom bar on a phone. */
export function AppShell() {
  const seat = useSeat();
  const todos = useTodos(seat);
  const items = navFor(seat.side, countTodos(todos.data));
  const bottom = items.slice(0, 4);
  const rest = items.slice(4);
  const [more, setMore] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => setMore(false), [location.pathname]);

  return (
    <div className="g-app">
      <a className="g-skip" href="#main">Skip to content</a>
      <header className="g-topbar">
        <Link to="/dashboard" className="g-topbar__logo" aria-label="GameIn home">
          <Logo />
        </Link>
        <div className="g-topbar__end">
          <LiveDot />
          <SeatSwitcher />
          <NotificationBell />
        </div>
      </header>
      <aside className="g-sidebar">
        <nav className="g-nav" aria-label="Main">
          {items.map((it) => (
            <NavLink key={it.to} to={it.to}>
              <Icon name={it.icon} />
              {it.label}
              {it.badge ? <span className="g-count g-nav__badge" aria-label={`${it.badge} waiting`}>{it.badge}</span> : null}
            </NavLink>
          ))}
        </nav>
        <p className="g-sidebar__foot g-tiny g-faint">Test mode: payments are simulated. No real money moves.</p>
      </aside>
      <main id="main" className="g-main" tabIndex={-1}>
        <Outlet />
      </main>
      <nav className="g-bottombar" aria-label="Main">
        {bottom.map((it) => (
          <NavLink key={it.to} to={it.to}>
            <Icon name={it.icon} />
            {it.label}
            {it.badge ? <span className="g-count" aria-label={`${it.badge} waiting`}>{it.badge}</span> : null}
          </NavLink>
        ))}
        <button type="button" onClick={() => setMore(true)} aria-haspopup="dialog">
          <Icon name="more" />
          More
        </button>
      </nav>
      <Dialog open={more} onClose={() => setMore(false)} title="More">
        <div className="g-more">
          {rest.map((it) => (
            <Link key={it.to} to={it.to}>
              <Icon name={it.icon} />
              {it.label}
            </Link>
          ))}
          <button type="button" onClick={() => void signOut().then(() => navigate('/', { replace: true }))}>
            <Icon name="logout" />
            Sign out
          </button>
        </div>
      </Dialog>
    </div>
  );
}

/** Pages anyone can open (a creator's page): inside the app when signed in with a seat, on the public site otherwise. */
export function AdaptiveShell() {
  const { user } = useAuth();
  const { seat } = useSeats();
  return user && seat ? <AppShell /> : <PublicShell />;
}
