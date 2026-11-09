import { describe, expect, it } from 'vitest';
import type { DealMoneyRow, ProofRow } from '@/lib/types';
import { DEAL_STATUS, MILESTONE_STATUS, dealHeadline, deliverableStatus, isActiveDeal, isFinishedDeal, latestProofs, owesFunding, paymentStatus } from './model';

const money = (m: Partial<DealMoneyRow>) => ({ not_funded_cents: 0, funded_cents: 0, clearing_cents: 0, in_escrow_cents: 0, released_cents: 0, ...m }) as DealMoneyRow;

describe('the deal model', () => {
  it('names every deal and milestone state', () => {
    expect(Object.keys(DEAL_STATUS).sort()).toEqual(['awaiting_funding', 'cancelled', 'completed', 'in_progress']);
    expect(MILESTONE_STATUS.pending).toEqual({ label: 'not funded', tone: 'coral' });
    expect(MILESTONE_STATUS.in_escrow).toEqual({ label: 'in escrow', tone: 'mint' });
  });

  it('says the same thing about a payment wherever it shows', () => {
    expect(paymentStatus('succeeded')).toEqual({ label: 'in escrow', tone: 'mint' });
    expect(paymentStatus('failed')).toEqual({ label: 'failed', tone: 'coral' });
    expect(paymentStatus('processing')).toEqual({ label: 'processing', tone: 'amber' });
    expect(paymentStatus('awaiting_wire')).toEqual({ label: 'awaiting wire', tone: 'amber' });
  });

  it('calls unfunded work upcoming and funded work ready', () => {
    expect(deliverableStatus('upcoming', false)).toEqual({ label: 'upcoming', tone: 'neutral' });
    expect(deliverableStatus('upcoming', true)).toEqual({ label: 'ready to deliver', tone: 'mint' });
    expect(deliverableStatus('in_review', true).label).toBe('in review');
    expect(deliverableStatus('changes_requested', true).tone).toBe('coral');
    expect(deliverableStatus('done', true)).toEqual({ label: 'done', tone: 'mint' });
  });

  it('splits deals into running and over, with nothing in both or neither', () => {
    for (const status of Object.keys(DEAL_STATUS) as (keyof typeof DEAL_STATUS)[]) {
      expect(isActiveDeal({ status }) !== isFinishedDeal({ status })).toBe(true);
    }
  });

  it('asks the brand to fund only what is still owed on a live deal', () => {
    expect(owesFunding({ status: 'awaiting_funding', money: money({ not_funded_cents: 900 }) })).toBe(true);
    expect(owesFunding({ status: 'cancelled', money: money({ not_funded_cents: 900 }) })).toBe(false);
    expect(owesFunding({ status: 'in_progress', money: money({}) })).toBe(false);
    expect(owesFunding({ status: 'in_progress', money: null })).toBe(false);
  });

  it('keeps the newest proof for each deliverable', () => {
    const proof = (id: string, deliverable_id: string, submitted_at: string) => ({ id, deliverable_id, submitted_at }) as ProofRow;
    const latest = latestProofs([proof('b', 'd1', '2026-11-02T10:00:00Z'), proof('a', 'd1', '2026-11-01T10:00:00Z'), proof('c', 'd2', '2026-11-01T09:00:00Z')]);
    expect(latest.get('d1')?.id).toBe('b');
    expect(latest.get('d2')?.id).toBe('c');
  });

  it('sums a deal up in one line, for its seat', () => {
    expect(dealHeadline(money({}), 'completed', 'brand')).toBe('Complete: everything released');
    expect(dealHeadline(money({ not_funded_cents: 90000 }), 'awaiting_funding', 'brand')).toBe('Fund $900.00 so the work can start');
    expect(dealHeadline(money({ not_funded_cents: 90000 }), 'awaiting_funding', 'creator')).toBe('Waiting on the brand to fund escrow');
    expect(dealHeadline(money({ clearing_cents: 5000, funded_cents: 0, not_funded_cents: 0 }), 'in_progress', 'brand')).toBe('$50.00 clearing');
    expect(dealHeadline(money({ in_escrow_cents: 100000, released_cents: 200000, funded_cents: 300000 }), 'in_progress', 'creator')).toBe('$1,000.00 in escrow · $2,000.00 released');
  });
});
