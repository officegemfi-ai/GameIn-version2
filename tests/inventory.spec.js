// Every button in both views: open each place from a fresh demo, list every visible control, click each one
// from a fresh demo and record what it did. Runs on demand (INVENTORY=1), writes test-results/inventory.md,
// and fails only if a control throws a JavaScript error.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const A = require('./support/app');

const PLACES = [
  ['creator', 'dashboard', "GameInBrand.app.go('dashboard')"],
  ['creator', 'messages', "GameInBrand.app.go('inbox')"],
  ['creator', 'offer in a thread', "GameInBX.link.goCreator({thread:'b3'})"],
  ['creator', 'deals', "GameInBrand.app.go('sponsorships')"],
  ['creator', 'deal page', "GameInBX.link.goCreator({deal:'sp1'})"],
  ['creator', 'packages', "GameInBrand.app.go('offerings')"],
  ['creator', 'wallet', "GameInBrand.app.go('wallet')"],
  ['creator', 'brand profile', "GameInBrand.app.go('brandProfile',GameInBrand.app.brands.find(b=>b.id==='b3'))"],
  ['creator', 'campaign board', "GameInBrand.app.go('campaignBoard')"],
  ['brand', 'overview', "GameInBX.link.goBrand({bid:'b2',tab:'overview'})"],
  ['brand', 'deals', "GameInBX.link.goBrand({bid:'b2',tab:'deals'})"],
  ['brand', 'shared deal', "GameInBX.link.goBrand({bid:'b2',tab:'deals',deal:'bx1'})"],
  ['brand', 'seeded deal', "GameInBX.link.goBrand({bid:'b2',tab:'deals',deal:'sp1'})"],
  ['brand', 'approvals', "GameInBX.link.goBrand({bid:'b2',tab:'approvals'})"],
  ['brand', 'messages', "GameInBX.link.goBrand({bid:'b2',tab:'messages'})"],
  ['brand', 'offers', "GameInBX.link.goBrand({bid:'b2',tab:'offers'})"],
  ['brand', 'payments', "GameInBX.link.goBrand({bid:'b2',tab:'payments'})"],
  ['brand', 'ratings', "GameInBX.link.goBrand({bid:'b2',tab:'ratings'})"],
  ['brand', 'campaigns', "GameInBX.link.goBrand({bid:'b2',tab:'campaigns'})"],
  ['brand', 'reports', "GameInBX.link.goBrand({bid:'b2',tab:'sponsorships'})"],
];

