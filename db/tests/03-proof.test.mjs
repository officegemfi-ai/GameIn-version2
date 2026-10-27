// Proof and release: P1-P6, M3 (the creator fee), M5 (the wallet), payouts and the 5-day auto-approval.
import assert from 'node:assert/strict';
import { refusal } from './harness.mjs';
import { dbTest, js } from './fixtures.mjs';

const proofRow = (w, id) => w.db.one('select * from public.proofs where id = $1', [id]);
const wallet = (w) => w.C.query('select * from public.creator_wallet').then((r) => r[0]);

dbTest('P1: proof for a funded deliverable goes to the brand\'s approvals with its amount', async (w) => {
  const deal = await w.deal({ amount: 100001 });
  await w.fund(deal);
  const proof = await w.deliver(deal, 3);
  const p = await proofRow(w, proof);
  assert.equal(p.status, 'in_review');
  assert.equal(p.value_cents, 33335);
  assert.equal((await w.deliverables(deal))[2].status, 'in_review');
  const todos = await w.B.query("select kind, amount_cents from public.todos where side = 'brand'");
  assert.deepEqual(todos, [{ kind: 'review_proof', amount_cents: 33335 }]);
  // one live proof per deliverable
  const r = await refusal(w.deliver(deal, 3));
  assert.equal(r.rule, 'P1');
  assert.match(r.message, /already in review/);
  // only the creator uploads
  const dl = (await w.deliverables(deal))[0];
  assert.equal((await refusal(w.B.rpc('submit_proof', { p_deliverable: dl.id, p_link_url: 'https://x.test' }))).code, '42501');
});

dbTest('P1: proof is a web link or a file in the deal\'s own folder', async (w) => {
  const deal = await w.deal();
  await w.fund(deal);
  const other = await w.deal();
  const [dl] = await w.deliverables(deal);
  const submit = (args) => w.C.rpc('submit_proof', { p_deliverable: dl.id, ...args });
  assert.equal((await refusal(submit({}))).rule, 'P1');
  assert.equal((await refusal(submit({ p_link_url: 'javascript:alert(1)' }))).rule, 'P1');
  assert.equal((await refusal(submit({ p_link_url: 'https://has space.test' }))).rule, 'P1');
  assert.equal((await refusal(submit({ p_file_path: `${other}/clip.mp4` }))).rule, 'P1');
  assert.equal((await refusal(submit({ p_file_path: 'clip.mp4' }))).rule, 'P1');
  const proof = await submit({ p_file_path: `${deal}/clip.mp4`, p_note: 'the launch stream' });
  assert.equal((await proofRow(w, proof)).file_path, `${deal}/clip.mp4`);
});

dbTest('P2: approving releases after the undo window: escrow down by the share, the wallet up by 95% of it', async (w) => {
  const deal = await w.deal({ amount: 100001 });
  await w.fund(deal);
  const proof = await w.deliver(deal, 1);
  const releaseAt = new Date(await w.B.rpc('approve_proof', { p_proof: proof }));
  assert.ok(Math.abs(releaseAt - Date.now() - 6000) < 1500, 'a 6-second window');
  assert.equal((await proofRow(w, proof)).status, 'releasing');
  // nothing is paid during the window
  assert.equal((await refusal(w.C.rpc('finalize_release', { p_proof: proof }))).rule, 'P2');
  assert.equal((await w.money(deal)).released_cents, 0);
  await w.endWindow(proof);
  const release = await w.C.rpc('finalize_release', { p_proof: proof });
  assert.ok(release);
  const p = await proofRow(w, proof);
  assert.equal(p.status, 'released');
  const m = await w.money(deal);
  assert.equal(m.in_escrow_cents, 100001 - 33333);
  assert.equal(m.released_cents, 33333);
  const wl = await wallet(w);
  assert.equal(wl.available_cents, 33333 - js.fee(33333));
  assert.equal(wl.fees_cents, js.fee(33333));
  assert.equal((await w.deliverables(deal))[0].status, 'done');
  // the milestone was this deliverable's only one: released in full
  assert.equal((await w.milestones(deal))[0].status, 'released');
  assert.equal((await w.events('payment_released')).length, 1);
  // a party who isn't on the deal can't trigger releases
  assert.equal((await refusal(w.X.rpc('finalize_release', { p_proof: proof }))).code, '42501');
});

