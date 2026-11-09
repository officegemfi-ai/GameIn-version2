import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  count?: number;
}

/** Tabs that switch what a page shows (a tablist, with arrow-key movement). */
export function Tabs<T extends string>({ label, tabs, value, onChange }: { label: string; tabs: TabItem<T>[]; value: T; onChange: (id: T) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = tabs.findIndex((t) => t.id === value);
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    onChange(next.id);
    ref.current?.querySelector<HTMLButtonElement>(`[data-tab="${next.id}"]`)?.focus();
    e.preventDefault();
  };
  return (
    <div className="g-tabs" role="tablist" aria-label={label} ref={ref} onKeyDown={onKey}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          data-tab={t.id}
          className="g-tab"
          aria-selected={t.id === value}
          tabIndex={t.id === value ? 0 : -1}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.count ? <span className="g-count">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
