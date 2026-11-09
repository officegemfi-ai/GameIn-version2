import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { Button, ButtonLink, Logo } from '@/components/ui';

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="g-public">
      <header className="g-public__top">
        <Link to="/" aria-label="GameIn home">
          <Logo />
        </Link>
      </header>
      <main id="main" className="g-public__narrow g-stack">
        <h1>{title}</h1>
        {children}
      </main>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <Frame title="Page not found">
      <p className="g-muted">That page doesn’t exist, or it moved.</p>
      <div>
        <ButtonLink to="/" variant="primary">go home</ButtonLink>
      </div>
    </Frame>
  );
}

/** A screen that crashed, or a screen's code that couldn't load (usually a new version was just published). */
export function RouteError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  const message = error instanceof Error ? error.message : '';
  const stale = /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(message);
  if (!stale) console.error(error);
  return (
    <Frame title={stale ? 'GameIn was updated' : 'Something went wrong'}>
      <p className="g-muted">{stale ? 'A new version is out. Reload to get it.' : 'This screen hit a problem. Reloading usually fixes it.'}</p>
      <div className="g-row">
        <Button variant="primary" onClick={() => window.location.reload()}>reload</Button>
        <ButtonLink to="/" variant="ghost">go home</ButtonLink>
      </div>
    </Frame>
  );
}
