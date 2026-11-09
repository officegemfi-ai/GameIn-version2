import { describe, expect, it } from 'vitest';
import { describeEvent, type ActivityEvent } from './describe';

const names = { brand: 'HYPERCORE', creator: 'Instant Shock' };
const ev = (e: Partial<ActivityEvent>): ActivityEvent => ({ kind: '', data: {}, amount_cents: null, deal_id: null, offer_id: null, side: null, ...e });

describe('activity lines', () => {
  it('describes offers and leads to them', () => {
    expect(describeEvent(ev({ kind: 'offer_sent', side: 'brand', amount_cents: 30000, offer_id: 'o1', data: { title: 'Launch week' } }), names, 'creator')).toEqual({
      text: 'HYPERCORE sent you an offer: Launch week ($300.00)',
      to: '/offers/o1',
    });
    expect(describeEvent(ev({ kind: 'offer_countered', side: 'creator', amount_cents: 65000, offer_id: 'o1' }), names).text).toBe('Instant Shock countered with $650.00');
    expect(describeEvent(ev({ kind: 'offer_accepted', side: 'creator', offer_id: 'o1', deal_id: 'd1', data: { title: 'Launch week' } }), names).to).toBe('/deals/d1');
    expect(describeEvent(ev({ kind: 'offer_declined', side: 'brand', data: { reason: 'Over budget' } }), names).text).toBe('HYPERCORE declined the offer: “Over budget”');
  });

  it('describes money from the reader’s side', () => {
    const released = ev({ kind: 'payment_released', side: 'brand', amount_cents: 15000, deal_id: 'd1', data: { deliverable: 'Launch stream', fee: 750, net: 14250 } });
    expect(describeEvent(released, names, 'creator').text).toBe('$142.50 released to you for Launch stream');
    expect(describeEvent(released, names, 'brand').text).toBe('$150.00 released to Instant Shock for Launch stream');
    expect(describeEvent(ev({ kind: 'payment_started', amount_cents: 15000, data: { method: 'bank' } }), names).text).toBe('HYPERCORE started a bank (ACH) payment of $150.00');
  });

  it('describes proof, and something it doesn’t know by its kind', () => {
    expect(describeEvent(ev({ kind: 'proof_submitted', side: 'creator', deal_id: 'd1', data: { deliverable: 'Recap clip' } }), names).text).toBe('Instant Shock sent proof for Recap clip');
    expect(describeEvent(ev({ kind: 'changes_requested', side: 'brand', data: { note: 'Logo too small' } }), names).text).toBe('HYPERCORE asked for changes: “Logo too small”');
    expect(describeEvent(ev({ kind: 'something_new', deal_id: 'd9' }), names)).toEqual({ text: 'something new', to: '/deals/d9' });
  });
});