dbTest('P3: undo during the window puts it back in review; approving again starts a new window', async (w) => {
  const deal = await w.deal();
  await w.fund(deal);
  const proof = await w.deliver(deal, 1);
  await w.B.rpc('approve_proof', { p_proof: proof });
  await w.B.rpc('undo_approval', { p_proof: proof });
  let p = await proofRow(w, proof);
  assert.equal(p.status, 'in_review');
  assert.equal(p.release_at, null);
  assert.equal((await refusal(w.B.rpc('undo_approval', { p_proof: proof }))).rule, 'P3');
  const second = new Date(await w.B.rpc('approve_proof', { p_proof: proof, p_undo_seconds: 8 }));
  assert.ok(second - Date.now() > 6500, 'the new approval has its own window');
  await w.endWindow(proof);
  const r = await refusal(w.B.rpc('undo_approval', { p_proof: proof }));
  assert.equal(r.rule, 'P3');
  assert.match(r.message, /window has ended/);
  await w.db.service().rpc('release_due');
  p = await proofRow(w, proof);
  assert.equal(p.status, 'released');
  assert.equal((await refusal(w.B.rpc('undo_approval', { p_proof: proof }))).rule, 'P3');
  // the creator can't undo or approve
  const p2 = await w.deliver(deal, 2);
  assert.equal((await refusal(w.C.rpc('approve_proof', { p_proof: p2 }))).code, '42501');
});

dbTest('P4: requesting changes sends the deliverable back; a new upload returns to review', async (w) => {
  const deal = await w.deal();
  await w.fund(deal);
  const proof = await w.deliver(deal, 2);
  await w.B.rpc('request_changes', { p_proof: proof, p_note: 'Logo is cut off' });
  const p = await proofRow(w, proof);
  assert.equal(p.status, 'changes_requested');
  assert.equal(p.changes_note, 'Logo is cut off');
  assert.equal((await w.deliverables(deal))[1].status, 'changes_requested');
  assert.equal((await refusal(w.B.rpc('approve_proof', { p_proof: proof }))).rule, 'P2');
  const again = await w.deliver(deal, 2);
  assert.notEqual(again, proof);
  assert.equal((await proofRow(w, again)).status, 'in_review');
  assert.equal((await w.deliverables(deal))[1].status, 'in_review');
  // changes can't be requested on something releasing or released
  await w.B.rpc('approve_proof', { p_proof: again });
  assert.match((await refusal(w.B.rpc('request_changes', { p_proof: again }))).message, /Undo the approval first/);
  await w.endWindow(again);
  await w.B.rpc('finalize_release', { p_proof: again });
  assert.equal((await refusal(w.B.rpc('request_changes', { p_proof: again }))).rule, 'P4');
});

dbTest('P5: when everything is released the deal completes, paid in full', async (w) => {
  const deal = await w.deal({ amount: 53840 });
  await w.fund(deal);
  await w.completeAll(deal);
  const m = await w.money(deal);
  assert.equal(m.status, 'completed');
  assert.equal(m.released_cents, 53840);
  assert.equal(m.in_escrow_cents, 0);
  assert.equal((await w.events('deal_completed')).length, 1);
  assert.equal((await wallet(w)).available_cents, 53840 - js.fee(53840));
  assert.equal((await refusal(w.fund(deal))).rule, 'E5');
  assert.equal((await refusal(w.deliver(deal, 1))).rule, 'P6');
});

dbTest('P6: the same proof is released once: a second approve is refused, finalize twice returns the same release', async (w) => {
  const deal = await w.deal();
  await w.fund(deal);
  const proof = await w.deliver(deal, 1);
  await w.B.rpc('approve_proof', { p_proof: proof });
  const r = await refusal(w.B.rpc('approve_proof', { p_proof: proof }));
  assert.equal(r.rule, 'P6');
  await w.endWindow(proof);
  const a = await w.B.rpc('finalize_release', { p_proof: proof });
  const b = await w.C.rpc('finalize_release', { p_proof: proof });
  assert.equal(await w.db.service().rpc('release_due'), 0);
  assert.equal(a, b);
  assert.equal((await w.db.q('select count(*)::int as n from public.releases'))[0].n, 1);
  assert.equal((await refusal(w.B.rpc('approve_proof', { p_proof: proof }))).rule, 'P6');
});

dbTest('M3: the creator fee is 5% of everything released on the deal, rounded once', async (w) => {
  for (const amount of [101, 999, 33333, 100001, 27450]) {
    const items = [1, 2, 3, 4, 5, 6, 7].map((i) => ({ label: 'D' + i }));
    const deal = await w.deal({ amount, items });
    await w.fund(deal);
    await w.completeAll(deal);
    const [s] = await w.db.q(`select sum(gross_cents)::bigint as gross, sum(fee_cents)::bigint as fee, sum(net_cents)::bigint as net
                              from public.releases where deal_id = $1`, [deal]);
    assert.equal(s.gross, amount);
    assert.equal(s.fee, js.fee(amount), `fee on ${amount}`);
    assert.equal(s.net, amount - js.fee(amount));
  }
});

