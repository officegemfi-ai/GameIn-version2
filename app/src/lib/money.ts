// Money is whole cents everywhere, as in the database. The fee formulas here mirror the database's own
// (five_percent, fee_step, instant_payout_fee, split_cents) so the app can show a preview; the database always
// computes the amount it saves.

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

/** 12345 → "$123.45" */
export function formatCents(cents: number | null | undefined): string {
  return usd.format((cents ?? 0) / 100);
}

/**
 * What someone typed as dollars → cents, or null if it isn't an amount: "1,234.5" → 123450, "$40" → 4000.
 * At most two decimals; no negatives.
 *
 * A comma is only ever a thousands separator, so it has to sit between groups of three digits. "299,99" or "1,5" is
 * someone writing cents the way much of the world does; reading that as $29,999 would be a hundred times what they
 * meant, so it isn't an amount here and the form asks again. The same goes for "0,500": nobody writes five hundred
 * dollars with a zero in front, so that comma is a decimal one too.
 */
export function parseDollars(input: string): number | null {
  const s = input.trim().replace(/^\$\s*/, '');
  if (!/^(\d+|[1-9]\d{0,2}(,\d{3})+)(\.\d{0,2})?$/.test(s)) return null;
  const [whole = '0', frac = ''] = s.replace(/,/g, '').split('.');
  const cents = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Cents → the plain dollar text an input shows: 123450 → "1234.50". */
export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return '';
  return (cents / 100).toFixed(2);
}

/** 5%, rounded half up: the brand fee on funding and the creator fee on releases. */
export const fivePercent = (cents: number): number => Math.floor((cents + 10) / 20);

/** Fees are 5% of a deal's running total, rounded once: the fee on a new amount is what it adds to the rounded total. */
export const feeStep = (before: number, amount: number): number => fivePercent(before + amount) - fivePercent(before);

/**
 * The brand fee on funding `base` cents of a deal whose earlier payments covered `basis` cents and were charged
 * `feesBefore` cents in fees (fund_milestones).
 */
export const fundingFee = (basis: number, feesBefore: number, base: number): number =>
  Math.max(0, fivePercent(basis + base) - feesBefore);

/** An instant payout costs 1.5%, rounded half up. */
export const instantPayoutFee = (cents: number): number => Math.floor((cents * 3 + 100) / 200);

/** An amount split into equal parts rounded down to the cent; the last part takes what's left (split_cents). */
export function splitCents(total: number, parts: number): number[] {
  if (parts < 1) return [];
  const each = Math.floor(total / parts);
  return Array.from({ length: parts }, (_, i) => (i < parts - 1 ? each : total - each * (parts - 1)));
}

/** The most one offer can be, as the database allows: $10,000,000. */
export const MAX_OFFER_CENTS = 1_000_000_000;
