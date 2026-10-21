// The rules every saved state must keep, checked inside the page against the raw data: no app function decides what's
// right. 09-random checks them after every random step, 08-data after every two-tab race.
// INVARIANTS runs in the page (it is passed as source), so it may only use what the page has: GameInBX and GameInLoop.
const INVARIANTS = () => {
  const S = GameInBX.S, L = GameInLoop.S, bad = [], C = x => Math.round((+x || 0) * 100), feeC = c => Math.round(c / 20);
  // offers
  S.offers.forEach(o => {
    if (o.versions.length > 9) bad.push('offer ' + o.id + ' has ' + o.versions.length + ' versions');
    for (let i = 1; i < o.versions.length; i++) if (o.versions[i].by === o.versions[i - 1].by && !o.versions[i].tpl) bad.push('offer ' + o.id + ' v' + (i + 1) + ' by the same side twice');
    if (o.versions.some(v => !(C(v.amt) > 0))) bad.push('offer ' + o.id + ' has a version at $0');
    if (o.status === 'accepted') { const d = S.deals.find(x => x.id === o.dealId); if (!d && !/^bx\d$/.test(o.dealId || '')) bad.push('accepted offer ' + o.id + ' has no deal'); else if (d && C(d.amount) !== C(o.versions[o.versions.length - 1].amt)) bad.push('deal ' + d.id + ' amount differs from the accepted version'); }
    if (o.status !== 'accepted' && S.deals.some(d => d.fromOffer === o.id)) bad.push('offer ' + o.id + ' is ' + o.status + ' but has a deal');
    if (S.deals.filter(d => d.fromOffer === o.id).length > 1) bad.push('offer ' + o.id + ' has ' + S.deals.filter(d => d.fromOffer === o.id).length + ' deals');
  });
  if (new Set(S.offers.map(o => o.id)).size !== S.offers.length) bad.push('two offers share an id');
  if (new Set(S.deals.map(d => d.id)).size !== S.deals.length) bad.push('two deals share an id');
  if (new Set(S.proofs.map(p => p.id)).size !== S.proofs.length) bad.push('two proofs share an id');
  if (new Set(S.inv.map(r => r.id)).size !== S.inv.length) bad.push('two receipts share an id');
  // payments: one receipt per payment, and every milestone a receipt charged for is held by that same payment,
  // so nothing is charged twice and nothing is funded without being charged
  const byPay = {};
  S.inv.forEach(r => {
    if (!r.pay) return;
    if (byPay[r.pay]) bad.push('payment ' + r.pay + ' has two receipts');
    byPay[r.pay] = r;
    if (!(r.ms || []).length) bad.push('receipt ' + r.id + ' pays for no milestone');
    (r.ms || []).forEach(i => { const e = S.esc[r.dealId + ':' + i]; if (!e || e.pay !== r.pay) bad.push('receipt ' + r.id + ' charged for milestone ' + (i + 1) + ' of ' + r.dealId + ', which ' + (e ? 'another payment funded' : 'is not funded')); });
  });
  Object.keys(S.esc).forEach(k => {
    const e = S.esc[k];
    if (!e || !e.pay) return;
    const r = byPay[e.pay];
    if (!r) { bad.push('escrow ' + k + ' was funded without a receipt'); return; }
    if (!(r.ms || []).includes(+k.slice(k.lastIndexOf(':') + 1))) bad.push('escrow ' + k + ' is held by a payment whose receipt doesn\'t charge for it');
    // a receipt is paid exactly when its money is in escrow
    if ((r.st === 'paid') !== (e.st === 'in escrow')) bad.push('escrow ' + k + ' is ' + e.st + ' but its receipt says ' + r.st);
  });
  // shared deals: split, funding, proofs
  const legacy = S.inv.length > 0 && !S.inv.some(r => r.dealId);
  S.deals.forEach(d => {
    const n = d.milestones.length, tot = C(d.amount), b = Math.floor(tot / n);
    d.milestones.forEach((m, i) => { const want = i === n - 1 ? tot - b * (n - 1) : b; if (C(m.amt) !== want) bad.push('deal ' + d.id + ' milestone ' + (i + 1) + ' is ' + m.amt + ', the split says ' + want / 100); });
    const byIdx = {};
    S.proofs.filter(p => p.dealId === d.id).forEach(p => { (byIdx[p.idx] = byIdx[p.idx] || []).push(p); });
    Object.keys(byIdx).forEach(i => {
      const ps = byIdx[i], live = ps.filter(p => p.status === 'review' || p.status === 'releasing' || p.status === 'released');
      if (live.length > 1) bad.push('deal ' + d.id + ' deliverable ' + i + ' has ' + live.length + ' live proofs');
      // money moves only from escrow: a proof being paid or paid sits on money in escrow. A proof in review sits on money that is
      // funded (when two payments for it met, the one that stands may still be clearing; the proof then waits)
      const e = S.esc[d.id + ':' + i], paying = live.filter(p => p.status !== 'review');
      if (paying.length && (!e || e.st !== 'in escrow')) bad.push('deal ' + d.id + ' deliverable ' + i + ' has a proof ' + paying[0].status + ' but its money is ' + (e ? e.st : 'not funded'));
      if (live.length && !e) bad.push('deal ' + d.id + ' deliverable ' + i + ' has proof but its money is not funded');
      ps.forEach(p => { if (C(p.value) !== C(d.milestones[i].amt)) bad.push('proof ' + p.id + ' value ' + p.value + ' differs from its milestone'); });
      ps.forEach(p => { if (p.status === 'released' && !p.relAt) bad.push('proof ' + p.id + ' released without a date'); if (p.status === 'releasing' && !p.releaseAt) bad.push('proof ' + p.id + ' releasing without a window'); });
    });
    // receipts: 5% of everything funded on the deal, rounded once (builds whose receipts don't name their deal can't be
    // checked this way: v61's carry only the deal's title)
    if (legacy) return;
    const inv = S.inv.filter(r => r.dealId === d.id);
    const base = inv.reduce((x, r) => x + C(r.base), 0), fee = inv.reduce((x, r) => x + C(r.fee), 0), paid = inv.reduce((x, r) => x + C(r.amt), 0);
    const funded = d.milestones.reduce((x, m, i) => x + (S.esc[d.id + ':' + i] ? C(m.amt) : 0), 0);
    if (base !== funded) bad.push('deal ' + d.id + ' receipts cover ' + base + ' but ' + funded + ' is funded');
    if (fee !== feeC(funded)) bad.push('deal ' + d.id + ' fees ' + fee + ' but 5% of ' + funded + ' is ' + feeC(funded));
    if (paid !== base + fee) bad.push('deal ' + d.id + ' charged ' + paid + ' not ' + (base + fee));
  });
  // seeded deals: proofs never claim more than their period has in escrow (a monthly deal's current month; otherwise the
  // deal's own milestones, never a renewal's), and one live proof per deliverable
  GameInBX.api.raw().seeded.forEach(d => {
    let ms = (d.milestones || []).map((m, i) => { const e = S.esc[d.id + ':' + i]; return { amt: C(m.amt), st: e ? e.st : m.st }; });
    if (d.type !== 'monthly') { let acc = 0; ms = ms.filter(m => { if (acc + m.amt <= C(d.amount) + 1) { acc += m.amt; return true; } return false; }); }
    const ci = (d.cycles || []).findIndex(c => c.status === 'current');
    const scope = d.type === 'monthly' ? (ci >= 0 && ms[ci] ? [ms[ci]] : []) : ms;
    const cap = scope.filter(m => m.st === 'in escrow').reduce((x, m) => x + m.amt, 0);
    const mine = L.proofs.filter(p => p.dealId === d.id), live = mine.filter(p => p.status === 'released' || p.status === 'review' || p.status === 'releasing');
    const out = live.reduce((x, p) => x + C(p.value), 0);
    if (out > cap) bad.push('seeded deal ' + d.id + ' has ' + out + ' claimed or released against ' + cap + ' in escrow for this period');
    mine.forEach(p => { if (!(C(p.value) > 0)) bad.push('seeded proof ' + p.id + ' worth ' + p.value); });
    const per = {};
    live.forEach(p => { const k = (p.ci == null ? '' : p.ci) + ':' + p.item; per[k] = (per[k] || 0) + 1; });
    Object.keys(per).forEach(k => { if (per[k] > 1) bad.push('seeded deal ' + d.id + ' deliverable ' + k + ' has ' + per[k] + ' live proofs'); });
  });
  if (new Set(L.proofs.map(p => p.id)).size !== L.proofs.length) bad.push('two seeded-deal proofs share an id');
  // every payout once
  const rel = GameInBX.api.releases();
  if (new Set(rel.map(r => r.id)).size !== rel.length) bad.push('a payout is listed twice');
  return bad;
};

// run the rules in a page; [] when they all hold
const rulesHold = page => page.evaluate(src => (new Function('return (' + src + ')()'))(), INVARIANTS.toString());

module.exports = { INVARIANTS, rulesHold };