const COLLECT = () => {
  const out = [];
  [...document.body.querySelectorAll('button,a[href],[role=button],[role=tab],[role=radio],input,select,textarea,summary')].forEach((e, i) => {
    if (!e.getClientRects().length) return;
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    if (e.closest('.gamein-cookie,.w24-cookie,.gds,.gib-tour,.gt-bar')) return;
    if (!(e.closest('#gamein-root') || e.closest('.gm-actbar,.gib-dock,.gib-bubble,.gnp,.gm-sheet,.gib-celebrate,.gib-undo'))) return;
    const name = (e.getAttribute('aria-label') || e.innerText || e.value || e.getAttribute('title') || e.getAttribute('placeholder') || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const zone = e.closest('.gamein-topbar') ? 'top bar' : e.closest('.gamein-sidebar-shell') ? 'sidebar' : e.closest('.gamein-mobile-nav') ? 'phone menu' : e.closest('.gm-actbar') ? 'phone action bar' : e.closest('.gib-dock,.gib-bubble') ? 'assistant' : e.closest('.gbw-tabs') ? 'brand tabs' : 'page';
    const on = e.getAttribute('aria-pressed') === 'true' || e.getAttribute('aria-selected') === 'true' || e.getAttribute('aria-checked') === 'true' || e.getAttribute('aria-current') || /(^|\s)is-on(\s|$)/.test(e.className && e.className.baseVal === undefined ? e.className : '');
    out.push({ i, tag: e.tagName.toLowerCase(), type: e.getAttribute('type') || '', name, zone, disabled: !!e.disabled, on: !!on, href: e.tagName === 'A' ? e.getAttribute('href') || '' : '' });
  });
  return out;
};
const STATE = () => {
  const A = window.GameInBrand && window.GameInBrand.app, root = document.querySelector('#gamein-root');
  const tab = [...document.querySelectorAll('#gamein-root .gbw-tabs [role=tab]')].find(t => t.getAttribute('aria-selected') === 'true');
  return {
    page: A && A.page, tab: tab ? tab.innerText : '',
    data: (window.GameInBX ? JSON.stringify(window.GameInBX.S).length + ':' + JSON.stringify(window.GameInBX.S).slice(-300) : '') + (window.GameInLoop ? JSON.stringify(window.GameInLoop.S.proofs.map(p => [p.id, p.status])) + window.GameInLoop.S.shortlist.join() : ''),
    dlg: [...document.querySelectorAll('[role=dialog],.gbx-modal,.gm-sheet,.gnp,.gib-report,.gdm')].filter(x => x.getClientRects().length).length,
    toast: [...document.querySelectorAll('div[style*="bottom: 64px"] span,.gib-undo')].map(x => x.innerText).join('|'),
    bub: [...document.querySelectorAll('.gib-bubble:not([hidden]) .gib-bubble__txt')].map(x => x.innerText).join('|'),
    fields: [...document.querySelectorAll('#gamein-root input,#gamein-root textarea,#gamein-root select')].map(x => x.value).join('|').slice(0, 2000),
    focus: document.activeElement ? (document.activeElement.id || document.activeElement.className || document.activeElement.tagName) : '',
    html: root ? root.innerHTML.length : 0, text: root ? root.innerText.length : 0, scroll: Math.round(scrollY),
  };
};
function classify(a, b, el, errs) {
  const eff = [];
  if (b.page !== a.page) eff.push('goes to ' + b.page);
  if (b.tab !== a.tab && b.tab) eff.push('opens the ' + b.tab.toLowerCase() + ' tab');
  if (b.dlg > a.dlg) eff.push('opens a dialog');
  if (b.dlg < a.dlg) eff.push('closes a dialog');
  if (b.data !== a.data) eff.push('changes saved data');
  if (b.toast && b.toast !== a.toast) eff.push('says: ' + b.toast.slice(0, 70));
  if (b.bub && b.bub !== a.bub && !b.bub.startsWith('Tip:')) eff.push('assistant: ' + b.bub.slice(0, 60));
  if (!eff.length && b.fields !== a.fields) eff.push('fills a field');
  if (!eff.length && (Math.abs(b.html - a.html) > 40 || Math.abs(b.text - a.text) > 8)) eff.push('changes the view');
  if (!eff.length && Math.abs(b.scroll - a.scroll) > 30) eff.push('scrolls');
  if (!eff.length && b.focus !== a.focus) eff.push('moves keyboard focus');
  if (!eff.length && el.on) eff.push('already selected');
  if (errs.length) eff.push('ERROR ' + errs[0].slice(0, 120));
  return eff.length ? eff : ['no visible effect'];
}

test.describe('every button', () => {
  test.skip(!process.env.INVENTORY, 'run with INVENTORY=1');
  const rows = [];
  for (const [view, place, setup] of PLACES) {
    test(`inventory: ${view} ${place}`, async ({ page }, info) => {
      test.setTimeout(30 * 60000);
      const fresh = async () => {
        await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('gib-') && !k.startsWith('gib-tip')).forEach(k => localStorage.removeItem(k)));
        await A.reload(page);
        await page.evaluate(() => document.querySelectorAll('.gib-bubble').forEach(b => { b.hidden = true; }));
        await page.evaluate(s => eval(s), setup);
        await page.waitForTimeout(900);
      };
      await A.startDemo(page);
      await fresh();
      const els = await page.evaluate(COLLECT);
      const errs = [];
      page.on('pageerror', e => errs.push(String(e && e.message || e)));
      const mine = [];
      for (const el of els) {
        let effect;
        if (['input', 'textarea', 'select'].includes(el.tag) && !['radio', 'checkbox'].includes(el.type)) effect = ['a field'];
        else if (el.disabled) effect = ['disabled here'];
        else if (el.tag === 'a' && el.href && !el.href.startsWith('#') && !el.href.startsWith('javascript')) effect = ['link to ' + el.href.slice(0, 60)];
        else {
          await fresh();
          const before = await page.evaluate(STATE);
          errs.length = 0;
          const ok = await page.evaluate(i => { const e = [...document.body.querySelectorAll('button,a[href],[role=button],[role=tab],[role=radio],input,select,textarea,summary')][i]; if (!e) return false; e.scrollIntoView({ block: 'center' }); e.click(); return true; }, el.i);
          if (!ok) effect = ['not found after a fresh start'];
          else { await page.waitForTimeout(900); effect = classify(before, await page.evaluate(STATE), el, errs.slice()); }
        }
        mine.push({ view, place, zone: el.zone, control: el.name || '(' + el.tag + ')', effect: effect.join('; ') });
      }
      rows.push(...mine);
      const dir = path.join(process.cwd(), 'test-results', 'inventory');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${info.project.name}-${view}-${place.replace(/\s+/g, '-')}.json`), JSON.stringify(mine, null, 1));
      expect(mine.filter(r => r.effect.includes('ERROR')), 'controls that threw an error').toEqual([]);
    });
  }
  test.afterAll(async ({}, info) => {
    const dir = path.join(process.cwd(), 'test-results', 'inventory');
    if (!fs.existsSync(dir)) return;
    const all = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f.startsWith(info.project.name + '-')).flatMap(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
    const md = ['| View | Place | Where | Control | What it does |', '|---|---|---|---|---|'].concat(all.map(r => `| ${r.view} | ${r.place} | ${r.zone} | ${r.control.replace(/\|/g, '/')} | ${r.effect.replace(/\|/g, '/')} |`));
    fs.writeFileSync(path.join(dir, `inventory-${info.project.name}.md`), `${all.length} controls\n\n` + md.join('\n') + '\n');
  });
});
