// Renewals (R1-R4) on monthly and one-time deals, and ratings (T1, T2).
import assert from 'node:assert/strict';
import { refusal } from './harness.mjs';
import { dbTest, js } from './fixtures.mjs';

// a monthly deal like the prototype's ULTIMATE PACKAGE: $1,500 a month for June to August, six deliverables a month
async function monthly(w) {
  await w.db.q('begin');  // a milestone and its deliverables arrive together (their shares are checked at commit)
  const deal = (await w.db.one(`insert into public.deals (brand_id, creator_id, title, type, amount_cents, starts_on, ends_on)
                                values ($1, $2, 'ULTIMATE PACKAGE Q3', 'monthly', 450000, '2026-06-01', '2026-08-31') returning id`,
                               [w.brand, w.creator])).id;
  const months = [['JUNE', '2026-06-01', '2026-06-30'], ['JULY', '2026-07-01', '2026-07-31'], ['AUGUST', '2026-08-01', '2026-08-31']];
  const labels = ['Mid-roll segment #1', 'Mid-roll segment #2', 'TikTok post #1', 'TikTok post #2', 'TikTok post #3', 'Hoodie highlight clip'];
  let seq = 0;
  for (let i = 0; i < 3; i++) {
    const [name, start, end] = months[i];
    const period = (await w.db.one('insert into public.deal_periods (deal_id, seq, label, starts_on, ends_on) values ($1, $2, $3, $4, $5) returning id',
      [deal, i + 1, name, start, end])).id;
    const ms = (await w.db.one(`insert into public.milestones (deal_id, seq, label, due_on, amount_cents, period_id)
                                values ($1, $2, $3, $4, 150000, $5) returning id`, [deal, i + 1, name + ' payout', end, period])).id;
    for (let k = 0; k < 6; k++) {
      await w.db.q(`insert into public.deliverables (deal_id, milestone_id, seq, label, due_on, amount_cents)
                    values ($1, $2, $3, $4, $5::date + $6::int, 25000)`, [deal, ms, ++seq, labels[k], start, 7 + k * 3]);
    }
  }
  await w.db.q('commit');
  return deal;
}

dbTest('R1: the brand offers a renewal on a monthly deal; the creator sees it waiting on them', async (w) => {
  const deal = await monthly(w);
  const ren = await w.B.rpc('offer_renewal', { p_deal: deal, p_months: 3, p_price_cents: 160000, p_auto_renew: true });
  const [r] = await w.C.query('select status, by_side, months, price_cents, auto_renew from public.renewals where id = $1', [ren]);
  assert.deepEqual(r, { status: 'sent', by_side: 'brand', months: 3, price_cents: 160000, auto_renew: true });
  assert.deepEqual((await w.C.query("select kind from public.todos where side = 'creator'")).map((t) => t.kind), ['answer_renewal']);
  let x = await refusal(w.B.rpc('offer_renewal', { p_deal: deal, p_months: 1, p_price_cents: 1000 }));
  assert.equal(x.rule, 'R1');
  assert.match(x.message, /already open/);
  x = await refusal(w.C.rpc('request_renewal', { p_deal: deal }));
  assert.equal(x.rule, 'R2');
  assert.match(x.message, /already offered/);
  assert.equal((await refusal(w.C.rpc('offer_renewal', { p_deal: deal, p_months: 3, p_price_cents: 1 }))).code, '42501');
  for (const [months, price] of [[0, 1000], [25, 1000], [3, 0], [3, 5]]) {
    const d2 = await monthly(w);
    const r2 = await refusal(w.B.rpc('offer_renewal', { p_deal: d2, p_months: months, p_price_cents: price }));
    assert.ok(['R1', 'M1'].includes(r2.rule), `${months} months at ${price}`);
  }
});

