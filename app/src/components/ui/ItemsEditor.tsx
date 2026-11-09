import type { Item } from '@/lib/types';
import { Icon } from './Icon';

/** Editable deliverables for offers and packages: a name each and the days to do it (1 to 20 of them). */
export function ItemsEditor({ items, onChange, max = 20 }: { items: Item[]; onChange: (items: Item[]) => void; max?: number }) {
  const set = (i: number, patch: Partial<Item>) => onChange(items.map((it, n) => (n === i ? { ...it, ...patch } : it)));
  return (
    <fieldset className="g-items">
      <legend className="g-field__label">Deliverables</legend>
      <ol className="g-items__list">
        {items.map((it, i) => (
          <li key={i} className="g-items__row">
            <span className="g-items__n g-muted" aria-hidden="true">{i + 1}</span>
            <input
              className="g-input"
              aria-label={`Deliverable ${i + 1}`}
              placeholder={i === 0 ? 'e.g. Launch stream with logo' : 'Another deliverable'}
              value={it.label}
              maxLength={120}
              onChange={(e) => set(i, { label: e.target.value })}
            />
            <div className="g-prefix g-items__days">
              <input
                className="g-input"
                aria-label={`Days for deliverable ${i + 1}`}
                inputMode="numeric"
                placeholder="7"
                value={it.days ?? ''}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 3);
                  set(i, { days: v ? Number(v) : undefined });
                }}
              />
              <span className="g-items__unit" aria-hidden="true">days</span>
            </div>
            <button
              type="button"
              className="g-btn g-btn--ghost g-btn--icon g-btn--sm"
              aria-label={`Remove deliverable ${i + 1}`}
              disabled={items.length <= 1}
              onClick={() => onChange(items.filter((_, n) => n !== i))}
            >
              <Icon name="x" />
            </button>
          </li>
        ))}
      </ol>
      {items.length < max ? (
        <button type="button" className="g-btn g-btn--ghost g-btn--sm g-items__add" onClick={() => onChange([...items, { label: '' }])}>
          <Icon name="plus" /> add a deliverable
        </button>
      ) : null}
      <span className="g-field__hint">Each deliverable gets an equal share of the price, paid when the brand approves its proof. Days count from when the deal starts (7 if left empty).</span>
    </fieldset>
  );
}
