// A whole deal between two brand-new accounts, each in their own browser, through the app's own screens: the brand
// sends an offer, the creator accepts it, the brand funds escrow, the creator delivers proof, the brand approves, and
// the money reaches the creator's wallet less the 5% fee. Every step is a database function; each side sees the
// other's moves without reloading.
const { test, expect, liveStatus, signIn, signUp, tag, go, brandTab, until, noErrors, settle } = require('./support/live');

// proof files need Supabase Storage: the CLI's stack has it (GAMEIN_LIVE_STORAGE=1 in CI)
const STORAGE = !!process.env.GAMEIN_LIVE_STORAGE;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

test('offer, escrow, proof and payout between a new brand and a new creator', async ({ browser }, testInfo) => {
  const t = tag();
  const creatorName = 'Nova' + t,
    brandName = 'Volt' + t;
  const creator = await signUp(browser, testInfo, 'creator', creatorName);
  const brand = await signUp(browser, testInfo, 'brand', brandName);
  expect(await brand.evaluate(() => GameInBrand.app.page)).toBe('brandHQ');

  // 1. the brand sends an offer: $300 for two deliverables
  await until(brand, (n) => GameInBrand.app.creators.some((c) => c.name === n), creatorName);
  await brandTab(brand, 'offers');
  await brand.locator('#gamein-root button', { hasText: '+ new offer' }).click();
  const form = brand.locator('.gbx-form').first();
  await form.locator('select').first().selectOption(creatorName);
  await brand.locator('input[placeholder="e.g. Launch week stream"]').fill('Launch week');
  await brand.locator('label:has-text("price (USD)") input').fill('300');
  await brand.locator('input[aria-label="Deliverable 1"]').fill('Launch stream with logo');
  await brand.locator('button', { hasText: /add (a )?deliverable/i }).first().click();
  await brand.locator('input[aria-label="Deliverable 2"]').fill('Recap clip');
  await brand.locator('button', { hasText: /^\s*send offer\s*$/ }).click();

  // 2. the creator sees it and accepts, from the offer card in their inbox
  await until(creator, () => GameInBrand.app.offers.some((o) => o.title === 'LAUNCH WEEK'));
  await go(creator, 'inbox');
  await creator.locator('#gamein-root').getByText(brandName.toUpperCase()).filter({ visible: true }).first().click();
  await settle(creator);
  await creator.locator('#gamein-root button', { hasText: /^\s*accept offer\s*$/ }).filter({ visible: true }).first().click();
  await until(creator, () => GameInBrand.app.ongoing.some((d) => d.title === 'LAUNCH WEEK'));

  // 3. the brand funds escrow by card: $300 plus the 5% fee
  await until(brand, () => GIX.bxDeals(GIX.bxCurBrand()).some((d) => d.title === 'LAUNCH WEEK'));
  await brandTab(brand, 'deals');
  await brand.locator('#gamein-root').getByText('LAUNCH WEEK').filter({ visible: true }).first().click();
  await settle(brand);
  await brand.locator('#gamein-root button', { hasText: /^\s*fund escrow\s*$/ }).first().click();
  const fund = brand.locator('.gbx-modal');
  const pay = fund.locator('button', { hasText: /^\s*fund \$/ });
  await expect(pay).toHaveText('fund $157.50'); // the next milestone: $150 plus the fee
  await fund.locator('button', { hasText: 'everything remaining' }).click();
  await expect(fund).toContainText('GameIn brand fee (5%)$15.00');
  await expect(pay).toHaveText('fund $315.00');
  await pay.click();
  await expect(fund.locator('.gbx-done')).toContainText('Escrow funded');
  await expect(fund.locator('.gbx-done')).toContainText('$315.00');
  await fund.locator('button', { hasText: /^\s*done\s*$/ }).click();
  await expect(fund).toHaveCount(0);
  await until(brand, () => GIX.bxDeals(GIX.bxCurBrand()).some((d) => d.title === 'LAUNCH WEEK' && d.held === 300));

  // 4. the creator delivers the first deliverable with a link
  await until(creator, () => GameInBrand.app.ongoing.some((d) => d.title === 'LAUNCH WEEK' && d.escrow === 300));
  const dealId = await creator.evaluate(() => GameInBrand.app.ongoing.find((d) => d.title === 'LAUNCH WEEK').id);
  await creator.evaluate((id) => {
    const e = GameInBrand.app.ongoing.find((d) => d.id === id);
    window.__said = null;
    GIX.bxTryUpload(e, (m) => (window.__said = m));
  }, dealId);
  await creator.locator('.gob.gil [data-f="link"]').fill('https://twitch.tv/videos/2299110');
  if (STORAGE) await creator.locator('.gob.gil [data-f="file"]').setInputFiles({ name: 'stream screenshot.png', mimeType: 'image/png', buffer: PNG });
  await creator.locator('.gob.gil [data-k="send"]').click();
  await until(creator, () => /Proof sent for Launch stream with logo/.test(window.__said || ''));

  // 5. the brand approves it in approvals; the money releases when the undo window ends
  await until(brand, () => GameInBX.S.proofs.some((p) => p.deal === 'LAUNCH WEEK' && p.status === 'review'));
  await brandTab(brand, 'approvals');
  const card = brand.locator('#gamein-root .gbw-proof').filter({ hasText: 'Launch stream with logo' });
  await expect(card).toContainText('open the link: twitch.tv/videos/2299110');
  if (STORAGE) {
    // the file opens for the brand through a link that only works for a while, and never for anyone else
    await expect(card).toContainText('open the file: stream-screenshot.png');
    const [tab] = await Promise.all([brand.waitForEvent('popup'), card.getByText('open the file: stream-screenshot.png').click()]);
    await tab.waitForURL(/\/storage\/v1\/object\/sign\/proofs\//);
    const got = await brand.request.get(tab.url());
    expect(got.status()).toBe(200);
    expect(got.headers()['content-type']).toContain('image/png');
    await tab.close();
    const file = await brand.evaluate(() => GameInBX.S.proofs.find((p) => p.deal === 'LAUNCH WEEK').file);
    const outsider = await signIn(browser, testInfo, 'demo@gamein.test');
    await expect(outsider.evaluate((f) => GIX.live.proofFileUrl(f), file)).rejects.toThrow();
  }
  await card.locator('button', { hasText: 'approve & release' }).click();
  await until(brand, () => GameInBX.S.proofs.some((p) => p.deal === 'LAUNCH WEEK' && p.status === 'released'), null, 30000);

  // 6. the creator's wallet: $150 released, $7.50 fee, $142.50 available
  await until(creator, () => GameInLoop.released() === 142.5, null, 30000);
  await go(creator, 'wallet');
  await expect(creator.locator('#gamein-root')).toContainText('$142.50');

  // 7. messages typed in each side's inbox reach the other side
  await go(creator, 'inbox');
  await creator.locator('#gamein-root').getByText(brandName.toUpperCase()).filter({ visible: true }).first().click();
  const say = creator.locator('#gamein-root textarea[aria-label^="Message "]').filter({ visible: true });
  await say.fill('Stream is booked for Friday');
  await say.press('Enter');
  await until(creator, () => GIX.live.world().messages.some((m) => m.body === 'Stream is booked for Friday')); // saved
  await until(brand, (n) => GIX.bxThreads(GIX.bxCurBrand()).some((th) => th.who === n && th.msgs.some((m) => m[1] === 'Stream is booked for Friday')), creatorName);
  await brandTab(brand, 'messages');
  await brand.locator('#gamein-root').getByText(creatorName).filter({ visible: true }).first().click();
  await expect(brand.locator('#gamein-root')).toContainText('Stream is booked for Friday');
  const reply = brand.locator('#gamein-root input[aria-label="Message"]').filter({ visible: true });
  await reply.fill('Great, see you then');
  await reply.press('Enter');
  await expect(creator.locator('#gamein-root')).toContainText('Great, see you then', { timeout: 20000 });

  // how each side heard about the other's moves: Realtime, and anything the safety net had to catch
  for (const [who, page] of [['creator', creator], ['brand', brand]]) {
    const st = await liveStatus(page);
    testInfo.annotations.push({ type: 'live ' + who, description: JSON.stringify(st) });
    console.log('[live] ' + who + ': ' + JSON.stringify(st));
  }
  noErrors(creator);
  noErrors(brand);
});
