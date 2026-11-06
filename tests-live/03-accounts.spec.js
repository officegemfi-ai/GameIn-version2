// Accounts: a wrong password is turned away, signing out (the LIVE badge on a computer, More on a phone) leaves the
// browser signed out, and a creator can open a brand of their own from the brand view.
const { test, expect, open, inside, signUp, tag, go, noErrors } = require('./support/live');

test('a wrong password is turned away, the right one gets in, and signing out leaves nobody signed in', async ({ browser }, testInfo) => {
  const p = await open(browser, testInfo);
  const signedIn = () => p.evaluate(async () => !!(await GIX.live.user()));
  await p.locator('#gi-market-site [data-gi-action="demo"]').first().click();
  const sheet = p.locator('.gob.gil');
  await sheet.locator('[data-f="email"]').fill('demo@gamein.test');
  await sheet.locator('[data-f="pw"]').fill('not-the-password');
  await sheet.locator('[data-k="go"]').click();
  await expect(sheet.locator('.gsi-err')).toHaveText('That email and password don’t match.');
  expect(await signedIn()).toBe(false);
  await sheet.locator('[data-f="pw"]').fill('gamein-demo');
  await sheet.locator('[data-k="go"]').click();
  await inside(p);
  expect(await p.evaluate(() => GameInBrand.app.me.name)).toBe('Instant Shock');

  // the demo's extras (the played story, the usability test, reset) aren't offered in the live app
  let out;
  if (testInfo.project.name === 'phone') {
    await p.locator('.gamein-mobile-nav button[aria-label="more"]').click();
    await expect(p.locator('.gm-sheet [data-go="#demo"], .gm-sheet [data-go="#test"]')).toHaveCount(0);
    out = p.locator('.gm-sheet [data-k="signout"]');
    await expect(out).toContainText('demo@gamein.test');
  } else {
    await p.locator('#gamein-root .gi-launch-demo-badge').click();
    const menu = p.locator('.gix-acct');
    await expect(menu).toContainText('signed in as demo@gamein.test');
    await expect(p.locator('.gdm:not(.gix-acct)')).toHaveCount(0);
    out = menu.locator('[data-k="out"]');
  }
  await Promise.all([p.waitForEvent('load'), out.click()]);
  await p.waitForFunction(() => window.GIX && GIX.ready && document.querySelector('#gi-market-site [data-gi-action="demo"]'), null, { timeout: 30000 });
  expect(await p.evaluate(() => window.GAMEIN_MODE)).toBe('live');
  expect(await signedIn()).toBe(false);
  noErrors(p);
});

test('a creator opens a brand of their own from the brand view', async ({ browser }, testInfo) => {
  const t = tag();
  const p = await signUp(browser, testInfo, 'creator', 'Solo' + t);
  expect(await p.evaluate(() => GameInBrand.app.me.name)).toBe('Solo' + t);
  await go(p, 'brandHQ');
  await expect(p.locator('#gamein-root h2', { hasText: 'Set up your brand' })).toBeVisible();
  await p.locator('#gamein-root button', { hasText: 'create a brand' }).click();
  const sheet = p.locator('.gob.gil');
  await sheet.locator('[data-f="name"]').fill('Solo Brand ' + t);
  await sheet.locator('[data-k="go"]').click();
  await expect(p.locator('#gamein-root .gbw-head b').first()).toHaveText(new RegExp('^solo brand ' + t + '$', 'i'));
  expect(await p.evaluate(() => GameInBrand.app.page)).toBe('brandHQ');
  // the same account keeps its creator profile, and the brand list holds just the new brand
  expect(await p.evaluate(() => GameInBrand.app.me.name)).toBe('Solo' + t);
  expect(await p.locator('#gamein-root .gbw-head select option').allTextContents()).toEqual([expect.stringMatching(new RegExp('^solo brand ' + t + '$', 'i'))]);
  noErrors(p);
});

test('if the account doesn’t load after signing in, the person is told and can try again', async ({ browser }, testInfo) => {
  const p = await open(browser, testInfo);
  await p.route('**/rest/v1/**', (r) => r.abort()); // the database can't be reached; signing in still works
  await p.locator('#gi-market-site [data-gi-action="demo"]').first().click();
  const sheet = p.locator('.gob.gil');
  await sheet.locator('[data-f="email"]').fill('demo@gamein.test');
  await sheet.locator('[data-f="pw"]').fill('gamein-demo');
  await sheet.locator('[data-k="go"]').click();
  await expect(sheet.locator('h2')).toHaveText('GameIn didn’t load', { timeout: 20000 });
  await p.unroute('**/rest/v1/**');
  await sheet.locator('[data-k="go"]').click();
  await inside(p);
  expect(await p.evaluate(() => GameInBrand.app.me.name)).toBe('Instant Shock');
  noErrors(p);
});

test('a website button pressed while the page is still starting opens the live sign-in, not the demo’s', async ({ browser }, testInfo) => {
  const p = await open(browser, testInfo);
  // a slow connection: the live app's last script arrives late, and the person presses "explore product" before it does
  await p.route('**/live/gamein-adapter.js', async (r) => {
    await new Promise((ok) => setTimeout(ok, 2000));
    await r.continue();
  });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.locator('#gi-market-site [data-gi-action="demo"]').first().click();
  expect(await p.evaluate(() => !!(window.GIX && GIX.ready))).toBe(false);
  const sheet = p.locator('.gob.gil[aria-label="Sign in to GameIn"]');
  await expect(sheet).toBeVisible({ timeout: 15000 });
  await expect(p.locator('.gob.gil')).toHaveCount(1);
  await sheet.locator('[data-f="email"]').fill('demo@gamein.test');
  await sheet.locator('[data-f="pw"]').fill('gamein-demo');
  await sheet.locator('[data-k="go"]').click();
  await inside(p);
  expect(await p.evaluate(() => [GameInBrand.app.me.name, !!GIX.live.world()])).toEqual(['Instant Shock', true]);
  noErrors(p);
});
