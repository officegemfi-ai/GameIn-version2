import { formatCents } from '@/lib/money';
import type { Json, Side } from '@/lib/types';

/** An event as the bell and the conversation timeline get it. */
export interface ActivityEvent {
  kind: string;
  data: Json | null;
  amount_cents: number | null;
  deal_id: string | null;
  offer_id: string | null;
  side: Side | null; // who made the move (null: the scheduler)
}

export interface Names {
  brand: string;
  creator: string;
}

const METHOD: Record<string, string> = { card: 'card', bank: 'bank (ACH)', wire: 'wire' };

function field(data: Json | null, key: string): string | number | boolean | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const v = (data as Record<string, Json | undefined>)[key];
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : null;
}

/** One line about an event, and where it leads. `viewer` is the side reading it, for "you". */
export function describeEvent(e: ActivityEvent, names: Names, viewer: Side | null = null): { text: string; to: string | null } {
  const actor = e.side === 'brand' ? names.brand : e.side === 'creator' ? names.creator : 'GameIn';
  const amount = e.amount_cents != null ? formatCents(e.amount_cents) : '';
  const title = String(field(e.data, 'title') ?? '');
  const deliverable = String(field(e.data, 'deliverable') ?? 'a deliverable');
  const offer = e.offer_id ? `/offers/${e.offer_id}` : null;
  const deal = e.deal_id ? `/deals/${e.deal_id}` : null;

  switch (e.kind) {
    case 'offer_sent':
      return { text: `${names.brand} sent ${viewer === 'creator' ? 'you ' : ''}an offer: ${title} (${amount})`, to: offer };
    case 'package_booked':
      return { text: `${names.brand} booked ${title} (${amount})`, to: offer };
    case 'offer_pitched':
      return {
        text: field(e.data, 'again') ? `${names.creator} offered to run ${title} again (${amount})` : `${names.creator} pitched ${title} (${amount})`,
        to: offer,
      };
    case 'offer_countered':
      return { text: `${actor} countered with ${amount}`, to: offer };
    case 'offer_accepted':
      return { text: `${actor} accepted ${title || 'the offer'}. The deal is on`, to: deal ?? offer };
    case 'offer_declined': {
      const reason = field(e.data, 'reason');
      return { text: `${actor} declined the offer${reason ? `: “${reason}”` : ''}`, to: offer };
    }
    case 'offer_withdrawn':
      return { text: `${actor} withdrew the offer`, to: offer };
    case 'offer_expired':
      return { text: 'An offer expired: nobody replied in time', to: offer };
    case 'payment_started':
      return { text: `${names.brand} started a ${METHOD[String(field(e.data, 'method'))] ?? ''} payment of ${amount}`, to: deal };
    case 'escrow_funded':
      return { text: `${names.brand} put ${amount} in escrow`, to: deal };
    case 'payment_failed':
      return { text: `A ${METHOD[String(field(e.data, 'method'))] ?? ''} payment of ${amount} didn’t go through`, to: deal };
    case 'proof_submitted':
      return { text: `${names.creator} sent proof for ${deliverable}`, to: deal };
    case 'proof_approved':
      return { text: `${names.brand} approved ${amount}. It releases in a few seconds`, to: deal };
    case 'proof_auto_approved':
      return { text: `Proof for ${deliverable} was approved automatically after 5 days`, to: deal };
    case 'approval_undone':
      return { text: `${names.brand} undid an approval`, to: deal };
    case 'changes_requested': {
      const note = field(e.data, 'note');
      return { text: `${names.brand} asked for changes${note ? `: “${note}”` : ''}`, to: deal };
    }
    case 'payment_released': {
      const net = field(e.data, 'net');
      return viewer === 'creator' && typeof net === 'number'
        ? { text: `${formatCents(net)} released to you for ${deliverable}`, to: deal }
        : { text: `${amount} released to ${names.creator} for ${deliverable}`, to: deal };
    }
    case 'deal_completed':
      return { text: 'The deal is complete. Rate how it went', to: deal };
    case 'deal_rated':
      return { text: `${actor} rated the deal ${field(e.data, 'score') ?? ''}/5`, to: deal };
    case 'payout_requested':
      return { text: `Payout of ${amount} requested`, to: '/wallet' };
    case 'payout_paid':
      return { text: `Payout of ${amount} sent to the bank`, to: '/wallet' };
    case 'payout_failed':
      return { text: `A payout of ${amount} failed; the money is back in the wallet`, to: '/wallet' };
    case 'renewal_offered':
      return { text: `${names.brand} offered to renew`, to: deal };
    case 'renewal_requested':
      return { text: `${names.creator} asked to renew`, to: deal };
    case 'renewal_accepted':
      return { text: `${actor} accepted the renewal`, to: deal };
    case 'renewal_declined':
      return { text: `${actor} declined the renewal`, to: deal };
    case 'renewal_withdrawn':
      return { text: `${actor} withdrew the renewal`, to: deal };
    default:
      return { text: e.kind.replace(/_/g, ' '), to: deal ?? offer };
  }
}
