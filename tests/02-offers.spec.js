// Offers: send, pitch, counter, accept, decline, withdraw, expire, and the moves the rules block.
// Every test acts through the real buttons on one side, then checks what both sides see.
const { test, expect } = require('@playwright/test');
const A = require('./support/app');

const sendOffer = (page, bid, title, amt, labels, hours) => page.evaluate(([b, t, a, ls, h]) => GameInBX.api.send({ bid: b, title: t, amt: a, hours: h || 24, items: ls.map((l, i) => ({ label: l, days: 3 + 2 * i })) }).id, [bid, title, amt, labels, hours]);

test.describe('offers', () => {
  test.beforeEach(async ({ page }) => { await A.startDemo(page); });
  test.afterEach(async ({ page }) => { A.noErrors(page); });

  test('O1 brand sends Instant Shock an offer from the offers tab; the creator gets it in that brand\'s thread', async ({ page }) => {
    await A.brand(page, 'b3', 'offers');
    await A.tap(page, '#gamein-root .gbx-ohead button', '+ new offer');
    const m = page.locator('.gbx-modal');
    await m.locator('select').first().selectOption(A.ME);
    await m.locator('.gbx-form input').first().fill('Holiday clips');
    await m.locator('.gbx-dlv__r input').first().fill('Holiday stream with logo');
    await m.locator('.gbx-dlv__add').click();
    await m.locator('.gbx-dlv__r input').nth(1).fill('TikTok recap');
    await m.locator('input[type=number]').fill('300');
    await m.locator('.gbx-act button', { hasText: 'send offer' }).click();
    const row = A.offerRow(page, 'Holiday clips');
    await expect(row).toContainText('waiting');
    await expect(row).toContainText(/2[34] h left to reply/);
    await expect(row).toContainText('$300.00');
    // the switch takes the brand's open offer straight to the creator's conversation with that brand
    await A.switchTo(page, 'creator');
    expect(await A.appPage(page)).toBe('inbox');
    const c = A.offerCard(page, 'Holiday clips');
    await expect(c).toBeVisible();
    await expect(c).toContainText('new offer, v1');
    await expect(c).toContainText('$300.00');
    await expect(c).toContainText('Holiday stream with logo');
    await expect(c).toContainText('TikTok recap');
    await expect(c).toContainText('You receive $285.00 after the 5% fee');
    await expect(c.locator('.gc-btn', { hasText: 'accept offer' })).toBeVisible();
    // also listed in the creator's open offers
    const offers = await page.evaluate(() => GameInBrand.app.offers.map(o => o.title));
    expect(offers).toContain('HOLIDAY CLIPS');
  });

  test('O1 brand sends Instant Shock an offer from a campaign shortlist; the creator gets it with a 48-hour window', async ({ page }) => {
    await A.brand(page, 'b3', 'campaigns');
    await A.tap(page, '#gamein-root .gc-btn', 'new campaign');
    await page.locator('#gamein-root input[placeholder="GRIDFUEL spring launch"]').fill('Winter cup');
    await A.tap(page, '#gamein-root .gc-btn', 'find creators with GameIn AI');
    const row = page.locator('#gamein-root .gbw-match', { hasText: A.ME });
    await expect(row).toBeVisible();
    const btn = row.locator('.gc-btn', { hasText: /^send offer/ });
    const price = A.M.cents(await btn.textContent());
    expect(price).toBeGreaterThan(0);
    await btn.click();
    await expect(row.locator('.gc-btn', { hasText: 'offer sent' })).toBeDisabled();
    const o = await page.evaluate(() => JSON.parse(JSON.stringify(GameInBX.S.offers.find(x => x.bid === 'b3' && x.cid && x.title === 'WINTER CUP') || null)));
    expect(o).toBeTruthy();
    expect(o.creator).toBe(A.ME);
    expect(A.M.C(o.versions[0].amt)).toBe(price);
    expect(o.expiresAt - Date.now()).toBeGreaterThan(47.5 * 36e5);
    await A.brand(page, 'b3', 'offers');
    await expect(A.offerRow(page, 'WINTER CUP', A.card(page, 'Sent, waiting on creators'))).toContainText(/4[78] h left to reply/);
    await A.creator(page, { thread: 'b3' });
    const c = A.offerCard(page, 'Winter cup');
    await expect(c).toContainText('new offer, v1');
    await expect(c).toContainText(A.M.fmt(price));
    await expect(c.locator('.gc-btn', { hasText: 'accept offer' })).toBeVisible();
  });

  test('O1 O2 an offer or a pitch needs a price of at least $0.01 and a deliverable', async ({ page }) => {
    const n0 = await page.evaluate(() => GameInBX.S.offers.length);
    for (const amt of [0, 0.004, -5]) {
      expect(await page.evaluate(a => GameInBX.api.send({ bid: 'b3', title: 'Zero', amt: a, items: [{ label: 'Clip', days: 5 }] }), amt), 'offer at ' + amt).toBe(null);
      expect(await page.evaluate(a => GameInBX.api.pitch({ bid: 'b3', title: 'Zero pitch', amt: a, items: [{ label: 'Clip', days: 5 }] }), amt), 'pitch at ' + amt).toBe(null);
    }
    expect(await page.evaluate(() => GameInBX.api.send({ bid: 'b3', title: 'No items', amt: 100, items: [] }))).toBe(null);
    expect(await page.evaluate(() => GameInBX.api.pitch({ bid: 'b3', title: 'No items', amt: 100, items: [] }))).toBe(null);
    expect(await page.evaluate(() => GameInBX.S.offers.length)).toBe(n0);
    // the brand's form: a price that rounds to $0.00 can't be sent
    await A.brand(page, 'b3', 'offers');
    await A.tap(page, '#gamein-root .gbx-ohead button', '+ new offer');
    const m = page.locator('.gbx-modal');
    await m.locator('select').first().selectOption(A.ME);
    await m.locator('.gbx-form input').first().fill('Zero price');
    await m.locator('.gbx-dlv__r input').first().fill('Clip');
    await m.locator('input[type=number]').fill('0.004');
    await expect(m.locator('.gbx-act button', { hasText: 'send offer' })).toBeDisabled();
    await m.locator('input[type=number]').fill('0.01');
    await expect(m.locator('.gbx-act button', { hasText: 'send offer' })).toBeEnabled();
  });

  test('O2 creator pitches a package from a brand profile; the brand gets a pitch to answer', async ({ page }) => {
    await page.evaluate(() => GameInBrand.app.go('brandProfile', GameInBrand.app.brands.find(b => b.id === 'b3')));
    await A.settle(page, 700);
    await A.tap(page, '.gbp-camp .gc-btn', /pitch a package/i);
    await A.tap(page, '.gbp-pkg', /video/i);
    await page.locator('.gbp-msg textarea').fill('Two YouTube integrations around your launch.');
    await A.tap(page, '.gbp-pitch .gc-btn', /send pitch/i);
    const o = await page.evaluate(() => JSON.parse(JSON.stringify(GameInBX.S.offers.find(x => x.bid === 'b3' && x.pitch))));
    expect(o).toBeTruthy();
    expect(o.versions.length).toBe(1);
    expect(o.versions[0].by).toBe('creator');
    await A.creator(page, { thread: 'b3' });
    const c = A.offerCard(page, o.title);
    await expect(c).toContainText('pitch sent, v1');
    await expect(c).toContainText('Waiting on GRIDFUEL to respond');
    await A.brand(page, 'b3', 'offers');
    const row = A.offerRow(page, o.title, A.card(page, 'Needs your response'));
    await expect(row).toContainText('needs you');
    await expect(row).toContainText('pitch');
    await expect(row.locator('.gc-btn', { hasText: /^accept/ })).toBeVisible();
  });

  test('O3 creator counters: a new version, and the brand gets a fresh 24-hour window', async ({ page }) => {
    const id = await sendOffer(page, 'b3', 'Counter test', 200, ['Stream with logo', 'Recap clip']);
    // most of the brand's window has passed
    await page.evaluate(i => { const o = GameInBX.S.offers.find(x => x.id === i); o.expiresAt = Date.now() + 2 * 36e5; GameInBX.emit(); }, id);
    await A.creator(page, { thread: 'b3' });
    const c = A.offerCard(page, 'Counter test');
    await c.locator('.gc-btn', { hasText: /^counter$/ }).click();
    await c.locator('.gc-offer__counter input').fill('260');
    await c.locator('.gc-offer__counter .gc-btn', { hasText: /send counter/i }).click();
    await expect(c).toContainText('counter sent, v2');
    await expect(c).toContainText('Waiting on GRIDFUEL to respond');
    await expect(c.locator('.gc-btn', { hasText: 'accept offer' })).toHaveCount(0);
    const o = await A.offerOf(page, id);
    expect(o.versions.map(v => [v.by, v.amt])).toEqual([['you', 200], ['creator', 260]]);
    expect(o.expiresAt - Date.now()).toBeGreaterThan(23.5 * 36e5);
    await A.brand(page, 'b3', 'offers');
    const row = A.offerRow(page, 'COUNTER TEST', A.card(page, 'Needs your response'));
    await expect(row).toContainText('counter-offer v2, you offered $200.00');
    await expect(row).toContainText(/2[34] h left to reply/);
    await expect(row).toContainText('$260.00');
  });

  test('O4 brand counters the creator\'s counter: a new version, and the creator sees what changed', async ({ page }) => {
    const id = await sendOffer(page, 'b3', 'Brand counter', 200, ['Stream with logo', 'Recap clip']);
    expect(await A.api(page, 'creator', id, 'counter', 260)).toBe(true);
    await A.brand(page, 'b3', 'offers');
    const row = A.offerRow(page, 'BRAND COUNTER', A.card(page, 'Needs your response'));
    await row.locator('.gc-btn', { hasText: /^counter$/ }).click();
    const m = page.locator('.gbx-modal');
    await m.locator('input[type=number]').fill('230');
    await m.locator('.gbx-act button', { hasText: /send counter-offer v3/ }).click();
    const sent = A.offerRow(page, 'BRAND COUNTER', A.card(page, 'Sent, waiting on creators'));
    await expect(sent).toContainText('v3 sent');
    await expect(sent).toContainText(/2[34] h left to reply/);
    await A.switchTo(page, 'creator');
    await A.creator(page, { thread: 'b3' });
    const c = A.offerCard(page, 'Brand counter');
    await expect(c).toContainText('offer updated, v3');
    await expect(c).toContainText('$230.00');
    await expect(c).toContainText('price: $260.00 → $230.00');
    await expect(c.locator('.gc-btn', { hasText: 'accept offer' })).toBeVisible();
  });

  test('O5 creator accepts the brand\'s offer: one deal, a milestone per deliverable, awaiting funding on both sides', async ({ page }) => {
    const id = await sendOffer(page, 'b3', 'Accept test', 100, ['Clip A', 'Clip B', 'Clip C']);
    await A.creator(page, { thread: 'b3' });
    await A.offerCard(page, 'Accept test').locator('.gc-btn', { hasText: 'accept offer' }).click();
    await A.waitFor(page, i => GameInBX.S.offers.find(o => o.id === i).status === 'accepted', id);
    await expect(page.locator('#gamein-root .gc-body')).toContainText('Deal activated: you accepted ACCEPT TEST at $100.00');
    const o = await A.offerOf(page, id);
    const d = await A.api(page, 'deal', o.dealId);
    expect(d.status).toBe('awaiting funding');
    expect(d.ms.map(m => m.amt)).toEqual([33.33, 33.33, 33.34]);
    expect(d.ms.every(m => m.st === 'pending')).toBe(true);
    // creator deals list
    await A.creator(page, { page: 'sponsorships' });
    await expect(page.locator('#gamein-root')).toContainText('ACCEPT TEST');
    // brand: accepted, waiting for escrow
    await A.brand(page, 'b3', 'offers');
    const row = A.offerRow(page, 'ACCEPT TEST', A.card(page, 'Accepted'));
    await expect(row).toContainText('fund to start');
    await expect(row).toContainText('accepted');
    await A.brand(page, 'b3', 'deals', o.dealId);
    await expect(page.locator('#gamein-root .gbx-hero')).toContainText('awaiting funding');
  });

  test('O5 brand accepts the creator\'s counter: the deal opens at the creator\'s price', async ({ page }) => {
    const id = await sendOffer(page, 'b3', 'Brand accepts', 200, ['Stream', 'Clip']);
    await A.api(page, 'creator', id, 'counter', 240);
    await A.brand(page, 'b3', 'offers');
    await A.offerRow(page, 'BRAND ACCEPTS', A.card(page, 'Needs your response')).locator('.gc-btn', { hasText: 'accept $240.00' }).click();
    const o = await A.offerOf(page, id);
    expect(o.status).toBe('accepted');
    expect(o.acceptedBy).toBe('you');
    const d = await A.api(page, 'deal', o.dealId);
    expect(d.amount).toBe(240);
    expect(d.ms.map(m => m.amt)).toEqual([120, 120]);
    await A.creator(page, { thread: 'b3' });
    await expect(page.locator('#gamein-root .gc-body')).toContainText('GRIDFUEL accepted your terms for BRAND ACCEPTS at $240.00');
    await A.creator(page, { deal: o.dealId });
    await expect(page.locator('#gamein-root')).toContainText(/awaiting funding/i);
  });

  test('O6 creator declines the brand\'s offer; the brand sees who declined', async ({ page }) => {
    const id = await sendOffer(page, 'b3', 'Decline test', 150, ['Clip']);
    await A.creator(page, { thread: 'b3' });
    await A.offerCard(page, 'Decline test').locator('.gc-btn', { hasText: /^decline$/ }).click();
    // the decline waits out an 8-second undo window
    await A.waitFor(page, i => GameInBX.S.offers.find(o => o.id === i).status === 'declined', id, 15000);
    await expect(A.resolvedCard(page).last()).toContainText('Offer declined');
    await A.brand(page, 'b3', 'offers');
    const row = A.offerRow(page, 'DECLINE TEST', A.card(page, 'Declined, withdrawn and expired'));
    await expect(row).toContainText('declined by Instant Shock');
    await expect(row.locator('button', { hasText: 'send a new offer' })).toBeVisible();
  });

  test('O6 brand declines the creator\'s counter; the creator\'s thread stays open', async ({ page }) => {
    const id = await sendOffer(page, 'b3', 'Brand declines', 150, ['Clip']);
    await A.api(page, 'creator', id, 'counter', 400);
    await A.brand(page, 'b3', 'offers');
    await A.offerRow(page, 'BRAND DECLINES', A.card(page, 'Needs your response')).locator('button', { hasText: /^decline$/ }).click();
    expect((await A.offerOf(page, id)).status).toBe('declined');
    await A.creator(page, { thread: 'b3' });
    await expect(page.locator('#gamein-root .gc-body')).toContainText('GRIDFUEL declined your counter-offer for BRAND DECLINES');
    await expect(A.resolvedCard(page).last()).toContainText('The brand declined your counter-offer');
  });

  test('O7 brand withdraws an offer that is waiting on the creator', async ({ page }) => {
    const id = await sendOffer(page, 'b3', 'Withdraw test', 150, ['Clip']);
    await A.brand(page, 'b3', 'offers');
    await A.offerRow(page, 'WITHDRAW TEST', A.card(page, 'Sent, waiting on creators')).locator('button', { hasText: /^withdraw$/ }).click();
    expect((await A.offerOf(page, id)).status).toBe('withdrawn');
    await expect(A.offerRow(page, 'WITHDRAW TEST', A.card(page, 'Declined, withdrawn and expired'))).toContainText('withdrawn');
    await A.creator(page, { thread: 'b3' });
    await expect(A.resolvedCard(page).last()).toContainText('Offer withdrawn');
    await expect(page.locator('#gamein-root .gc-body')).toContainText('GRIDFUEL withdrew the offer WITHDRAW TEST');
  });

  test('O9 nobody can accept or counter their own latest version', async ({ page }) => {
    const id = await sendOffer(page, 'b3', 'Own version', 150, ['Clip']);
    // brand side: its own offer has no accept button, and the engine refuses
    await A.brand(page, 'b3', 'offers');
    const row = A.offerRow(page, 'OWN VERSION', A.card(page, 'Sent, waiting on creators'));
    await expect(row.locator('button', { hasText: /^accept/ })).toHaveCount(0);
    expect(await A.api(page, 'brandAccept', id)).toBe(false);
    expect(await A.api(page, 'brandCounter', id, 120)).toBe(false);
    expect((await A.offerOf(page, id)).status).toBe('sent');
    // creator side: after their counter the card waits, and the engine refuses accepting or countering again
    await A.creator(page, { thread: 'b3' });
    const c = A.offerCard(page, 'Own version');
    await c.locator('.gc-btn', { hasText: /^counter$/ }).click();
    await c.locator('.gc-offer__counter input').fill('175');
    await c.locator('.gc-offer__counter .gc-btn', { hasText: /send counter/i }).click();
    await expect(c).toContainText('Waiting on GRIDFUEL to respond');
    await expect(c.locator('.gc-btn', { hasText: 'accept offer' })).toHaveCount(0);
    expect(await A.api(page, 'creator', id, 'accept')).toBe(false);
    expect(await A.api(page, 'creator', id, 'counter', 190)).toBe(false);
    const o = await A.offerOf(page, id);
    expect(o.status).toBe('countered');
    expect(o.versions.length).toBe(2);
    expect(o.dealId || null).toBe(null);
  });

  test('O10 the 8-change limit holds on both sides', async ({ page }) => {
    const id = await sendOffer(page, 'b3', 'Long haggle', 100, ['Clip']);
    // seven changes: creator, brand, creator, ...
    for (let k = 0; k < 7; k++) {
      const ok = k % 2 === 0 ? await A.api(page, 'creator', id, 'counter', 150 + k * 5) : await A.api(page, 'brandCounter', id, 110 + k * 5);
      expect(ok, 'change ' + (k + 1)).toBe(true);
    }
    // eighth change by the brand: now the creator can only accept or decline
    expect(await A.api(page, 'brandCounter', id, 140)).toBe(true);
    expect((await A.offerOf(page, id)).versions.length).toBe(9);
    await A.creator(page, { thread: 'b3' });
    const c = A.offerCard(page, 'Long haggle');
    await expect(c).toContainText('adjustments 8 of 8 used');
    await expect(c.locator('.gc-btn', { hasText: /^counter$/ })).toBeDisabled();
    expect(await A.api(page, 'creator', id, 'counter', 145)).toBe(false);
    await expect(c.locator('.gc-btn', { hasText: 'accept offer' })).toBeEnabled();
    // and the brand, when it is its turn after eight changes, can't counter either (a pitch starts with the creator)
    const id2 = await page.evaluate(() => GameInBX.api.pitch({ bid: 'b3', title: 'Long haggle two', amt: 100, items: [{ label: 'Clip', days: 5 }] }).id);
    for (let k = 0; k < 8; k++) {
      const ok = k % 2 === 0 ? await A.api(page, 'brandCounter', id2, 110 + k * 5) : await A.api(page, 'creator', id2, 'counter', 150 + k * 5);
      expect(ok, 'change ' + (k + 1)).toBe(true);
    }
    await A.brand(page, 'b3', 'offers');
    const row = A.offerRow(page, 'LONG HAGGLE TWO', A.card(page, 'Needs your response'));
    await expect(row.locator('.gc-btn', { hasText: /^counter$/ })).toBeDisabled();
    expect(await A.api(page, 'brandCounter', id2, 160)).toBe(false);
    await row.locator('.gbx-orow__open').click();
    await expect(page.locator('.gbx-modal')).toContainText('8 of 8 changes used');
    await expect(page.locator('.gbx-modal .gc-btn', { hasText: /^counter$/ })).toBeDisabled();
    await expect(page.locator('.gbx-modal .gc-btn', { hasText: /^accept/ })).toBeEnabled();
  });

  test('O10 the demo creators on the brand side follow the same 8-change limit', async ({ page }) => {
    // Testy answers HYPERCORE through the demo buttons; four counters each way use up the eight changes
    const id = 'of_testy';
    expect((await A.offerOf(page, id)).versions.length).toBe(1);
    for (let k = 0; k < 8; k++) {
      const ok = k % 2 === 0 ? await A.api(page, 'demoReply', id, 'counter') : await A.api(page, 'brandCounter', id, 500 + k * 10);
      expect(ok, 'change ' + (k + 1)).toBe(true);
    }
    expect((await A.offerOf(page, id)).versions.length).toBe(9);
    expect(await A.api(page, 'demoReply', id, 'counter')).toBe(false);
    expect((await A.offerOf(page, id)).versions.length).toBe(9);
    await A.brand(page, 'b2', 'offers');
    await A.offerRow(page, 'CS2 LAUNCH STREAM', A.card(page, 'Sent, waiting on creators')).locator('.gbx-orow__open').click();
    const m = page.locator('.gbx-modal');
    await expect(m).toContainText('8 of 8 changes used');
    await expect(m.locator('.gbx-demo button', { hasText: 'counter-offer' })).toBeDisabled();
    await expect(m.locator('.gbx-demo button', { hasText: /^accept$/ })).toBeEnabled();
    // accepting still works and makes the deal at the last price
    await m.locator('.gbx-demo button', { hasText: /^accept$/ }).click();
    const o = await A.offerOf(page, id);
    expect(o.status).toBe('accepted');
    expect((await A.api(page, 'deal', o.dealId)).amount).toBe(o.versions[8].amt);
  });

  test('O11 closed offers can\'t be acted on, by either side', async ({ page }) => {
    const acc = await sendOffer(page, 'b3', 'Closed accepted', 100, ['Clip']);
    await A.api(page, 'creator', acc, 'accept');
    const dec = await sendOffer(page, 'b3', 'Closed declined', 100, ['Clip']);
    await A.api(page, 'creator', dec, 'decline');
    const wd = await sendOffer(page, 'b3', 'Closed withdrawn', 100, ['Clip']);
    await A.api(page, 'withdraw', wd);
    const before = await page.evaluate(() => JSON.stringify(GameInBX.S.offers.map(o => [o.id, o.status, o.versions.length])) + GameInBX.S.deals.length);
    for (const id of [acc, dec, wd]) {
      expect(await A.api(page, 'brandAccept', id)).toBe(false);
      expect(await A.api(page, 'brandCounter', id, 120)).toBe(false);
      expect(await A.api(page, 'brandDecline', id)).toBe(false);
      expect(await A.api(page, 'withdraw', id)).toBe(false);
      for (const k of ['accept', 'counter', 'decline']) expect(await A.api(page, 'creator', id, k, 130)).toBe(false);
    }
    const after = await page.evaluate(() => JSON.stringify(GameInBX.S.offers.map(o => [o.id, o.status, o.versions.length])) + GameInBX.S.deals.length);
    expect(after).toBe(before);
    await A.brand(page, 'b3', 'offers');
    const closed = A.card(page, 'Declined, withdrawn and expired');
    for (const t of ['CLOSED DECLINED', 'CLOSED WITHDRAWN']) {
      const r = A.offerRow(page, t, closed);
      await expect(r.locator('button', { hasText: /^accept|^counter|^decline|^withdraw/ })).toHaveCount(0);
    }
  });
});

