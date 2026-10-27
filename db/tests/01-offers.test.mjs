// Offers: O1-O11, K1 (packages) and R5 (book again), from both seats, including every blocked move.
import assert from 'node:assert/strict';
import { refusal } from './harness.mjs';
import { dbTest, ITEMS3, js } from './fixtures.mjs';

const hoursLeft = (o) => (new Date(o.expires_at) - Date.now()) / 3600e3;

dbTest('O1: a brand sends an offer; the creator sees it waiting on them, with a 24-hour window', async (w) => {
  const offer = await w.offer({ amount: 50000 });
  const seen = await w.C.query('select * from public.offer_board where id = $1', [offer]);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].status, 'sent');
  assert.equal(seen[0].waiting_on, 'creator');
  assert.equal(seen[0].amount_cents, 50000);
  assert.deepEqual(seen[0].items, ITEMS3);
  assert.ok(Math.abs(hoursLeft(seen[0]) - 24) < 0.1);
  assert.deepEqual((await w.C.query("select kind from public.todos where side = 'creator'")).map((r) => r.kind), ['answer_offer']);
  assert.deepEqual(await w.B.query("select kind from public.todos where side = 'brand'"), []);
  const notes = await w.C.query('select kind from public.notifications');
  assert.deepEqual(notes.map((n) => n.kind), ['offer_sent']);
  assert.equal((await w.B.query('select count(*)::int as n from public.notifications'))[0].n, 0);
});

dbTest('O1: from a campaign the creator gets 48 hours, and the shortlist links the offer', async (w) => {
  const [{ id: campaign }] = await w.B.query(
    `insert into public.campaigns (brand_id, title, budget_cents, items) values ($1, 'Holiday push', 150000, $2) returning id`,
    [w.brand, ITEMS3]);
  const offer = await w.B.rpc('send_offer', { p_brand: w.brand, p_creator: w.creator, p_title: 'Holiday stream week',
    p_amount_cents: 45000, p_items: ITEMS3, p_campaign: campaign });
  const o = await w.offerRow(offer);
  assert.equal(o.source, 'campaign');
  assert.ok(Math.abs(hoursLeft(o) - 48) < 0.1);
  const [s] = await w.B.query('select offer_id from public.campaign_shortlist where campaign_id = $1', [campaign]);
  assert.equal(s.offer_id, offer);
  // someone else's campaign can't be used
  const r = await refusal(w.X.rpc('send_offer', { p_brand: w.otherBrand, p_creator: w.creator, p_title: 'x',
    p_amount_cents: 100, p_items: ITEMS3, p_campaign: campaign }));
  assert.equal(r.rule, 'O1');
});

dbTest('K1: the creator\'s own packages are what brands book, one deliverable per module', async (w) => {
  const items = [{ label: 'Streaming: logo placement', days: 14 }, { label: 'Merch: jersey wear', days: 30 }];
  const [{ id: pkg }] = await w.C.query(
    `insert into public.packages (creator_id, code, title, price_cents, items) values ($1, 'SO9', 'BUNDLE', 72999, $2) returning id`,
    [w.creator, items]);
  // brands see it in the marketplace, visitors too
  assert.equal((await w.B.query('select count(*)::int as n from public.packages where id = $1', [pkg]))[0].n, 1);
  assert.equal((await w.db.anon().query('select count(*)::int as n from public.packages where id = $1', [pkg]))[0].n, 1);
  const offer = await w.B.rpc('book_package', { p_brand: w.brand, p_package: pkg });
  const [o] = await w.C.query('select * from public.offer_board where id = $1', [offer]);
  assert.equal(o.source, 'package');
  assert.equal(o.amount_cents, 72999);
  assert.deepEqual(o.items, items);
  assert.equal(o.waiting_on, 'creator');
  // booking says the price the brand saw: a price changed in the meantime is refused, not booked
  await w.C.query('update public.packages set price_cents = 79999 where id = $1', [pkg]);
  const changed = await refusal(w.B.rpc('book_package', { p_brand: w.brand, p_package: pkg, p_expected_price_cents: 72999 }));
  assert.equal(changed.rule, 'K1');
  assert.match(changed.message, /\$799\.99/);
  assert.ok(await w.B.rpc('book_package', { p_brand: w.brand, p_package: pkg, p_expected_price_cents: 79999 }));
  // a package taken off sale can't be booked, and nobody else can add packages to this creator
  await w.C.query('update public.packages set active = false where id = $1', [pkg]);
  assert.equal((await w.B.query('select count(*)::int as n from public.packages where id = $1', [pkg]))[0].n, 0);
  assert.equal((await refusal(w.B.rpc('book_package', { p_brand: w.brand, p_package: pkg }))).rule, 'K1');
  const denied = await refusal(w.X.query(
    `insert into public.packages (creator_id, title, price_cents, items) values ($1, 'FAKE', 100, $2)`, [w.creator, items]));
  assert.equal(denied.code, '42501');
});

