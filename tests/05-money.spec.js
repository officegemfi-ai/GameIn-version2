// Money to the cent: splits, both fees, conservation on every screen, and the wallet rows.
// The expected numbers come from tests/support/money.js, which implements the rules on its own.
const { test, expect } = require('@playwright/test');
const A = require('./support/app');
const { M } = A;

test.describe('money', () => {
  test.beforeEach(async ({ page }) => { await A.startDemo(page); });
  test.afterEach(async ({ page }) => { A.noErrors(page); });

  test('M1 milestones split the deal value to the cent, and both views show the same split', async ({ page }) => {
    // 20.06 over 2 and 51 over 5 are prices where splitting in floating point comes out a cent off
    const cases = [[100, 3], [0.1, 3], [999.99, 7], [1250, 4], [33.33, 2], [20.06, 2], [51, 5]];
    const ids = [];
    for (const [amt, n] of cases) {
      const id = await A.makeDeal(page, 'b3', 'Split ' + amt + ' by ' + n, amt, Array.from({ length: n }, (_, i) => 'Item ' + (i + 1)));
      const d = await A.api(page, 'deal', id);
      const want = M.split(M.C(amt), n);
      expect(d.ms.map(m => M.C(m.amt)), amt + ' over ' + n).toEqual(want);
      expect(want.reduce((x, y) => x + y, 0)).toBe(M.C(amt));
      ids.push(id);
    }
    // the brand's milestone table and the creator's payment list show the same amounts
    await A.checkMoney(page, { bids: ['b3'], deals: ids.slice(0, 3) });
  });

  test('M1 the split is exact for any price: 3,000 random prices and deliverable counts', async ({ page }) => {
    let seed = 20261021;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const cases = Array.from({ length: 3000 }, () => [Math.round((0.01 + rnd() * 25000) * 100) / 100, 1 + Math.floor(rnd() * 12)]);
    const got = await page.evaluate(cs => cs.map(([a, n]) => GameInBX.api.shares(a, n).map(x => [Math.round(x * 100), Math.abs(x * 100 - Math.round(x * 100)) < 1e-6])), cases);
    const bad = [];
    cases.forEach(([a, n], k) => {
      const want = M.split(M.C(a), n), cents = got[k].map(x => x[0]);
      if (JSON.stringify(cents) !== JSON.stringify(want) || got[k].some(x => !x[1])) bad.push(a + ' over ' + n + ': ' + JSON.stringify(cents) + ' expected ' + JSON.stringify(want));
    });
    expect(bad.slice(0, 10), bad.length + ' prices split wrong').toEqual([]);
    // and deals made at a sample of those prices store exactly that split
    const ids = [];
    for (const [a, n] of cases.slice(0, 12)) ids.push(await A.makeDeal(page, 'b6', 'Random split ' + a, a, Array.from({ length: n }, (_, i) => 'Item ' + (i + 1))));
    await A.checkMoney(page, { bids: ['b6'] });
  });

  test('M2 the brand fee is 5% of everything funded on a deal, rounded once: funding in parts costs the same', async ({ page }) => {
    // $100 over three deliverables: 33.33 + 33.33 + 33.34. Rounding each part separately would charge $5.01 in fees.
    const a = await A.makeDeal(page, 'b3', 'Fee in parts', 100, ['Clip A', 'Clip B', 'Clip C']);
    const b = await A.makeDeal(page, 'b3', 'Fee at once', 100, ['Clip A', 'Clip B', 'Clip C']);
    const parts = [];
    for (let k = 0; k < 3; k++) parts.push(await A.api(page, 'fund', a, 'next', 'pm1'));
    const once = await A.api(page, 'fund', b, 'all', 'pm1');
    const feesParts = parts.reduce((x, r) => x + M.C(r.fee), 0);
    expect(parts.map(r => M.C(r.fee))).toEqual(M.brandFees(0, [3333, 3333, 3334]));
    expect(feesParts).toBe(500);
    expect(M.C(once.fee)).toBe(500);
    expect(parts.reduce((x, r) => x + M.C(r.total), 0)).toBe(M.C(once.total));
    // the receipts on the payments tab say the same
    await A.brand(page, 'b3', 'payments');
    const rec = await page.locator('#gamein-root .gbx-table[aria-label="Receipts"] .gbx-tr', { hasText: 'FEE IN PARTS' }).allTextContents();
    expect(rec.map(t => M.cents(t)).sort((x, y) => x - y)).toEqual([3499, 3500, 3501]);
    await A.checkMoney(page, { bids: ['b3'], deals: [a, b] });
  });

  test('M3 the creator fee is 5% of everything released on a deal, rounded once: the payouts add up to what the offer promised', async ({ page }) => {
    const id = await A.makeDeal(page, 'b3', 'Creator fee', 100, ['Clip A', 'Clip B', 'Clip C']);
    // what the offer card promised before accepting is checked in O1; here: $100 deal -> $95.00 to the creator
    await A.api(page, 'fund', id, 'all', 'pm1');
    for (let k = 0; k < 3; k++) {
      const pid = await A.api(page, 'upload', id);
      await A.api(page, 'approve', pid);
    }
    await A.waitFor(page, i => GameInBX.S.proofs.filter(p => p.dealId === i && p.status === 'released').length === 3, id, 15000);
    const r = await A.checkMoney(page, { bids: ['b3'], deals: [id] });
    const mine = r.pays.filter(p => p.dealId === id);
    expect(mine.reduce((x, p) => x + p.feeC, 0)).toBe(500);
    expect(mine.reduce((x, p) => x + p.netC, 0)).toBe(9500);
    const eng = await page.evaluate(i => GameInBX.api.releases().filter(x => x.dealId === i).map(x => [x.fee, x.net]), id);
    expect(eng.reduce((x, p) => x + M.C(p[1]), 0)).toBe(9500);
  });

  test('M4 money is conserved on every screen through a mixed scenario', async ({ page }) => {
    const x = await A.makeDeal(page, 'b3', 'Mixed one', 650, ['Stream', 'Clip', 'Post']);
    const y = await A.makeDeal(page, 'b3', 'Mixed two', 210.5, ['Video', 'Short']);
    await A.api(page, 'fund', x, 'next', 'pm1');            // card: in escrow
    await A.api(page, 'fund', x, 'next', 'pm2');            // bank: processing
    await A.api(page, 'fund', y, 'all', 'wire');            // wire: awaiting
    const p1 = await A.api(page, 'upload', x);
    await A.api(page, 'approve', p1);
    await A.api(page, 'clear', y, 0);                       // the wire lands: both milestones in escrow
    const p2 = await A.api(page, 'upload', y);
    await A.api(page, 'changes', p2);
    await A.waitFor(page, i => GameInBX.S.proofs.find(p => p.id === i).status === 'released', p1, 12000);
    await A.checkMoney(page, { bids: ['b3'], deals: [x, y] });
    // and on a seeded deal, alongside
    await A.brand(page, 'b5', 'deals', 'sp3');
    const g = await A.api(page, 'seedUpload', 'sp3');
    await page.evaluate(id => GameInLoop.approve(id), g);
    await A.checkMoney(page, { bids: ['b3', 'b5'], deals: [x, y, 'sp3'] });
  });

  test('M5 the wallet has one release row and one fee row per payout, and moves by exactly those rows', async ({ page }) => {
    const before = await A.creatorWallet(page);
    const id = await A.makeDeal(page, 'b3', 'Wallet rows', 333.33, ['Clip A', 'Clip B']);
    await A.api(page, 'fund', id, 'all', 'pm1');
    const pids = [await A.api(page, 'upload', id), await A.api(page, 'upload', id)];
    for (const p of pids) { await A.api(page, 'approve', p); await page.waitForTimeout(150); }
    await A.waitFor(page, i => GameInBX.S.proofs.filter(p => p.dealId === i && p.status === 'released').length === 2, id, 15000);
    const after = await A.creatorWallet(page);
    const added = after.rows.slice(0, 4);
    expect(added.map(r => r[1])).toEqual(['escrow release', 'fee', 'escrow release', 'fee']);
    const moved = added.reduce((x, r) => x + M.cents(r[3]), 0);
    expect(M.cents(after.available) - M.cents(before.available)).toBe(moved);
    // 166.66 and 166.67 released; fees on the running total: 8.33 then 8.34 (5% of 333.33 is 16.67 overall)
    expect(added.map(r => M.cents(r[3]))).toEqual([16667, -834, 16666, -833]);
    // exactly one release row and one fee row per payout today: nothing doubled, nothing missing
    const today = await page.evaluate(() => new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
    const todays = after.rows.filter(r => r[0] === today && /escrow release|fee/.test(r[1]));
    expect(todays.length).toBe(2 * pids.length);
    await A.checkMoney(page, { bids: ['b3'], deals: [id] });
  });
});
