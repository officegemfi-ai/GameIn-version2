// Renewals: the brand offers one, the creator asks for one, either side answers once, and the new period
// arrives as milestones to fund. Book again on a finished shared deal sends the same package as a pitch.
const { test, expect } = require('@playwright/test');
const A = require('./support/app');

test.describe('renewals', () => {
  test.beforeEach(async ({ page }) => { await A.startDemo(page); });
  test.afterEach(async ({ page }) => { A.noErrors(page); });

  test('R1 R3 brand offers to renew the monthly deal; the creator accepts and the new months arrive unfunded', async ({ page }) => {
    await A.brand(page, 'b2', 'deals', 'sp1');
    await A.tap(page, '#gamein-root .gbx-ren .gc-btn', 'renew deal');
    await A.tap(page, '.gbx-modal .gbx-act button', 'send renewal offer');
    const ren = page.locator('#gamein-root .gbx-ren');
    await expect(ren).toContainText('renewal sent');
    await expect(ren).toContainText('Waiting for Instant Shock to accept');
    await A.creator(page, { deal: 'sp1' });
    const ban = page.locator('#gamein-root .gbx-cbans');
    await expect(ban).toContainText('HYPERCORE offered to renew: 3 months at $1,500.00/mo');
    await ban.locator('.gc-btn', { hasText: 'accept renewal' }).click();
    await expect(ban).toContainText('Renewed. 3 more months at $1,500.00/mo.');
    await expect(ban.locator('.gc-btn', { hasText: 'accept renewal' })).toHaveCount(0);
    await A.brand(page, 'b2', 'deals', 'sp1');
    await expect(ren).toContainText('Renewed for 3 more months at $1,500.00/mo');
    const rows = page.locator('#gamein-root .gbx-table[aria-label="Payment milestones"] .gbx-tr:not(.is-h)');
    await expect(rows).toHaveCount(6);
    for (let i = 3; i < 6; i++) { await expect(rows.nth(i)).toContainText('added by renewal'); await expect(rows.nth(i)).toContainText('not funded'); }
    await A.checkMoney(page, { bids: ['b2'], deals: ['sp1'] });
  });

  test('R2 R3 creator asks a brand to renew; the brand accepts on the deal', async ({ page }) => {
    await A.creator(page, { deal: 'sp2' });
    await A.tap(page, '#gamein-root .gi-v5-bottom-actions button', /renew deal/i);
    const ban = page.locator('#gamein-root .gbx-cbans');
    await expect(ban).toContainText('Renewal requested.');
    await expect(ban).toContainText('Waiting for NEXAWEAR to accept 1 more month at $274.50');
    await A.brand(page, 'b4', 'deals', 'sp2');
    const ren = page.locator('#gamein-root .gbx-ren');
    await expect(ren).toContainText('needs you');
    await expect(ren).toContainText('Instant Shock asked to renew: 1 month at $274.50');
    await ren.locator('.gc-btn', { hasText: 'accept renewal' }).click();
    await expect(ren).toContainText('Renewed for 1 more month at $274.50');
    await expect(page.locator('#gamein-root .gbx-table[aria-label="Payment milestones"]')).toContainText('Renewal payment');
    await A.creator(page, { deal: 'sp2' });
    await expect(ban).toContainText('Renewed.');
    await A.checkMoney(page, { bids: ['b4'], deals: ['sp2'] });
  });

  test('R4 a renewal request can be declined, and a renewal offer withdrawn; each is answered only once', async ({ page }) => {
    // the brand declines the creator's request
    await A.creator(page, { deal: 'sp2' });
    await A.tap(page, '#gamein-root .gi-v5-bottom-actions button', /renew deal/i);
    await A.brand(page, 'b4', 'deals', 'sp2');
    const ren = page.locator('#gamein-root .gbx-ren');
    await ren.locator('.gc-btn', { hasText: /^decline$/ }).click();
    await expect(ren).toContainText('You declined Instant Shock\'s renewal request');
    await expect(ren.locator('.gc-btn', { hasText: 'renew deal' })).toBeVisible();
    await A.creator(page, { deal: 'sp2' });
    await expect(page.locator('#gamein-root .gbx-cbans')).toContainText('Renewal declined. NEXAWEAR declined your request.');
    expect(await page.evaluate(() => GameInBX.S.ren.sp2.st)).toBe('declined');
    // the brand withdraws a renewal offer before the creator answers it
    await A.brand(page, 'b2', 'deals', 'sp1');
    await A.tap(page, '#gamein-root .gbx-ren .gc-btn', 'renew deal');
    await A.tap(page, '.gbx-modal .gbx-act button', 'send renewal offer');
    await A.tap(page, '#gamein-root .gbx-ren .gib-link', 'withdraw');
    await expect(ren).toContainText('Renew now so the next cycle starts without a gap');
    await A.creator(page, { deal: 'sp1' });
    await expect(page.locator('#gamein-root .gbx-cbans')).toHaveCount(0);
    expect(await page.evaluate(() => GameInBX.S.ren.sp1 || null)).toBe(null);
  });

  test('R4 a renewal is answered only once, even from a second tab that still shows it', async ({ page, context }) => {
    // HYPERCORE offers a renewal; the creator has the deal open in a second tab
    expect(await A.api(page, 'renew', 'sp1', 'offer', { months: 3, price: 1500 })).toBe('');
    const ct = await context.newPage();
    await ct.goto(A.PAGE);
    await A.enterDemo(ct);
    await A.creator(ct, { deal: 'sp1' });
    const ban = ct.locator('#gamein-root .gbx-cbans');
    await expect(ban.locator('.gc-btn', { hasText: 'accept renewal' })).toBeVisible();
    // the brand withdraws it in its own tab
    await A.brand(page, 'b2', 'deals', 'sp1');
    await A.tap(page, '#gamein-root .gbx-ren .gib-link', 'withdraw');
    // the creator's tab takes that in without a reload, and answering the old offer is refused
    await expect(ban.locator('.gc-btn', { hasText: 'accept renewal' })).toHaveCount(0);
    expect(await A.api(ct, 'renew', 'sp1', 'answer', { by: 'creator', st: 'accepted' })).toBe('This renewal offer was already answered');
    expect(await page.evaluate(() => GameInBX.S.ren.sp1 || null)).toBe(null);
    // a request the brand accepted can't be answered again, from either tab, and can't be requested again
    expect(await A.api(ct, 'renew', 'sp2', 'request', { brand: 'NEXAWEAR', months: 1, price: 274.5 })).toBe('');
    expect(await A.api(page, 'renew', 'sp2', 'answer', { by: 'brand', st: 'accepted' })).toBe('');
    expect(await A.api(ct, 'renew', 'sp2', 'answer', { by: 'brand', st: 'declined' })).toBe('This renewal request was already answered');
    expect(await A.api(ct, 'renew', 'sp2', 'request', { brand: 'NEXAWEAR' })).toBe('This deal is already renewed');
    for (const t of [page, ct]) expect(await t.evaluate(() => GameInBX.S.ren.sp2.st)).toBe('accepted');
    await ct.close();
  });

  test('R5 book again waits until the deal is complete, and sends one pitch at a time', async ({ page }) => {
    const id = await A.makeDeal(page, 'b3', 'Not yet', 200, ['Clip A', 'Clip B']);
    await A.api(page, 'fund', id, 'all', 'pm1');
    const n0 = await page.evaluate(() => GameInBX.S.offers.length);
    await A.creator(page, { deal: id });
    await A.tap(page, '#gamein-root .gi-v5-bottom-actions button', /book again/i);
    expect(await page.evaluate(() => GameInBX.S.offers.length)).toBe(n0);
    expect(await A.api(page, 'bookAgain', id)).toEqual({ sent: false, msg: 'You can book GRIDFUEL again once this deal is complete.' });
    for (let k = 0; k < 2; k++) { const p = await A.api(page, 'upload', id); await A.api(page, 'approve', p); await page.waitForTimeout(100); }
    await A.waitFor(page, i => GameInBX.S.proofs.filter(p => p.dealId === i && p.status === 'released').length === 2, id, 15000);
    expect((await A.api(page, 'bookAgain', id)).sent).toBe(true);
    const again = await A.api(page, 'bookAgain', id);
    expect(again.sent).toBe(false);
    expect(again.msg).toContain('already sent GRIDFUEL this package again');
    expect(await page.evaluate(i => GameInBX.S.offers.filter(o => o.again === i).length, id)).toBe(1);
  });

  test('R5 book again on a finished shared deal sends the brand the same package as a pitch', async ({ page }) => {
    const id = await A.makeDeal(page, 'b3', 'Run it back', 200, ['Clip A', 'Clip B']);
    await A.api(page, 'fund', id, 'all', 'pm1');
    for (let k = 0; k < 2; k++) { const p = await A.api(page, 'upload', id); await A.api(page, 'approve', p); await page.waitForTimeout(100); }
    await A.waitFor(page, i => GameInBX.S.proofs.filter(p => p.dealId === i && p.status === 'released').length === 2, id, 15000);
    await A.creator(page, { deal: id });
    await A.tap(page, '#gamein-root .gi-v5-bottom-actions button', /book again/i);
    const o = await page.evaluate(() => JSON.parse(JSON.stringify(GameInBX.S.offers.find(x => x.bid === 'b3' && x.pitch && x.title === 'RUN IT BACK'))));
    expect(o).toBeTruthy();
    expect(o.versions[0].amt).toBe(200);
    expect(o.versions[0].items.map(i => i.label)).toEqual(['Clip A', 'Clip B']);
    await A.brand(page, 'b3', 'offers');
    const row = A.offerRow(page, 'Run it back', A.card(page, 'Needs your response'));
    await expect(row).toContainText('pitch');
    await expect(row).toContainText('$200.00');
  });
});
