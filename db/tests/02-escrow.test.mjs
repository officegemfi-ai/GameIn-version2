// Deals and escrow: E1-E6 and M2 (the brand fee), plus payments that fail and the switch to Stripe.
import assert from 'node:assert/strict';
import { refusal } from './harness.mjs';
import { dbTest, js } from './fixtures.mjs';

const pay = (w, id) => w.db.one('select * from public.payments where id = $1', [id]);
const ledgerOf = (w, payment) => w.db.q('select account, amount_cents from public.ledger_entries where payment_id = $1 order by amount_cents', [payment]);

dbTest('E1: a new deal starts with every milestone not funded; the creator can\'t upload yet', async (w) => {
  const deal = await w.deal();
  const m = await w.money(deal);
  assert.equal(m.status, 'awaiting_funding');
  assert.equal(m.not_funded_cents, 100000);
  assert.equal(m.funded_cents, 0);
  const r = await refusal(w.deliver(deal, 1));
  assert.equal(r.rule, 'E6');
  assert.match(r.message, /hasn't funded escrow/);
  assert.equal((await w.db.q('select count(*)::int as n from public.proofs'))[0].n, 0);
});

dbTest('E2: funding by card puts milestones in escrow at once, with the 5% fee on the receipt', async (w) => {
  const deal = await w.deal({ amount: 100001 });
  const id = await w.fund(deal, 'card', 'next');
  const p = await pay(w, id);
  assert.equal(p.status, 'succeeded');
  assert.equal(p.base_cents, 33333);
  assert.equal(p.fee_cents, js.fee(33333));
  assert.equal(p.total_cents, 33333 + js.fee(33333));
  assert.deepEqual((await w.milestones(deal)).map((m) => m.status), ['in_escrow', 'pending', 'pending']);
  const m = await w.money(deal);
  assert.equal(m.status, 'in_progress');
  assert.equal(m.in_escrow_cents, 33333);
  // the ledger: the brand paid the total, escrow holds the milestone, GameIn holds the fee
  assert.deepEqual(await ledgerOf(w, id), [
    { account: `brand:${w.brand}`, amount_cents: -p.total_cents },
    { account: 'fees', amount_cents: p.fee_cents },
    { account: `escrow:${deal}`, amount_cents: 33333 },
  ]);
  // the creator can deliver the funded one only
  await w.deliver(deal, 1);
  assert.equal((await refusal(w.deliver(deal, 2))).rule, 'E6');
  assert.equal((await w.events('escrow_funded')).length, 1);
});

dbTest('E3: a bank payment is processing until it clears; the creator waits; it clears as a whole, once', async (w) => {
  const deal = await w.deal();
  const id = await w.fund(deal, 'bank', 'all');
  assert.equal((await pay(w, id)).status, 'processing');
  assert.deepEqual((await w.milestones(deal)).map((m) => m.status), ['processing', 'processing', 'processing']);
  const m = await w.money(deal);
  assert.equal(m.clearing_cents, 100000);
  assert.equal(m.in_escrow_cents, 0);
  assert.equal(m.status, 'in_progress');
  assert.deepEqual(await ledgerOf(w, id), [], 'no money has moved yet');
  const r = await refusal(w.deliver(deal, 1));
  assert.equal(r.rule, 'E6');
  assert.match(r.message, /still clearing/);
  // the creator can't say it cleared; the brand can, in the demo
  assert.equal((await refusal(w.C.rpc('simulate_payment', { p_payment: id }))).code, '42501');
  assert.equal(await w.B.rpc('simulate_payment', { p_payment: id }), true);
  assert.equal(await w.B.rpc('simulate_payment', { p_payment: id }), false, 'clearing twice changes nothing');
  assert.deepEqual((await w.milestones(deal)).map((m) => m.status), ['in_escrow', 'in_escrow', 'in_escrow']);
  assert.equal((await w.money(deal)).in_escrow_cents, 100000);
  assert.equal((await ledgerOf(w, id)).length, 3);
  await w.deliver(deal, 2);
});

dbTest('E4: a wire waits for the money, with a reference; the provider confirms it with the service key', async (w) => {
  const deal = await w.deal();
  const id = await w.fund(deal, 'wire', 'next');
  const p = await pay(w, id);
  assert.equal(p.status, 'awaiting_wire');
  assert.match(p.reference, /^GI-[0-9A-F]{6}-1-1$/);
  assert.equal((await w.milestones(deal))[0].status, 'awaiting_wire');
  assert.equal((await refusal(w.deliver(deal, 1))).rule, 'E6');
  assert.equal((await refusal(w.B.rpc('confirm_payment', { p_payment: id }))).code, '42501', 'only the backend confirms');
  assert.equal(await w.db.service().rpc('confirm_payment', { p_payment: id, p_provider_ref: 'wire-123' }), true);
  assert.equal(await w.db.service().rpc('confirm_payment', { p_payment: id }), false);
  const after = await pay(w, id);
  assert.equal(after.status, 'succeeded');
  assert.equal(after.provider_ref, 'wire-123');
  await w.deliver(deal, 1);
});

dbTest('E5: the brand funds the next milestone only, everything remaining, or the milestones it picks', async (w) => {
  const deal = await w.deal({ amount: 100000, items: [1, 2, 3, 4].map((i) => ({ label: 'Part ' + i })) });
  const ms = await w.milestones(deal);
  await w.fund(deal, 'card', 'next');
  assert.deepEqual((await w.milestones(deal)).map((m) => m.status), ['in_escrow', 'pending', 'pending', 'pending']);
  await w.B.rpc('fund_milestones', { p_deal: deal, p_method: 'card', p_milestones: [ms[3].id] });
  assert.deepEqual((await w.milestones(deal)).map((m) => m.status), ['in_escrow', 'pending', 'pending', 'in_escrow']);
  let r = await refusal(w.B.rpc('fund_milestones', { p_deal: deal, p_method: 'card', p_milestones: [ms[0].id, ms[1].id] }));
  assert.equal(r.rule, 'E5');
  assert.match(r.message, /already funded/);
  const other = await w.deal();
  const otherMs = await w.milestones(other);
  r = await refusal(w.B.rpc('fund_milestones', { p_deal: deal, p_method: 'card', p_milestones: [otherMs[0].id] }));
  assert.equal(r.rule, 'E5');
  await w.fund(deal, 'card', 'all');
  assert.deepEqual((await w.milestones(deal)).map((m) => m.status), ['in_escrow', 'in_escrow', 'in_escrow', 'in_escrow']);
  r = await refusal(w.fund(deal, 'card', 'next'));
  assert.equal(r.rule, 'E5');
  assert.match(r.message, /already funded/);
  assert.equal((await refusal(w.fund(other, 'card', 'some'))).rule, 'E5');
  // only the brand's people fund
  assert.equal((await refusal(w.C.rpc('fund_milestones', { p_deal: other, p_method: 'card' }))).code, '42501');
  assert.equal((await refusal(w.X.rpc('fund_milestones', { p_deal: other, p_method: 'card' }))).code, '42501');
});

dbTest('M2: the brand fee is 5% of everything funded on the deal, rounded once, however it is split', async (w) => {
  for (const amount of [100, 101, 999, 1001, 33333, 53840, 100001, 274_50]) {
    const items = [1, 2, 3, 4, 5, 6, 7].map((i) => ({ label: 'D' + i }));
    const inParts = await w.deal({ amount, items });
    for (let i = 0; i < items.length; i++) await w.fund(inParts, i % 3 === 0 ? 'bank' : 'card', 'next');
    const atOnce = await w.deal({ amount, items });
    await w.fund(atOnce, 'card', 'all');
    for (const deal of [inParts, atOnce]) {
      const [s] = await w.db.q(`select sum(base_cents)::bigint as base, sum(fee_cents)::bigint as fee, sum(total_cents)::bigint as total
                                from public.payments where deal_id = $1`, [deal]);
      assert.equal(s.base, amount);
      assert.equal(s.fee, js.fee(amount), `fee on ${amount}`);
      assert.equal(s.total, amount + js.fee(amount));
    }
  }
});

dbTest('payments that fail: the milestones go back to not funded, and the next payment is priced afresh', async (w) => {
  const deal = await w.deal({ amount: 30000 });
  const bank = await w.fund(deal, 'bank', 'next');
  const card = await w.fund(deal, 'card', 'next');
  assert.equal((await pay(w, card)).fee_basis_cents, 10000, 'priced on what was funded before it, the bank payment included');
  assert.equal((await refusal(w.B.rpc('fail_payment', { p_payment: bank }))).code, '42501');
  assert.equal(await w.db.service().rpc('fail_payment', { p_payment: bank, p_reason: 'insufficient funds' }), true);
  assert.equal(await w.db.service().rpc('fail_payment', { p_payment: bank }), false);
  assert.deepEqual((await w.milestones(deal)).map((m) => m.status), ['pending', 'in_escrow', 'pending']);
  assert.equal((await w.events('payment_failed')).length, 1);
  // a cleared payment can't fail afterwards
  assert.equal((await refusal(w.db.service().rpc('fail_payment', { p_payment: card }))).rule, 'E3');
  // fund it again: the new payment's fee is on the running total of payments that didn't fail
  const again = await w.fund(deal, 'card', 'next');
  const p = await pay(w, again);
  assert.equal(p.fee_basis_cents, 10000);
  assert.equal(p.fee_cents, js.fee(20000) - js.fee(10000));
  // a failed payment can't clear later
  assert.equal((await refusal(w.B.rpc('simulate_payment', { p_payment: bank }))).rule, 'E3');
  // with nothing funded or clearing, a deal is back to awaiting funding
  const d2 = await w.deal();
  const p2 = await w.fund(d2, 'wire', 'all');
  assert.equal((await w.money(d2)).status, 'in_progress');
  await w.B.rpc('simulate_payment', { p_payment: p2, p_outcome: 'failed' });
  assert.equal((await w.money(d2)).status, 'awaiting_funding');
});

dbTest('with Stripe connected every payment waits for Stripe, and only the backend can clear it', async (w) => {
  await w.db.q("update private.settings set value = 'stripe' where key = 'payments_provider'");
  const deal = await w.deal();
  const id = await w.fund(deal, 'card', 'all');
  const p = await pay(w, id);
  assert.equal(p.provider, 'stripe');
  assert.equal(p.status, 'processing', 'a card waits for Stripe\'s webhook');
  assert.equal((await refusal(w.B.rpc('simulate_payment', { p_payment: id }))).rule, 'E3');
  assert.equal(await w.db.service().rpc('confirm_payment', { p_payment: id, p_provider_ref: 'pi_123' }), true);
  assert.equal((await w.money(deal)).in_escrow_cents, 100000);
});

dbTest('M4: the brand\'s and the creator\'s screens show the same money for a deal', async (w) => {
  const deal = await w.deal({ amount: 100001 });
  await w.fund(deal, 'card', 'next');
  const p2 = await w.fund(deal, 'bank', 'next');
  const proof = await w.deliver(deal, 1);
  await w.release(proof);
  const fromBrand = (await w.B.query('select * from public.deal_money where deal_id = $1', [deal]))[0];
  const fromCreator = (await w.C.query('select * from public.deal_money where deal_id = $1', [deal]))[0];
  assert.deepEqual(fromBrand, fromCreator);
  assert.equal(fromBrand.funded_cents, fromBrand.in_escrow_cents + fromBrand.released_cents);
  assert.deepEqual([fromBrand.not_funded_cents, fromBrand.clearing_cents, fromBrand.in_escrow_cents, fromBrand.released_cents],
    [33335, 33333, 0, 33333]);
  await w.B.rpc('simulate_payment', { p_payment: p2 });
  const [bm] = await w.B.query('select * from public.brand_money where brand_id = $1', [w.brand]);
  assert.equal(bm.in_escrow_cents, 33333);
  assert.equal(bm.released_cents, 33333);
  assert.equal(bm.paid_cents, 66666 + js.fee(66666));
  assert.equal(bm.fees_cents, js.fee(66666));
  // the creator doesn't see the brand's payments, only each milestone's state
  assert.equal((await w.C.query('select count(*)::int as n from public.payments'))[0].n, 0);
  assert.equal((await w.C.query('select count(*)::int as n from public.milestones'))[0].n, 3);
});
