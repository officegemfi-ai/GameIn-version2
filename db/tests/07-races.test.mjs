// Two people (or two tabs) acting at the same instant: D2 and P6. Each race is lined up exactly: the first move holds
// its locks, the second is seen waiting, then the first commits. One stands, the other is refused with the reason,
// and the money audit still finds nothing. Then many connections at once.
import assert from 'node:assert/strict';
import { race } from './harness.mjs';
import { dbTest } from './fixtures.mjs';

dbTest('two tabs approve the same proof at once: one approval, the other refused', async (w) => {
  const deal = await w.deal();
  await w.fund(deal);
  const proof = await w.deliver(deal, 1);
  const tab2 = await w.db.userByEmail((await w.db.one('select email from auth.users where id = $1', [w.B.id])).email);
  const { second } = await race(w.db, [w.B, 'approve_proof', { p_proof: proof }], [tab2, 'approve_proof', { p_proof: proof }]);
  assert.equal(second.err.rule, 'P6');
  assert.equal((await w.db.one('select status from public.proofs where id = $1', [proof])).status, 'releasing');
  assert.equal((await w.events('proof_approved')).length, 1);
});

dbTest('both tabs and the scheduler release the same proof at once: paid once', async (w) => {
  const deal = await w.deal();
  await w.fund(deal);
  const proof = await w.deliver(deal, 1);
  await w.B.rpc('approve_proof', { p_proof: proof });
  await w.endWindow(proof);
  const { first, second } = await race(w.db, [w.B, 'finalize_release', { p_proof: proof }], [w.C, 'finalize_release', { p_proof: proof }]);
  assert.equal(second.ok, first, 'the second gets the same release');
  assert.equal(await w.db.service().rpc('release_due'), 0);
  assert.equal((await w.db.q('select count(*)::int as n from public.releases'))[0].n, 1);
  assert.equal((await w.db.q("select count(*)::int as n from public.ledger_entries where memo = 'released to creator'"))[0].n, 3);
});

dbTest('undo arrives while the release is being saved: too late, released once', async (w) => {
  const deal = await w.deal();
  await w.fund(deal);
  const proof = await w.deliver(deal, 1);
  await w.B.rpc('approve_proof', { p_proof: proof });
  await w.endWindow(proof);
  const { second } = await race(w.db, [w.C, 'finalize_release', { p_proof: proof }], [w.B, 'undo_approval', { p_proof: proof }]);
  assert.equal(second.err.rule, 'P3');
  assert.match(second.err.message, /already released/);
});

dbTest('two tabs fund the same milestone at once (card and bank): it is paid once, the other is refused', async (w) => {
  const deal = await w.deal();
  const [m1] = await w.milestones(deal);
  const tab2 = w.db.actor({ role: 'authenticated', userId: w.B.id, name: 'brand tab 2' });
  const { second } = await race(w.db,
    [w.B, 'fund_milestones', { p_deal: deal, p_method: 'card', p_milestones: [m1.id] }],
    [tab2, 'fund_milestones', { p_deal: deal, p_method: 'bank', p_milestones: [m1.id] }]);
  assert.equal(second.err.rule, 'E5');
  assert.match(second.err.message, /already funded/);
  assert.equal((await w.db.q('select count(*)::int as n from public.payments'))[0].n, 1);
  // "fund the next one" from two tabs funds two different milestones, each once, the fee on the running total
  const both = await race(w.db,
    [w.B, 'fund_milestones', { p_deal: deal, p_method: 'card', p_scope: 'next' }],
    [tab2, 'fund_milestones', { p_deal: deal, p_method: 'card', p_scope: 'next' }]);
  assert.ok(both.second.ok);
  assert.deepEqual((await w.milestones(deal)).map((m) => m.status), ['in_escrow', 'in_escrow', 'in_escrow']);
});

dbTest('the creator accepts while the brand withdraws: one stands; no deal for an offer that wasn\'t accepted', async (w) => {
  const o1 = await w.offer();
  let r = await race(w.db, [w.C, 'accept_offer', { p_offer: o1, p_as: 'creator' }], [w.B, 'withdraw_offer', { p_offer: o1, p_as: 'brand' }]);
  assert.equal(r.second.err.rule, 'O11');
  assert.equal((await w.offerRow(o1)).status, 'accepted');
  const o2 = await w.offer();
  r = await race(w.db, [w.B, 'withdraw_offer', { p_offer: o2, p_as: 'brand' }], [w.C, 'accept_offer', { p_offer: o2, p_as: 'creator' }]);
  assert.equal(r.second.err.rule, 'O11');
  assert.equal((await w.offerRow(o2)).status, 'withdrawn');
  assert.equal((await w.db.q('select count(*)::int as n from public.deals'))[0].n, 1);
});