dbTest('R2: the creator asks to renew, by default the same terms for 3 more months', async (w) => {
  const deal = await monthly(w);
  const ren = await w.C.rpc('request_renewal', { p_deal: deal });
  const [r] = await w.B.query('select status, by_side, months, price_cents from public.renewals where id = $1', [ren]);
  assert.deepEqual(r, { status: 'requested', by_side: 'creator', months: 3, price_cents: 150000 });
  assert.deepEqual((await w.B.query("select kind from public.todos where side = 'brand'")).map((t) => t.kind), ['answer_renewal']);
  const x = await refusal(w.C.rpc('request_renewal', { p_deal: deal }));
  assert.equal(x.rule, 'R2');
  assert.match(x.message, /already sent/);
});

dbTest('R3: accepting adds the new months as milestones to fund, with the same deliverables again', async (w) => {
  const deal = await monthly(w);
  const ren = await w.B.rpc('offer_renewal', { p_deal: deal, p_months: 2, p_price_cents: 100001 });
  await w.C.rpc('answer_renewal', { p_renewal: ren, p_as: 'creator', p_accept: true });
  const ms = await w.milestones(deal);
  assert.equal(ms.length, 5);
  assert.deepEqual(ms.slice(3).map((m) => [m.label, m.amount_cents, m.status, m.renewal_id]),
    [['September payout', 100001, 'pending', ren], ['October payout', 100001, 'pending', ren]]);
  const periods = await w.db.q('select label, starts_on::text, ends_on::text from public.deal_periods where deal_id = $1 order by seq', [deal]);
  assert.deepEqual(periods.slice(3), [
    { label: 'SEPTEMBER', starts_on: '2026-09-01', ends_on: '2026-09-30' },
    { label: 'OCTOBER', starts_on: '2026-10-01', ends_on: '2026-10-31' },
  ]);
  const sept = await w.db.q('select label, amount_cents, due_on::text from public.deliverables where milestone_id = $1 order by seq', [ms[3].id]);
  assert.deepEqual(sept.map((d) => d.label), ['Mid-roll segment #1', 'Mid-roll segment #2', 'TikTok post #1', 'TikTok post #2', 'TikTok post #3', 'Hoodie highlight clip']);
  assert.deepEqual(sept.map((d) => d.amount_cents), js.split(100001, 6));
  assert.deepEqual(sept.map((d) => d.due_on), ['2026-09-08', '2026-09-11', '2026-09-14', '2026-09-17', '2026-09-20', '2026-09-23'],
    'each deliverable keeps its place in the month');
  const [d] = await w.db.q('select amount_cents, ends_on::text from public.deals where id = $1', [deal]);
  assert.deepEqual(d, { amount_cents: 450000, ends_on: '2026-10-31' }, 'the agreed amount stays; the renewal adds its own milestones');
  assert.equal((await w.money(deal)).total_cents, 450000 + 2 * 100001);
  // the new months fund and pay like any other
  await w.B.rpc('fund_milestones', { p_deal: deal, p_method: 'card', p_milestones: [ms[3].id] });
  const dl = (await w.deliverables(deal)).find((x) => x.milestone_id === ms[3].id);
  const proof = await w.C.rpc('submit_proof', { p_deliverable: dl.id, p_link_url: 'https://x.test/sept' });
  await w.release(proof);
  assert.equal((await w.money(deal)).released_cents, dl.amount_cents);
});

dbTest('R3: renewing a one-time deal adds one more period with its deliverables, and reopens a finished deal', async (w) => {
  const deal = await w.deal({ amount: 90000 });
  await w.fund(deal);
  await w.completeAll(deal);
  assert.equal((await refusal(w.B.rpc('offer_renewal', { p_deal: deal, p_months: 2, p_price_cents: 90000 }))).rule, 'R1');
  const ren = await w.C.rpc('request_renewal', { p_deal: deal });
  const [r] = await w.db.q('select months, price_cents from public.renewals where id = $1', [ren]);
  assert.deepEqual(r, { months: 1, price_cents: 90000 });
  await w.B.rpc('answer_renewal', { p_renewal: ren, p_as: 'brand', p_accept: true });
  const ms = await w.milestones(deal);
  assert.equal(ms.length, 4);
  assert.equal(ms[3].label, 'Renewal 1');
  assert.equal(ms[3].amount_cents, 90000);
  const dls = await w.db.q('select label, amount_cents from public.deliverables where milestone_id = $1 order by seq', [ms[3].id]);
  assert.deepEqual(dls.map((x) => x.amount_cents), [30000, 30000, 30000]);
  assert.equal((await w.money(deal)).status, 'in_progress', 'the deal has new work to fund');
  await w.fund(deal);
  await w.completeAll(deal);
  assert.equal((await w.money(deal)).status, 'completed');
});

