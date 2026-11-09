import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { Icon, type IconName } from './Icon';
import { Spinner } from './Feedback';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface Look {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  icon?: IconName;
}

function cls({ variant = 'secondary', size = 'md', block }: Look, extra?: string): string {
  return ['g-btn', variant !== 'secondary' && `g-btn--${variant}`, size !== 'md' && `g-btn--${size}`, block && 'g-btn--block', extra]
    .filter(Boolean)
    .join(' ');
}

export function Button({
  variant, size, block, icon, loading, children, className, disabled, type = 'button', ...rest
}: Look & { loading?: boolean; children?: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={cls({ variant, size, block }, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner /> : icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({ variant, size, block, icon, children, className, ...rest }: Look & LinkProps) {
  return (
    <Link className={cls({ variant, size, block }, className)} {...rest}>
      {icon ? <Icon name={icon} /> : null}
      {children}
    </Link>
  );
}
