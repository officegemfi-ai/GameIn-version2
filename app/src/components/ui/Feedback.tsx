import type { ReactNode } from 'react';

export function Spinner({ label }: { label?: string }) {
  return <span className="g-spinner" role={label ? 'status' : undefined} aria-label={label} />;
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="g-loading">
      <Spinner label={label} />
    </div>
  );
}

export function Skeleton({ height = 18, width = '100%' }: { height?: number; width?: number | string }) {
  return <div className="g-skeleton" style={{ height, width }} aria-hidden="true" />;
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="g-empty">
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

type Tone = 'mint' | 'coral' | 'amber' | 'neutral';

export function Notice({ tone = 'neutral', children, action }: { tone?: Tone; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`g-notice${tone === 'neutral' ? '' : ` g-notice--${tone}`}`} role={tone === 'coral' ? 'alert' : undefined}>
      <div className="g-notice__body">{children}</div>
      {action}
    </div>
  );
}

/** A query that failed: what went wrong, and a way to try again. */
export function ErrorState({ error, retry }: { error: string; retry?: () => void }) {
  return (
    <Notice tone="coral" action={retry ? <button className="g-btn g-btn--sm" onClick={retry}>try again</button> : undefined}>
      {error}
    </Notice>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone | 'solid'; children: ReactNode }) {
  return <span className={`g-badge${tone === 'neutral' ? '' : ` g-badge--${tone}`}`}>{children}</span>;
}