dbTest('M5: the wallet has one release row and one fee row per payout, and moves by exactly its rows', async (w) => {
  const deal = await w.deal({ amount: 100001 });
  await w.fund(deal);
  await w.completeAll(deal);
  const lines = await w.C.query('select kind, amount_cents from public.wallet_lines order by at, kind desc');
  assert.equal(lines.filter((l) => l.kind === 'release').length, 3);
  assert.equal(lines.filter((l) => l.kind === 'fee').length, 3);
  const sum = lines.reduce((a, l) => a + l.amount_cents, 0);
  assert.equal(sum, (await wallet(w)).available_cents);
  // payouts: up to the balance; instant ones cost 1.5%
  assert.equal((await refusal(w.C.rpc('request_payout', { p_creator: w.creator, p_amount_cents: sum + 1 }))).rule, 'M5');
  const weekly = await w.C.rpc('request_payout', { p_creator: w.creator, p_amount_cents: 50000 });
  const instant = await w.C.rpc('request_payout', { p_creator: w.creator, p_instant: true });
  const pos = await w.C.query('select id, amount_cents, fee_cents, net_cents, status from public.payouts order by created_at');
  assert.deepEqual(pos.map((p) => [p.id, p.amount_cents, p.fee_cents, p.status]),
    [[weekly, 50000, 0, 'paid'], [instant, sum - 50000, Math.floor(((sum - 50000) * 3 + 100) / 200), 'paid']]);
  const wl = await wallet(w);
  assert.equal(wl.available_cents, 0);
  assert.equal(wl.paid_out_cents, pos[0].net_cents + pos[1].net_cents);
  assert.equal((await refusal(w.C.rpc('request_payout', { p_creator: w.creator }))).rule, 'M5');
  const after = await w.C.query('select kind, amount_cents from public.wallet_lines');
  assert.equal(after.reduce((a, l) => a + l.amount_cents, 0), 0);
  // nobody else can pay out this creator's money, or see it
  assert.equal((await refusal(w.B.rpc('request_payout', { p_creator: w.creator }))).code, '42501');
  assert.equal((await w.B.query('select count(*)::int as n from public.payouts'))[0].n, 0);
  assert.deepEqual(await w.B.query('select * from public.creator_wallet'), []);
});

dbTest('payouts through a provider wait for the transfer; a failed one puts the money back', async (w) => {
  await w.db.q("update private.settings set value = 'stripe' where key = 'payments_provider'");
  const deal = await w.deal({ amount: 20000 });
  const pay = await w.fund(deal);
  await w.db.service().rpc('confirm_payment', { p_payment: pay });
  await w.completeAll(deal);
  const net = 20000 - js.fee(20000);
  const first = await w.C.rpc('request_payout', { p_creator: w.creator, p_amount_cents: 10000, p_instant: true });
  assert.equal((await wallet(w)).payouts_pending_cents, 10000);
  assert.equal((await wallet(w)).available_cents, net - 10000);
  assert.equal(await w.db.service().rpc('complete_payout', { p_payout: first, p_paid: false }), true);
  assert.equal((await wallet(w)).available_cents, net, 'a failed payout returns the money and the fee');
  const second = await w.C.rpc('request_payout', { p_creator: w.creator });
  // a webhook that says neither paid nor failed changes nothing (it must not hand the money back)
  assert.equal((await refusal(w.db.service().rpc('complete_payout', { p_payout: second, p_paid: null }))).rule, 'M5');
  assert.equal((await w.db.one('select status from public.payouts where id = $1', [second])).status, 'pending');
  assert.equal(await w.db.service().rpc('complete_payout', { p_payout: second, p_paid: true, p_provider_ref: 'tr_1' }), true);
  assert.equal(await w.db.service().rpc('complete_payout', { p_payout: second, p_paid: false }), false, 'a paid payout stays paid');
  const wl = await wallet(w);
  assert.equal(wl.available_cents, 0);
  assert.equal(wl.paid_out_cents, net);
  assert.equal((await refusal(w.C.rpc('complete_payout', { p_payout: second, p_paid: true }))).code, '42501');

});

dbTest('proof a brand leaves unanswered for 5 days approves itself and releases', async (w) => {
  const deal = await w.deal();
  await w.fund(deal);
  const old = await w.deliver(deal, 1);
  const fresh = await w.deliver(deal, 2);
  await w.db.q("update public.proofs set submitted_at = now() - interval '6 days', review_started_at = now() - interval '5 days 1 minute' where id = $1", [old]);
  assert.equal(await w.db.service().rpc('release_due'), 1);
  assert.equal((await proofRow(w, old)).status, 'released');
  assert.equal((await proofRow(w, fresh)).status, 'in_review');
  assert.equal((await w.events('proof_auto_approved')).length, 1);
  // an undo restarts the 5 days: proof approved and undone on day 5 isn't released by the next scheduler run
  await w.db.q("update public.proofs set submitted_at = now() - interval '5 days', review_started_at = now() - interval '5 days' where id = $1", [fresh]);
  await w.B.rpc('approve_proof', { p_proof: fresh });
  await w.B.rpc('undo_approval', { p_proof: fresh });
  assert.equal(await w.db.service().rpc('release_due'), 0);
  assert.equal((await proofRow(w, fresh)).status, 'in_review');
});
