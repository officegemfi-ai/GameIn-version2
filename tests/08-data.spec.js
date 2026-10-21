// Saved data: everything survives a reload (the seeded deals included), two tabs stay in step without
// overwriting each other, and reset demo really starts fresh.
const { test, expect } = require('@playwright/test');
const A = require('./support/app');

// a second tab in the same browser, with its own list of page errors
async function secondTab(context) {
  const t = await context.newPage();
  t.__errors = [];
  t.on('pageerror', e => t.__errors.push(String((e && e.message) || e)));
  await t.goto(A.PAGE);
  await A.enterDemo(t);
  return t;
}

// Two tabs act at the same moment. Each is held back from the other's saves (as the browser does while a tab is
// writing), so both actions go through and the second save overwrites the first in storage. Then both catch up: the
// tab whose save was overwritten merges the two and saves again. Each tab also sends a message in the same moment.
async function sameMoment(first, second, doFirst, doSecond) {
  await A.api(first, 'me');
  await A.api(second, 'me');
  await A.api(first, 'hold', true);
  await A.api(second, 'hold', true);
  const a = await doFirst(first);
  await A.api(first, 'say', 'b3', 'creator', 'sent from the first tab');
  const b = await doSecond(second);
  await A.api(second, 'say', 'b3', 'brand', 'sent from the second tab');
  await A.api(first, 'hold', false);
  await A.api(second, 'hold', false);
  await first.waitForTimeout(300);
  return [a, b];
}

// what both tabs must agree on afterwards, and what's saved
const VIEW = () => ({
  offers: GameInBX.S.offers.map(o => [o.id, o.status, o.versions.length, o.dealId || '']),
  deals: GameInBX.S.deals.map(d => [d.id, d.amount, d.fromOffer || '']),
  esc: GameInBX.S.esc, inv: GameInBX.S.inv, ren: GameInBX.S.ren,
  proofs: GameInBX.S.proofs.map(p => [p.id, p.status, p.value, p.relAt || 0, p.releaseAt || 0]),
  loop: GameInLoop.S.proofs.map(p => [p.id, p.status, p.value, p.relAt || 0]),
  msgs: (GameInBX.S.cmsg.b3 || []).map(m => m.t),
});
// wait until every tab has taken in the others' saves (a storage event can land a moment later), then: the rules hold in every
// tab and they all show the same state
async function settled(tabs, timeout = 5000) {
  const t0 = Date.now();
  let views;
  for (;;) {
    views = [];
    for (const t of tabs) { await A.api(t, 'me'); views.push(await t.evaluate(VIEW)); }
    if (views.every(v => JSON.stringify(v) === JSON.stringify(views[0])) || Date.now() - t0 > timeout) break;
    await tabs[0].waitForTimeout(200);
  }
  for (const t of tabs) expect(await A.rulesHold(t), 'the rules hold in every tab').toEqual([]);
  views.slice(1).forEach(v => expect(v, 'both tabs show the same state').toEqual(views[0]));
  return views[0];
}
async function inStep(tabs) {
  const views = [await settled(tabs)];
  const saved = await tabs[0].evaluate(() => { const s = JSON.parse(localStorage.getItem('gib-bx')), l = JSON.parse(localStorage.getItem('gib-loop') || '{"proofs":[]}');
    return { offers: s.offers.length, deals: s.deals.length, inv: s.inv.length, esc: Object.keys(s.esc).length, proofs: s.proofs.length, loop: l.proofs.length }; });
  const v = views[0];
  expect(saved, 'what is saved is what the tabs show').toEqual({ offers: v.offers.length, deals: v.deals.length, inv: v.inv.length, esc: Object.keys(v.esc).length, proofs: v.proofs.length, loop: v.loop.length });
  expect(v.msgs).toEqual(expect.arrayContaining(['sent from the first tab', 'sent from the second tab']));
  for (const t of tabs) expect(t.__errors || [], 'no JavaScript errors in any tab').toEqual([]);
  // the collision really happened: a tab merged the two saves, always from a common starting point
  const m = [];
  for (const t of tabs) m.push(await A.api(t, 'merges'));
  expect(m.reduce((x, y) => x + y.store + y.loop, 0), 'a tab merged the two saves').toBeGreaterThan(0);
  expect(m.map(y => y.storeBlind + y.loopBlind), 'every merge had a common starting point').toEqual(tabs.map(() => 0));
  return v;
}

// a snapshot of what both sides show, by deal: the numbers that must not change across a reload
async function picture(page, ids) {
  const out = {};
  for (const id of ids) {
    const d = await A.api(page, 'deal', id);
    out[id] = d && { status: d.status, rel: d.rel, held: d.held, proc: d.proc, open: d.open, items: d.items.map(i => i.status) };
  }
  out.releases = (await page.evaluate(() => GameInBX.api.releases().map(r => [r.dealId, r.value, r.net]))).sort();
  out.wallet = await page.evaluate(() => GameInLoop.released());
  out.offers = await page.evaluate(() => GameInBX.S.offers.map(o => o.id + ':' + o.status + ':' + o.versions.length).sort());
  out.packages = await page.evaluate(() => GameInBrand.app.offerings.map(o => o.id + ':' + o.title + ':' + o.price));
  return out;
}