dbTest('the creator accepts in one tab and counters in another: the acceptance stands', async (w) => {
  const offer = await w.offer();
  const tab2 = w.db.actor({ role: 'authenticated', userId: w.C.id, name: 'creator tab 2' });
  const { second } = await race(w.db,
    [w.C, 'accept_offer', { p_offer: offer, p_as: 'creator' }],
    [tab2, 'counter_offer', { p_offer: offer, p_as: 'creator', p_amount_cents: 150000 }]);
  assert.equal(second.err.rule, 'O11');
  assert.equal((await w.db.q('select count(*)::int as n from public.offer_versions where offer_id = $1', [offer]))[0].n, 1);
});

dbTest('a renewal answered from two tabs at once (accept and decline): answered once, its months added once', async (w) => {
  const deal = await w.deal();
  const ren = await w.B.rpc('offer_renewal', { p_deal: deal, p_months: 1, p_price_cents: 50000 });
  const tab2 = w.db.actor({ role: 'authenticated', userId: w.C.id, name: 'creator tab 2' });
  const { second } = await race(w.db,
    [w.C, 'answer_renewal', { p_renewal: ren, p_as: 'creator', p_accept: true }],
    [tab2, 'answer_renewal', { p_renewal: ren, p_as: 'creator', p_accept: false }]);
  assert.equal(second.err.rule, 'R4');
  assert.equal((await w.milestones(deal)).length, 4);
});

dbTest('the brand clears a bank payment while the bank reports it failed: one outcome', async (w) => {
  const deal = await w.deal();
  const pay = await w.fund(deal, 'bank');
  const { second } = await race(w.db, [w.B, 'simulate_payment', { p_payment: pay }], [w.db.service(), 'fail_payment', { p_payment: pay }]);
  assert.equal(second.err.rule, 'E3');
  assert.equal((await w.db.one('select status from public.payments where id = $1', [pay])).status, 'succeeded');
});

dbTest('two payouts of the whole balance at once: one is paid, the other refused', async (w) => {
  const deal = await w.deal();
  await w.fund(deal);
  await w.completeAll(deal);
  const tab2 = w.db.actor({ role: 'authenticated', userId: w.C.id, name: 'creator tab 2' });
  const { second } = await race(w.db, [w.C, 'request_payout', { p_creator: w.creator }], [tab2, 'request_payout', { p_creator: w.creator }]);
  assert.equal(second.err.rule, 'M5');
  assert.equal((await w.db.q('select count(*)::int as n from public.payouts'))[0].n, 1);
});

dbTest('two tabs upload proof for the same deliverable at once: one proof in review', async (w) => {
  const deal = await w.deal();
  await w.fund(deal);
  const [dl] = await w.deliverables(deal);
  const tab2 = w.db.actor({ role: 'authenticated', userId: w.C.id, name: 'creator tab 2' });
  const { second } = await race(w.db,
    [w.C, 'submit_proof', { p_deliverable: dl.id, p_link_url: 'https://x.test/a' }],
    [tab2, 'submit_proof', { p_deliverable: dl.id, p_link_url: 'https://x.test/b' }]);
  assert.equal(second.err.rule, 'P1');
  assert.equal((await w.db.q('select count(*)::int as n from public.proofs'))[0].n, 1);
});

dbTest('many connections at once: 12 fundings of 5 milestones, 20 approvals of one proof, 30 payouts of $10 from $190', async (w) => {
  const deal = await w.deal({ amount: 100000, items: [1, 2, 3, 4, 5].map((i) => ({ label: 'Part ' + i })) });
  const fundings = await Promise.allSettled(Array.from({ length: 12 }, (_, i) =>
    w.B.rpcOwn('fund_milestones', { p_deal: deal, p_method: i % 2 ? 'card' : 'bank', p_scope: 'next' })));
  assert.equal(fundings.filter((r) => r.status === 'fulfilled').length, 5);
  assert.ok(fundings.filter((r) => r.status === 'rejected').every((r) => r.reason.hint === 'E5'));
  const pays = await w.db.q("select id from public.payments where status = 'processing'");
  await Promise.all(pays.map((p) => w.B.rpcOwn('simulate_payment', { p_payment: p.id })));
  const proof = await w.deliver(deal, 1);
  const approvals = await Promise.allSettled(Array.from({ length: 20 }, () => w.B.rpcOwn('approve_proof', { p_proof: proof, p_undo_seconds: 0 })));
  assert.equal(approvals.filter((r) => r.status === 'fulfilled').length, 1);
  assert.ok(approvals.filter((r) => r.status === 'rejected').every((r) => r.reason.hint === 'P6'));
  // the creator now has $200 less the 5% fee, $190: thirty payouts of $10 at once take exactly what's there, never more
  const available = (await w.C.query('select available_cents from public.creator_wallet'))[0].available_cents;
  const payouts = await Promise.allSettled(Array.from({ length: 30 }, () =>
    w.C.rpcOwn('request_payout', { p_creator: w.creator, p_amount_cents: 1000 })));
  const paid = payouts.filter((r) => r.status === 'fulfilled').length;
  assert.equal(paid, Math.min(30, Math.floor(available / 1000)));
  assert.ok(payouts.filter((r) => r.status === 'rejected').every((r) => r.reason.hint === 'M5'));
  assert.equal((await w.C.query('select available_cents from public.creator_wallet'))[0].available_cents, available - paid * 1000);
});
