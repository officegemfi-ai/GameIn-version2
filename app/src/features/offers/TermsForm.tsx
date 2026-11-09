import { ItemsEditor, TextAreaField, TextField } from '@/components/ui';
import { checkTerms } from '@/lib/items';
import { formatCents, parseDollars } from '@/lib/money';
import type { Item } from '@/lib/types';

export interface Terms {
  title: string;
  amount: string; // as typed, in dollars
  items: Item[];
  note: string;
}

/** What's wrong with the terms, or null; checked the way the database checks them. */
export function termsProblem(t: Terms, withTitle: boolean): string | null {
  if (withTitle && !t.title.trim()) return 'Give the offer a title';
  if (withTitle && t.title.trim().length > 120) return 'The title is over 120 characters';
  return checkTerms(parseDollars(t.amount), t.items);
}

/** Title, price, deliverables and a note: a new offer, a pitch, or a counter. */
export function TermsForm({ value, onChange, withTitle = true, notePlaceholder }: { value: Terms; onChange: (t: Terms) => void; withTitle?: boolean; notePlaceholder?: string }) {
  const cents = parseDollars(value.amount);
  const share = cents != null && value.items.length > 0 ? Math.floor(cents / value.items.length) : null;
  return (
    <div className="g-stack">
      {withTitle ? (
        <TextField label="Title" value={value.title} maxLength={120} placeholder="e.g. Launch week stream" onChange={(e) => onChange({ ...value, title: e.target.value })} />
      ) : null}
      <TextField
        label="Price (USD)"
        prefix="$"
        inputMode="decimal"
        placeholder="0.00"
        value={value.amount}
        onChange={(e) => onChange({ ...value, amount: e.target.value })}
        error={value.amount && cents == null ? 'Enter an amount like 300 or 299.99' : null}
        hint={share != null && value.items.length > 1 ? `About ${formatCents(share)} per deliverable.` : undefined}
      />
      <ItemsEditor items={value.items} onChange={(items) => onChange({ ...value, items })} />
      <TextAreaField label="Note (optional)" value={value.note} maxLength={2000} placeholder={notePlaceholder ?? 'Anything the other side should know'} onChange={(e) => onChange({ ...value, note: e.target.value })} />
    </div>
  );
}
