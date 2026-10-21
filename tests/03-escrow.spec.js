// Deals and escrow: how money gets into escrow (card, bank, wire), funding part or all of a deal,
// and the rule that a creator can't deliver against money that isn't there.
const { test, expect } = require('@playwright/test');
const A = require('./support/app');

// fund escrow through the brand's own dialog on the deal page
async function fundViaDialog(page, { scope, method } = {}) {
  await A.tap(page, '#gamein-root .gbx-hero .gc-btn', 'fund escrow');
  const m = page.locator('.gbx-modal');
  await expect(m).toBeVisible();
  if (scope) await m.locator('.gbx-seg button', { hasText: scope }).click();
  if (method) await m.locator('.gbx-pm', { hasText: method }).click();
  const go = m.locator('.gbx-act .gc-btn.is-primary');
  const label = await go.textContent();
  await go.click();
  await expect(m.locator('.gbx-done')).toBeVisible({ timeout: 8000 });
  const summary = await m.locator('.gbx-done').innerText();
  await m.locator('button', { hasText: 'done' }).click();
  await A.settle(page, 400);
  return { label, summary };
}
const msRow = (page, i) => page.locator('#gamein-root .gbx-table[aria-label="Payment milestones"] .gbx-tr:not(.is-h)').nth(i);

