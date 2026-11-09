// What deals, milestones, deliverables and payments mean on screen: their labels and colours, and the questions the
// screens ask of a deal. Pure functions over the database's rows (no fetching here), tested in model.test.ts.
import type { Tone } from '@/components/ui';
import { formatCents } from '@/lib/money';
import type { DealMoneyRow, DealStatus, DeliverableStatus, MilestoneStatus, PaymentStatus, ProofRow, Side } from '@/lib/types';

export interface StatusLabel {
  label: string;
  tone: Tone;
}

export const DEAL_STATUS: Record<DealStatus, StatusLabel> = {
  awaiting_funding: { label: 'awaiting funding', tone: 'coral' },
  in_progress: { label: 'in progress', tone: 'mint' },
  completed: { label: 'complete', tone: 'neutral' },
  cancelled: { label: 'cancelled', tone: 'neutral' },
};

export const MILESTONE_STATUS: Record<MilestoneStatus, StatusLabel> = {
  pending: { label: 'not funded', tone: 'coral' },
  processing: { label: 'clearing', tone: 'amber' },
  awaiting_wire: { label: 'awaiting wire', tone: 'amber' },
  in_escrow: { label: 'in escrow', tone: 'mint' },
  released: { label: 'released', tone: 'neutral' },
};

/** A payment into escrow, as both the deal page and the brand's payments list show it. */
export function paymentStatus(status: PaymentStatus): StatusLabel {
  if (status === 'succeeded') return { label: 'in escrow', tone: 'mint' };
  return { label: status.replace('_', ' '), tone: status === 'failed' ? 'coral' : 'amber' };
}

/** Where one deliverable stands; work that isn't funded yet is "upcoming", funded work is "ready to deliver". */
export function deliverableStatus(status: DeliverableStatus, inEscrow: boolean): StatusLabel {
  switch (status) {
    case 'in_review':
      return { label: 'in review', tone: 'amber' };
    case 'changes_requested':
      return { label: 'changes requested', tone: 'coral' };
    case 'done':
      return { label: 'done', tone: 'mint' };
    default:
      return inEscrow ? { label: 'ready to deliver', tone: 'mint' } : { label: 'upcoming', tone: 'neutral' };
  }
}

/** Still running: waiting for money, or work under way. */
export const isActiveDeal = (d: { status: DealStatus }): boolean => d.status === 'awaiting_funding' || d.status === 'in_progress';

/** Over: everything released, or called off. */
export const isFinishedDeal = (d: { status: DealStatus }): boolean => d.status === 'completed' || d.status === 'cancelled';

/** The brand still has money to put in escrow for it. */
export const owesFunding = (d: { status: DealStatus; money: Pick<DealMoneyRow, 'not_funded_cents'> | null }): boolean =>
  (d.money?.not_funded_cents ?? 0) > 0 && d.status !== 'cancelled';

/** The latest proof for each deliverable (a deliverable gets new proof after changes are requested). */
export function latestProofs(proofs: ProofRow[]): Map<string, ProofRow> {
  const out = new Map<string, ProofRow>();
  for (const p of [...proofs].sort((a, b) => a.submitted_at.localeCompare(b.submitted_at))) out.set(p.deliverable_id, p);
  return out;
}

/** The one line that says where a deal stands, for its seat. */
export function dealHeadline(m: DealMoneyRow | null, status: string, side: Side): string {
  if (status === 'completed') return 'Complete: everything released';
  if (status === 'cancelled') return 'Cancelled';
  if (!m) return '';
  if ((m.not_funded_cents ?? 0) > 0 && (m.funded_cents ?? 0) + (m.clearing_cents ?? 0) === 0) {
    return side === 'brand' ? `Fund ${formatCents(m.not_funded_cents)} so the work can start` : 'Waiting on the brand to fund escrow';
  }
  if ((m.clearing_cents ?? 0) > 0) return `${formatCents(m.clearing_cents)} clearing`;
  return `${formatCents(m.in_escrow_cents)} in escrow · ${formatCents(m.released_cents)} released`;
}