dbTest('O2: a creator pitches a package from a brand\'s profile; the brand has 72 hours', async (w) => {
  const [{ id: pkg }] = await w.C.query(
    `insert into public.packages (creator_id, title, price_cents, items) values ($1, 'VIDEO: 2x BRAND INTEGRATION', 29999, $2) returning id`,
    [w.creator, [{ label: 'Video: 2x brand integration', days: 30 }]]);
  const offer = await w.C.rpc('pitch_offer', { p_creator: w.creator, p_brand: w.brand, p_package: pkg });
  const [o] = await w.B.query('select * from public.offer_board where id = $1', [offer]);
  assert.equal(o.status, 'countered');
  assert.equal(o.waiting_on, 'brand');
  assert.equal(o.amount_cents, 29999);
  assert.equal(o.source, 'pitch');
  assert.ok(Math.abs(hoursLeft(o) - 72) < 0.1);
  assert.deepEqual((await w.B.query("select kind from public.todos where side = 'brand'")).map((r) => r.kind), ['answer_pitch']);
  // a package that isn't yours can't be pitched
  assert.equal((await refusal(w.X.rpc('pitch_offer', { p_creator: w.otherCreator, p_brand: w.brand, p_package: pkg }))).rule, 'K1');
});

dbTest('O3, O4: counters add versions, alternate sides and restart the 24-hour window', async (w) => {
  const offer = await w.offer({ amount: 80000 });
  await w.db.q("update public.offers set expires_at = now() + interval '2 hours' where id = $1", [offer]);
  const items2 = ITEMS3.slice(0, 2);
  assert.equal(await w.C.rpc('counter_offer', { p_offer: offer, p_as: 'creator', p_amount_cents: 65000, p_items: items2,
    p_note: 'Two posts for $650?' }), 2);
  let [o] = await w.B.query('select * from public.offer_board where id = $1', [offer]);
  assert.equal(o.status, 'countered');
  assert.equal(o.waiting_on, 'brand');
  assert.equal(o.amount_cents, 65000);
  assert.equal(o.previous_amount_cents, 80000);
  assert.deepEqual(o.items, items2);
  assert.ok(Math.abs(hoursLeft(o) - 24) < 0.1, 'the window restarts');
  assert.deepEqual((await w.B.query("select kind from public.todos where side = 'brand'")).map((r) => r.kind), ['answer_counter']);
  assert.equal(await w.B.rpc('counter_offer', { p_offer: offer, p_as: 'brand', p_amount_cents: 72000 }), 3);
  [o] = await w.C.query('select * from public.offer_board where id = $1', [offer]);
  assert.equal(o.status, 'sent');
  assert.equal(o.waiting_on, 'creator');
  assert.deepEqual(o.items, items2, 'a counter without items keeps the last version\'s');
  const versions = await w.C.query('select version, by_side, amount_cents from public.offer_versions where offer_id = $1 order by version', [offer]);
  assert.deepEqual(versions.map((v) => [v.version, v.by_side, v.amount_cents]),
    [[1, 'brand', 80000], [2, 'creator', 65000], [3, 'brand', 72000]]);
});