test.describe('saved data', () => {
  test.beforeEach(async ({ page }) => { await A.startDemo(page); });
  test.afterEach(async ({ page }) => { A.noErrors(page); });

  test('D1 everything survives a reload, the seeded deals and packages included', async ({ page }) => {
    const id = await A.makeDeal(page, 'b3', 'Reload deal', 300, ['Launch stream', 'Recap clip']);
    await A.api(page, 'fund', id, 'next', 'pm1');
    await A.api(page, 'fund', id, 'next', 'pm2');
    const p = await A.api(page, 'upload', id);
    await A.api(page, 'approve', p);
    await A.waitFor(page, i => GameInBX.S.proofs.find(x => x.id === i).status === 'released', p, 12000);
    // a seeded deal pays out too
    await A.brand(page, 'b2', 'approvals');
    const sp = await page.evaluate(() => (GameInLoop.S.proofs.find(x => x.status === 'review') || {}).id);
    await page.evaluate(i => GameInLoop.approve(i), sp);
    // and the creator adds a package
    await A.creator(page, { page: 'offerings' });
    await page.locator('#gamein-root .gpl-card').first().locator('.gpl-link', { hasText: 'duplicate' }).click();
    await A.settle(page, 500);
    const before = await picture(page, [id, 'sp1', 'sp2', 'sp3']);
    await A.reload(page);
    const after = await picture(page, [id, 'sp1', 'sp2', 'sp3']);
    expect(after).toEqual(before);
    await A.creator(page, { deal: 'sp1' });
    await A.creatorDealTab(page, 'deliverables');
    await expect(page.locator('#gamein-root .gi-v5-check-row', { hasText: 'Mid-roll segment #2' })).toHaveAttribute('data-done', 'true');
    await A.checkMoney(page, { bids: ['b3', 'b2'], deals: [id, 'sp1'] });
  });

  test('D1 a release still in its undo window when the page closes completes, once', async ({ page }) => {
    const id = await A.makeDeal(page, 'b3', 'Closing tab', 100, ['Clip']);
    await A.api(page, 'fund', id, 'all', 'pm1');
    const p = await A.api(page, 'upload', id);
    await A.api(page, 'approve', p);
    const due = await page.evaluate(i => GameInBX.S.proofs.find(x => x.id === i).releaseAt, p);
    await A.reload(page);
    // after the reload it is still releasing until its window ends (and the moment it takes a tab to notice), then released,
    // dated when the window ended
    const st = await page.evaluate(i => { const x = GameInBX.S.proofs.find(y => y.id === i); return { status: x.status, now: Date.now(), releaseAt: x.releaseAt, relAt: x.relAt }; }, p);
    if (st.now < due) expect(st).toEqual({ status: 'releasing', now: st.now, releaseAt: due });
    else if (st.status === 'releasing') expect(st.releaseAt).toBe(due);
    else expect(st).toMatchObject({ status: 'released', relAt: due });
    await A.waitFor(page, i => GameInBX.S.proofs.find(x => x.id === i).status === 'released', p, 12000);
    expect(await page.evaluate(i => GameInBX.S.proofs.find(x => x.id === i).relAt, p)).toBe(due);
    await page.waitForTimeout(4000);
    expect(await page.evaluate(() => GameInBX.api.releases().length)).toBe(1);
    await A.checkMoney(page, { bids: ['b3'], deals: [id] });
  });

  test('D2 two tabs, creator and brand, stay in step and never overwrite each other', async ({ page, context }) => {
    const id = await A.makeDeal(page, 'b3', 'Two tabs', 300, ['Launch stream', 'Recap clip']);
    const brandTab = await context.newPage();
    brandTab.__errors = [];
    brandTab.on('pageerror', e => brandTab.__errors.push(String(e)));
    await brandTab.goto(A.PAGE);
    await A.enterDemo(brandTab);
    await A.brand(brandTab, 'b3', 'deals', id);
    // the brand funds in its tab; the creator's tab sees it without reloading
    await A.api(brandTab, 'fund', id, 'next', 'pm1');
    await A.creator(page, { deal: id });
    await A.creatorDealTab(page, 'deliverables');
    await expect(page.locator('#gamein-root .gi-v5-check-row').first()).toContainText('Ready to deliver', { timeout: 5000 });
    // the creator uploads in its tab; the brand's tab has it in approvals
    await A.creatorUpload(page);
    await A.brand(brandTab, 'b3', 'approvals');
    await expect(brandTab.locator('#gamein-root .gbw-proof', { hasText: 'Launch stream' })).toBeVisible({ timeout: 5000 });
    // interleaved writes from both tabs, each one seen by the other tab before the next: a new offer, a message from each
    // side, a second funding, a creator counter on the new offer
    const o2 = await brandTab.evaluate(() => GameInBX.api.send({ bid: 'b3', title: 'Second offer', amt: 120, items: [{ label: 'Post', days: 5 }] }).id);
    await A.waitFor(page, o => GameInBX.S.offers.some(x => x.id === o), o2, 5000);
    await A.api(page, 'say', 'b3', 'creator', 'From the creator tab');
    await A.waitFor(brandTab, () => (GameInBX.S.cmsg.b3 || []).some(m => m.t === 'From the creator tab'), null, 5000);
    await A.api(brandTab, 'say', 'b3', 'brand', 'From the brand tab');
    await A.waitFor(page, () => (GameInBX.S.cmsg.b3 || []).some(m => m.t === 'From the brand tab'), null, 5000);
    await A.api(brandTab, 'fund', id, 'next', 'pm2');
    await A.waitFor(page, i => (GameInBX.S.esc[i + ':1'] || {}).st === 'processing', id, 5000);
    expect(await A.api(page, 'creator', o2, 'counter', 150)).toBe(true);
    await A.waitFor(brandTab, o => (GameInBX.S.offers.find(x => x.id === o) || {}).status === 'countered', o2, 5000);
    for (const tab of [page, brandTab]) {
      const s = await tab.evaluate(([i, o]) => ({
        msgs: (GameInBX.S.cmsg.b3 || []).map(m => m.t),
        funded: [0, 1].map(k => (GameInBX.S.esc[i + ':' + k] || {}).st || 'pending'),
        offer: (GameInBX.S.offers.find(x => x.id === o) || {}).status,
        proofs: GameInBX.S.proofs.filter(p => p.dealId === i).length,
      }), [id, o2]);
      expect(s.msgs).toEqual(expect.arrayContaining(['From the creator tab', 'From the brand tab']));
      expect(s.funded).toEqual(['in escrow', 'processing']);
      expect(s.offer).toBe('countered');
      expect(s.proofs).toBe(1);
    }
    // and what's saved is the same as what both tabs hold
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('gib-bx')));
    expect(saved.cmsg.b3.map(m => m.t)).toEqual(expect.arrayContaining(['From the creator tab', 'From the brand tab']));
    expect(brandTab.__errors).toEqual([]);
    await brandTab.close();
  });

  test('D2 both tabs writing at the same moment lose nothing', async ({ page, context }) => {
    const id = await A.makeDeal(page, 'b3', 'Busy tabs', 300, ['Launch stream', 'Recap clip']);
    await A.api(page, 'fund', id, 'all', 'pm1');
    const other = await context.newPage();
    other.__errors = [];
    other.on('pageerror', e => other.__errors.push(String(e)));
    await other.goto(A.PAGE);
    await A.enterDemo(other);
    // 25 messages from each tab, sent as fast as they come, each followed by an offer
    const burst = (t, who, bid, title) => t.evaluate(async ([who, bid, title]) => {
      for (let i = 0; i < 25; i++) { GameInBX.api.say('b3', who, who + ' burst ' + i); await new Promise(r => setTimeout(r, Math.random() * 6)); }
      return GameInBX.api.send({ bid, title, amt: 210, items: [{ label: 'Post', days: 4 }] }).id;
    }, [who, bid, title]);
    const ids = await Promise.all([burst(page, 'creator', 'b4', 'Tab one offer'), burst(other, 'brand', 'b5', 'Tab two offer')]);
    // at the same moment: the creator uploads proof in one tab while the brand approves the seeded proof in the other
    const seedProof = await page.evaluate(() => GameInLoop.S.proofs.find(p => p.dealId === 'sp1' && p.status === 'review').id);
    const [up] = await Promise.all([A.api(page, 'upload', id), other.evaluate(i => GameInLoop.approve(i), seedProof)]);
    expect(up).toBeTruthy();
    await page.waitForTimeout(2500);
    for (const t of [page, other]) {
      const s = await t.evaluate(([ids, up, sp]) => ({
        creator: (GameInBX.S.cmsg.b3 || []).filter(m => /^creator burst /.test(m.t)).length,
        brand: (GameInBX.S.cmsg.b3 || []).filter(m => /^brand burst /.test(m.t)).length,
        offers: ids.filter(i => GameInBX.S.offers.some(o => o.id === i)).length,
        upload: (GameInBX.S.proofs.find(p => p.id === up) || {}).status,
        seeded: (GameInLoop.S.proofs.find(p => p.id === sp) || {}).status,
      }), [ids, up, seedProof]);
      expect(s).toEqual({ creator: 25, brand: 25, offers: 2, upload: 'review', seeded: 'released' });
    }
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('gib-bx')));
    expect(saved.cmsg.b3.filter(m => / burst /.test(m.t)).length).toBe(50);
    expect(other.__errors).toEqual([]);
    await A.checkMoney(page, { bids: ['b3', 'b2'], deals: [id, 'sp1'] });
    await other.close();
  });

  // ---- the same moment in two tabs, for every move that changes money or a deal, in both orders
  for (const order of ['next first', 'everything first']) {
    test(`D2 M2 the brand pays for the next milestone in one tab and for everything in another at the same moment: each milestone is charged once (${order})`, async ({ page, context }) => {
      const id = await A.makeDeal(page, 'b3', 'Pay twice?', 301.01, ['Launch stream', 'Recap clip']);
      const other = await secondTab(context);
      await A.waitFor(other, i => GameInBX.S.deals.some(d => d.id === i), id);
      // the next milestone by card (in escrow at once), everything by bank (processing)
      const next = t => A.api(t, 'fund', id, 'next', 'pm1'), all = t => A.api(t, 'fund', id, 'all', 'pm2');
      const [a, b] = await sameMoment(page, other, order === 'next first' ? next : all, order === 'next first' ? all : next);
      expect(a && b).toBeTruthy();
      const v = await inStep([page, other]);
      // milestone 1 is paid once, by the card payment, which is already in escrow. The bank payment keeps milestone 2, and
      // its receipt charges only for that. Fees run on the deal's total in payment order: $15.05 in all, as if paid at once
      expect([0, 1].map(k => (v.esc[id + ':' + k] || {}).st || 'pending')).toEqual(['in escrow', 'processing']);
      const inv = v.inv.filter(r => r.dealId === id).sort((x, y) => x.ts - y.ts).map(r => ({ ms: r.ms, base: r.base, fee: r.fee, amt: r.amt, st: r.st }));
      expect(inv).toEqual(order === 'next first'
        ? [{ ms: [0], base: 150.5, fee: 7.53, amt: 158.03, st: 'paid' }, { ms: [1], base: 150.51, fee: 7.52, amt: 158.03, st: 'processing' }]
        : [{ ms: [1], base: 150.51, fee: 7.53, amt: 158.04, st: 'processing' }, { ms: [0], base: 150.5, fee: 7.52, amt: 158.02, st: 'paid' }]);
      await A.checkMoney(page, { bids: ['b3'], deals: [id] });
      // the bank payment clears as a whole, and nothing is left to fund
      expect(await A.api(other, 'clear', id, 1)).toBe(true);
      await A.waitFor(page, i => (GameInBX.S.esc[i + ':1'] || {}).st === 'in escrow', id, 5000);
      expect(await A.api(page, 'fund', id, 'all', 'pm1')).toBe(null);
      await A.checkMoney(page, { bids: ['b3'], deals: [id] });
      await other.close();
    });
  }

  for (const order of ['bank tab merges', 'card tab merges']) {
    test(`D2 a bank payment in one tab and a card payment in another for the same milestone, with proof uploaded against the card payment: the money stays in escrow under that proof (${order})`, async ({ page, context }) => {
      const id = await A.makeDeal(page, 'b3', 'Card or bank', 300, ['Launch stream', 'Recap clip']);
      const other = await secondTab(context);
      await A.waitFor(other, i => GameInBX.S.deals.some(d => d.id === i), id);
      const bank = async t => (await A.api(t, 'fund', id, 'next', 'pm2')).st;
      const cardAndUpload = async t => { const r = await A.api(t, 'fund', id, 'all', 'pm1'); return [r.st, await A.api(t, 'upload', id)]; };
      // the tab that acted first is the one that takes in the other's save and merges
      const [x, y] = order === 'bank tab merges' ? await sameMoment(page, other, bank, cardAndUpload) : await sameMoment(page, other, cardAndUpload, bank);
      const card = order === 'bank tab merges' ? y : x, pid = card[1];
      expect(card[0]).toBe('in escrow');
      expect(pid).toBeTruthy();
      const v = await inStep([page, other]);
      // the card payment, in escrow, stands for both milestones; the bank payment held nothing else, so it is gone
      expect([0, 1].map(k => (v.esc[id + ':' + k] || {}).st)).toEqual(['in escrow', 'in escrow']);
      expect(v.inv.filter(r => r.dealId === id).map(r => [r.ms, r.amt, r.st])).toEqual([[[0, 1], 315, 'paid']]);
      expect(v.proofs.filter(p => p[0] === pid).map(p => p[1])).toEqual(['review']);
      // so the brand can approve it, and the creator is paid from escrow
      expect(await A.api(page, 'approve', pid)).toBe(true);
      await A.waitFor(page, i => GameInBX.S.proofs.find(p => p.id === i).status === 'released', pid, 12000);
      const r = await A.checkMoney(page, { bids: ['b3'], deals: [id] });
      expect(r.net).toBe(14250);
      await other.close();
    });
  }

  test('M4 a proof whose money is still clearing can\'t be approved; it waits in review', async ({ page }) => {
    const id = await A.makeDeal(page, 'b3', 'Clearing first', 300, ['Launch stream', 'Recap clip']);
    await A.api(page, 'fund', id, 'all', 'pm1');
    const pid = await A.api(page, 'upload', id);
    // as after a merge that left this deliverable's payment clearing: the engine won't move money that isn't in escrow
    await page.evaluate(i => { const e = GameInBX.S.esc[i + ':0']; e.st = 'processing'; GameInBX.emit(); }, id);
    expect(await A.api(page, 'approve', pid)).toBe(false);
    expect(await page.evaluate(i => GameInBX.S.proofs.find(p => p.id === i).status, pid)).toBe('review');
    // and a release already under way waits too, back in review when its window ends, until the money is there
    await page.evaluate(i => { GameInBX.S.esc[i + ':0'].st = 'in escrow'; GameInBX.emit(); }, id);
    expect(await A.api(page, 'approve', pid)).toBe(true);
    await page.evaluate(i => { GameInBX.S.esc[i + ':0'].st = 'processing'; GameInBX.emit(); }, id);
    await page.waitForTimeout(8000);
    expect(await page.evaluate(i => GameInBX.S.proofs.find(p => p.id === i).status, pid)).toBe('review');
    expect(await page.evaluate(() => GameInBX.api.releases().length)).toBe(0);
  });

  for (const order of ['accept first', 'withdraw first']) {
    test(`D2 the creator accepts while the brand withdraws the same offer at the same moment: the acceptance stands, with one deal (${order})`, async ({ page, context }) => {
      const o = await A.api(page, 'send', { bid: 'b3', title: 'Race offer', amt: 240, items: [{ label: 'Stream', days: 3 }, { label: 'Clip', days: 5 }] });
      const other = await secondTab(context);
      await A.waitFor(other, i => GameInBX.S.offers.some(x => x.id === i), o.id);
      const accept = t => A.api(t, 'creator', o.id, 'accept'), withdraw = t => A.api(t, 'withdraw', o.id);
      const [a, b] = await sameMoment(page, other, order === 'accept first' ? accept : withdraw, order === 'accept first' ? withdraw : accept);
      expect([a, b]).toEqual([true, true]);
      const v = await inStep([page, other]);
      const off = v.offers.find(x => x[0] === o.id), deals = v.deals.filter(d => d[2] === o.id);
      expect(off.slice(1, 3)).toEqual(['accepted', 1]);
      expect(deals).toEqual([[off[3], 240, o.id]]);
      await A.checkMoney(page, { bids: ['b3'], deals: [off[3]] });
      // both seats see the deal, awaiting funding
      await A.brand(other, 'b3', 'deals', off[3]);
      await expect(other.locator('#gamein-root .gbx-hero')).toContainText(/awaiting funding/i);
      await other.close();
    });
  }

  for (const order of ['accept first', 'counter first']) {
    test(`D2 the brand accepts the creator's counter in one tab and counters it in another at the same moment: the acceptance stands (${order})`, async ({ page, context }) => {
      const o = await A.api(page, 'send', { bid: 'b3', title: 'Counter race', amt: 250, items: [{ label: 'Stream', days: 3 }] });
      expect(await A.api(page, 'creator', o.id, 'counter', 300)).toBe(true);
      const other = await secondTab(context);
      await A.waitFor(other, i => (GameInBX.S.offers.find(x => x.id === i) || {}).status === 'countered', o.id);
      const accept = t => A.api(t, 'brandAccept', o.id), counter = t => A.api(t, 'brandCounter', o.id, 280);
      const [a, b] = await sameMoment(page, other, order === 'accept first' ? accept : counter, order === 'accept first' ? counter : accept);
      expect([a, b]).toEqual([true, true]);
      const v = await inStep([page, other]);
      const off = v.offers.find(x => x[0] === o.id);
      // accepted at the creator's $300, without the brand's $280 counter; one deal at that price
      expect(off.slice(1, 3)).toEqual(['accepted', 2]);
      expect(v.deals.filter(d => d[2] === o.id)).toEqual([[off[3], 300, o.id]]);
      await A.checkMoney(page, { bids: ['b3'], deals: [off[3]] });
      await other.close();
    });
  }

  test('D2 the creator uploads proof for the same deliverable from two tabs at the same moment: one proof in review', async ({ page, context }) => {
    const id = await A.makeDeal(page, 'b3', 'Upload twice', 300, ['Launch stream', 'Recap clip']);
    await A.api(page, 'fund', id, 'all', 'pm1');
    const other = await secondTab(context);
    await A.waitFor(other, i => !!GameInBX.S.esc[i + ':1'], id);
    const up = t => A.api(t, 'upload', id);
    const [a, b] = await sameMoment(page, other, up, up);
    expect(a && b && a !== b).toBeTruthy();
    const v = await inStep([page, other]);
    const ps = v.proofs.filter(p => p[0] === a || p[0] === b);
    expect(ps.map(p => p[1])).toEqual(['review']);
    // the brand has one proof to approve, and the creator's next upload is the second deliverable
    await A.brand(other, 'b3', 'approvals');
    await expect(other.locator('#gamein-root .gbw-proof', { hasText: 'Launch stream' })).toHaveCount(1);
    const next = await A.api(page, 'upload', id);
    expect(await page.evaluate(i => GameInBX.S.proofs.find(p => p.id === i).idx, next)).toBe(1);
    await A.checkMoney(page, { bids: ['b3'], deals: [id] });
    await other.close();
  });

  for (const order of ['approve first', 'changes first']) {
    test(`D2 the brand approves a proof in one tab and asks for changes in another at the same moment: one outcome, paid at most once (${order})`, async ({ page, context }) => {
      const id = await A.makeDeal(page, 'b3', 'Approve or fix', 300, ['Launch stream', 'Recap clip']);
      await A.api(page, 'fund', id, 'all', 'pm1');
      const pid = await A.api(page, 'upload', id);
      const other = await secondTab(context);
      await A.waitFor(other, i => GameInBX.S.proofs.some(p => p.id === i), pid);
      const approve = t => A.api(t, 'approve', pid), changes = t => A.api(t, 'changes', pid);
      const [a, b] = await sameMoment(page, other, order === 'approve first' ? approve : changes, order === 'approve first' ? changes : approve);
      expect([a, b]).toEqual([true, true]);
      // the move saved first stands; wait out the release window either way
      await page.waitForTimeout(8000);
      const v = await inStep([page, other]);
      const pf = v.proofs.find(p => p[0] === pid);
      const r = await A.checkMoney(page, { bids: ['b3'], deals: [id] });
      if (order === 'approve first') {
        expect(pf[1]).toBe('released');
        expect(r.net).toBe(14250);
      } else {
        expect(pf[1]).toBe('changes');
        expect(r.net).toBe(0);
        await A.creator(page, { deal: id });
        await A.creatorDealTab(page, 'deliverables');
        await expect(page.locator('#gamein-root .gi-v5-check-row').first()).toContainText('Fix and re-upload');
      }
      expect(await page.evaluate(() => GameInBX.api.releases().length)).toBe(order === 'approve first' ? 1 : 0);
      await other.close();
    });
  }

  test('D2 P6 P7 seeded deal: the same deliverable uploaded from two tabs is one proof, and approving it in both tabs pays once', async ({ page, context }) => {
    const other = await secondTab(context);
    const share = A.M.seedShare(await A.raw(page), 'sp1');
    expect(share).toMatchObject({ ok: true, valueC: 37500, item: 'TikTok post #2' });
    const up = t => A.api(t, 'seedUpload', 'sp1');
    const [a, b] = await sameMoment(page, other, up, up);
    expect(a && b && a !== b).toBeTruthy();
    let v = await inStep([page, other]);
    const live = v.loop.filter(p => (p[0] === a || p[0] === b) && p[1] !== 'changes');
    expect(live.map(p => [p[1], p[2]])).toEqual([['review', 375]]);
    // HYPERCORE approves that proof in both tabs at the same moment
    const pid = live[0][0];
    const approve = t => t.evaluate(i => { GameInLoop.approve(i); return GameInLoop.S.proofs.find(p => p.id === i).status; }, pid);
    const [s1, s2] = await sameMoment(page, other, approve, approve);
    expect([s1, s2]).toEqual(['released', 'released']);
    v = await inStep([page, other]);
    expect(v.loop.filter(p => p[0] === pid).map(p => p[1])).toEqual(['released']);
    const paid = await page.evaluate(i => GameInBX.api.releases().filter(r => r.id === i).length, pid);
    expect(paid).toBe(1);
    const r = await A.checkMoney(page, { bids: ['b2'], deals: ['sp1'] });
    expect(r.net).toBe(37500 - 1875);
    await other.close();
  });

  // ---- longer collisions: one tab keeps acting while the other can't see it (found by independent stress tests)
  test('D2 two bank payments for the same milestone, and the second clears in a tab that can\'t see the first: the payment that arrived stands', async ({ page, context }) => {
    const id = await A.makeDeal(page, 'b3', 'Bank twice', 300, ['Launch stream', 'Recap clip']);
    const other = await secondTab(context);
    await A.waitFor(other, i => GameInBX.S.deals.some(d => d.id === i), id);
    const first = t => A.api(t, 'fund', id, 'next', 'pm2');
    const secondClearsAndUploads = async t => { await A.api(t, 'fund', id, 'next', 'pm2'); expect(await A.api(t, 'clear', id, 0)).toBe(true); return A.api(t, 'upload', id); };
    const [, pid] = await sameMoment(page, other, first, secondClearsAndUploads);
    expect(pid).toBeTruthy();
    const v = await inStep([page, other]);
    // the payment whose money arrived pays milestone 1; the one still clearing pays nothing, so its receipt is gone
    expect((v.esc[id + ':0'] || {}).st).toBe('in escrow');
    expect(v.inv.filter(r => r.dealId === id).map(r => [r.ms, r.amt, r.st])).toEqual([[[0], 157.5, 'paid']]);
    // so the proof uploaded against it can be approved at once, and the creator is paid once
    expect(v.proofs.find(p => p[0] === pid)[1]).toBe('review');
    expect(await A.api(page, 'approve', pid)).toBe(true);
    await A.waitFor(page, i => GameInBX.S.proofs.find(p => p.id === i).status === 'released', pid, 12000);
    const r = await A.checkMoney(page, { bids: ['b3'], deals: [id] });
    expect(r.net).toBe(14250);
    await other.close();
  });

  test('D2 two bank payments for the same milestone; the later one clears and is paid out in its tab before the tabs catch up: the payout keeps its money', async ({ page, context }) => {
    const id = await A.makeDeal(page, 'b3', 'Paid out first', 300, ['Launch stream', 'Recap clip']);
    const other = await secondTab(context);
    await A.waitFor(other, i => GameInBX.S.deals.some(d => d.id === i), id);
    const first = t => A.api(t, 'fund', id, 'next', 'pm2');
    const paidOut = async t => {
      await A.api(t, 'fund', id, 'next', 'pm2');
      expect(await A.api(t, 'clear', id, 0)).toBe(true);
      const pid = await A.api(t, 'upload', id);
      expect(await A.api(t, 'approve', pid)).toBe(true);
      await t.waitForTimeout(7500);
      expect(await t.evaluate(i => GameInBX.S.proofs.find(p => p.id === i).status, pid)).toBe('released');
      return pid;
    };
    const [, pid] = await sameMoment(page, other, first, paidOut);
    const v = await inStep([page, other]);
    expect((v.esc[id + ':0'] || {}).st).toBe('in escrow');
    expect(v.inv.filter(r => r.dealId === id).map(r => [r.ms, r.amt, r.st])).toEqual([[[0], 157.5, 'paid']]);
    expect(v.proofs.find(p => p[0] === pid)[1]).toBe('released');
    const r = await A.checkMoney(page, { bids: ['b3'], deals: [id] });
    expect(r.net).toBe(14250);
    await other.close();
  });

  test('D2 a payment trimmed by a merge clears later in the tab that made it: it takes its milestone back, and everything is charged once', async ({ page, context }) => {
    const id = await A.makeDeal(page, 'b3', 'Clears later', 301.01, ['Launch stream', 'Recap clip', 'Wrap-up']);
    const other = await secondTab(context);
    await A.waitFor(other, i => GameInBX.S.deals.some(d => d.id === i), id);
    await A.api(other, 'me');
    await A.api(other, 'hold', true);
    expect((await A.api(page, 'fund', id, 'next', 'pm2')).st).toBe('processing');   // bank, milestone 1
    expect((await A.api(other, 'fund', id, 'all', 'pm2')).st).toBe('processing');   // bank, everything, without seeing it
    await A.api(page, 'say', 'b3', 'brand', 'the first tab takes in the second');
    // both still clearing: the payment made first pays milestone 1, the other is charged for milestones 2 and 3
    expect(await page.evaluate(i => GameInBX.S.inv.filter(r => r.dealId === i).sort((x, y) => x.ts - y.ts).map(r => r.ms), id)).toEqual([[0], [1, 2]]);
    expect(await A.api(other, 'clear', id, 2)).toBe(true);                           // the second tab marks its payment received
    await A.api(other, 'say', 'b3', 'creator', 'the second tab catches up');
    await A.api(other, 'hold', false);
    const v = await settled([page, other]);
    // its money arrived, so it pays all three milestones again; the payment still clearing pays nothing and its receipt is gone
    expect([0, 1, 2].map(k => v.esc[id + ':' + k].st)).toEqual(['in escrow', 'in escrow', 'in escrow']);
    const inv = v.inv.filter(r => r.dealId === id).map(r => ({ ms: r.ms, base: r.base, fee: r.fee, amt: r.amt, st: r.st }));
    expect(inv).toEqual([{ ms: [0, 1, 2], base: 301.01, fee: 15.05, amt: 316.06, st: 'paid' }]);
    await A.checkMoney(page, { bids: ['b3'], deals: [id] });
    await other.close();
  });

  test('D2 P7 a seeded deal\'s last payment made by bank in both tabs, received in one and claimed in full by the last deliverable: approvals pay exactly what is in escrow', async ({ page, context }) => {
    // ORBITAL AUDIO: two proofs already in review, then the recap bonus is paid by bank in both tabs
    const q1 = await A.api(page, 'seedUpload', 'sp3'), q2 = await A.api(page, 'seedUpload', 'sp3');
    const other = await secondTab(context);
    await A.waitFor(other, ids => ids.every(i => GameInLoop.S.proofs.some(p => p.id === i)), [q1, q2]);
    const bank = t => A.api(t, 'fund', 'sp3', 'next', 'pm2');
    const receivedAndClaimed = async t => { await A.api(t, 'fund', 'sp3', 'next', 'pm2'); expect(await A.api(t, 'clear', 'sp3', 2)).toBe(true); return A.api(t, 'seedUpload', 'sp3'); };
    const [, q3] = await sameMoment(page, other, bank, receivedAndClaimed);
    expect(q3).toBeTruthy();
    const v = await inStep([page, other]);
    expect((v.esc['sp3:2'] || {}).st).toBe('in escrow');
    // the brand approves all three in the first tab: $71.78 + $71.79 + $179.47 = $323.04, everything the deal has in escrow
    await page.evaluate(ids => ids.forEach(i => GameInLoop.approve(i)), [q1, q2, q3]);
    await A.waitFor(page, ids => ids.every(i => GameInLoop.S.proofs.find(p => p.id === i).status === 'released'), [q1, q2, q3], 8000);
    const paid = await page.evaluate(ids => GameInBX.api.releases().filter(r => ids.includes(r.id)).reduce((x, r) => x + Math.round(r.value * 100), 0), [q1, q2, q3]);
    expect(paid).toBe(7178 + 7179 + 17947);
    await A.checkMoney(page, { bids: ['b5'], deals: ['sp3'] });
    await other.close();
  });

  test('D2 P7 a seeded proof that would release more than its period has in escrow waits', async ({ page }) => {
    // as after a merge that left the recap bonus still clearing: three proofs claim $323.04 against $215.36 in escrow
    const q1 = await A.api(page, 'seedUpload', 'sp3'), q2 = await A.api(page, 'seedUpload', 'sp3');
    await A.api(page, 'fund', 'sp3', 'next', 'pm1');
    const q3 = await A.api(page, 'seedUpload', 'sp3');
    await page.evaluate(() => { GameInBX.S.esc['sp3:2'].st = 'processing'; const r = GameInBX.S.inv.find(x => x.dealId === 'sp3'); r.st = 'processing'; GameInBX.emit(); });
    await page.evaluate(ids => ids.forEach(i => GameInLoop.approve(i)), [q1, q2, q3]);
    const st = await page.evaluate(ids => ids.map(i => GameInLoop.S.proofs.find(p => p.id === i).status), [q1, q2, q3]);
    // the first two fit in what is in escrow; the last waits in review until the bonus clears
    expect(st).toEqual(['released', 'released', 'review']);
    expect(await A.api(page, 'clear', 'sp3', 2)).toBe(true);
    await page.evaluate(i => GameInLoop.approve(i), q3);
    expect(await page.evaluate(i => GameInLoop.S.proofs.find(p => p.id === i).status, q3)).toBe('released');
    await A.checkMoney(page, { bids: ['b5'], deals: ['sp3'] });
  });

  test('D2 an offer accepted at two versions in two tabs: the acceptance that went further stands, with its deal and payment', async ({ page, context }) => {
    const o = await A.api(page, 'send', { bid: 'b3', title: 'Two versions', amt: 240, items: [{ label: 'Stream', days: 3 }, { label: 'Clip', days: 5 }] });
    const other = await secondTab(context);
    await A.waitFor(other, i => GameInBX.S.offers.some(x => x.id === i), o.id);
    // one tab: the creator counters at $300 and the brand accepts. The other, without seeing it: the creator accepts the $240 offer
    // and the brand pays for the whole deal by card
    const counterAccepted = async t => [await A.api(t, 'creator', o.id, 'counter', 300), await A.api(t, 'brandAccept', o.id)];
    const acceptedAndPaid = async t => { await A.api(t, 'creator', o.id, 'accept'); const did = await t.evaluate(i => GameInBX.S.offers.find(x => x.id === i).dealId, o.id); return (await A.api(t, 'fund', did, 'all', 'pm1')).st; };
    const [a, b] = await sameMoment(other, page, counterAccepted, acceptedAndPaid);
    expect(a).toEqual([true, true]);
    expect(b).toBe('in escrow');
    const v = await inStep([page, other]);
    const off = v.offers.find(x => x[0] === o.id);
    expect(off.slice(1, 3)).toEqual(['accepted', 1]);
    expect(v.deals.filter(d => d[2] === o.id)).toEqual([[off[3], 240, o.id]]);
    expect(v.inv.filter(r => r.dealId === off[3]).map(r => [r.ms, r.amt, r.st])).toEqual([[[0, 1], 252, 'paid']]);
    await A.checkMoney(page, { bids: ['b3'], deals: [off[3]] });
    await other.close();
  });

  test('D2 R3 a renewal request accepted and paid for in one tab and declined in another: the acceptance stands, with its payment', async ({ page, context }) => {
    expect(await A.api(page, 'renew', 'sp1', 'request', { months: 3, price: 1500, brand: 'HYPERCORE' })).toBe('');
    const other = await secondTab(context);
    await A.waitFor(other, () => (GameInBX.S.ren.sp1 || {}).st === 'requested');
    const decline = t => A.api(t, 'renew', 'sp1', 'answer', { by: 'brand', st: 'declined' });
    const acceptAndPay = async t => { expect(await A.api(t, 'renew', 'sp1', 'answer', { by: 'brand', st: 'accepted' })).toBe(''); return (await A.api(t, 'fund', 'sp1', 'all', 'pm1')).st; };
    const [, paid] = await sameMoment(page, other, decline, acceptAndPay);
    expect(paid).toBe('in escrow');
    const v = await inStep([page, other]);
    expect(v.ren.sp1.st).toBe('accepted');
    // August and the three renewal months are in escrow: $6,000 plus 5% of the deal's running total, $6,300.00
    expect([2, 3, 4, 5].map(k => (v.esc['sp1:' + k] || {}).st)).toEqual(['in escrow', 'in escrow', 'in escrow', 'in escrow']);
    expect(v.inv.filter(r => r.dealId === 'sp1').map(r => [r.ms, r.amt])).toEqual([[[2, 3, 4, 5], 6300]]);
    await A.checkMoney(page, { bids: ['b2'], deals: ['sp1'] });
    await other.close();
  });

  test('D2 R3 two different renewals accepted and paid for in two tabs: the first acceptance stands, and nothing is charged for months the deal doesn\'t have', async ({ page, context }) => {
    const other = await secondTab(context);
    // one tab: HYPERCORE offers one more month at $1,500, the creator accepts, the brand pays for everything open. The other: the
    // creator asks for two months at $1,600, the brand accepts and pays for everything open
    const oneMonth = async t => { await A.api(t, 'renew', 'sp1', 'offer', { months: 1, price: 1500 }); await A.api(t, 'renew', 'sp1', 'answer', { by: 'creator', st: 'accepted' }); return (await A.api(t, 'fund', 'sp1', 'all', 'pm1')).st; };
    const twoMonths = async t => { await A.api(t, 'renew', 'sp1', 'request', { months: 2, price: 1600, brand: 'HYPERCORE' }); await A.api(t, 'renew', 'sp1', 'answer', { by: 'brand', st: 'accepted' }); return (await A.api(t, 'fund', 'sp1', 'all', 'pm1')).st; };
    const [a, b] = await sameMoment(page, other, oneMonth, twoMonths);
    expect([a, b]).toEqual(['in escrow', 'in escrow']);
    const v = await inStep([page, other]);
    expect([v.ren.sp1.st, v.ren.sp1.months, v.ren.sp1.price]).toEqual(['accepted', 1, 1500]);
    // August and the one renewal month are in escrow, paid once; the two-month payment pays for nothing the deal has, so it's gone
    expect(Object.keys(v.esc).filter(k => k.startsWith('sp1:')).sort()).toEqual(['sp1:2', 'sp1:3']);
    expect(v.inv.filter(r => r.dealId === 'sp1').map(r => [r.ms, r.amt])).toEqual([[[2, 3], 3150]]);
    await A.checkMoney(page, { bids: ['b2'], deals: ['sp1'] });
    await other.close();
  });

  test('D2 one tab saves a dozen times while the other pays out a proof both tabs had seen: the payout isn\'t undone', async ({ page, context }) => {
    // the second tab is open first and only takes in the first tab's saves, so the last state both saw is the proof in review
    const other = await secondTab(context);
    await page.waitForTimeout(500);
    const id = await A.makeDeal(page, 'b3', 'Busy brand', 300, ['Launch stream', 'Recap clip']);
    await A.api(page, 'fund', id, 'next', 'pm1');
    const pid = await A.api(page, 'upload', id);
    await A.waitFor(other, i => GameInBX.S.proofs.some(p => p.id === i), pid);
    await A.api(page, 'me');
    await A.api(other, 'me');
    await A.api(page, 'hold', true);
    await A.api(other, 'hold', true);
    for (let i = 0; i < 12; i++) await A.api(page, 'say', 'b3', 'brand', 'note ' + i);
    expect(await A.api(other, 'approve', pid)).toBe(true);
    await other.waitForTimeout(7500);
    expect(await other.evaluate(i => GameInBX.S.proofs.find(p => p.id === i).status, pid)).toBe('released');
    await A.api(page, 'say', 'b3', 'creator', 'sent from the first tab');
    await A.api(other, 'say', 'b3', 'brand', 'sent from the second tab');
    await A.api(page, 'hold', false);
    await A.api(other, 'hold', false);
    await page.waitForTimeout(500);
    const v = await inStep([page, other]);
    expect(v.proofs.find(p => p[0] === pid)[1]).toBe('released');
    expect(v.msgs.filter(t => /^note \d+$/.test(t)).length).toBe(12);
    const r = await A.checkMoney(page, { bids: ['b3'], deals: [id] });
    expect(r.net).toBe(14250);
    await other.close();
  });

  test('D2 P6 a proof sent back for changes in a tab that missed the first upload: the first stays in review, no second upload, paid once', async ({ page, context }) => {
    const id = await A.makeDeal(page, 'b3', 'Paid twice?', 300, ['Launch stream', 'Recap clip']);
    await A.api(page, 'fund', id, 'next', 'pm1');
    const other = await secondTab(context);
    await A.waitFor(other, i => (GameInBX.S.esc[i + ':0'] || {}).st === 'in escrow', id);
    await A.api(other, 'me');
    await A.api(other, 'hold', true);
    const p1 = await A.api(page, 'upload', id);                       // the creator uploads in one tab
    const p2 = await A.api(other, 'upload', id);                      // the other tab hasn't seen it and uploads too
    expect(await A.api(other, 'changes', p2)).toBe(true);             // and the brand sends that copy back for changes
    await A.api(other, 'hold', false);
    await page.waitForTimeout(400);
    await A.api(page, 'me');
    expect(await A.rulesHold(page)).toEqual([]);
    // the first upload is still the deliverable's proof: no new upload for it (and the next deliverable isn't funded)
    expect(await A.api(page, 'upload', id)).toBe(null);
    expect(await A.api(page, 'approve', p2)).toBe(false);
    expect(await A.api(page, 'approve', p1)).toBe(true);
    await A.waitFor(page, i => GameInBX.S.proofs.find(p => p.id === i).status === 'released', p1, 12000);
    await page.waitForTimeout(1500);
    expect(await page.evaluate(i => GameInBX.api.releases().filter(r => r.dealId === i).length, id)).toBe(1);
    const r = await A.checkMoney(page, { bids: ['b3'], deals: [id] });
    expect(r.net).toBe(14250);
    await other.close();
  });

  test('P6 a second proof for a deliverable that is already paid is never paid, by any route', async ({ page }) => {
    // as after a merge that brought in another copy: shared deal, the demo's extra deal and a seeded deal
    const id = await A.makeDeal(page, 'b3', 'Already paid', 300, ['Launch stream', 'Recap clip']);
    await A.api(page, 'fund', id, 'next', 'pm1');
    const p1 = await A.api(page, 'upload', id);
    expect(await A.api(page, 'approve', p1)).toBe(true);
    await A.waitFor(page, i => GameInBX.S.proofs.find(p => p.id === i).status === 'released', p1, 12000);
    const copy = (st, extra) => page.evaluate(([i, st, ex]) => { const p = GameInBX.S.proofs.find(x => x.id === i); const c = { ...p, id: p.id + st, status: st, at: p.at + 1, ...ex }; delete c.relAt; GameInBX.S.proofs.unshift(c); GameInBX.emit(); return c.id; }, [p1, st, extra || {}]);
    const p2 = await copy('review');
    expect(await A.api(page, 'approve', p2)).toBe(false);
    const p3 = await copy('releasing', { releaseAt: Date.now() - 4000 });   // a release whose window ran out: the sweeper puts it back
    await A.waitFor(page, i => GameInBX.S.proofs.find(p => p.id === i).status === 'review', p3, 6000);
    expect(await page.evaluate(i => GameInBX.api.releases().filter(r => r.dealId === i).length, id)).toBe(1);
    // seeded deal: a second copy of an approved deliverable's proof stays in review
    const s1 = await A.api(page, 'seedUpload', 'sp1');
    await page.evaluate(i => GameInLoop.approve(i), s1);
    const s2 = await page.evaluate(i => { const L = GameInLoop, p = L.S.proofs.find(x => x.id === i), c = { ...p, id: p.id + 'b', status: 'review' }; delete c.relAt; L.S.proofs.unshift(c); L.emit(); L.approve(c.id); return L.S.proofs.find(x => x.id === c.id).status; }, s1);
    expect(s2).toBe('review');
    expect(await page.evaluate(() => GameInBX.api.releases().filter(r => r.dealId === 'sp1').length)).toBe(1);
  });

  test('M4 the demo\'s extra deal pays out only from escrow', async ({ page }) => {
    // ROCKET LEAGUE CUP WEEK (Qwerty2000, for HYPERCORE): funded by bank, the delivered stream can't be paid until the money clears
    expect((await A.api(page, 'fund', 'bx1', 'next', 'pm2')).st).toBe('processing');
    await page.evaluate(() => { const S = GameInBX.S; S.proofs.unshift({ id: 'bpx1', dealId: 'bx1', bid: 'b2', creator: 'Qwerty2000', deal: 'ROCKET LEAGUE CUP WEEK', item: 'Cup stream with logo overlay', idx: 0, n: 3, value: 300, status: 'review', at: Date.now() }); GameInBX.emit(); });
    expect(await A.api(page, 'approve', 'bpx1')).toBe(false);
    expect(await A.api(page, 'clear', 'bx1', 0)).toBe(true);
    expect(await A.api(page, 'approve', 'bpx1')).toBe(true);
    await A.waitFor(page, () => GameInBX.S.proofs.find(p => p.id === 'bpx1').status === 'released', null, 12000);
    expect(await A.rulesHold(page)).toEqual([]);
    await A.checkMoney(page, { bids: ['b2'], deals: ['bx1'] });
  });

  test('D2 M2 two payments on a seeded deal at the same moment, for different milestones: fees on the running total, to the cent', async ({ page, context }) => {
    // ORBITAL AUDIO renews for $100.12; the recap bonus and the renewal are then paid for in two tabs at the same moment
    expect(await A.api(page, 'renew', 'sp3', 'request', { months: 1, price: 100.12, brand: 'ORBITAL AUDIO' })).toBe('');
    expect(await A.api(page, 'renew', 'sp3', 'answer', { by: 'brand', st: 'accepted' })).toBe('');
    const other = await secondTab(context);
    await A.waitFor(other, () => (GameInBX.S.ren.sp3 || {}).st === 'accepted');
    const bonus = t => A.api(t, 'fundIdx', 'sp3', [2], 'pm1'), renewal = t => A.api(t, 'fundIdx', 'sp3', [3], 'pm1');
    const [a, b] = await sameMoment(page, other, bonus, renewal);
    expect(a.st && b.st).toBe('in escrow');
    const v = await inStep([page, other]);
    // $430.72 was funded before; 5% of the running total: $5.38 for the bonus, then $5.01 for the renewal, $10.39 together, as at once
    const inv = v.inv.filter(r => r.dealId === 'sp3').sort((x, y) => x.ts - y.ts).map(r => [r.ms, r.base, r.fee, r.amt]);
    expect(inv).toEqual([[[2], 107.68, 5.38, 113.06], [[3], 100.12, 5.01, 105.13]]);
    await A.checkMoney(page, { bids: ['b5'], deals: ['sp3'] });
    await other.close();
  });

  test('D2 a tab that lost track of where both tabs started still keeps both tabs\' changes', async ({ page, context }) => {
    const id = await A.makeDeal(page, 'b3', 'Lost track', 300, ['Launch stream', 'Recap clip']);
    const other = await secondTab(context);
    await A.waitFor(other, i => GameInBX.S.deals.some(d => d.id === i), id);
    await A.api(page, 'forget');
    const pay = t => A.api(t, 'fund', id, 'next', 'pm1'), offer = t => A.api(t, 'send', { bid: 'b4', title: 'Kept too', amt: 90, items: [{ label: 'Post', days: 4 }] });
    const [paid, sent] = await sameMoment(page, other, pay, offer);
    expect(paid.st).toBe('in escrow');
    const v = await settled([page, other]);
    expect(v.esc[id + ':0'].st).toBe('in escrow');
    expect(v.offers.some(x => x[0] === sent.id)).toBe(true);
    expect(v.msgs).toEqual(expect.arrayContaining(['sent from the first tab', 'sent from the second tab']));
    expect((await A.api(page, 'merges')).storeBlind).toBeGreaterThan(0);
    await A.checkMoney(page, { bids: ['b3'], deals: [id] });
    await other.close();
  });

  test('D2 P7 a seeded proof is saved once, with its share, and approved with its date in the same save', async ({ page }) => {
    // every save of the seeded deals' proofs, as the other tab would read it
    await page.evaluate(() => { window.__loopSaves = []; const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'gib-loop') window.__loopSaves.push(v); return set.call(this, k, v); }; });
    const pid = await A.api(page, 'seedUpload', 'sp1');
    const share = await page.evaluate(i => GameInLoop.S.proofs.find(p => p.id === i).value, pid);
    expect(A.M.C(share)).toBe(37500);
    await page.evaluate(i => GameInLoop.approve(i), pid);
    const saves = await page.evaluate(i => window.__loopSaves.map(v => (JSON.parse(v).proofs || []).find(p => p.id === i)).filter(Boolean), pid);
    expect(saves.length).toBeGreaterThan(0);
    // never another value, and never released without its date
    expect(saves.filter(p => A.M.C(p.value) !== 37500)).toEqual([]);
    expect(saves.filter(p => p.status === 'released' && !p.relAt)).toEqual([]);
    expect(saves[saves.length - 1].status).toBe('released');
  });

  test('D3 reset demo clears everything, in every open tab', async ({ page, context }) => {
    const id = await A.makeDeal(page, 'b3', 'Before reset', 100, ['Clip']);
    await A.api(page, 'fund', id, 'all', 'pm1');
    const other = await context.newPage();
    await other.goto(A.PAGE);
    await A.enterDemo(other);
    expect(await other.evaluate(i => !!GameInBX.S.deals.find(d => d.id === i), id)).toBe(true);
    await page.evaluate(() => GameInBrand.demoReset(false)).catch(() => {});
    await page.waitForLoadState('load');
    await A.enterDemo(page);
    const s = await page.evaluate(() => ({ deals: GameInBX.S.deals.length, offers: GameInBX.S.offers.filter(o => !o.seeded && !['of_fsx', 'of_testy', 'of_qw', 'of_co'].includes(o.id)).length, inv: GameInBX.S.inv.length, loop: GameInLoop.S.proofs.filter(p => !p.seed).length }));
    expect(s).toEqual({ deals: 0, offers: 0, inv: 0, loop: 0 });
    // the other tab reloads too, instead of writing the old data back
    await other.waitForLoadState('load');
    await A.enterDemo(other);
    expect(await other.evaluate(() => GameInBX.S.deals.length)).toBe(0);
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gib-bx') || '{"deals":[]}').deals.length)).toBe(0);
    await other.close();
  });
});
