import { MAX_OFFER_CENTS } from './money';
import type { Item, Json } from './types';

/** Deliverables from the database's JSON, skipping anything malformed. */
export function itemsFromJson(json: Json | null | undefined): Item[] {
  if (!Array.isArray(json)) return [];
  const out: Item[] = [];
  for (const e of json) {
    if (!e || typeof e !== 'object' || Array.isArray(e)) continue;
    const label = typeof e.label === 'string' ? e.label : '';
    const days = typeof e.days === 'number' ? e.days : undefined;
    if (label) out.push(days === undefined ? { label } : { label, days });
  }
  return out;
}

/** Deliverables as the database stores them: trimmed labels, whole days. */
export function itemsToJson(items: Item[]): Json {
  return items.map((i) => {
    const label = i.label.trim();
    return i.days ? { label, days: Math.round(i.days) } : { label };
  });
}

/**
 * The database's rules for deliverables (items_valid, check_terms), so a form can say what's wrong before sending.
 * Returns null when the terms are fine.
 */
export function checkItems(items: Item[]): string | null {
  if (items.length < 1 || items.length > 20) return 'List 1 to 20 deliverables';
  for (const [n, i] of items.entries()) {
    const label = i.label.trim();
    if (!label) return `Name deliverable ${n + 1}`;
    if (label.length > 120) return `Deliverable ${n + 1}'s name is over 120 characters`;
    if (i.days !== undefined && (!Number.isFinite(i.days) || i.days < 1 || i.days > 365)) {
      return `Deliverable ${n + 1} needs 1 to 365 days`;
    }
  }
  return null;
}

export function checkTerms(amountCents: number | null, items: Item[]): string | null {
  if (amountCents == null || amountCents <= 0) return 'Enter an amount above $0';
  if (amountCents > MAX_OFFER_CENTS) return 'One offer can be up to $10,000,000';
  const itemsProblem = checkItems(items);
  if (itemsProblem) return itemsProblem;
  if (amountCents < items.length) return 'The amount has to cover at least a cent per deliverable';
  return null;
}

/** The days a deal takes: its longest deliverable (7 days when none is given), as accept_offer sets the end date. */
export const dealDays = (items: Item[]): number => Math.max(0, ...items.map((i) => Math.ceil(i.days ?? 7)));
