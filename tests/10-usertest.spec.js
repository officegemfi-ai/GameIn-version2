// The 15-minute user test runs inside the prototype (usability test mode). This walks both task sets the way a
// participant would, so the script handed to testers is known to work: each task's other-side move is prepared,
// completion is detected, and the session ends in the moderator panel with a CSV.
const { test, expect } = require('@playwright/test');
const A = require('./support/app');

async function startSession(page, role) {
  await page.evaluate(() => GameInBrand.testStart());
  const dlg = page.locator('.gt-start');
  await expect(dlg).toBeVisible();
  await dlg.locator('[data-r="' + role + '"]').click();
  await dlg.locator('[data-k="go"]').click();
  // the session resets the demo, reloads and resumes on its own
  await page.waitForFunction(() => document.querySelector('.gt-bar'), null, { timeout: 30000 });
  await page.addStyleTag({ content: '.gamein-cookie,.w24-cookie,.gds,.gdm,.gib-tour{display:none!important}' });
}
const bar = page => page.locator('.gt-bar');
async function done(page, ease) {
  await bar(page).locator('[data-k="done"]').click();
  await page.locator('.gt-seq [data-v="' + ease + '"]').click();
  await A.settle(page, 900);
}
const sessionOf = page => page.evaluate(() => { const all = JSON.parse(localStorage.getItem('gtest-sessions') || '{}'); return Object.values(all).sort((a, b) => b.startedAt - a.startedAt)[0]; });

test.describe('user test script', () => {
  test('creator session: five tasks, the brand\'s moves prepared, completion detected', async ({ page }) => {
    test.setTimeout(300000);
    await A.startDemo(page);
    await startSession(page, 'creator');
    // C1: answer GRIDFUEL's offer. The "looks done" hint stays hidden until it is
    await expect(bar(page)).toContainText('Answer an offer');
    await expect(bar(page).locator('.gt-auto')).toBeHidden();
    await A.creator(page, { thread: 'b3' });
    const c = A.offerCard(page, 'Holiday stream week');
    await expect(c).toContainText('$450.00');
    await expect(c).toContainText('You receive $427.50 after the 5% fee');
    await c.locator('.gc-btn', { hasText: 'accept offer' }).click();
    await expect(bar(page)).toHaveClass(/is-ok/);
    await done(page, 6);
    // C2: the brand accepted and funded; upload proof for the first deliverable
    await expect(bar(page)).toContainText('Start the work');
    const deal = await page.evaluate(() => GameInBrand._utDeal);
    expect(deal).toBeTruthy();
    expect((await A.api(page, 'deal', deal)).held).toBe(450);
    await A.creator(page, { deal });
    await A.creatorUpload(page);
    await expect(bar(page)).toHaveClass(/is-ok/);
    await done(page, 5);
    // C3: the brand approved; the money is in the wallet after the undo window
    await expect(bar(page)).toContainText('Find your money');
    await page.waitForTimeout(7000);
    const w = await A.creatorWallet(page);
    expect(A.M.cents(w.available)).toBe(158600 + 14250);
    await done(page, 6);
    // C4: ask HYPERCORE to renew
    await expect(bar(page)).toContainText('Ask for a renewal');
    await A.creator(page, { deal: 'sp1' });
    await A.tap(page, '#gamein-root .gi-v5-bottom-actions button', /renew deal/i);
    await expect(bar(page)).toHaveClass(/is-ok/);
    await done(page, 7);
    // C5: spoken answer, scored by the moderator
    await expect(bar(page)).toContainText('Explain the money');
    await done(page, 6);
    await expect(page.locator('.gt-mod')).toBeVisible();
    await expect(page.locator('.gt-mod')).toContainText('download this session (CSV)');
    const s = await sessionOf(page);
    expect(s.tasks.map(t => [t.id, t.outcome])).toEqual([['C1', 'success'], ['C2', 'success'], ['C3', 'moderator to score'], ['C4', 'success'], ['C5', 'moderator to score']]);
    A.noErrors(page);
  });

  test('brand session: five tasks, the creator\'s moves prepared, completion detected', async ({ page }) => {
    test.setTimeout(300000);
    await A.startDemo(page);
    await startSession(page, 'brand');
    // B1: send Instant Shock an offer
    await expect(bar(page)).toContainText('Send an offer');
    await A.brand(page, 'b2', 'offers');
    await A.tap(page, '#gamein-root .gbx-ohead button', '+ new offer');
    const m = page.locator('.gbx-modal');
    await m.locator('select').first().selectOption(A.ME);
    await m.locator('.gbx-form input').first().fill('Vortex launch');
    await m.locator('.gbx-dlv__r input').first().fill('Launch stream with logo overlay');
    await m.locator('.gbx-dlv__add').click();
    await m.locator('.gbx-dlv__r input').nth(1).fill('Recap clip');
    await m.locator('input[type=number]').fill('500');
    await m.locator('.gbx-act button', { hasText: 'send offer' }).click();
    await expect(bar(page)).toHaveClass(/is-ok/);
    await done(page, 6);
    // B2: Instant Shock countered at 20% more; accept it
    await expect(bar(page)).toContainText('Answer the creator');
    await A.brand(page, 'b2', 'offers');
    const row = A.offerRow(page, 'Vortex launch', A.card(page, 'Needs your response'));
    await expect(row).toContainText('$600.00');
    await row.locator('.gc-btn', { hasText: 'accept $600.00' }).click();
    await expect(bar(page)).toHaveClass(/is-ok/);
    await done(page, 6);
    // B3: fund with the company bank account
    await expect(bar(page)).toContainText('Fund the deal');
    const deal = await page.evaluate(() => GameInBrand._utDeal);
    await A.brand(page, 'b2', 'deals', deal);
    await A.tap(page, '#gamein-root .gbx-hero .gc-btn', 'fund escrow');
    await page.locator('.gbx-modal .gbx-seg button', { hasText: 'everything remaining' }).click();
    await page.locator('.gbx-modal .gbx-pm', { hasText: 'Chase bank' }).click();
    await expect(page.locator('.gbx-modal .gbx-act .gc-btn.is-primary')).toContainText('fund $630.00');
    await page.locator('.gbx-modal .gbx-act .gc-btn.is-primary').click();
    await page.locator('.gbx-modal button', { hasText: 'done' }).click();
    await expect(bar(page)).toHaveClass(/is-ok/);
    await done(page, 5);
    // B4: the payment cleared and the creator delivered; approve and pay
    await expect(bar(page)).toContainText('Approve and pay');
    await A.brand(page, 'b2', 'approvals');
    await page.locator('#gamein-root .gbw-proof', { hasText: 'Launch stream with logo overlay' }).locator('.gc-btn', { hasText: 'approve & release' }).click();
    await expect(bar(page)).toHaveClass(/is-ok/, { timeout: 15000 });
    await done(page, 6);
    // B5: spoken answer
    await expect(bar(page)).toContainText('Explain the cost');
    await done(page, 6);
    const s = await sessionOf(page);
    expect(s.tasks.map(t => [t.id, t.outcome])).toEqual([['B1', 'success'], ['B2', 'success'], ['B3', 'success'], ['B4', 'success'], ['B5', 'moderator to score']]);
    // the moderator closes the panel; the money from the session adds up on both sides
    await page.locator('.gt-mod [data-k="close"]').click();
    await A.checkMoney(page, { bids: ['b2'], deals: [deal] });
    A.noErrors(page);
  });
});
