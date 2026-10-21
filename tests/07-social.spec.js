// Ratings, messages, the shared conversation, and the creator's packages on the brand side.
const { test, expect } = require('@playwright/test');
const A = require('./support/app');

async function completedDeal(page, title) {
  const id = await A.makeDeal(page, 'b3', title, 200, ['Clip A', 'Clip B']);
  await A.api(page, 'fund', id, 'all', 'pm1');
  for (let k = 0; k < 2; k++) { const p = await A.api(page, 'upload', id); await A.api(page, 'approve', p); await page.waitForTimeout(100); }
  await A.waitFor(page, i => GameInBX.S.proofs.filter(p => p.dealId === i && p.status === 'released').length === 2, id, 15000);
  return id;
}
async function rateAll(page, stars) {
  const groups = page.locator('.gbx-modal .gbx-stars');
  const n = await groups.count();
  for (let i = 0; i < n; i++) await groups.nth(i).locator('button').nth(stars - 1).click();
  await page.locator('.gbx-modal button', { hasText: 'submit rating' }).click();
  await A.settle(page);
}

test.describe('ratings, messages and packages', () => {
  test.beforeEach(async ({ page }) => { await A.startDemo(page); });
  test.afterEach(async ({ page }) => { A.noErrors(page); });

  test('T1 brand rates the creator after completion; the creator sees it in the conversation', async ({ page }) => {
    const id = await completedDeal(page, 'Rate creator');
    await A.brand(page, 'b3', 'deals', id);
    await A.tap(page, '#gamein-root .gc-btn', 'rate Instant Shock');
    await rateAll(page, 5);
    await expect(page.locator('#gamein-root')).toContainText(/You rated Instant Shock 5\.0 \/ 5 on/);
    await A.brand(page, 'b3', 'ratings');
    await expect(A.card(page, 'Your ratings')).toContainText('RATE CREATOR');
    await A.creator(page, { thread: 'b3' });
    await expect(page.locator('#gamein-root .gc-body')).toContainText('GRIDFUEL rated your work 5.0 / 5 for RATE CREATOR');
  });

  test('T2 creator rates the brand after completion; the brand sees it under ratings creators gave you', async ({ page }) => {
    const id = await completedDeal(page, 'Rate brand');
    await A.creator(page, { deal: id });
    await A.tap(page, '#gamein-root .gbx-cban .gc-btn', 'rate GRIDFUEL');
    await rateAll(page, 4);
    await expect(page.locator('#gamein-root .gbx-cbans')).toContainText('You rated GRIDFUEL 4.0 / 5.');
    await A.brand(page, 'b3', 'ratings');
    const got = A.card(page, 'Ratings creators gave you');
    await expect(got).toContainText('RATE BRAND');
    await expect(got).toContainText('4.0');
    await A.brand(page, 'b3', 'messages');
    await expect(page.locator('#gamein-root .gbx-msgs')).toContainText('Instant Shock rated you 4.0 / 5 for RATE BRAND');
  });

  test('C1 messages reach the other side, unread until opened, then marked seen', async ({ page }) => {
    await A.brand(page, 'b2', 'messages');
    await expect(page.locator('#gamein-root .gbx-thread__h')).toContainText('Instant Shock');
    await page.locator('#gamein-root .gbx-compose input').fill('Files for the next segment are up.');
    await page.locator('#gamein-root .gbx-compose .gc-btn', { hasText: 'send' }).click();
    await expect(page.locator('#gamein-root .gbx-msgs')).toContainText('Files for the next segment are up.');
    await expect(page.locator('#gamein-root .gbx-seen').last()).toHaveText('sent');
    // the creator has one unread message from HYPERCORE
    await A.creator(page, { page: 'inbox' });
    if (!A.isPhone(page)) await expect(page.locator('#gamein-root .gc-thread', { hasText: 'HYPERCORE' })).toContainText('Files for the next segment are up.');
    expect(await page.evaluate(() => GameInBrand.app.threads.find(t => t.who === 'b2').unread)).toBeGreaterThan(0);
    // the switch from the brand's chat lands on the same conversation
    await A.brand(page, 'b2', 'messages');
    await A.switchTo(page, 'creator');
    expect(await A.appPage(page)).toBe('inbox');
    await expect(page.locator('#gamein-root .gc-body')).toContainText('Files for the next segment are up.');
    await page.locator('#gamein-root .gc-compose textarea').fill('Got them, thanks. Posting Friday.');
    await page.locator('#gamein-root .gc-send').click();
    await expect(page.locator('#gamein-root .gc-body')).toContainText('Got them, thanks. Posting Friday.');
    await expect(page.locator('#gamein-root .gc-seen').last()).toContainText('sent');
    // the brand: unread until it opens the thread; its own message now shows as seen
    await A.brand(page, 'b2', 'overview');
    await expect(page.locator('#gamein-root .gbw-tabs [role=tab]', { hasText: /^messages/i })).toContainText(/messages \(\d\)/i);
    await A.brand(page, 'b2', 'messages');
    await expect(page.locator('#gamein-root .gbx-msgs')).toContainText('Got them, thanks. Posting Friday.');
    await expect(page.locator('#gamein-root .gbx-seen').last()).toHaveText('seen');
    await A.creator(page, { thread: 'b2' });
    await expect(page.locator('#gamein-root .gc-seen').last()).toContainText('seen');
  });

  test('C2 offer, deal, funding, proof and payout events appear in both sides\' conversation', async ({ page }) => {
    const id = await A.makeDeal(page, 'b3', 'Event trail', 300, ['Launch stream', 'Recap clip']);
    await A.api(page, 'fund', id, 'next', 'pm1');
    await A.api(page, 'fund', id, 'next', 'pm2');
    await A.api(page, 'clear', id, 1);
    const p = await A.api(page, 'upload', id);
    await A.api(page, 'approve', p);
    await A.waitFor(page, i => GameInBX.S.proofs.find(x => x.id === i).status === 'released', p, 12000);
    await A.brand(page, 'b3', 'messages');
    const b = page.locator('#gamein-root .gbx-msgs');
    for (const t of ['offer v1', 'Deal activated: Instant Shock accepted EVENT TRAIL at $300.00', 'You funded escrow: $150.00 for Launch stream (EVENT TRAIL)', 'You started a bank payment of $150.00 for Recap clip (EVENT TRAIL)', 'Your payment cleared: Recap clip (EVENT TRAIL) is in escrow', 'Instant Shock uploaded proof: Launch stream', 'You approved Launch stream. $150.00 released to Instant Shock']) await expect(b).toContainText(t);
    await A.creator(page, { thread: 'b3' });
    const c = page.locator('#gamein-root .gc-body');
    for (const t of ['Deal activated: you accepted EVENT TRAIL at $300.00', 'GRIDFUEL funded escrow: $150.00 for Launch stream (EVENT TRAIL)', 'GRIDFUEL started a bank payment for Recap clip (EVENT TRAIL) ($150.00)', 'GRIDFUEL\'s payment cleared: Recap clip (EVENT TRAIL) is in escrow', 'You uploaded proof: Launch stream', 'GRIDFUEL approved Launch stream. $150.00 released, $142.50 lands in your wallet']) await expect(c).toContainText(t);
  });

  test('K1 the creator\'s own packages are what brands can book; booking fills one deliverable per module', async ({ page }) => {
    const before = await page.evaluate(() => GameInBrand.app.offerings.length);
    await A.creator(page, { page: 'offerings' });
    await page.locator('#gamein-root .gpl-card', { hasText: /ultimate promoting package/i }).first().locator('.gpl-link', { hasText: 'duplicate' }).click();
    await A.settle(page, 500);
    expect(await page.evaluate(() => GameInBrand.app.offerings.length)).toBe(before + 1);
    const copy = await page.evaluate(() => JSON.parse(JSON.stringify(GameInBrand.app.offerings[GameInBrand.app.offerings.length - 1])));
    expect(copy.active).toBe(false);
    // a paused copy isn't bookable; publishing it makes it so
    await A.brand(page, 'b3', 'offers');
    await expect(page.locator('#gamein-root .gbx-pkg', { hasText: 'Instant Shock' })).toHaveCount(before);
    await A.creator(page, { page: 'offerings' });
    await page.locator('#gamein-root .gpl-card.is-paused .gpl-live').last().click();
    await A.settle(page, 400);
    await A.brand(page, 'b3', 'offers');
    const pkgs = page.locator('#gamein-root .gbx-pkg', { hasText: 'Instant Shock' });
    await expect(pkgs).toHaveCount(before + 1);
    const pk = pkgs.filter({ hasText: copy.title.replace(/\s+—\s+/g, ', ').toLowerCase().replace(/^\w/, c => c.toUpperCase()) }).first();
    await pk.locator('.gc-btn', { hasText: 'book' }).click();
    const m = page.locator('.gbx-modal');
    await expect(m.locator('select').first()).toHaveValue('Instant Shock');
    const labels = await m.locator('.gbx-dlv__r input').evaluateAll(xs => xs.map(x => x.value));
    expect(labels.length).toBe(copy.modules.length);
    await m.locator('.gbx-act button', { hasText: 'send offer' }).click();
    const o = await page.evaluate(() => JSON.parse(JSON.stringify(GameInBX.S.offers[0])));
    expect(o.creator).toBe('Instant Shock');
    expect(o.versions[0].amt).toBe(copy.price);
    expect(o.versions[0].items.length).toBe(copy.modules.length);
    await A.creator(page, { thread: 'b3' });
    await expect(A.offerCard(page, o.title)).toContainText('$' + copy.price.toFixed(2));
  });
});