dbTest('O5: accepting the other side\'s latest version makes the deal, one milestone per deliverable, split to the cent', async (w) => {
  const offer = await w.offer({ amount: 100001 });
  await w.C.rpc('counter_offer', { p_offer: offer, p_as: 'creator', p_amount_cents: 53840 });
  const deal = await w.B.rpc('accept_offer', { p_offer: offer, p_as: 'brand' });
  const o = await w.offerRow(offer);
  assert.equal(o.status, 'accepted');
  assert.equal(o.deal_id, deal);
  assert.equal(o.accepted_by_side, 'brand');
  const [d] = await w.C.query('select * from public.deals where id = $1', [deal]);
  assert.equal(d.status, 'awaiting_funding');
  assert.equal(d.amount_cents, 53840);
  const ms = await w.milestones(deal);
  assert.deepEqual(ms.map((m) => m.amount_cents), js.split(53840, 3));
  assert.deepEqual(ms.map((m) => m.label), ITEMS3.map((i) => i.label));
  assert.ok(ms.every((m) => m.status === 'pending'));
  const dls = await w.deliverables(deal);
  assert.deepEqual(dls.map((x) => [x.milestone_id, x.amount_cents]), ms.map((m) => [m.id, m.amount_cents]));
  assert.equal((await w.events('offer_accepted')).length, 1);
});

dbTest('O6: declining closes the offer, says who declined, and the conversation stays open', async (w) => {
  const offer = await w.offer();
  await w.C.rpc('decline_offer', { p_offer: offer, p_as: 'creator', p_reason: 'schedule conflict' });
  const o = await w.offerRow(offer);
  assert.equal(o.status, 'declined');
  assert.equal(o.closed_by_side, 'creator');
  assert.equal(o.close_reason, 'schedule conflict');
  await w.C.rpc('send_message', { p_brand: w.brand, p_creator: w.creator, p_as: 'creator', p_body: 'Maybe next month?' });
  assert.equal((await w.B.query('select count(*)::int as n from public.messages'))[0].n, 1);
  // the brand can't decline its own version
  const o2 = await w.offer();
  assert.equal((await refusal(w.B.rpc('decline_offer', { p_offer: o2, p_as: 'brand' }))).rule, 'O9');
});

dbTest('O7: the brand withdraws an offer waiting on the creator, not one the creator answered', async (w) => {
  const offer = await w.offer();
  await w.B.rpc('withdraw_offer', { p_offer: offer, p_as: 'brand' });
  assert.equal((await w.offerRow(offer)).status, 'withdrawn');
  const o2 = await w.offer();
  await w.C.rpc('counter_offer', { p_offer: o2, p_as: 'creator', p_amount_cents: 120000 });
  const r = await refusal(w.B.rpc('withdraw_offer', { p_offer: o2, p_as: 'brand' }));
  assert.equal(r.rule, 'O7');
  assert.match(r.message, /already replied/);
  // the creator can take back their own counter (a decision to confirm: the prototype has no button for it)
  await w.C.rpc('withdraw_offer', { p_offer: o2, p_as: 'creator' });
  assert.equal((await w.offerRow(o2)).status, 'withdrawn');
});

dbTest('O8: an offer not answered in its window expires; nobody can act on it; a new one can be sent', async (w) => {
  const offer = await w.offer();
  await w.expire(offer);
  const [shown] = await w.C.query('select status, waiting_on from public.offer_board where id = $1', [offer]);
  assert.deepEqual(shown, { status: 'expired', waiting_on: null });
  assert.deepEqual(await w.C.query('select * from public.todos'), []);
  for (const [fn, args] of [
    ['accept_offer', { p_as: 'creator' }], ['counter_offer', { p_as: 'creator', p_amount_cents: 5 }],
    ['decline_offer', { p_as: 'creator' }],
  ]) {
    assert.equal((await refusal(w.C.rpc(fn, { p_offer: offer, ...args }))).rule, 'O8', fn);
  }
  assert.equal((await refusal(w.B.rpc('withdraw_offer', { p_offer: offer, p_as: 'brand' }))).rule, 'O8');
  assert.equal(await w.db.service().rpc('expire_offers'), 1);
  assert.equal((await w.offerRow(offer)).status, 'expired');
  assert.equal((await w.events('offer_expired')).length, 1);
  assert.equal(await w.db.service().rpc('expire_offers'), 0);
  const again = await w.offer();
  assert.equal((await w.offerRow(again)).status, 'sent');
});

