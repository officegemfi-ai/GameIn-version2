import type { ReactNode } from 'react';

export function Card({ title, actions, children, tone, flush, raised, className, as: As = 'section' }: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  tone?: 'mint' | 'coral';
  flush?: boolean;
  raised?: boolean;
  className?: string;
  as?: 'section' | 'div' | 'article';
}) {
  const cls = ['g-card', tone && `g-card--${tone}`, flush && 'g-card--flush', raised && 'g-card--raised', className].filter(Boolean).join(' ');
  return (
    <As className={cls}>
      {title || actions ? (
        <div className="g-card__head">
          {typeof title === 'string' ? <h2>{title}</h2> : title}
          {actions}
        </div>
      ) : null}
      {children}
    </As>
  );
}

export function Stat({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: 'mint' | 'coral' }) {
  return (
    <div className={`g-stat${tone ? ` g-stat--${tone}` : ''}`} role="group" aria-label={label}>
      <span className="g-label">{label}</span>
      <span className="g-stat__value">{value}</span>
      {note ? <span className="g-stat__note">{note}</span> : null}
    </div>
  );
}

export function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="g-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}
