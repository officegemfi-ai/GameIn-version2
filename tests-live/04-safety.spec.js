// In the live app, names, titles and messages are typed by other people. They're only ever shown as text: here,
// Glint's speech bubble, which takes HTML from the app and puts names straight into it (a creator's name when a brand
// releases $1,000 or more).
const { test, expect, signIn, noErrors } = require('./support/live');

test('Glint keeps the app’s formatting but shows tags in someone’s name as text', async ({ browser }, testInfo) => {
  const p = await signIn(browser, testInfo, 'demo@gamein.test');
  const name = '<img src=x onerror="window.__ran=1">Evil<script>window.__ran=2</script>';
  await p.evaluate((n) => GameInBrand.glintSay('<b>Release $1,000.00?</b> This pays ' + n + ' from escrow and cannot be reversed.', [['cancel', null]]), name);
  const said = p.locator('.gib-bubble__txt');
  await expect(said).toContainText('This pays Evilwindow.__ran=2 from escrow');
  await expect(said.locator('b')).toHaveText('Release $1,000.00?');
  await expect(said.locator('img, script')).toHaveCount(0);
  await p.waitForTimeout(500);
  expect(await p.evaluate(() => window.__ran)).toBeUndefined();
  noErrors(p);
});