dbTest('O9: nobody can accept or counter their own latest version', async (w) => {
  const offer = await w.offer();
  assert.equal((await refusal(w.B.rpc('accept_offer', { p_offer: offer, p_as: 'brand' }))).rule, 'O9');
  assert.equal((await refusal(w.B.rpc('counter_offer', { p_offer: offer, p_as: 'brand', p_amount_cents: 1000 }))).rule, 'O9');
  await w.C.rpc('counter_offer', { p_offer: offer, p_as: 'creator', p_amount_cents: 110000 });
  const r = await refusal(w.C.rpc('accept_offer', { p_offer: offer, p_as: 'creator' }));
  assert.equal(r.rule, 'O9');
  assert.match(r.message, /waiting on the brand/);
});

dbTest('O10: at most 8 changes to an offer; then only accept or decline', async (w) => {
  const offer = await w.offer({ amount: 10000 });
  for (let v = 2; v <= 9; v++) {
    const side = v % 2 === 0 ? 'creator' : 'brand';
    const actor = side === 'creator' ? w.C : w.B;
    assert.equal(await actor.rpc('counter_offer', { p_offer: offer, p_as: side, p_amount_cents: 10000 + v }), v);
  }
  const [o] = await w.C.query('select versions, changes_left, waiting_on from public.offer_board where id = $1', [offer]);
  assert.deepEqual(o, { versions: 9, changes_left: 0, waiting_on: 'creator' });
  const r = await refusal(w.C.rpc('counter_offer', { p_offer: offer, p_as: 'creator', p_amount_cents: 5 }));
  assert.equal(r.rule, 'O10');
  assert.match(r.message, /8 of 8/);
  const deal = await w.C.rpc('accept_offer', { p_offer: offer, p_as: 'creator' });
  assert.equal((await w.money(deal)).total_cents, 10009);
});

dbTest('O11: closed offers (accepted, declined, withdrawn) can\'t be acted on', async (w) => {
  const accepted = await w.offer();
  await w.C.rpc('accept_offer', { p_offer: accepted, p_as: 'creator' });
  const declined = await w.offer();
  await w.C.rpc('decline_offer', { p_offer: declined, p_as: 'creator' });
  const withdrawn = await w.offer();
  await w.B.rpc('withdraw_offer', { p_offer: withdrawn, p_as: 'brand' });
  for (const offer of [accepted, declined, withdrawn]) {
    for (const [fn, args] of [['accept_offer', {}], ['counter_offer', { p_amount_cents: 999 }], ['decline_offer', {}]]) {
      const r = await refusal(w.C.rpc(fn, { p_offer: offer, p_as: 'creator', ...args }));
      assert.equal(r.rule, 'O11', fn);
      assert.match(r.message, /no longer open/);
    }
    assert.equal((await refusal(w.B.rpc('withdraw_offer', { p_offer: offer, p_as: 'brand' }))).rule, 'O11');
  }
  assert.equal((await w.db.q('select count(*)::int as n from public.deals'))[0].n, 1, 'one deal, for the accepted offer only');
});

