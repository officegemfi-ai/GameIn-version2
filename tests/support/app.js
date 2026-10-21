// Helpers that drive the GameIn prototype the way a person does: the top-bar switch, the real buttons and forms.
// Navigation to a page or tab goes through the app's own router (the same thing the menu links call),
// so tests spend their time on the actions, not on menus. Reading money always comes from what is on screen.
const { expect } = require('@playwright/test');
const M = require('./money');
const { rulesHold } = require('./invariants');

const PAGE = process.env.GAMEIN_URL || '/index.html';
// cookie banner, guided tour, demo menu, test bar and the assistant's pop-up tips sit on top of the app; they are not what
// these tests check (on a phone a tip can cover the button a test taps; the button inventory covers the tips' own buttons)
const HIDE = '.gamein-cookie,.w24-cookie,.gt-bar,.gds,.gdm,.gib-tour,.gib-bubble,#gamein-root .gi-launch-demo-badge{display:none!important}';
const ME = 'Instant Shock';

async function startDemo(page) {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(String((e && e.message) || e)));
  await page.addInitScript(() => {
    try {
      ['sponsorships', 'inbox', 'wallet', 'brandHQ', 'offerings', 'creatorSearch'].forEach(p => localStorage.setItem('gib-tip:' + p, '1'));
      localStorage.setItem('gamein-market-cookie', 'accept');
    } catch (e) { /* storage blocked */ }
  });
  await page.goto(PAGE);
  await enterDemo(page);
}

async function enterDemo(page) {
  await page.waitForFunction(() => document.querySelector('#gi-market-site [data-gi-action="demo"]'), null, { timeout: 30000 });
  await page.evaluate(() => document.querySelector('#gi-market-site [data-gi-action="demo"]').click());
  await page.waitForFunction(() => window.GameInBrand && GameInBrand.app && GameInBrand.app.page === 'dashboard' && window.GameInBX && GameInBX.api, null, { timeout: 30000 });
  await page.addStyleTag({ content: HIDE });
  await page.waitForTimeout(400);
}

// after a reload the app restores the saved state; enter the demo again
async function reload(page) {
  await page.reload();
  await enterDemo(page);
}

const isPhone = page => (page.viewportSize() || { width: 1440 }).width < 600;
const api = (page, fn, ...args) => page.evaluate(([f, a]) => GameInBX.api[f](...a), [fn, args]);
const raw = page => page.evaluate(() => JSON.parse(JSON.stringify(GameInBX.api.raw())));
const appPage = page => page.evaluate(() => GameInBrand.app.page);
const settle = (page, ms = 350) => page.waitForTimeout(ms);
// the payout and deal celebrations cover the screen for a few seconds; close them the way a person would
const dismiss = page => page.evaluate(() => document.querySelectorAll('.gib-celebrate').forEach(c => c.remove()));
const noErrors = page => expect(page.__errors || [], 'no JavaScript errors on the page').toEqual([]);

// ---- the top-bar switch
const seatButton = (page, who) => page.locator('.gbr .gbr__b').nth(who === 'brand' ? 1 : 0);
async function switchTo(page, who) {
  await seatButton(page, who).click();
  await page.waitForFunction(w => (GameInBrand.app.page === 'brandHQ') === (w === 'brand'), who);
  await settle(page, 500);
}
const seat = async page => (await appPage(page)) === 'brandHQ' ? 'brand' : 'creator';

// ---- getting to a place (the app's router, same as the menus)
async function brand(page, bid, tab, deal) {
  await dismiss(page);
  await page.evaluate(([b, t, d]) => GameInBX.link.goBrand({ bid: b, tab: t, deal: d || null }), [bid, tab || 'overview', deal || null]);
  await page.waitForFunction(() => GameInBrand.app.page === 'brandHQ');
  await settle(page, 500);
}
async function creator(page, where) {
  await dismiss(page);
  await page.evaluate(w => GameInBX.link.goCreator(w), where || { page: 'dashboard' });
  await page.waitForFunction(() => GameInBrand.app.page !== 'brandHQ');
  await settle(page, 600);
}
async function creatorDealTab(page, name) {
  const t = page.locator('.gib-dtabs [role=tab]', { hasText: new RegExp('^' + name, 'i') });
  await t.click();
  await settle(page, 250);
}

