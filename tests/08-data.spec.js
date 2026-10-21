// Saved data: everything survives a reload (the seeded deals included), two tabs stay in step without
// overwriting each other, and reset demo really starts fresh.
const { test, expect } = require('@playwright/test');
const A = require('./support/app');

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
    // after the reload it is still releasing while its window runs, and released, dated when the window ended, after it
    const st = await page.evaluate(i => { const x = GameInBX.S.proofs.find(y => y.id === i); return { status: x.status, now: Date.now(), releaseAt: x.releaseAt, relAt: x.relAt }; }, p);
    if (st.now < due) expect(st).toEqual({ status: 'releasing', now: st.now, releaseAt: due, relAt: undefined });
    else expect(st.relAt).toBe(due);
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
