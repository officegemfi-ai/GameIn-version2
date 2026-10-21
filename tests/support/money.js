// The money rules, written a second time on purpose: these functions never call the app's code.
// Each test reads the app's raw saved data, works out what every screen should show, and compares.
//   brand pays milestone + 5% brand fee; creator receives 95% (5% creator fee)
//   fees are 5% of the running total per deal, rounded to the cent once (half up), so splits never drift
//   money is released only for approved proof, and never more than is in escrow
//   the creator's existing (seeded) deals: each approved deliverable releases an even share of what is in escrow for its
//   period (a monthly deal's current month; otherwise the deal itself, never a renewal), rounded down to the cent like
//   every split, and the last one releases what is left

const C = x => Math.round(Number(x || 0) * 100);           // dollars -> integer cents
const feeC = c => Math.round(c / 20);                       // 5% of a cent amount, half up
const fmt = c => (c < 0 ? '-' : '') + '$' + (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// parse "$1,234.56", "−$1.67", "+$33.33" into cents
function cents(text) {
  const t = String(text == null ? '' : text).replace(/−|–/g, '-');
  const m = t.match(/(-?)\s*\+?\s*\$?\s*(-?)([\d,]+\.\d{2})/);
  if (!m) return null;
  const v = Math.round(parseFloat(m[3].replace(/,/g, '')) * 100);
  return (m[1] === '-' || m[2] === '-') ? -v : v;
}

// split a price over n deliverables: every share rounded down to the cent, the last one takes the rest
function split(totalC, n) {
  n = Math.max(1, n);
  const b = Math.floor(totalC / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? totalC - b * (n - 1) : b));
}

// what the brand pays in fees for each funding of one deal, given what was already funded before
function brandFees(alreadyFundedC, fundingsC) {
  let run = alreadyFundedC;
  return fundingsC.map(a => { const f = feeC(run + a) - feeC(run); run += a; return f; });
}

// the creator's payouts: fee per release on the running total per deal
function creatorPayouts(releases) {
  const run = {};
  return releases.slice().sort((a, b) => a.relAt - b.relAt || String(a.id).localeCompare(String(b.id))).map(r => {
    const c0 = run[r.dealId] || 0, c1 = c0 + C(r.value);
    run[r.dealId] = c1;
    const fee = feeC(c1) - feeC(c0);
    return { ...r, valueC: C(r.value), feeC: fee, netC: C(r.value) - fee };
  });
}

// milestones as the rules define them: never more than the deal is worth (except monthly deals, one per month)
function milestonesOf(deal, raw) {
  let ms = (deal.milestones && deal.milestones.length) ? deal.milestones.map(m => ({ label: m.label, amtC: C(m.amt), st: m.st }))
    : [{ label: 'Full payment', amtC: C(deal.amount), st: 'pending' }];
  if (deal.type !== 'monthly' && !deal.perItem) {
    let acc = 0; const keep = [];
    ms.forEach(m => { if (acc + m.amtC <= C(deal.amount) + 1) { keep.push(m); acc += m.amtC; } });
    if (keep.length && keep.length < ms.length) ms = keep;
  }
  // an accepted renewal adds the new period as milestones to fund
  const rn = raw && raw.S.ren[deal.id];
  if (rn && rn.st === 'accepted' && !deal.perItem) {
    const n = deal.type === 'monthly' ? rn.months : 1;
    for (let k = 0; k < n; k++) ms.push({ label: 'renewal ' + (k + 1), amtC: C(rn.price), st: 'pending', ren: 1 });
  }
  return ms;
}

// one deal's ledger from raw data: which milestones are funded, clearing, held or released, and the totals
function ledger(deal, raw) {
  const S = raw.S, ms = milestonesOf(deal, raw).map((m, i) => {
    const e = S.esc[deal.id + ':' + i];
    return { ...m, i, st: e ? e.st : m.st, fundedNow: !!e, ts: e && e.ts };
  });
  if (deal.perItem) {
    // shared deals: a milestone is released when the latest proof for its deliverable is released
    const last = {};
    S.proofs.filter(p => p.dealId === deal.id).forEach(p => { if (!last[p.idx] || p.at > last[p.idx].at) last[p.idx] = p; });
    ms.forEach(m => { const p = last[m.i]; if (p && p.status === 'released' && m.st === 'in escrow') m.st = 'released'; m.partC = 0; });
  } else {
    // seeded deals: approved proofs release money from escrow in milestone order. Anything released beyond what was in
    // escrow is kept as overC, so a check can fail on it instead of it disappearing into a capped total
    let left = raw.loop.filter(p => p.dealId === deal.id && p.status === 'released').reduce((x, p) => x + C(p.value), 0);
    ms.forEach(m => { m.partC = 0; if (m.st === 'in escrow' && left > 0) { const x = Math.min(left, m.amtC); left -= x; if (x >= m.amtC) { m.st = 'released'; m.byProof = 1; } else m.partC = x; } });
    ms.overC = left;
  }
  const sum = sts => ms.filter(m => sts.includes(m.st)).reduce((x, m) => x + m.amtC, 0), part = ms.reduce((x, m) => x + m.partC, 0);
  return {
    id: deal.id, ms, overC: ms.overC || 0,
    relC: sum(['released']) + part, heldC: sum(['in escrow']) - part,
    procC: sum(['processing', 'awaiting wire']), openC: sum(['pending']),
    totC: ms.reduce((x, m) => x + m.amtC, 0),
  };
}

