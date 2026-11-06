// Signing in with real accounts: each one sees what the database says it may see, on the seats it has.
const { test, expect, signIn, go, brandTab, brandTiles, noErrors } = require('./support/live');

test('the demo account sees its creator deals and its brands’ money from the database', async ({ browser }, testInfo) => {
  const p = await signIn(browser, testInfo, 'demo@gamein.test');
  // the creator seat: Instant Shock, with the seeded deals, offers and wallet
  const creator = await p.evaluate(() => {
    const A = GameInBrand.app;
    return { me: A.me.name, deals: A.ongoing.map((d) => d.title).sort(), offers: A.offers.map((o) => o.title).sort(), wallet: GameInLoop.released() };
  });
  expect(creator.me).toBe('Instant Shock');
  expect(creator.deals).toEqual(['ORBITAL AUDIO — CREATOR SERIES', 'ULTIMATE PACKAGE Q3', 'XMAS TEASER DROP']);
  expect(creator.offers).toEqual(['INSTANTSHOCK ULTIMATE SPONSORSHIP PACKAGE', 'XMAS STREAM LOGO CAMPAIGN']);
  expect(creator.wallet).toBe(2191.51);
  await go(p, 'sponsorships');
  await expect(p.locator('#gamein-root')).toContainText('Proof in review: Mid-roll segment #2');
  await expect(p.locator('#gamein-root')).toContainText('$1,398.36'); // in escrow across the three deals

  // the brand seat opens on the brand with the most waiting on it: HYPERCORE
  await go(p, 'brandHQ');
  await expect(p.locator('#gamein-root .gbw-head b').first()).toHaveText('HYPERCORE');
  const tiles = await brandTiles(p);
  expect(tiles['in escrow']).toBe('$1,000.00');
  expect(tiles['to fund']).toBe('$2,400.00');
  expect(tiles['proofs to review']).toBe('1');
  // every brand the account works for, and no other
  const brands = await p.locator('#gamein-root .gbw-head select option').allTextContents();
  expect(brands.sort()).toEqual(['GRIDFUEL', 'HYPERCORE', 'NEXAWEAR', 'ORBITAL AUDIO', 'SHIELDPOINT', 'VOLTEDGE']);
  await brandTab(p, 'approvals');
  await expect(p.locator('#gamein-root .gbw-proof')).toContainText('Mid-roll segment #2');
  noErrors(p);
});

test('a brand manager sees only their brand, and lands in the brand view', async ({ browser }, testInfo) => {
  const p = await signIn(browser, testInfo, 'manager@hypercore.test');
  expect(await p.evaluate(() => GameInBrand.app.page)).toBe('brandHQ');
  await expect(p.locator('#gamein-root .gbw-head b').first()).toHaveText('HYPERCORE');
  expect(await p.locator('#gamein-root .gbw-head select option').allTextContents()).toEqual(['HYPERCORE']);
  // row-level security: only HYPERCORE's offers and deals reached this browser
  const seen = await p.evaluate(() => ({
    brands: [...new Set(GameInBX.S.offers.map((o) => o.bid).concat(GameInBX.S.deals.map((d) => d.brandId)))].length,
    payments: GameInBX.S.inv.length,
  }));
  expect(seen.brands).toBe(1);
  expect(seen.payments).toBe(3); // HYPERCORE's own payments, never another brand's
  noErrors(p);
});