dbTest('R4: declining or withdrawing; each renewal is answered once, by the other side', async (w) => {
  const deal = await monthly(w);
  const ren = await w.B.rpc('offer_renewal', { p_deal: deal, p_months: 1, p_price_cents: 150000 });
  let x = await refusal(w.B.rpc('answer_renewal', { p_renewal: ren, p_as: 'brand', p_accept: true }));
  assert.equal(x.rule, 'R4');
  assert.match(x.message, /waiting on the creator/);
  assert.equal((await refusal(w.C.rpc('withdraw_renewal', { p_renewal: ren, p_as: 'creator' }))).rule, 'R4');
  await w.C.rpc('answer_renewal', { p_renewal: ren, p_as: 'creator', p_accept: false });
  x = await refusal(w.C.rpc('answer_renewal', { p_renewal: ren, p_as: 'creator', p_accept: true }));
  assert.equal(x.rule, 'R4');
  assert.match(x.message, /already declined/);
  assert.equal((await w.milestones(deal)).length, 3, 'a declined renewal adds nothing');
  // a new one can be sent, and withdrawn by whoever sent it
  const again = await w.B.rpc('offer_renewal', { p_deal: deal, p_months: 1, p_price_cents: 150000 });
  await w.B.rpc('withdraw_renewal', { p_renewal: again, p_as: 'brand' });
  assert.equal((await refusal(w.C.rpc('answer_renewal', { p_renewal: again, p_as: 'creator', p_accept: true }))).rule, 'R4');
  const req = await w.C.rpc('request_renewal', { p_deal: deal, p_months: 6, p_price_cents: 140000 });
  await w.C.rpc('withdraw_renewal', { p_renewal: req, p_as: 'creator' });
  const statuses = await w.db.q('select status from public.renewals where deal_id = $1 order by created_at', [deal]);
  assert.deepEqual(statuses.map((s) => s.status), ['declined', 'withdrawn', 'withdrawn']);
  assert.equal((await refusal(w.X.rpc('offer_renewal', { p_deal: deal, p_months: 1, p_price_cents: 1000 }))).code, '42501');
});

dbTest('T1, T2: each side rates the other once, after completion; the rating shows in the conversation', async (w) => {
  const deal = await w.deal();
  assert.equal((await refusal(w.B.rpc('rate_deal', { p_deal: deal, p_as: 'brand', p_score: 5 }))).rule, 'T1');
  await w.fund(deal);
  await w.completeAll(deal);
  await w.B.rpc('rate_deal', { p_deal: deal, p_as: 'brand', p_score: 5, p_comment: 'Great stream' });
  await w.C.rpc('rate_deal', { p_deal: deal, p_as: 'creator', p_score: 4 });
  assert.equal((await refusal(w.B.rpc('rate_deal', { p_deal: deal, p_as: 'brand', p_score: 1 }))).rule, 'T1');
  assert.equal((await refusal(w.C.rpc('rate_deal', { p_deal: deal, p_as: 'creator', p_score: 6 }))).rule, 'T1');
  assert.equal((await refusal(w.C.rpc('rate_deal', { p_deal: deal, p_as: 'brand', p_score: 3 }))).code, '42501');
  const ratings = await w.C.query('select by_side, score from public.ratings order by by_side');
  assert.deepEqual(ratings, [{ by_side: 'brand', score: 5 }, { by_side: 'creator', score: 4 }]);
  const lines = await w.C.query("select side, data from public.conversation_timeline where kind = 'deal_rated' order by at");
  assert.deepEqual(lines.map((l) => [l.side, l.data.score]), [['brand', 5], ['creator', 4]]);
});