test.describe('offer expiry', () => {
  test('O8 an offer nobody answers in its reply window expires on both sides, and a new one can be sent', async ({ page }) => {
    await page.clock.install();
    await A.startDemo(page);
    const id = await sendOffer(page, 'b3', 'Expiry test', 150, ['Clip'], 24);
    await page.clock.fastForward('25:00:00');
    await A.settle(page, 1500);
    await A.brand(page, 'b3', 'offers');
    const row = A.offerRow(page, 'EXPIRY TEST', A.card(page, 'Declined, withdrawn and expired'));
    await expect(row).toContainText('expired');
    await expect(row).toContainText('no reply in time');
    await expect(row.locator('button', { hasText: 'send a new offer' })).toBeVisible();
    // nobody can act on it any more
    expect(await A.api(page, 'creator', id, 'accept')).toBe(false);
    expect(await A.api(page, 'withdraw', id)).toBe(false);
    await A.creator(page, { thread: 'b3' });
    await expect(page.locator('#gamein-root .gc-body')).toContainText('GRIDFUEL\'s offer EXPIRY TEST expired before you replied');
    await expect(A.resolvedCard(page).last()).toContainText('Offer expired');
    const open = await page.evaluate(() => GameInBrand.app.offers.map(o => o.title));
    expect(open).not.toContain('EXPIRY TEST');
    A.noErrors(page);
  });
});