// ---- reading the creator's views
const exact = t => new RegExp('^\\s*' + esc(String(t).toUpperCase()) + '\\s*$', 'i');
const offerCard = (page, title) => page.locator('.gc-offer').filter({ has: page.locator('.gc-offer__ttl b', { hasText: exact(title) }) }).last();
const resolvedCard = page => page.locator('.gc-offer.is-done');
async function creatorWallet(page) {
  await creator(page, { page: 'wallet' });
  return page.evaluate(() => {
    const val = lab => { const d = [...document.querySelectorAll('#gamein-root div')].find(x => x.children.length === 0 && x.textContent.trim().startsWith(lab)); return d && d.nextElementSibling ? d.nextElementSibling.textContent : null; };
    const rows = [...document.querySelectorAll('#gamein-root div')].filter(d => /grid-template-columns: 0.7fr 0.9fr 2fr 0.7fr 0.6fr/.test(d.getAttribute('style') || '') && /\d{4}/.test(d.children[0] && d.children[0].textContent || ''))
      .map(r => [...r.children].map(c => c.textContent.trim()));
    return { available: val('AVAILABLE BALANCE'), escrow: val('IN ESCROW'), lifetime: val('LIFETIME EARNINGS'), rows };
  });
}

// ---- reading the brand's views
async function brandDealMoney(page) {
  return page.evaluate(() => {
    const leg = {};
    document.querySelectorAll('#gamein-root .gbx-legend li').forEach(li => { leg[li.querySelector('span').textContent.trim()] = li.querySelector('b').textContent; });
    const ms = [...document.querySelectorAll('#gamein-root .gbx-table[aria-label="Payment milestones"] .gbx-tr:not(.is-h)')].map(r => [...r.children].map(c => c.innerText.trim()));
    return { leg, ms };
  });
}
async function brandTiles(page) {
  return page.evaluate(() => {
    const o = {};
    document.querySelectorAll('#gamein-root .gbw-tile').forEach(t => { o[t.querySelector('small').textContent.trim().toLowerCase()] = t.querySelector('b').textContent; });
    return o;
  });
}
const card = (page, title) => page.locator('#gamein-root .gamein-card').filter({ has: page.locator(':scope > :first-child > span:first-child', { hasText: new RegExp('^\\s*' + esc(title), 'i') }) }).first();
const offerRow = (page, title, scope) => (scope || page.locator('#gamein-root')).locator('.gbx-orow').filter({ has: page.locator('.gbx-orow__t b', { hasText: exact(title) }) }).first();

// ---- forms
async function proofSheet(page) {
  // the upload sheet: paste a link and send
  const link = page.locator('.gm-sheet input[type=url]');
  await expect(link).toBeVisible();
  await link.fill('https://twitch.tv/videos/2299110');
  await page.locator('.gm-sheet [data-k=send]').click();
  await settle(page, 600);
}

// click the first visible element matching css whose text starts with (or contains) text
async function tap(page, css, text) {
  const loc = text ? page.locator(css).filter({ hasText: text instanceof RegExp ? text : new RegExp('^\\s*' + esc(text), 'i') }) : page.locator(css);
  const n = await loc.count();
  for (let i = 0; i < n; i++) {
    const el = loc.nth(i);
    if (await el.isVisible()) { await el.scrollIntoViewIfNeeded(); await el.click(); await settle(page); return true; }
  }
  throw new Error('nothing visible to click: ' + css + ' ' + (text || ''));
}
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// the creator's deal page action that uploads proof: the next-step button on desktop, the action bar on phone
async function creatorUpload(page) {
  if (isPhone(page)) await tap(page, '.gm-actbar button', /upload proof/i);
  else await tap(page, '.gib-next .gc-btn', /upload proof/i);
  await proofSheet(page);
}

