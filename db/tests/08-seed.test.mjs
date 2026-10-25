// The demo seed is the prototype's starting workspace, to the cent, and the demo can carry on from it.
import assert from 'node:assert/strict';
import { refusal } from './harness.mjs';
import { dbTest, DEMO, js } from './fixtures.mjs';

const money = (w, deal) => w.db.one('select * from public.deal_money where deal_id = $1', [deal]);

dbTest('the seeded deals match the prototype: ULTIMATE PACKAGE Q3, XMAS TEASER DROP, CREATOR SERIES, and HYPERCORE\'s two', async (w) => {
  const sp1 = await money(w, DEMO.sp1);
  assert.deepEqual([sp1.title, sp1.status, sp1.total_cents, sp1.released_cents, sp1.in_escrow_cents, sp1.not_funded_cents],
    ['ULTIMATE PACKAGE Q3', 'in_progress', 450000, 200000, 100000, 150000]);
  const sp1ms = await w.milestones(DEMO.sp1);
  assert.deepEqual(sp1ms.map((m) => [m.label, m.status, m.released_cents]),
    [['June payout', 'released', 150000], ['July payout', 'in_escrow', 50000], ['August payout', 'pending', 0]]);
  const july = await w.db.q(`select d.label, d.status from public.deliverables d where d.milestone_id = $1 order by d.seq`, [sp1ms[1].id]);
  assert.deepEqual(july.map((d) => `${d.label}: ${d.status}`), ['Mid-roll segment #1 (Vortex GPU): done', 'Mid-roll segment #2: in_review',
    'TikTok post #1 (@hypercore): done', 'TikTok post #2: upcoming', 'TikTok post #3: upcoming', 'Hoodie highlight clip: upcoming']);
  const sp2 = await money(w, DEMO.sp2);
  assert.deepEqual([sp2.title, sp2.total_cents, sp2.released_cents, sp2.in_escrow_cents], ['XMAS TEASER DROP', 27450, 9150, 18300]);
  const sp3 = await money(w, DEMO.sp3);
  assert.deepEqual([sp3.total_cents, sp3.released_cents, sp3.in_escrow_cents, sp3.not_funded_cents], [53840, 21536, 21536, 10768]);
  const bx1 = await w.db.one("select dm.* from public.deal_money dm join public.deals d on d.id = dm.deal_id where d.demo_key = 'bx1'");
  assert.deepEqual([bx1.title, bx1.status, bx1.not_funded_cents], ['ROCKET LEAGUE CUP WEEK', 'awaiting_funding', 90000]);
  assert.deepEqual((await w.db.q("select m.amount_cents from public.milestones m join public.deals d on d.id = m.deal_id where d.demo_key = 'bx1' order by m.seq")).map((m) => m.amount_cents), [30000, 30000, 30000]);
  const bx2 = await money(w, DEMO.bx2);
  assert.deepEqual([bx2.title, bx2.status, bx2.released_cents], ['FORTNITE MAP SHOWCASE', 'completed', 120000]);
  // receipts as the prototype lists them: $1,575.00 for July by bank, $1,260.00 for the map showcase by card
  const receipts = await w.db.q(`select d.title, p.method, p.method_label, p.total_cents, p.created_at::date::text as day
                                 from public.payments p join public.deals d on d.id = p.deal_id order by p.created_at`);
  assert.deepEqual(receipts.slice(0, 4).map((r) => [r.title, r.method, r.total_cents, r.day]), [
    ['ULTIMATE PACKAGE Q3', 'card', 157500, '2026-06-01'], ['ULTIMATE PACKAGE Q3', 'bank', 157500, '2026-07-01'],
    ['ORBITAL AUDIO — CREATOR SERIES', 'card', 45226, '2026-08-20'], ['FORTNITE MAP SHOWCASE', 'card', 126000, '2026-09-01']]);
  assert.equal(receipts[1].method_label, 'Chase bank (ACH) •••• 6789');
}, { seed: true });

