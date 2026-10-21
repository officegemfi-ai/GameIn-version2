// Proof and payouts: upload, approve with an undo window, request changes, complete the deal,
// release exactly once, and the creator's existing (seeded) deals paying out from what's in escrow.
const { test, expect } = require('@playwright/test');
const A = require('./support/app');

async function fundedDeal(page, title, amt, labels, scope = 'all') {
  const id = await A.makeDeal(page, 'b3', title, amt, labels);
  await A.api(page, 'fund', id, scope, 'pm1');
  return id;
}
const proofCard = (page, item) => page.locator('#gamein-root .gbw-proof').filter({ has: page.locator('.gbw-proof__t b', { hasText: new RegExp('^' + item + '$') }) });
const creatorRow = (page, i) => page.locator('#gamein-root .gi-v5-check-row').nth(i);

test.describe('proof', () => {
  test.beforeEach(async ({ page }) => { await A.startDemo(page); });
  test.afterEach(async ({ page }) => { A.noErrors(page); });

  test('P1 creator uploads proof for a funded deliverable; it lands in the brand\'s approvals with its amount', async ({ page }) => {
    const id = await fundedDeal(page, 'Proof deal', 300, ['Launch stream', 'Recap clip']);
    await A.creator(page, { deal: id });
    await A.creatorUpload(page);
    await A.waitFor(page, i => GameInBX.S.proofs.some(p => p.dealId === i && p.status === 'review'), id);
    await A.creatorDealTab(page, 'deliverables');
    await expect(creatorRow(page, 0)).toContainText('In review');
    await A.brand(page, 'b3', 'approvals');
    const pc = proofCard(page, 'Launch stream');
    await expect(pc).toContainText('$150.00');
    await expect(pc).toContainText('Instant Shock, PROOF DEAL');
    await expect(pc.locator('.gc-btn', { hasText: 'approve & release' })).toBeVisible();
    await A.brand(page, 'b3', 'deals', id);
    await expect(page.locator('#gamein-root .gbx-items')).toContainText('proof in review');
  });

  test('P2 brand approves: after the undo window the milestone is released and 95% reaches the wallet', async ({ page }) => {
    const id = await fundedDeal(page, 'Release deal', 300, ['Launch stream', 'Recap clip']);
    const pid = await A.api(page, 'upload', id);
    await A.brand(page, 'b3', 'approvals');
    await proofCard(page, 'Launch stream').locator('.gc-btn', { hasText: 'approve & release' }).click();
    await expect(proofCard(page, 'Launch stream').locator('.gc-btn', { hasText: /undo, releasing in \ds/ })).toBeVisible();
    await A.waitFor(page, i => GameInBX.S.proofs.find(p => p.id === i).status === 'released', pid, 12000);
    await A.brand(page, 'b3', 'deals', id);
    await expect(page.locator('#gamein-root .gbx-items li').first()).toContainText('approved, paid');
    await A.creator(page, { deal: id });
    await A.creatorDealTab(page, 'deliverables');
    await expect(creatorRow(page, 0)).toContainText('Released');
    await A.creator(page, { thread: 'b3' });
    await expect(page.locator('#gamein-root .gc-body')).toContainText('GRIDFUEL approved Launch stream. $150.00 released, $142.50 lands in your wallet after the 5% fee.');
    const r = await A.checkMoney(page, { bids: ['b3'], deals: [id] });
    expect(r.net).toBe(14250);
  });

  test('P3 undo during the window cancels the release: back in review, nothing paid', async ({ page }) => {
    const id = await fundedDeal(page, 'Undo deal', 300, ['Launch stream', 'Recap clip']);
    const pid = await A.api(page, 'upload', id);
    await A.brand(page, 'b3', 'approvals');
    await proofCard(page, 'Launch stream').locator('.gc-btn', { hasText: 'approve & release' }).click();
    await page.waitForTimeout(800); // a person reads the countdown before changing their mind
    await proofCard(page, 'Launch stream').locator('.gc-btn', { hasText: /undo, releasing/ }).click();
    await page.waitForTimeout(7500);
    expect(await page.evaluate(i => GameInBX.S.proofs.find(p => p.id === i).status, pid)).toBe('review');
    await expect(proofCard(page, 'Launch stream').locator('.gc-btn', { hasText: 'approve & release' })).toBeVisible();
    await A.creator(page, { deal: id });
    await A.creatorDealTab(page, 'deliverables');
    await expect(creatorRow(page, 0)).toContainText('In review');
    const r = await A.checkMoney(page, { bids: ['b3'], deals: [id] });
    expect(r.net).toBe(0);
  });

  test('P3 approving again after an undo starts a new window: the first one doesn\'t release it early, and it pays once', async ({ page }) => {
    const id = await fundedDeal(page, 'Again deal', 300, ['Launch stream', 'Recap clip']);
    const pid = await A.api(page, 'upload', id);
    await A.brand(page, 'b3', 'approvals');
    const pc = proofCard(page, 'Launch stream');
    await pc.locator('.gc-btn', { hasText: 'approve & release' }).click();
    const first = await page.evaluate(i => GameInBX.S.proofs.find(p => p.id === i).releaseAt, pid);
    await page.waitForTimeout(1000);
    await pc.locator('.gc-btn', { hasText: /undo, releasing/ }).click();
    await page.waitForTimeout(1500);
    await pc.locator('.gc-btn', { hasText: 'approve & release' }).click();
    const second = await page.evaluate(i => GameInBX.S.proofs.find(p => p.id === i).releaseAt, pid);
    expect(second - first).toBeGreaterThan(2000);
    // past the end of the first window: still releasing
    await page.waitForFunction(t => Date.now() > t + 800, first);
    expect(await page.evaluate(i => GameInBX.S.proofs.find(p => p.id === i).status, pid)).toBe('releasing');
    await A.waitFor(page, i => GameInBX.S.proofs.find(p => p.id === i).status === 'released', pid, 12000);
    const done = await page.evaluate(i => GameInBX.S.proofs.find(p => p.id === i), pid);
    expect(done.relAt).toBe(second);
    expect(await page.evaluate(() => GameInBX.api.releases().length)).toBe(1);
    const r = await A.checkMoney(page, { bids: ['b3'], deals: [id] });
    expect(r.net).toBe(14250);
  });

  test('P4 brand requests changes; the creator fixes and re-uploads, and it\'s back in review', async ({ page }) => {
    const id = await fundedDeal(page, 'Changes deal', 300, ['Launch stream', 'Recap clip']);
    await A.api(page, 'upload', id);
    await A.brand(page, 'b3', 'approvals');
    await proofCard(page, 'Launch stream').locator('.gc-btn', { hasText: 'request changes' }).click();
    await A.brand(page, 'b3', 'deals', id);
    await expect(page.locator('#gamein-root .gbx-items li').first()).toContainText('changes requested');
    await A.creator(page, { deal: id });
    await A.creatorDealTab(page, 'deliverables');
    await expect(creatorRow(page, 0)).toContainText('Fix and re-upload');
    await expect(page.locator(A.isPhone(page) ? '.gm-actbar' : '#gamein-root .gib-next')).toContainText('Upload proof for Launch stream');
    await A.creatorUpload(page);
    await A.waitFor(page, i => { const ps = GameInBX.S.proofs.filter(p => p.dealId === i && p.idx === 0); return ps.length === 2 && ps.some(p => p.status === 'review'); }, id);
    await A.creatorDealTab(page, 'deliverables');
    await expect(creatorRow(page, 0)).toContainText('In review');
    await A.creator(page, { thread: 'b3' });
    await expect(page.locator('#gamein-root .gc-body')).toContainText('GRIDFUEL asked for changes on Launch stream');
  });

  test('P5 when every deliverable is released the deal completes on both sides', async ({ page }) => {
    const id = await fundedDeal(page, 'Complete deal', 200, ['Clip A', 'Clip B']);
    for (let k = 0; k < 2; k++) {
      const pid = await A.api(page, 'upload', id);
      await A.api(page, 'approve', pid);
    }
    await A.waitFor(page, i => GameInBX.S.proofs.filter(p => p.dealId === i && p.status === 'released').length === 2, id, 15000);
    await A.brand(page, 'b3', 'deals', id);
    await expect(page.locator('#gamein-root .gbx-hero')).toContainText('completed');
    await expect(page.locator('#gamein-root .gc-btn', { hasText: 'rate Instant Shock' })).toBeVisible();
    await expect(page.locator('#gamein-root .gc-btn', { hasText: 'book again' })).toBeVisible();
    await A.creator(page, { deal: id });
    await expect(page.locator('#gamein-root .gbx-cbans')).toContainText('Deal complete.');
    await expect(page.locator('#gamein-root .gbx-cban .gc-btn', { hasText: 'rate GRIDFUEL' })).toBeVisible();
    await A.creator(page, { page: 'sponsorships' });
    await expect(page.locator('#gamein-root')).toContainText('paid in full');
    await A.checkMoney(page, { bids: ['b3'], deals: [id] });
  });

  test('P6 a proof is released once: a double click, a second approve and a second tab all do nothing', async ({ page, context }) => {
    const id = await fundedDeal(page, 'Once deal', 300, ['Launch stream', 'Recap clip']);
    const pid = await A.api(page, 'upload', id);
    await A.brand(page, 'b3', 'approvals');
    await proofCard(page, 'Launch stream').locator('.gc-btn', { hasText: 'approve & release' }).dblclick();
    expect(await A.api(page, 'approve', pid)).toBe(false);
    // a second tab, open on the same approvals list
    const p2 = await context.newPage();
    await p2.goto(A.PAGE);
    await A.enterDemo(p2);
    expect(await A.api(p2, 'approve', pid)).toBe(false);
    await A.waitFor(page, i => GameInBX.S.proofs.find(p => p.id === i).status === 'released', pid, 12000);
    await page.waitForTimeout(1500);
    expect(await A.api(p2, 'approve', pid)).toBe(false);
    const rel = await page.evaluate(() => GameInBX.api.releases().length);
    expect(rel).toBe(1);
    const r = await A.checkMoney(page, { bids: ['b3'], deals: [id] });
    expect(r.net).toBe(14250);
    await p2.close();
  });

  test('P6 two tabs approving the same proof at the same moment release it once', async ({ page, context }) => {
    const id = await fundedDeal(page, 'Race deal', 300, ['Launch stream', 'Recap clip']);
    const pid = await A.api(page, 'upload', id);
    const p2 = await context.newPage();
    await p2.goto(A.PAGE);
    await A.enterDemo(p2);
    await A.waitFor(p2, i => GameInBX.S.proofs.some(p => p.id === i), pid);
    const both = await Promise.all([A.api(page, 'approve', pid), A.api(p2, 'approve', pid)]);
    expect(both).toContain(true);
    const windows = await Promise.all([page, p2].map(t => t.evaluate(i => GameInBX.S.proofs.find(p => p.id === i).releaseAt, pid)));
    await A.waitFor(page, i => GameInBX.S.proofs.find(p => p.id === i).status === 'released', pid, 15000);
    await page.waitForTimeout(3000);
    const seen = [];
    for (const t of [page, p2]) {
      expect(await t.evaluate(i => GameInBX.S.proofs.filter(p => p.id === i).map(p => p.status), pid)).toEqual(['released']);
      expect(await t.evaluate(i => GameInBX.api.releases().filter(r => r.id === i).length, pid)).toBe(1);
      seen.push(await t.evaluate(i => GameInBX.S.proofs.find(p => p.id === i).relAt, pid));
    }
    // dated once, the same in both tabs: when the undo window that won ended
    expect(seen[0]).toBe(seen[1]);
    expect(windows).toContain(seen[0]);
    const r = await A.checkMoney(page, { bids: ['b3'], deals: [id] });
    expect(r.net).toBe(14250);
    await p2.close();
  });

  test('P6 D2 two tabs that can\'t see each other\'s save both approve the same proof: released once, dated once', async ({ page, context }) => {
    const id = await fundedDeal(page, 'Blind race', 300, ['Launch stream', 'Recap clip']);
    const pid = await A.api(page, 'upload', id);
    const p2 = await context.newPage();
    p2.__errors = [];
    p2.on('pageerror', e => p2.__errors.push(String((e && e.message) || e)));
    await p2.goto(A.PAGE);
    await A.enterDemo(p2);
    await A.waitFor(p2, i => GameInBX.S.proofs.some(p => p.id === i), pid);
    // each tab is held back from the other's saves (as the browser does while a tab is writing): both approvals go through
    await A.api(page, 'hold', true);
    await A.api(p2, 'hold', true);
    expect(await A.api(page, 'approve', pid)).toBe(true);
    expect(await A.api(p2, 'approve', pid)).toBe(true);
    const windows = await Promise.all([page, p2].map(t => t.evaluate(i => GameInBX.S.proofs.find(p => p.id === i).releaseAt, pid)));
    await A.api(page, 'hold', false);
    await A.api(p2, 'hold', false);
    for (const t of [page, p2]) await A.waitFor(t, i => GameInBX.S.proofs.find(p => p.id === i).status === 'released', pid, 15000);
    await page.waitForTimeout(Math.max(0, Math.max(...windows) - Date.now()) + 2000);
    const seen = [];
    for (const t of [page, p2]) {
      seen.push(await t.evaluate(i => { const p = GameInBX.S.proofs.find(x => x.id === i); return { status: p.status, relAt: p.relAt, open: 'releaseAt' in p, paid: GameInBX.api.releases().filter(r => r.id === i).length }; }, pid));
      expect(await A.rulesHold(t)).toEqual([]);
    }
    expect(seen[0]).toEqual(seen[1]);
    expect(seen[0]).toMatchObject({ status: 'released', open: false, paid: 1 });
    expect(windows).toContain(seen[0].relAt);
    // the two approvals really collided: one tab merged them
    const merged = (await A.api(page, 'merges')).store + (await A.api(p2, 'merges')).store;
    expect(merged).toBeGreaterThan(0);
    const r = await A.checkMoney(page, { bids: ['b3'], deals: [id] });
    expect(r.net).toBe(14250);
    expect(p2.__errors).toEqual([]);
    await p2.close();
  });

  test('P7 seeded deal: the approved proof releases its share of escrow; the creator gets 95% and the deliverable is done', async ({ page }) => {
    // HYPERCORE's July payout is in escrow; the share each open July deliverable releases comes from the saved data
    const share = A.M.seedShare(await A.raw(page), 'sp1');
    const seeded = await page.evaluate(() => JSON.parse(JSON.stringify(GameInLoop.S.proofs.find(p => p.dealId === 'sp1' && p.status === 'review'))));
    expect(seeded.item).toBe('Mid-roll segment #2');
    // written out by hand: $1,500.00 for July in escrow, four July deliverables still open (one in review): $375.00 each
    expect(share).toMatchObject({ ok: true, valueC: 37500, last: false });
    expect(A.M.C(seeded.value)).toBe(37500);
    await A.brand(page, 'b2', 'approvals');
    const pc = proofCard(page, 'Mid-roll segment #2');
    await expect(pc).toContainText(A.M.fmt(A.M.C(seeded.value)));
    await A.brand(page, 'b2', 'payments');
    const before = await A.brandTiles(page);
    expect(A.M.cents(before['in escrow'])).toBe(150000);
    await A.brand(page, 'b2', 'approvals');
    await pc.locator('.gc-btn', { hasText: 'approve & release' }).click();
    await A.waitFor(page, () => GameInLoop.S.proofs.some(p => p.item === 'Mid-roll segment #2' && p.status === 'released'), null, 15000);
    await A.brand(page, 'b2', 'payments');
    const after = await A.brandTiles(page);
    expect(A.M.cents(after['in escrow'])).toBe(A.M.cents(before['in escrow']) - A.M.C(seeded.value));
    await A.creator(page, { deal: 'sp1' });
    await A.creatorDealTab(page, 'deliverables');
    await expect(page.locator('#gamein-root .gi-v5-check-row', { hasText: 'Mid-roll segment #2' })).toHaveAttribute('data-done', 'true');
    const r = await A.checkMoney(page, { bids: ['b2'], deals: ['sp1'] });
    expect(r.net).toBe(A.M.C(seeded.value) - A.M.feeC(A.M.C(seeded.value)));
    // the next deliverable claims an even share of what's left, the same share the rule gives from the saved data
    const next = A.M.seedShare(r.raw, 'sp1');
    expect(next.ok).toBe(true);
    expect(A.M.C((await A.api(page, 'seedGate', 'sp1')).value)).toBe(next.valueC);
    expect(next.valueC).toBe(share.valueC);
  });

  test('P7 R3 seeded deals: a prepaid month and a funded renewal stay in escrow; proofs share only their own period\'s money', async ({ page }) => {
    const r0 = await A.raw(page);
    const sp1 = A.M.seedShare(r0, 'sp1'), sp2 = A.M.seedShare(r0, 'sp2');
    expect(sp1.ok && sp2.ok).toBe(true);
    // by hand: July's $1,500.00 over four open deliverables; XMAS TEASER DROP's $274.50 over its two deliverables
    expect([sp1.valueC, sp2.valueC]).toEqual([37500, 13725]);
    // HYPERCORE prepays August; NEXAWEAR renews XMAS TEASER DROP and funds the renewal
    expect((await A.api(page, 'fund', 'sp1', 'next', 'pm1')).st).toBe('in escrow');
    expect(await A.api(page, 'renew', 'sp2', 'request', { brand: 'NEXAWEAR', months: 1, price: 274.5 })).toBe('');
    expect(await A.api(page, 'renew', 'sp2', 'answer', { by: 'brand', st: 'accepted' })).toBe('');
    expect((await A.api(page, 'fund', 'sp2', 'next', 'pm1')).st).toBe('in escrow');
    const r1 = await A.raw(page);
    expect(A.M.seedShare(r1, 'sp1')).toEqual(sp1);
    expect(A.M.seedShare(r1, 'sp2')).toEqual(sp2);
    for (const [id, s] of [['sp1', sp1], ['sp2', sp2]]) expect(A.M.C((await A.api(page, 'seedGate', id)).value), id).toBe(s.valueC);
    // the creator uploads the next July deliverable from the deal page; HYPERCORE approves it
    await A.creator(page, { deal: 'sp1' });
    await A.creatorUpload(page);
    const pf = await page.evaluate(() => JSON.parse(JSON.stringify(GameInLoop.S.proofs.find(p => p.dealId === 'sp1' && p.status === 'review' && !p.seed) || null)));
    expect(pf).toBeTruthy();
    expect(pf.item).toBe(sp1.item);
    expect(A.M.C(pf.value)).toBe(sp1.valueC);
    await A.brand(page, 'b2', 'payments');
    const before = await A.brandTiles(page);
    await A.brand(page, 'b2', 'approvals');
    await proofCard(page, pf.item).locator('.gc-btn', { hasText: 'approve & release' }).click();
    await A.waitFor(page, i => GameInLoop.S.proofs.find(p => p.id === i).status === 'released', pf.id, 15000);
    await A.brand(page, 'b2', 'payments');
    const after = await A.brandTiles(page);
    expect(A.M.cents(after['in escrow'])).toBe(A.M.cents(before['in escrow']) - sp1.valueC);
    // August is still in escrow, untouched
    const d = await A.api(page, 'deal', 'sp1');
    expect(d.ms[2].st).toBe('in escrow');
    expect(d.ms[2].part).toBe(0);
    await A.checkMoney(page, { bids: ['b2', 'b4'], deals: ['sp1', 'sp2'] });
  });
});
