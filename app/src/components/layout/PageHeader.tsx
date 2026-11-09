import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon } from '@/components/ui';

export function PageHeader({ title, subtitle, back, actions }: { title: ReactNode; subtitle?: ReactNode; back?: { to: string; label: string }; actions?: ReactNode }) {
  return (
    <div className="g-stack-sm">
      {back ? (
        <Link className="g-back" to={back.to}>
          <Icon name="chevronLeft" width={16} height={16} /> {back.label}
        </Link>
      ) : null}
      <div className="g-pagehead">
        <div className="g-pagehead__text">
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {actions ? <div className="g-row-wrap">{actions}</div> : null}
      </div>
    </div>
  );
}