// ---- money: check every screen against the rules, to the cent
async function checkMoney(page, opts = {}) {
  const r = await raw(page);
  // every rule on the raw data first (tests/support/invariants.js), then the numbers on every screen
  const errs = (await rulesHold(page)).map(x => 'rule broken: ' + x);
  const bids = opts.bids || [...new Set(r.S.deals.map(d => d.brandId))];
  const pays = M.releasesOf(r), paidC = {};
  pays.forEach(p => { paidC[p.dealId] = (paidC[p.dealId] || 0) + p.valueC; });
  // engine projection vs the rules
  for (const bid of bids) {
    for (const d of M.brandDeals(r, bid)) {
      const L = M.ledger(d, r), P = await api(page, 'deal', d.id);
      if (!P) { errs.push('deal ' + d.id + ' missing'); continue; }
      const got = { rel: M.C(P.rel), held: M.C(P.held), proc: M.C(P.proc), open: M.C(P.open), tot: M.C(P.tot) };
      const want = { rel: L.relC, held: L.heldC, proc: L.procC, open: L.openC, tot: L.totC };
      if (JSON.stringify(got) !== JSON.stringify(want)) errs.push('engine ' + d.id + ' ' + JSON.stringify(got) + ' expected ' + JSON.stringify(want));
      // M2: what the brand was charged for this deal = funded + 5% of the running total
      const inv = r.S.inv.filter(x => x.dealId === d.id).sort((a, b) => (a.ts || 0) - (b.ts || 0));
      if (inv.length) {
        const already = M.milestonesOf(d, r).filter(m => m.st && m.st !== 'pending' && !m.ren).reduce((x, m) => x + m.amtC, 0) * (d.perItem ? 0 : 1);
        const fees = M.brandFees(already, inv.map(x => M.C(x.base)));
        inv.forEach((x, k) => { if (M.C(x.amt) !== M.C(x.base) + fees[k]) errs.push('receipt ' + d.id + ' #' + k + ' charged ' + x.amt + ' expected ' + M.fmt(M.C(x.base) + fees[k])); });
      }
    }
  }
  // the two seats agree on every deal: the brand's receipts charge for exactly the milestones it funded, and the creator
  // was paid exactly what the brand's deal shows as released (less what was paid out before the demo started).
  // Receipts that don't name their deal (v61's carry only its title) can't be matched to it
  const linked = !(r.S.inv.length && !r.S.inv.some(x => x.dealId));
  for (const bid of bids) {
    for (const d of M.brandDeals(r, bid)) {
      const L = M.ledger(d, r);
      const chargedFor = r.S.inv.filter(x => x.dealId === d.id).reduce((x, i) => x + M.C(i.base), 0);
      const funded = L.ms.filter(m => m.fundedNow).reduce((x, m) => x + m.amtC, 0);
      if (linked && chargedFor !== funded) errs.push('deal ' + d.id + ': receipts charge for ' + M.fmt(chargedFor) + ' of milestones, but ' + M.fmt(funded) + ' was funded');
      if (d.creator === r.me || r.seeded.some(x => x.id === d.id)) {
        const before = d.perItem ? 0 : L.ms.filter(m => m.st === 'released' && !m.byProof).reduce((x, m) => x + m.amtC, 0);
        if ((paidC[d.id] || 0) !== L.relC - before) errs.push('deal ' + d.id + ': the creator was paid ' + M.fmt(paidC[d.id] || 0) + ' but the brand released ' + M.fmt(L.relC - before));
      }
    }
  }
  // M1: a shared deal's milestones are its price split to the cent, and each proof claims exactly its milestone
  for (const d of r.S.deals.filter(x => bids.includes(x.brandId))) {
    const want = M.split(M.C(d.amount), d.milestones.length), got = d.milestones.map(m => M.C(m.amt));
    if (JSON.stringify(got) !== JSON.stringify(want)) errs.push('deal ' + d.id + ' milestones ' + JSON.stringify(got) + ', expected the split ' + JSON.stringify(want));
    r.S.proofs.filter(p => p.dealId === d.id).forEach(p => { const m = d.milestones[p.idx]; if (!m || M.C(p.value) !== M.C(m.amt)) errs.push('proof ' + p.id + ' claims ' + p.value + ', its milestone is ' + (m && m.amt)); });
  }
  // P7: on the creator's existing deals, proofs never claim more than their period has in escrow, and nothing is released beyond it
  for (const d of r.seeded.filter(x => bids.includes(x.brandId))) {
    const c = M.seedClaims(r, d.id);
    if (c.claimedC > c.fundedC) errs.push('seeded deal ' + d.id + ': proofs claim ' + M.fmt(c.claimedC) + ' against ' + M.fmt(c.fundedC) + ' in escrow for this period');
    if (c.overC) errs.push('seeded deal ' + d.id + ': ' + M.fmt(c.overC) + ' released beyond what was in escrow');
  }
  // brand screens
  for (const bid of bids) {
    const ds = M.brandDeals(r, bid).map(d => M.ledger(d, r));
    const sum = k => ds.reduce((x, L) => x + L[k], 0);
    await brand(page, bid, 'payments');
    const t = await brandTiles(page);
    const want = { 'in escrow': sum('heldC'), processing: sum('procC'), 'not funded': sum('openC'), released: sum('relC') };
    for (const k of Object.keys(want)) if (M.cents(t[k]) !== want[k]) errs.push('brand ' + bid + ' payments tile "' + k + '" shows ' + t[k] + ', expected ' + M.fmt(want[k]));
    if (!isPhone(page)) {
      const top = await page.locator('.gbr-esc__v').textContent();
      if (M.cents(top) !== sum('heldC')) errs.push('brand ' + bid + ' top bar escrow ' + top + ', expected ' + M.fmt(sum('heldC')));
    }
    for (const id of (opts.deals || []).filter(id => ds.some(L => L.id === id))) {
      const L = ds.find(x => x.id === id);
      await brand(page, bid, 'deals', id);
      const v = await brandDealMoney(page);
      const w = { 'released to creator': L.relC, 'in escrow': L.heldC, processing: L.procC, 'not funded yet': L.openC };
      for (const k of Object.keys(w)) if (M.cents(v.leg[k]) !== w[k]) errs.push('brand deal ' + id + ' "' + k + '" shows ' + v.leg[k] + ', expected ' + M.fmt(w[k]));
      L.ms.forEach((m, i) => { const row = v.ms[i]; if (!row || M.cents(row[2]) !== m.amtC) errs.push('brand deal ' + id + ' milestone ' + (i + 1) + ' amount ' + (row && row[2]) + ', expected ' + M.fmt(m.amtC)); });
    }
  }
  // creator screens
  const net = pays.reduce((x, p) => x + p.netC, 0);
  const myHeld = M.creatorDeals(r).map(d => M.ledger(d, r)).reduce((x, L) => x + L.heldC, 0);
  const w = await creatorWallet(page);
  if (M.cents(w.available) !== M.C(1586) + net) errs.push('wallet available ' + w.available + ', expected ' + M.fmt(M.C(1586) + net));
  if (M.cents(w.lifetime) !== M.C(18412.3) + net) errs.push('wallet lifetime ' + w.lifetime + ', expected ' + M.fmt(M.C(18412.3) + net));
  if (M.cents(w.escrow) !== myHeld) errs.push('wallet escrow ' + w.escrow + ', expected ' + M.fmt(myHeld));
  // M5: one release row and one fee row per payout, newest first, exactly the payout amounts
  const live = w.rows.filter(x => /escrow release|fee/.test(x[1])).slice(0, pays.length * 2);
  const exp = pays.slice().reverse().flatMap(p => [['escrow release', p.valueC], ['fee', -p.feeC]]);
  exp.forEach((e, k) => { const row = live[k]; if (!row || row[1] !== e[0] || M.cents(row[3]) !== e[1]) errs.push('wallet row ' + (k + 1) + ' is ' + JSON.stringify(row) + ', expected ' + e[0] + ' ' + M.fmt(e[1])); });
  if (!isPhone(page)) {
    for (const id of (opts.deals || [])) {
      const d = M.creatorDeals(r).find(x => x.id === id);
      if (!d) continue;
      const L = M.ledger(d, r);
      await creator(page, { deal: id });
      if (d.perItem) {
        await creatorDealTab(page, 'payments');
        const got = await page.locator('#gamein-root .gi-v5-milestone strong').allTextContents();
        L.ms.forEach((m, i) => { if (M.cents(got[i]) !== m.amtC) errs.push('creator deal ' + id + ' milestone ' + (i + 1) + ' shows ' + got[i] + ', expected ' + M.fmt(m.amtC)); });
      }
    }
  }
  expect(errs, 'money on every screen matches the rules').toEqual([]);
  return { raw: r, pays, net };
}

// a deal between a brand and Instant Shock, made the quick way (offer sent, creator accepts); returns its id
async function makeDeal(page, bid, title, amt, labels) {
  return page.evaluate(([b, t, a, ls]) => {
    const A = GameInBX.api, o = A.send({ bid: b, title: t, amt: a, items: ls.map((l, i) => ({ label: l, days: 3 + i * 2 })) });
    A.creator(o.id, 'accept');
    return GameInBX.S.offers.find(x => x.id === o.id).dealId;
  }, [bid, title, amt, labels]);
}
const offerOf = (page, id) => page.evaluate(i => JSON.parse(JSON.stringify(GameInBX.S.offers.find(o => o.id === i) || null)), id);
const waitFor = (page, fn, arg, timeout = 15000) => page.waitForFunction(fn, arg, { timeout });

module.exports = { rulesHold, makeDeal, offerOf, waitFor, dismiss,  PAGE, ME, M, startDemo, enterDemo, reload, isPhone, api, raw, appPage, settle, noErrors, seatButton, switchTo, seat, brand, creator, creatorDealTab, offerCard, resolvedCard, creatorWallet, brandDealMoney, brandTiles, card, offerRow, proofSheet, tap, creatorUpload, checkMoney };
