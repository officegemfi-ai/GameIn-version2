// The top-bar switch: one person, two seats. It keeps context, shows what waits on the other seat,
// and the brand seat shows brand figures only.
const { test, expect } = require('@playwright/test');
const A = require('./support/app');

// the brand seat's count, worked out from raw data: counters and pitches to answer, proofs to review,
// renewal requests, and messages from the creator the brand hasn't read
async function brandTodo(page, bid) {
  return page.evaluate(b => {
    const S = GameInBX.S, now = Date.now(), me = GameInBX.api.me();
    const open = o => (o.status === 'sent' || o.status === 'countered') && !(o.expiresAt && now > o.expiresAt);
    const offers = S.offers.filter(o => o.bid === b && open(o) && o.versions[o.versions.length - 1].by === 'creator').length;
    const proofs = S.proofs.filter(p => p.bid === b && p.status === 'review').length + GameInLoop.S.proofs.filter(p => p.brandId === b && p.status === 'review').length;
    const ids = new Set(S.deals.filter(d => d.brandId === b).map(d => d.id).concat(GameInBX.api.raw().seeded.filter(d => d.brandId === b).map(d => d.id)));
    const ren = Object.keys(S.ren).filter(k => S.ren[k].st === 'requested' && ids.has(k)).length;
    const rd = S.readAt[b + ':me'] || 0;
    const notes = S.offers.filter(o => o.bid === b && o.creator === me).flatMap(o => o.versions.filter(v => v.by === 'creator' && v.note && !v.tpl && v.at + 1 > rd));
    const msgs = (S.cmsg[b] || []).filter(m => m.by === 'creator' && m.at > rd);
    return offers + proofs + ren + notes.length + msgs.length;
  }, bid);
}
const badge = (page, who) => A.seatButton(page, who).locator('.gbr__n');
const count = async (page, who) => { const b = badge(page, who); return (await b.count()) ? parseInt(await b.textContent(), 10) : 0; };