dbTest('the seeded offers match the prototype, with their time left to reply', async (w) => {
  const offers = await w.db.q(`select b.name as brand, c.display_name as creator, ob.title, ob.status, ob.waiting_on, ob.versions,
                                      ob.amount_cents, round(extract(epoch from ob.expires_at - now()) / 3600, 1)::float as hours
                               from public.offer_board ob join public.brands b on b.id = ob.brand_id
                               join public.creators c on c.id = ob.creator_id where ob.status in ('sent', 'countered') order by hours`);
  assert.deepEqual(offers.map((o) => [o.brand, o.creator, o.title, o.waiting_on, o.versions, o.amount_cents]), [
    ['VOLTEDGE', 'Instant Shock', 'INSTANTSHOCK ULTIMATE SPONSORSHIP PACKAGE', 'creator', 6, 150000],
    ['GRIDFUEL', 'Instant Shock', 'XMAS STREAM LOGO CAMPAIGN', 'creator', 2, 38000],
    ['HYPERCORE', 'FortniteSpartanXYZ', 'FORTNITE SEASON DROP', 'brand', 2, 65000],
    ['HYPERCORE', 'Testy', 'CS2 LAUNCH STREAM', 'creator', 1, 50000],
  ]);
  for (const [o, h] of offers.map((o, i) => [o, [3.4, 11.2, 18, 22][i]])) assert.ok(Math.abs(o.hours - h) < 0.2, `${o.title}: ${o.hours}h`);
  const v = await w.db.q(`select v.by_side, v.amount_cents from public.offer_versions v join public.offers o on o.id = v.offer_id
                          where o.title = 'INSTANTSHOCK ULTIMATE SPONSORSHIP PACKAGE' order by v.version`);
  assert.deepEqual(v.map((x) => [x.by_side, x.amount_cents]), [['creator', 150000], ['brand', 150000], ['creator', 165000],
    ['brand', 148000], ['creator', 155000], ['brand', 150000]]);
  const closed = await w.db.q("select title, status, close_reason from public.offers where status not in ('sent', 'countered') order by title");
  assert.deepEqual(closed.map((o) => [o.title, o.status, o.close_reason]),
    [['MINECRAFT BUILD NIGHT', 'declined', 'schedule conflict'], ['ROCKET LEAGUE CUP WEEK', 'accepted', null]]);
  assert.equal((await w.db.q('select count(*)::int as n from public.packages'))[0].n, 5);
}, { seed: true });

dbTest('the demo carries on from the seed: approve the July proof, fund August, deliver; every figure follows', async (w) => {
  const proof = (await w.db.one("select id from public.proofs where status = 'in_review'")).id;
  await w.demo.rpc('approve_proof', { p_proof: proof, p_undo_seconds: 0 });
  const sp1 = await money(w, DEMO.sp1);
  assert.equal(sp1.released_cents, 225000);
  assert.equal(sp1.in_escrow_cents, 75000);
  // Instant Shock's wallet: every release so far, less the 5% fee per deal on its running total
  const [wallet] = await w.demo.query('select * from public.creator_wallet');
  const gross = { sp1: 225000, sp2: 9150, sp3: 21536 };
  const net = Object.values(gross).reduce((a, g) => a + g - js.fee(g), 0);
  assert.equal(wallet.available_cents, net);
  assert.equal(wallet.in_escrow_cents, 75000 + 18300 + 21536);
  // HYPERCORE funds August by wire; the creator can't deliver August until it arrives
  const august = (await w.milestones(DEMO.sp1))[2];
  const wire = await w.manager.rpc('fund_milestones', { p_deal: DEMO.sp1, p_method: 'wire', p_milestones: [august.id] });
  const dl = (await w.db.q('select id from public.deliverables where milestone_id = $1 order by seq', [august.id]))[0];
  assert.equal((await refusal(w.demo.rpc('submit_proof', { p_deliverable: dl.id, p_link_url: 'https://x.test/aug' }))).rule, 'E6');
  await w.manager.rpc('simulate_payment', { p_payment: wire });
  await w.demo.rpc('submit_proof', { p_deliverable: dl.id, p_link_url: 'https://x.test/aug' });
  // and the demo user can answer VOLTEDGE's v6 from the creator seat
  const v6 = (await w.db.one("select id from public.offers where title = 'INSTANTSHOCK ULTIMATE SPONSORSHIP PACKAGE'")).id;
  const deal = await w.demo.rpc('accept_offer', { p_offer: v6, p_as: 'creator' });
  assert.deepEqual((await w.milestones(deal)).map((m) => m.amount_cents), [37500, 37500, 37500, 37500]);
}, { seed: true });

dbTest('the demo accounts sign in with the demo password', async (w) => {
  const rows = await w.db.q("select email, encrypted_password = extensions.crypt('gamein-demo', encrypted_password) as ok from auth.users where email like '%.test' order by email");
  assert.equal(rows.length, 7);
  assert.ok(rows.every((r) => r.ok));
  assert.equal((await w.db.q("select count(*)::int as n from auth.identities where provider = 'email'"))[0].n, 7);
  assert.equal((await w.demo.query('select count(*)::int as n from public.notifications where read_at is null'))[0].n, 0);
}, { seed: true });