dbTest('offers: only the two parties can act, each only from their own seat', async (w) => {
  const offer = await w.offer();
  let r = await refusal(w.X.rpc('accept_offer', { p_offer: offer, p_as: 'creator' }));
  assert.equal(r.code, '42501');
  r = await refusal(w.X.rpc('counter_offer', { p_offer: offer, p_as: 'brand', p_amount_cents: 1 }));
  assert.equal(r.code, '42501');
  r = await refusal(w.B.rpc('accept_offer', { p_offer: offer, p_as: 'creator' }));
  assert.equal(r.code, '42501', 'the brand manager isn\'t the creator');
  r = await refusal(w.X.rpc('send_offer', { p_brand: w.brand, p_creator: w.creator, p_title: 'x', p_amount_cents: 100, p_items: ITEMS3 }));
  assert.equal(r.code, '42501', 'only the brand\'s people send its offers');
  r = await refusal(w.db.anon().rpc('send_offer', { p_brand: w.brand, p_creator: w.creator, p_title: 'x', p_amount_cents: 100, p_items: ITEMS3 }));
  assert.equal(r.code, '42501');
  assert.equal((await w.X.query('select count(*)::int as n from public.offers'))[0].n, 0, 'an outsider sees no offers');
});

dbTest('offers: terms are checked: an amount above $0, 1 to 20 named deliverables, a cent for each', async (w) => {
  const send = (amount, items, title = 'Deal') => w.B.rpc('send_offer', { p_brand: w.brand, p_creator: w.creator, p_title: title, p_amount_cents: amount, p_items: items });
  assert.equal((await refusal(send(0, ITEMS3))).rule, 'M1');
  assert.equal((await refusal(send(-5, ITEMS3))).rule, 'M1');
  assert.equal((await refusal(send(100, []))).rule, 'K1');
  assert.equal((await refusal(send(100, [{ label: '' }]))).rule, 'K1');
  assert.equal((await refusal(send(10000, Array.from({ length: 21 }, (_, i) => ({ label: 'D' + i }))))).rule, 'K1');
  assert.equal((await refusal(send(2, ITEMS3))).rule, 'M1');
  assert.equal((await refusal(send(100, ITEMS3, '   '))).rule, 'O1');
  assert.equal((await refusal(send(1_000_000_001, ITEMS3))).rule, 'M1', 'one offer is at most $10,000,000');
  assert.ok(await send(1_000_000_000, ITEMS3));
  const ok = await send(3, ITEMS3);
  const deal = await w.C.rpc('accept_offer', { p_offer: ok, p_as: 'creator' });
  assert.deepEqual((await w.milestones(deal)).map((m) => m.amount_cents), [1, 1, 1]);
});

dbTest('R5: book again sends the same package as a pitch, once the deal is complete, one open pitch at a time', async (w) => {
  const deal = await w.deal({ amount: 90000 });
  assert.equal((await refusal(w.C.rpc('book_again', { p_deal: deal }))).rule, 'R5');
  await w.fund(deal);
  await w.completeAll(deal);
  const pitch = await w.C.rpc('book_again', { p_deal: deal });
  const [o] = await w.B.query('select * from public.offer_board where id = $1', [pitch]);
  assert.equal(o.status, 'countered');
  assert.equal(o.waiting_on, 'brand');
  assert.equal(o.source, 'book_again');
  assert.equal(o.amount_cents, 90000);
  assert.deepEqual(o.items, ITEMS3);
  assert.equal(o.previous_deal_id, deal);
  const r = await refusal(w.C.rpc('book_again', { p_deal: deal }));
  assert.equal(r.rule, 'R5');
  assert.match(r.message, /already sent/);
  const expiredBefore = (await w.events('offer_expired')).length;
  // the brand can't book again for the creator, and an outsider can't either
  assert.equal((await refusal(w.B.rpc('book_again', { p_deal: deal }))).code, '42501');
  // once that pitch is answered (or its window passes), another can go
  await w.B.rpc('decline_offer', { p_offer: pitch, p_as: 'brand' });
  const second = await w.C.rpc('book_again', { p_deal: deal });
  await w.expire(second);
  const third = await w.C.rpc('book_again', { p_deal: deal });
  assert.equal((await w.offerRow(second)).status, 'expired');
  assert.equal((await w.offerRow(third)).status, 'countered');
  assert.equal((await w.events('offer_expired')).length, expiredBefore + 1, 'the expired pitch has its event');
});
