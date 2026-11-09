// The database's business rules, as the app needs to know them: for checking a form before sending it, for previews
// (fees), and for the words on screen ("24 hours to answer"). The database enforces every one of these; keeping them
// here, once, means a rule changed in a migration is changed in the app in one place.

/** GameIn's fee on each side: the brand pays it on top of funding, the creator's release is paid less it (five_percent). */
export const FEE_PERCENT = 5;
/** What an instant payout costs, on top of the weekly one being free (instant_payout_fee). */
export const INSTANT_PAYOUT_PERCENT = 1.5;

/** How long an offer, a booking or a counter waits for an answer before it expires. */
export const OFFER_HOURS = 24;
/** How long a creator's pitch (and "book again") waits for the brand. */
export const PITCH_HOURS = 72;
/** How many times an offer can change hands. */
export const MAX_COUNTERS = 8;

/** One offer's deliverables: how many, how long a name, how many days each (items_valid). */
export const MAX_ITEMS = 20;
export const MAX_ITEM_LABEL = 120;
export const MAX_ITEM_DAYS = 365;
/** The days a deliverable gets when none are given (accept_offer). */
export const DEFAULT_ITEM_DAYS = 7;

/** Approving proof can be undone for this long before the money is released (approve_proof's p_undo_seconds). */
export const UNDO_SECONDS = 6;
/** Releases this large (in cents) ask "are you sure?" first. */
export const CONFIRM_RELEASE_CENTS = 100_000;