// every deal a brand has, from raw data (shared deals, the creator's seeded deals, the demo's extra deals)
function brandDeals(raw, bid) {
  const own = raw.S.deals.filter(d => d.brandId === bid);
  const seeded = raw.seeded.filter(d => d.brandId === bid);
  const extra = raw.extra.filter(d => d.brandId === bid);
  return own.concat(seeded, extra);
}

function creatorDeals(raw) {
  return raw.S.deals.filter(d => d.creator === raw.me).concat(raw.seeded);
}

function releasesOf(raw) {
  const out = [];
  raw.S.proofs.forEach(p => { if (p.creator === raw.me && p.status === 'released') out.push({ id: p.id, dealId: p.dealId, value: p.value, relAt: p.relAt || 0, item: p.item }); });
  raw.loop.forEach(p => { if (p.status === 'released') out.push({ id: p.id, dealId: p.dealId, value: p.value, relAt: p.relAt || 0, item: p.item }); });
  return creatorPayouts(out);
}

// ---- the creator's existing (seeded) deals
// the milestones the current deliverables can claim: a monthly deal's current month, otherwise the deal's own milestones
function seedScope(deal, L) {
  if (deal.type === 'monthly') {
    const ci = (deal.cycles || []).findIndex(c => c.status === 'current'), m = ci >= 0 ? L.ms[ci] : null;
    return m && !m.ren ? [m] : L.ms.filter(x => x.st !== 'released' && !x.ren).slice(0, 1);
  }
  return L.ms.filter(m => !m.ren);
}
// the deliverables still open in the current period, with a released proof counting as done
function seedItems(deal, raw) {
  const cs = deal.cycles || [], ci = cs.findIndex(c => c.status === 'current'), cy = ci >= 0 ? cs[ci] : null;
  const items = (cy && cy.items) || deal.deliverables || [], ciKey = cy ? ci : null;
  const P = raw.loop.filter(p => p.dealId === deal.id);
  const released = (it, idx) => P.some(p => p.status === 'released' && p.idx === idx && (p.ci == null ? ciKey == null : p.ci === ciKey) && p.item === it.label);
  const taken = new Set(P.filter(p => p.status !== 'changes').map(p => p.item));
  return items.map((it, idx) => ({ label: it.label, done: it.status === 'done' || released(it, idx), taken: taken.has(it.label) }));
}
// what the next proof on a seeded deal releases, worked out from the saved data: { ok, valueC, last }
function seedShare(raw, dealId) {
  const deal = raw.seeded.find(d => d.id === dealId), L = ledger(deal, raw), scope = seedScope(deal, L);
  const open = seedItems(deal, raw).filter(x => !x.done && !x.taken);
  if (!open.length) return { ok: false, why: 'nothing left to upload' };
  const pend = raw.loop.filter(p => p.dealId === dealId && (p.status === 'review' || p.status === 'releasing')).reduce((x, p) => x + C(p.value), 0);
  const availC = scope.filter(m => m.st === 'in escrow').reduce((x, m) => x + m.amtC - m.partC, 0) - pend;
  if (!(availC > 0)) return { ok: false, why: 'nothing in escrow for it' };
  if (open.length <= 1) {
    if (scope.some(m => m.st !== 'in escrow' && m.st !== 'released')) return { ok: false, why: 'the rest is not funded yet' };
    return { ok: true, valueC: availC, last: true, item: open[0].label };
  }
  return { ok: true, valueC: Math.floor(availC / open.length), last: false, item: open[0].label };
}
// what a seeded deal's proofs claim against what its period has in escrow: claims may never exceed it
function seedClaims(raw, dealId) {
  const deal = raw.seeded.find(d => d.id === dealId), L = ledger(deal, raw), scope = seedScope(deal, L);
  const claimedC = raw.loop.filter(p => p.dealId === dealId && ['review', 'releasing', 'released'].includes(p.status)).reduce((x, p) => x + C(p.value), 0);
  const fundedC = scope.filter(m => m.st === 'in escrow' || m.byProof).reduce((x, m) => x + m.amtC, 0);
  return { claimedC, fundedC, overC: L.overC };
}

module.exports = { C, feeC, fmt, cents, split, brandFees, creatorPayouts, milestonesOf, ledger, brandDeals, creatorDeals, releasesOf, seedScope, seedItems, seedShare, seedClaims };