test.describe('escrow', () => {
  test.beforeEach(async ({ page }) => { await A.startDemo(page); });
  test.afterEach(async ({ page }) => { A.noErrors(page); });

  test('E1 a new deal starts with nothing funded; the creator can\'t upload and is told why', async ({ page }) => {
    const id = await A.makeDeal(page, 'b3', 'Unfunded deal', 300, ['Stream', 'Clip', 'Post']);
    await A.brand(page, 'b3', 'deals', id);
    await expect(page.locator('#gamein-root .gbx-hero')).toContainText('awaiting funding');
    for (let i = 0; i < 3; i++) await expect(msRow(page, i)).toContainText('not funded');
    await expect(page.locator('#gamein-root .gbx-hero .gc-btn', { hasText: 'fund escrow' })).toBeVisible();
    await A.creator(page, { deal: id });
    const why = A.isPhone(page) ? page.locator('.gm-actbar') : page.locator('#gamein-root .gib-next');
    await expect(why).toContainText('GRIDFUEL hasn\'t funded escrow for the next deliverable yet');
    expect(await A.api(page, 'upload', id)).toBe(null);
    await A.checkMoney(page, { bids: ['b3'], deals: [id] });
  });

  test('E2 funding by card puts the milestone in escrow at once; the creator can start', async ({ page }) => {
    const id = await A.makeDeal(page, 'b3', 'Card deal', 300, ['Stream', 'Clip']);
    await A.brand(page, 'b3', 'deals', id);
    const r = await fundViaDialog(page, {});
    expect(r.label).toContain('fund $157.50');
    expect(r.summary).toContain('Escrow funded');
    await expect(msRow(page, 0)).toContainText('in escrow');
    await expect(msRow(page, 1)).toContainText('not funded');
    await A.brand(page, 'b3', 'payments');
    await expect(page.locator('#gamein-root .gbx-table[aria-label="Receipts"]')).toContainText('$157.50');
    await A.creator(page, { deal: id });
    await A.creatorDealTab(page, 'deliverables');
    await expect(page.locator('#gamein-root .gi-v5-check-row').first()).toContainText('Ready to deliver');
    await expect(page.locator('#gamein-root .gi-v5-check-row').nth(1)).toContainText('Not funded yet');
    await A.checkMoney(page, { bids: ['b3'], deals: [id] });
  });

  test('E3 funding by bank is processing until it clears; the creator waits, then can start', async ({ page }) => {
    const id = await A.makeDeal(page, 'b3', 'Bank deal', 300, ['Stream', 'Clip']);
    await A.brand(page, 'b3', 'deals', id);
    const r = await fundViaDialog(page, { method: 'Chase bank' });
    expect(r.summary).toContain('Bank payment processing');
    await expect(msRow(page, 0)).toContainText('processing');
    await A.brand(page, 'b3', 'payments');
    const rec = page.locator('#gamein-root .gbx-table[aria-label="Receipts"] .gbx-tr').filter({ hasText: 'BANK DEAL' });
    await expect(rec).toContainText('processing');
    await A.creator(page, { deal: id });
    await A.creatorDealTab(page, 'deliverables');
    await expect(page.locator('#gamein-root .gi-v5-check-row').first()).toContainText('Funding clears');
    expect(await A.api(page, 'upload', id)).toBe(null);
    await A.brand(page, 'b3', 'deals', id);
    await msRow(page, 0).locator('button', { hasText: 'clears (demo)' }).click();
    await expect(msRow(page, 0)).toContainText('in escrow');
    // the receipt follows the payment
    await A.brand(page, 'b3', 'payments');
    await expect(rec).not.toContainText('processing');
    await A.creator(page, { deal: id });
    await A.creatorDealTab(page, 'deliverables');
    await expect(page.locator('#gamein-root .gi-v5-check-row').first()).toContainText('Ready to deliver');
    await A.checkMoney(page, { bids: ['b3'], deals: [id] });
  });

  test('E4 funding by wire waits for the wire, with a reference; then the creator can start', async ({ page }) => {
    const id = await A.makeDeal(page, 'b3', 'Wire deal', 2000, ['Launch stream', 'Recap video']);
    await A.brand(page, 'b3', 'deals', id);
    const r = await fundViaDialog(page, { method: 'wire transfer' });
    expect(r.label).toContain('get wire details');
    expect(r.summary).toContain('Waiting for your wire');
    expect(r.summary).toMatch(/GI-BO_[A-Z0-9]+-1/);
    await expect(msRow(page, 0)).toContainText('awaiting wire');
    await expect(msRow(page, 0)).toContainText('ref GI-');
    await A.creator(page, { deal: id });
    await A.creatorDealTab(page, 'deliverables');
    await expect(page.locator('#gamein-root .gi-v5-check-row').first()).toContainText('Funding clears');
    await A.brand(page, 'b3', 'deals', id);
    await msRow(page, 0).locator('button', { hasText: 'received (demo)' }).click();
    await expect(msRow(page, 0)).toContainText('in escrow');
    await A.creator(page, { deal: id });
    await A.creatorDealTab(page, 'deliverables');
    await expect(page.locator('#gamein-root .gi-v5-check-row').first()).toContainText('Ready to deliver');
    await A.checkMoney(page, { bids: ['b3'], deals: [id] });
  });

  test('E5 the brand funds the next milestone only, then everything remaining', async ({ page }) => {
    const id = await A.makeDeal(page, 'b3', 'Split funding', 100, ['Clip A', 'Clip B', 'Clip C']);
    await A.brand(page, 'b3', 'deals', id);
    const a = await fundViaDialog(page, { scope: 'next milestone' });
    expect(a.label).toContain('fund $35.00');
    await expect(msRow(page, 0)).toContainText('in escrow');
    await expect(msRow(page, 1)).toContainText('not funded');
    await expect(msRow(page, 2)).toContainText('not funded');
    const b = await fundViaDialog(page, { scope: 'everything remaining' });
    // 33.33 + 33.34 plus the fee on the running total: 5% of 100 is exactly 5.00 overall
    expect(b.label).toContain('fund $70.00');
    for (let i = 0; i < 3; i++) await expect(msRow(page, i)).toContainText('in escrow');
    await A.creator(page, { deal: id });
    await A.creatorDealTab(page, 'deliverables');
    const rows = page.locator('#gamein-root .gi-v5-check-row');
    await expect(rows.nth(0)).toContainText('Ready to deliver');
    await expect(rows.nth(1)).toContainText('Funded');
    await A.checkMoney(page, { bids: ['b3'], deals: [id] });
  });

  test('E6 proof can\'t be uploaded against money that isn\'t in escrow (shared deals)', async ({ page }) => {
    const id = await A.makeDeal(page, 'b3', 'No money yet', 200, ['Clip A', 'Clip B']);
    const before = await page.evaluate(() => GameInBX.S.proofs.length);
    await A.creator(page, { deal: id });
    // every upload button on the page explains instead of uploading
    if (!A.isPhone(page)) await expect(page.locator('#gamein-root .gib-next .gc-btn', { hasText: 'upload proof' })).toHaveCount(0);
    await A.tap(page, '#gamein-root .gi-v5-bottom-actions button', /upload proof/i);
    await A.creatorDealTab(page, 'deliverables');
    await page.locator('#gamein-root .gi-v5-check-row').first().click();
    expect(await A.api(page, 'upload', id)).toBe(null);
    expect(await page.evaluate(() => GameInBX.S.proofs.length)).toBe(before);
    // fund one milestone: exactly one deliverable becomes uploadable
    await A.api(page, 'fund', id, 'next', 'pm1');
    const p1 = await A.api(page, 'upload', id);
    expect(p1).toBeTruthy();
    expect(await A.api(page, 'upload', id)).toBe(null);
    expect(await page.evaluate(() => GameInBX.S.proofs.length)).toBe(before + 1);
  });

  test('E6 seeded deals: the creator can\'t claim more than is in escrow; the last deliverable waits for full funding', async ({ page }) => {
    // ORBITAL AUDIO has $215.36 in escrow and a $107.68 bonus not funded yet; three deliverables are open. Shares are
    // rounded down to the cent like every split: the first claims a third of what's in escrow ($71.78), the second half of
    // what's left ($71.79). Worked out here from the saved data, and written out by hand
    const share = async () => A.M.seedShare(await A.raw(page), 'sp3');
    const s1 = await share();
    expect(s1).toMatchObject({ ok: true, valueC: 7178, last: false });
    const g1 = await A.api(page, 'seedGate', 'sp3');
    expect(g1.ok).toBe(true);
    expect(A.M.C(g1.value)).toBe(s1.valueC);
    const p1 = await A.api(page, 'seedUpload', 'sp3');
    await page.evaluate(id => GameInLoop.approve(id), p1);
    const s2 = await share();
    expect(s2).toMatchObject({ ok: true, valueC: 7179, last: false });
    expect(A.M.C((await A.api(page, 'seedGate', 'sp3')).value)).toBe(s2.valueC);
    const p2 = await A.api(page, 'seedUpload', 'sp3');
    await page.evaluate(id => GameInLoop.approve(id), p2);
    expect((await share()).ok).toBe(false);
    const g3 = await A.api(page, 'seedGate', 'sp3');
    expect(g3.ok).toBe(false);
    expect(g3.why).toContain('ORBITAL AUDIO still has to fund the rest of this deal');
    // through the UI: the creator is told the same thing, and nothing is uploaded
    const n = await page.evaluate(() => GameInLoop.S.proofs.length);
    await A.creator(page, { deal: 'sp3' });
    const why = A.isPhone(page) ? page.locator('.gm-actbar') : page.locator('#gamein-root .gib-next');
    await expect(why).toContainText('still has to fund the rest of this deal');
    await A.tap(page, '#gamein-root .gi-v5-bottom-actions button', /upload proof/i);
    expect(await page.evaluate(() => GameInLoop.S.proofs.length)).toBe(n);
    // the brand funds the bonus: now the last deliverable releases everything left in escrow
    await A.brand(page, 'b5', 'deals', 'sp3');
    await fundViaDialog(page, {});
    const g4 = await A.api(page, 'seedGate', 'sp3');
    const s4 = await share();
    expect(s4).toMatchObject({ ok: true, last: true });
    expect(g4.ok).toBe(true);
    expect(g4.last).toBe(true);
    expect(A.M.C(g4.value)).toBe(s4.valueC);
    // $215.36 + $107.68 funded, $143.57 already paid out: $179.47 is left for the last deliverable
    expect(s4.valueC).toBe(21536 + 10768 - 7178 - 7179);
    await A.checkMoney(page, { bids: ['b5'], deals: ['sp3'] });
  });
});
