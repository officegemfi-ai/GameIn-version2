// Helpers for the live-mode tests: the app signed in to a real Supabase stack, one browser per person.
// The stack is GAMEIN_LIVE_API (default http://localhost:54321) with the anon key GAMEIN_LIVE_ANON; see
// playwright.live.config.js. Every test signs in as real accounts: the demo seed's, or new ones it signs up itself.
const base = require('@playwright/test');
const { expect } = base;

const API = process.env.GAMEIN_LIVE_API || 'http://localhost:54321';
const ANON = process.env.GAMEIN_LIVE_ANON;
const PAGE = '/index.html?live';
const PASSWORD = 'gamein-demo'; // the demo seed's accounts
// the cookie banner, guided tour and the assistant's tips sit on top of the app; they are not what these tests check
const HIDE = '.gamein-cookie,.w24-cookie,.gi-mkt-cookie,.gt-bar,.gds,.gib-tour,.gib-bubble{display:none!important}';
const settle = (page, ms = 400) => page.waitForTimeout(ms);
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

if (!ANON) throw new Error('Set GAMEIN_LIVE_ANON to the stack\'s anon key (npx supabase status)');

// each person's browser is closed when their test ends, so the next test starts with nobody signed in
const opened = [];
const test = base.test.extend({
  _people: [
    async ({}, use) => {
      await use();
      while (opened.length) await opened.pop().close().catch(() => {});
    },
    { auto: true },
  ],
});

// a new browser for one person, on the live app, not signed in yet
async function browserFor(browser, testInfo) {
  const use = testInfo.project.use || {};
  const ctx = await browser.newContext({
    viewport: use.viewport, deviceScaleFactor: use.deviceScaleFactor, isMobile: use.isMobile, hasTouch: use.hasTouch, userAgent: use.userAgent,
  });
  opened.push(ctx);
  await ctx.addInitScript(([url, key]) => {
    window.GAMEIN_SUPABASE = { url, anonKey: key, liveByDefault: true, pollMs: 1500, realtimeWaitMs: 1500 };
    try {
      ['sponsorships', 'inbox', 'wallet', 'brandHQ', 'offerings', 'creatorSearch', 'dashboard'].forEach((p) => localStorage.setItem('gib-tip:' + p, '1'));
      localStorage.setItem('gamein-market-cookie', 'accept');
    } catch (e) { /* storage blocked */ }
  }, [API, ANON]);
  const page = await ctx.newPage();
  page.__errors = [];
  page.__console = [];
  page.on('pageerror', (e) => page.__errors.push(String((e && e.message) || e)));
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    page.__console.push(new Date().toISOString().slice(11, 23) + ' ' + m.type() + ': ' + m.text().slice(0, 300));
    if (page.__console.length > 40) page.__console.shift();
  });
  await page.goto(PAGE);
  await page.waitForFunction(() => window.GAMEIN_MODE === 'live' && window.GIX && GIX.ready && document.querySelector('#gi-market-site [data-gi-action="demo"]'), null, { timeout: 30000 });
  return page;
}

// signed in and inside the app, with the first snapshot of the database on screen
async function inside(page) {
  await page.waitForFunction(() => window.GameInBrand && GameInBrand.app && GameInBrand.app.loggedIn && window.GameInBX && GameInBX.S.v === 3, null, { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('#gamein-root .gamein-sidebar-shell, #gamein-root .gibw, #gamein-root main'), null, { timeout: 30000 });
  await page.addStyleTag({ content: HIDE });
  await settle(page, 800);
}

async function signIn(browser, testInfo, email, password = PASSWORD) {
  const page = await browserFor(browser, testInfo);
  await page.locator('#gi-market-site [data-gi-action="demo"]').first().click();
  const sheet = page.locator('.gob.gil');
  await expect(sheet.locator('h2')).toHaveText('Sign in');
  await sheet.locator('[data-f="email"]').fill(email);
  await sheet.locator('[data-f="pw"]').fill(password);
  await sheet.locator('[data-k="go"]').click();
  await inside(page);
  return page;
}

// a brand-new account, signed up through the website's join buttons
async function signUp(browser, testInfo, role, name) {
  const page = await browserFor(browser, testInfo);
  await page.locator('#gi-market-site [data-gi-action="' + role + '"]').first().click();
  const sheet = page.locator('.gob.gil');
  await expect(sheet.locator('h2')).toHaveText('Create your account');
  await sheet.locator('[data-f="name"]').fill(name);
  await sheet.locator('[data-f="email"]').fill(name.toLowerCase().replace(/[^a-z0-9]/g, '') + '@example.com');
  await sheet.locator('[data-f="pw"]').fill('test-password-1');
  await sheet.locator('[data-f="terms"]').check();
  await sheet.locator('[data-k="go"]').click();
  await inside(page);
  return page;
}

const tag = () => Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
const go = async (page, where) => {
  await page.evaluate((w) => GameInBrand.app.go(w), where);
  await settle(page, 700);
};
async function brandTab(page, name) {
  if ((await page.evaluate(() => GameInBrand.app.page)) !== 'brandHQ') await go(page, 'brandHQ');
  await page.locator('#gamein-root [role="tab"]', { hasText: new RegExp('^\\s*' + esc(name), 'i') }).filter({ visible: true }).first().click();
  await settle(page, 600);
}
async function brandTiles(page) {
  return page.evaluate(() => {
    const o = {};
    document.querySelectorAll('#gamein-root .gbw-tile').forEach((t) => {
      o[t.querySelector('small').textContent.trim().toLowerCase()] = t.querySelector('b').textContent;
    });
    return o;
  });
}
// what the page's connection to the database has been doing (loads, Realtime, the safety net)
const liveStatus = (page) => page.evaluate(() => (window.GIX && GIX.live && GIX.live.status ? GIX.live.status() : null)).catch(() => null);

// wait until the other person's move shows up here (the app follows the database by itself). If it doesn't, say what
// the page's connection was doing and what the browser logged, so a failure on GitHub can be read from the log alone
async function until(page, fn, arg, timeout = 20000) {
  try {
    return await page.waitForFunction(fn, arg, { timeout, polling: 250 });
  } catch (e) {
    console.log('[live] the wait ran out. Connection: ' + JSON.stringify(await liveStatus(page)));
    console.log('[live] the browser logged:\n  ' + (page.__console || []).join('\n  '));
    throw e;
  }
}
const noErrors = (page) => expect(page.__errors || [], 'no JavaScript errors on the page').toEqual([]);

module.exports = { test, expect, liveStatus, open: browserFor, inside, signIn, signUp, tag, go, brandTab, brandTiles, until, noErrors, settle, esc };