test.describe('switch', () => {
  test.beforeEach(async ({ page }) => { await A.startDemo(page); });
  test.afterEach(async ({ page }) => { A.noErrors(page); });

  test('S1 the switch moves between the creator and the chosen brand, and marks the active seat', async ({ page }) => {
    await expect(A.seatButton(page, 'creator')).toHaveAttribute('aria-pressed', 'true');
    await expect(A.seatButton(page, 'brand')).toHaveAttribute('aria-pressed', 'false');
    await expect(A.seatButton(page, 'brand')).toContainText('brand');
    await A.switchTo(page, 'brand');
    expect(await A.appPage(page)).toBe('brandHQ');
    await expect(A.seatButton(page, 'brand')).toHaveAttribute('aria-pressed', 'true');
    // the brand workspace opens on its overview, or on approvals when a proof is waiting for it
    await expect(page.locator('#gamein-root .gbw-tabs [role=tab][aria-selected=true]')).toContainText(/overview|approvals/i);
    // pick another brand in the brand seat: the switch follows it
    await page.locator('#gamein-root .gbw-switch select').selectOption('b3');
    await A.settle(page, 500);
    if (!A.isPhone(page)) await expect(A.seatButton(page, 'brand')).toContainText('GRIDFUEL');
    await A.switchTo(page, 'creator');
    expect(await A.appPage(page)).toBe('dashboard');
    await expect(A.seatButton(page, 'creator')).toHaveAttribute('aria-pressed', 'true');
    // and back: the brand seat remembers GRIDFUEL
    await A.switchTo(page, 'brand');
    expect(await page.evaluate(() => GameInLoop.S.brandId)).toBe('b3');
  });

  test('S2 switching keeps context: the same conversation or deal on the other side', async ({ page }) => {
    // creator chat with HYPERCORE -> HYPERCORE's chat with Instant Shock
    await A.creator(page, { thread: 'b2' });
    await A.switchTo(page, 'brand');
    await expect(page.locator('#gamein-root .gbw-tabs [role=tab][aria-selected=true]')).toContainText(/messages/i);
    await expect(page.locator('#gamein-root .gbx-thread__h')).toContainText('Instant Shock');
    expect(await page.evaluate(() => GameInLoop.S.brandId)).toBe('b2');
    // ...and back to the same creator conversation
    await A.switchTo(page, 'creator');
    expect(await A.appPage(page)).toBe('inbox');
    expect(await page.evaluate(() => GameInBrand.app.activeThread)).toBe('t4');
    // creator deal page -> the brand's deal page for the same deal
    await A.creator(page, { deal: 'sp3' });
    await A.switchTo(page, 'brand');
    expect(await page.evaluate(() => GameInLoop.S.brandId)).toBe('b5');
    await expect(page.locator('#gamein-root .gbx-hero')).toContainText('ORBITAL AUDIO — CREATOR SERIES');
    await A.switchTo(page, 'creator');
    expect(await A.appPage(page)).toBe('sponsorships');
    await expect(page.locator('#gamein-root')).toContainText('ORBITAL AUDIO — CREATOR SERIES');
    // going to another deal while the creator's deals page is open shows that deal, not the one already open
    const open = page.locator('#gamein-root .gi-deal-expanded-v5').first();
    await expect(open).toContainText('Logo overlay — campaign schedule');
    await A.creator(page, { deal: 'sp2' });
    await expect(open).toContainText('Unboxing short');
    await expect(open).not.toContainText('Logo overlay — campaign schedule');
    // a brand profile -> that brand's seat
    await page.evaluate(() => GameInBrand.app.go('brandProfile', GameInBrand.app.brands.find(b => b.id === 'b4')));
    await A.settle(page, 600);
    await A.switchTo(page, 'brand');
    expect(await page.evaluate(() => GameInLoop.S.brandId)).toBe('b4');
  });

  test('S3 each seat shows how many things wait on it, and the count follows both sides\' actions', async ({ page }) => {
    // in the creator seat, the brand seat's badge counts what waits on HYPERCORE
    expect(await count(page, 'brand')).toBe(await brandTodo(page, 'b2'));
    // a pitch to answer
    await page.evaluate(() => GameInBX.api.pitch({ bid: 'b2', title: 'Badge pitch', amt: 300, items: [{ label: 'Stream', days: 7 }] }));
    await A.settle(page);
    expect(await count(page, 'brand')).toBe(await brandTodo(page, 'b2'));
    // a message from the creator
    await A.api(page, 'say', 'b2', 'creator', 'Quick question about the brief');
    await A.settle(page);
    const n = await count(page, 'brand');
    expect(n).toBe(await brandTodo(page, 'b2'));
    // the brand reads it: the count drops
    await A.brand(page, 'b2', 'messages');
    await A.switchTo(page, 'creator');
    expect(await count(page, 'brand')).toBe(n - 1);
    // in the brand seat, the creator seat's badge counts offers to answer plus unread messages; measured by what each
    // action changes, not by reading the app's own total
    await A.brand(page, 'b2', 'overview');
    const c0 = await count(page, 'creator');
    const id = await page.evaluate(() => GameInBX.api.send({ bid: 'b2', title: 'Badge offer', amt: 150, items: [{ label: 'Clip', days: 5 }] }).id);
    await A.settle(page);
    // a new offer counts twice until the creator opens it: an offer to answer and an unread message (listed as open)
    expect(await count(page, 'creator')).toBe(c0 + 2);
    // the creator opens the conversation: the message is read
    await A.creator(page, { thread: 'b2' });
    await A.brand(page, 'b2', 'overview');
    expect(await count(page, 'creator')).toBe(c0 + 1);
    // the creator accepts: nothing left to answer
    await A.api(page, 'creator', id, 'accept');
    await A.settle(page);
    expect(await count(page, 'creator')).toBe(c0);
  });

  test('S4 the brand seat shows brand figures, not the creator\'s', async ({ page }) => {
    await A.switchTo(page, 'brand');
    if (A.isPhone(page)) {
      // the phone menu turns into the brand's sections
      for (const k of ['overview', 'deals', 'approvals', 'messages', 'offers']) await expect(page.locator('.gamein-mobile-nav button[aria-label="' + k + '"]')).toBeVisible();
      await page.locator('.gamein-mobile-nav button[aria-label="approvals"]').click();
      await A.settle(page, 500);
      await expect(page.locator('#gamein-root .gbw-tabs [role=tab][aria-selected=true]')).toContainText(/approvals/i);
      await expect(page.locator('.gamein-mobile-nav button[aria-label="wallet"]')).toHaveCount(0);
    } else {
      await expect(page.locator('.gbr-esc')).toContainText('In escrow');
      expect(A.M.cents(await page.locator('.gbr-esc__v').textContent())).toBe(150000);
      await expect(page.locator('.gbr-bell')).toBeVisible();
      await expect(page.locator('.gamein-balance:not(.gbr-esc)')).toHaveCount(0);
      // the escrow figure opens the brand's payments
      await page.locator('.gbr-esc').click();
      await A.settle(page, 500);
      await expect(page.locator('#gamein-root .gbw-tabs [role=tab][aria-selected=true]')).toContainText(/payments/i);
    }
    await A.switchTo(page, 'creator');
    if (!A.isPhone(page)) await expect(page.locator('.gamein-balance')).toContainText('Balance');
  });
});
