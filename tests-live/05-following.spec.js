// Following the database: Realtime brings the other side's moves in, and a safety net catches anything it misses.
const { test, expect, signIn, until, noErrors } = require('./support/live');

test('if Realtime misses a change, the safety net still brings it in', async ({ browser }, testInfo) => {
  const brand = await signIn(browser, testInfo, 'manager@hypercore.test');
  const creator = await signIn(browser, testInfo, 'demo@gamein.test');
  // the brand's live feed goes quiet: no Realtime, no polling, as if every event since were lost
  await brand.evaluate(() => GIX.live.unwatch());
  const text = 'Did the proof upload? ' + Date.now().toString(36);
  const hypercore = await brand.evaluate(() => GIX.bxCurBrand());
  await creator.evaluate(([b, t]) => GIX.bxCreatorSay('bx:' + b, null, t), [hypercore, text]);
  await until(creator, (t) => GIX.live.world().messages.some((m) => m.body === t), text);
  const seen = (t) => GIX.live.world().messages.some((m) => m.body === t);
  expect(await brand.evaluate(seen, text)).toBe(false);
  // the check: one small read finds a notification newer than the brand's snapshot, and everything reloads
  await brand.evaluate(() => GIX.live.checkNow());
  await until(brand, seen, text);
  expect(await brand.evaluate(() => GIX.live.status().caught)).toBe(1);
  await expect.poll(() => brand.evaluate((n) => GIX.bxThreads(GIX.bxCurBrand()).some((th) => th.msgs.some((m) => m[1] === n)), text)).toBe(true);
  noErrors(brand);
  noErrors(creator);
});
