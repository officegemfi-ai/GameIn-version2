import { Link, Outlet } from 'react-router';
import { ButtonLink, Logo } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';

/** The public site: landing, sign in and up, creator pages for visitors. */
export function PublicShell() {
  const { user } = useAuth();
  return (
    <div className="g-public">
      <a className="g-skip" href="#main">Skip to content</a>
      <header className="g-public__top">
        <Link to="/" aria-label="GameIn home">
          <Logo />
        </Link>
        <span className="g-spacer" />
        {user ? (
          <ButtonLink to="/dashboard" variant="primary" size="sm">open GameIn</ButtonLink>
        ) : (
          <>
            <ButtonLink to="/sign-in" variant="ghost" size="sm">sign in</ButtonLink>
            <ButtonLink to="/sign-up" variant="primary" size="sm">join</ButtonLink>
          </>
        )}
      </header>
      <main id="main" className="g-public__main" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="g-public__foot">
        <div>
          <span>© {new Date().getFullYear()} GameIn. Sponsorships for gaming creators, with escrow.</span>
          <span>Test mode: payments are simulated.</span>
        </div>
      </footer>
    </div>
  );
}
