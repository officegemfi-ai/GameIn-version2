// Random play: hundreds of actions from both seats in a random order (fixed seeds, so a failure can be replayed),
// with the rules checked after every single step, then every screen checked to the cent at the end.
// The test drives time from outside the page: release windows run out and whole reply windows pass between steps,
// and it keeps trying moves the rules block (closed and expired offers, proofs already releasing or released).
const { test, expect } = require('@playwright/test');
const A = require('./support/app');
const { INVARIANTS } = require('./support/invariants');

const SEEDS = (process.env.GAMEIN_SEEDS || '7,21,1999').split(',').map(Number);
const STEPS = +(process.env.GAMEIN_STEPS || 160);
const CHUNK = 20;

// one chunk of random steps, run inside the page. Blocked moves are tried on purpose and must change nothing
const STEP_CHUNK = async ([n]) => {
  const R = window.__rp, check = window.__inv;
  const rnd = () => { R.s = (R.s + 0x6D2B79F5) >>> 0; let t = R.s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = a => a.length ? a[Math.floor(rnd() * a.length)] : null;
  const API = GameInBX.api, S = GameInBX.S, me = API.me(), out = [];
  const bids = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'];
  const isOpen = o => (o.status === 'sent' || o.status === 'countered') && !(o.expiresAt && Date.now() > o.expiresAt);
  const open = () => S.offers.filter(o => o.creator === me && isOpen(o));
  const closed = () => S.offers.filter(o => o.creator === me && !isOpen(o));
  const mine = () => S.deals.filter(d => d.creator === me);
  // everything a blocked move could touch: offers (status, versions, reply window, deal), deals, escrow, receipts,
  // renewals, every proof's status, value and release dates, and the seeded deals' proofs
  const snap = () => JSON.stringify([S.offers.map(o => [o.id, o.status, o.versions.length, o.expiresAt || 0, o.dealId || '']), S.deals.map(d => d.id), S.esc, S.inv, S.ren,
    S.proofs.map(p => [p.id, p.status, p.value, p.relAt || 0, p.releaseAt || 0]), GameInLoop.S.proofs.map(p => [p.id, p.status, p.value, p.relAt || 0, p.releaseAt || 0])]);
  const refused = (what, f) => { const a = snap(), r = f(), b = snap(); return (r === false || r === null) && a === b ? what + ' refused' : 'BLOCKED MOVE WENT THROUGH: ' + what + ' returned ' + JSON.stringify(r); };
  const acts = [
    [3, () => { const k = 1 + Math.floor(rnd() * 4), amt = Math.round((20 + rnd() * 1500) * 100) / 100; const o = API.send({ bid: pick(bids), title: 'R' + Math.floor(rnd() * 1e4), amt, hours: pick([24, 24, 48]), items: Array.from({ length: k }, (_, i) => ({ label: 'Item ' + (i + 1), days: 3 + i })) }); return 'send ' + (o && o.id) + ' ' + amt; }],
    [1, () => { const o = API.pitch({ bid: pick(bids), title: 'P' + Math.floor(rnd() * 1e4), amt: Math.round((20 + rnd() * 900) * 100) / 100, items: [{ label: 'Pitched item', days: 7 }] }); return 'pitch ' + (o && o.id); }],
    [3, () => { const o = pick(open()); if (!o) return null; const k = pick(['accept', 'counter', 'decline', 'accept']); return 'creator ' + k + ' ' + o.id + ' ' + API.creator(o.id, k, Math.round((10 + rnd() * 2000) * 100) / 100); }],
    [3, () => { const o = pick(open()); if (!o) return null; const k = pick(['accept', 'counter', 'decline', 'withdraw']); const r = k === 'accept' ? API.brandAccept(o.id) : k === 'counter' ? API.brandCounter(o.id, Math.round((10 + rnd() * 2000) * 100) / 100) : k === 'decline' ? API.brandDecline(o.id) : API.withdraw(o.id); return 'brand ' + k + ' ' + o.id + ' ' + r; }],
    // blocked: anything on a closed or expired offer, by either side
    [2, () => { const o = pick(closed()); if (!o) return null; const k = pick(['c-accept', 'c-counter', 'c-decline', 'b-accept', 'b-counter', 'b-decline', 'withdraw']);
      return refused(k + ' on ' + o.status + ' offer ' + o.id, () => k === 'c-accept' ? (API.creator(o.id, 'accept') || null) : k === 'c-counter' ? (API.creator(o.id, 'counter', 99) || null) : k === 'c-decline' ? (API.creator(o.id, 'decline') || null) : k === 'b-accept' ? API.brandAccept(o.id) : k === 'b-counter' ? API.brandCounter(o.id, 99) : k === 'b-decline' ? API.brandDecline(o.id) : API.withdraw(o.id)); }],
    [4, () => { const d = pick(mine()); if (!d) return null; const r = API.fund(d.id, pick(['next', 'all', 'next']), pick(['pm1', 'pm2', 'wire', 'pm1'])); return 'fund ' + d.id + ' ' + (r && r.st); }],
    [2, () => { const k = pick(Object.keys(S.esc).filter(k => S.esc[k].st === 'processing' || S.esc[k].st === 'awaiting wire')); if (!k) return null; const [id, i] = [k.slice(0, k.lastIndexOf(':')), +k.slice(k.lastIndexOf(':') + 1)]; return 'clear ' + k + ' ' + API.clear(id, i); }],
    [4, () => { const d = pick(mine()); if (!d) return null; return 'upload ' + d.id + ' ' + API.upload(d.id); }],
    [3, () => { const p = pick(S.proofs.filter(p => p.status === 'review')); if (!p) return null; return 'approve ' + p.id + ' ' + API.approve(p.id); }],
    // blocked: approving a proof that is releasing or released, undoing a released one, changes on one not in review
    [2, () => { const p = pick(S.proofs.filter(p => p.status === 'releasing' || p.status === 'released')); if (!p) return null; const k = p.status === 'released' ? pick(['approve', 'undo', 'changes']) : pick(['approve', 'changes']);
      return refused(k + ' on ' + p.status + ' proof ' + p.id, () => k === 'approve' ? API.approve(p.id) : k === 'undo' ? API.undo(p.id) : API.changes(p.id)); }],
    [1, () => { const p = pick(S.proofs.filter(p => p.status === 'releasing')); if (!p) return null; return 'undo ' + p.id + ' ' + API.undo(p.id); }],
    [1, () => { const p = pick(S.proofs.filter(p => p.status === 'review')); if (!p) return null; return 'changes ' + p.id + ' ' + API.changes(p.id); }],
    [2, () => { const id = pick(['sp1', 'sp2', 'sp3']); const r = API.seedUpload(id); if (r && rnd() < 0.5) GameInLoop.approve(r); else if (r && rnd() < 0.6) GameInLoop.approveLater(r, 8000); return 'seed upload ' + id + ' ' + r; }],
    [1, () => { const id = pick(['sp1', 'sp2', 'sp3']); const d = API.deal(id); const r = d && d.open > 0 ? API.fund(id, 'next', pick(['pm1', 'pm2'])) : null; return 'fund seeded ' + id + ' ' + (r && r.st); }],
    [1, () => { const id = pick(['sp1', 'sp2', 'sp3']); const k = pick(['offer', 'request', 'answer-c', 'answer-b', 'withdraw']); const w = k === 'offer' ? API.renew(id, 'offer', { months: 1, price: 300 }) : k === 'request' ? API.renew(id, 'request', { months: 1, price: 300 }) : k === 'answer-c' ? API.renew(id, 'answer', { by: 'creator', st: pick(['accepted', 'declined']) }) : k === 'answer-b' ? API.renew(id, 'answer', { by: 'brand', st: pick(['accepted', 'declined']) }) : API.renew(id, 'withdraw'); return 'renew ' + k + ' ' + id + ' ' + (w || 'done'); }],
    [1, () => { const b = pick(bids); API.say(b, pick(['brand', 'creator']), 'hello ' + Math.floor(rnd() * 100)); return 'say ' + b; }],
  ];
  const total = acts.reduce((x, a) => x + a[0], 0);
  for (let j = 0; j < n; j++) {
    const k = R.k++;
    let r = rnd() * total, act = acts[0][1];
    for (const a of acts) { if ((r -= a[0]) < 0) { act = a[1]; break; } }
    let what = null;
    try { what = act(); } catch (e) { out.push({ k, error: String(e && e.stack || e) }); return { out, broken: true }; }
    if (what) {
      const bad = check();
      if (/BLOCKED MOVE WENT THROUGH/.test(what)) bad.push(what);
      out.push({ k, what, bad: bad.length ? bad : undefined });
      if (bad.length) return { out, broken: true };
    }
  }
  // what happens to time next: nothing, a release window runs out, or a whole reply window passes
  return { out, broken: false, time: pick(['none', 'none', 'release', 'release', 'expire']) };
};

test.describe('random play', () => {
  for (const seed of SEEDS) {
    test(`M4 O8 O9 O11 E6 P6 random actions from both seats keep every rule (seed ${seed})`, async ({ page }) => {
      test.setTimeout(300000);
      await page.clock.install();
      await A.startDemo(page);
      await A.brand(page, 'b2', 'approvals');
      await page.evaluate(([s, inv]) => { window.__rp = { s: s >>> 0, k: 0 }; window.__inv = new Function('return (' + inv + ')()'); }, [seed, INVARIANTS.toString()]);
      const log = [];
      let broken = false;
      for (let c = 0; c < Math.ceil(STEPS / CHUNK) && !broken; c++) {
        const res = await page.evaluate(STEP_CHUNK, [CHUNK]);
        log.push(...res.out);
        broken = res.broken;
        if (broken) break;
        if (res.time === 'release') { await page.clock.runFor(9000); log.push({ k: 't', what: 'time: a release window runs out' }); }
        if (res.time === 'expire') { await page.clock.fastForward('25:00:00'); await page.clock.runFor(3000); log.push({ k: 't', what: 'time: 25 hours pass' }); }
        if (res.time !== 'none') {
          const bad = await page.evaluate(() => window.__inv());
          if (bad.length) { log.push({ k: 't', what: 'after time moved', bad }); broken = true; }
        }
      }
      const failed = log.filter(x => x.bad || x.error);
      expect(failed, 'replay with GAMEIN_SEEDS=' + seed + '\n' + log.slice(-14).map(x => x.k + ' ' + (x.what || '') + ' ' + JSON.stringify(x.bad || x.error || '')).join('\n')).toEqual([]);
      expect(log.filter(x => x.what && !/^time/.test(x.what)).length).toBeGreaterThan(STEPS / 3);
      // the blocked moves were really tried
      expect(log.filter(x => / refused$/.test(x.what || '')).length).toBeGreaterThan(3);
      // let every release finish, check the rules once more, then every screen to the cent
      await page.clock.runFor(12000);
      expect(await page.evaluate(() => window.__inv())).toEqual([]);
      const bids = await page.evaluate(() => [...new Set(GameInBX.S.deals.map(d => d.brandId).concat(['b2', 'b4', 'b5']))]);
      const deals = await page.evaluate(() => GameInBX.S.deals.slice(0, 4).map(d => d.id));
      await A.checkMoney(page, { bids, deals });
      A.noErrors(page);
    });
  }
});
