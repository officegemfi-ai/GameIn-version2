/* GameIn live mode: the adapter between the database and the prototype's screens.
 *
 * The screens stay as they are; the engine underneath changes:
 *   - every database snapshot (GameInLive) becomes the records the screens already read: the brand and creator
 *     profiles (the app's own lists) and the shared store GameInBX.S (offers, deals, proofs, escrow, receipts,
 *     renewals, ratings)
 *   - the engine's projections (a brand's deals, a creator's deals and offers, threads, the wallet, counts) are
 *     computed from the snapshot instead of the demo's made-up data
 *   - every move goes to its database function. The screen updates at once where it can, the database answers, and
 *     the next snapshot replaces the guess; a refusal is shown with the database's own reason
 *   - sign-in and sign-up are real (Supabase Auth)
 *
 * The app's engine functions hand over to GIX.<name> (wired by live/tools/patch-index.mjs); GIXI holds the app's own
 * helpers (money format, dates, profile lists, the store). Loaded by live/boot.js in live mode only.
 */
(function () {
  'use strict';
  if (window.GAMEIN_MODE !== 'live') return;
  const GIX = (window.GIX = window.GIX || {});
  const live = window.GameInLive && window.GameInLive.instance;
  if (!live) {
    console.error('GameIn live mode: Supabase is not configured (live/config.js)');
    return;
  }
  GIX.live = live;
  const X = () => window.GIXI || null;
  const G = () => window.GameInBrand || {};
  const app = () => (window.GameInBrand && window.GameInBrand.app) || null;

  // ---------------------------------------------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------------------------------------------
  const toD = (c) => Math.round(+c || 0) / 100; // cents to dollars
  const toC = (d) => Math.round((+d || 0) * 100); // dollars to cents
  const at = (iso) => (iso ? Date.parse(iso) : 0);
  const onDay = (date) => (date ? new Date(date + 'T18:00:00').getTime() : 0); // a due date, 6 pm local
  const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''));
  const money = (d) => (X() ? X().Se(d) : '$' + (+d).toFixed(2));
  const dayLabel = (t) => (t ? X().bxDay(t) : '');
  const dateLabel = (t) => (t ? X().bxDate(t) : '');
  const MS_ST = { pending: 'pending', processing: 'processing', awaiting_wire: 'awaiting wire', in_escrow: 'in escrow', released: 'released' };
  const PROOF_ST = { in_review: 'review', releasing: 'releasing', released: 'released', changes_requested: 'changes' };
  const DEAL_TYPE = { one_time: 'one-time', milestone: 'milestone', monthly: 'monthly' };
  const notify = (t) => {
    const A = app();
    if (A && A.notify && t) A.notify(t);
  };
  const say = (NT) => (t) => (NT ? NT(t) : notify(t));

  // a move: the database function, then a fresh snapshot (GameInLive reloads after every move). A refusal shows the
  // database's reason and the snapshot puts the screen back
  function run(fn, args, done) {
    const p = live.act(fn, args);
    p.then((data) => done && done(data)).catch((e) => {
      notify(e.refused ? e.message : 'That didn’t go through: ' + (e.message || 'please try again'));
      live.load().catch(() => {});
    });
    return p;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // The snapshot, indexed
  // ---------------------------------------------------------------------------------------------------------------
  let M = null;
  const group = (rows, key) => {
    const m = new Map();
    (rows || []).forEach((r) => {
      const k = r[key];
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    });
    return m;
  };
  const byId = (rows) => new Map((rows || []).map((r) => [r.id, r]));

  function index(w) {
    const m = { w };
    m.brands = byId(w.brands);
    m.creators = byId(w.creators);
    m.offers = byId(w.offers);
    m.versions = group(w.versions, 'offer_id');
    m.deals = byId(w.deals);
    m.milestones = group(w.milestones, 'deal_id');
    m.deliverables = group(w.deliverables, 'deal_id');
    m.proofs = group(w.proofs, 'deliverable_id');
    m.proofsByDeal = group(w.proofs, 'deal_id');
    m.releases = new Map((w.releases || []).map((r) => [r.proof_id, r]));
    m.payments = byId(w.payments);
    m.periods = group(w.periods, 'deal_id');
    m.renewals = group(w.renewals, 'deal_id');
    m.ratings = group(w.ratings, 'deal_id');
    m.money = new Map((w.dealMoney || []).map((r) => [r.deal_id, r]));
    m.convs = byId(w.conversations);
    m.convByPair = new Map((w.conversations || []).map((c) => [c.brand_id + '|' + c.creator_id, c]));
    m.messages = group(w.messages, 'conversation_id');
    m.reads = new Map((w.reads || []).map((r) => [r.conversation_id + '|' + r.side, r]));
    m.events = w.events || [];
    m.eventsByDeal = group(m.events, 'deal_id');
    m.packages = group(w.packages, 'creator_id');
    m.creatorSeat = (w.seats || []).find((s) => s.side === 'creator') || null;
    m.brandSeats = (w.seats || []).filter((s) => s.side === 'brand');
    m.wallet = (w.wallet || [])[0] || null;
    m.todos = w.todos || [];
    return m;
  }
  const creatorName = (id) => ((M && M.creators.get(id)) || {}).display_name || 'Creator';
  const brandName = (id) => ((M && M.brands.get(id)) || {}).name || 'Brand';
  const myCreatorId = () => (M && M.creatorSeat ? M.creatorSeat.creator_id : null);
  const myBrandIds = () => (M ? M.brandSeats.map((s) => s.brand_id) : []);
  const creatorIdByName = (name) => {
    if (!M) return null;
    for (const c of M.creators.values()) if (c.display_name === name) return c.id;
    return null;
  };

  // ---------------------------------------------------------------------------------------------------------------
  // Profiles: the app's creator and brand lists (jB, _w) hold the database's, with the demo's richer profile data kept
  // for the demo workspace's own brands and creators
  // ---------------------------------------------------------------------------------------------------------------
  const CREATOR_TPL = { instantshock: 'c1', rp1: 'c2', qwerty2000: 'c3', fspartan: 'c4', testy: 'c5', outpost: 'c6' };
  const BRAND_TPL = { voltedge: 'b1', hypercore: 'b2', gridfuel: 'b3', nexawear: 'b4', 'orbital-audio': 'b5', shieldpoint: 'b6' };
  const HUES = ['#424446', '#353739', '#3a3f4a', '#433b48', '#3b4840', '#4a4038', '#383f48', '#463a3a'];
  let TPL = null;
  function templates() {
    if (!TPL) {
      const x = X();
      TPL = {
        c: new Map(x.jB.map((c) => [c.id, JSON.parse(JSON.stringify(c))])),
        b: new Map(x._w.map((b) => [b.id, JSON.parse(JSON.stringify(b))])),
      };
    }
    return TPL;
  }
  const hueOf = (id) => {
    let h = 0;
    for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return HUES[h % HUES.length];
  };
  const NOBODY = {
    id: '', kind: 'creator', name: 'Creator profile', handle: '', level: 1, pts: 0, followers: '0', fnum: 0, games: [], type: 'Creator',
    c1: '#969696', c2: '#767676', hue: '#424446', verified: false, partner: false, likes: '0', views: '0', socials: {},
    cert: [0, 0, 0, 0, 0, 0], bio: '', offerings: [],
  };
  function creatorEntity(r) {
    const t = templates().c.get(CREATOR_TPL[String(r.handle).toLowerCase()]);
    const socials = {};
    (Array.isArray(r.platforms) ? r.platforms : []).forEach((p) => {
      if (p && p.platform) socials[String(p.platform).toLowerCase()] = p.followers || '';
    });
    const base = t
      ? { ...t }
      : {
          kind: 'creator', level: 1, pts: 0, followers: '0', fnum: 0, age: '', country: '', flag: '', games: [],
          type: 'Creator', c1: '#969696', c2: '#767676', hue: hueOf(r.id), verified: false, partner: false, likes: '0',
          views: '0', joined: dateLabel(at(r.created_at)), sponsoredBy: '', socials, cert: [0, 0, 0, 0, 0, 0],
        };
    return Object.assign(base, {
      id: r.id, name: r.display_name, handle: '@' + r.handle, bio: r.bio || base.bio || '', live: 1,
      offerings: offeringsOfCreator(r.id),
    });
  }
  function brandEntity(r) {
    const t = templates().b.get(BRAND_TPL[r.slug]);
    const base = t
      ? { ...t }
      : {
          kind: 'brand', cat: 'Brand', pcat: '', level: 1, followers: '0', fnum: 0, country: '', flag: '', partner: false,
          c1: '#969696', c2: '#767676', hue: hueOf(r.id), joined: dateLabel(at(r.created_at)), views: '0', socials: {},
          products: [], score: 0, radar: [0, 0, 0, 0, 0, 0], about: '',
        };
    return Object.assign(base, { id: r.id, name: r.name, slug: r.slug, verified: !!r.verified, live: 1 });
  }
  let meEntity = null;
  GIX.me = () => meEntity || NOBODY;

  // ---------------------------------------------------------------------------------------------------------------
  // Packages (a creator's offerings)
  // ---------------------------------------------------------------------------------------------------------------
  function pkgShape(p) {
    const items = Array.isArray(p.items) ? p.items : [];
    return {
      id: p.id, code: p.code, title: p.title, desc: p.description || '', price: toD(p.price_cents), active: !!p.active,
      modules: items.map((it) => X().bxMod(it.label)), length: p.length_label || '', items, live: 1,
    };
  }
  function offeringsOfCreator(cid) {
    if (!M) return [];
    return (M.packages.get(cid) || [])
      .filter((p) => p.active)
      .map((p) => {
        const s = pkgShape(p),
          J = X().Ja[s.modules[0]] || {};
        return {
          id: p.id, title: p.title, price: s.price, sub: s.desc, platform: '', timeframe: s.length, live: 1, src: s,
          tag: s.modules.length > 1 ? 'bundle' : String(J.name || 'package').split(/[:,]/)[0].toLowerCase(),
        };
      });
  }
  GIX.bxOfferingsOf = (c) => (c && c.id ? offeringsOfCreator(c.id) : []);
  GIX.offerings = () => (M && myCreatorId() ? (M.packages.get(myCreatorId()) || []).map(pkgShape) : []);
  const pkgRow = (p) => ({
    code: p.code || null,
    title: String(p.title || 'Package').slice(0, 120),
    description: p.desc || '',
    price_cents: toC(p.price),
    length_label: p.length || null,
    items: (X().bxPkgItems(p) || []).map((x) => ({ label: String(x.label).slice(0, 120), days: x.days || 7 })),
    active: p.active !== false,
  });
  function savePackage(p, isNew) {
    const cid = myCreatorId();
    if (!cid) return notify('Create your creator profile first');
    const row = pkgRow(p);
    const q = isNew || !isUuid(p.id)
      ? live.client.from('packages').insert({ ...row, creator_id: cid })
      : live.client.from('packages').update(row).eq('id', p.id);
    q.then(({ error }) => {
      if (error) notify('The package wasn’t saved: ' + error.message);
      live.load().catch(() => {});
    });
  }
  GIX.addOffering = (p) => savePackage(p, true);
  GIX.updateOffering = (p) => savePackage(p, false);
  GIX.removeOffering = (id) => savePackage({ ...(GIX.offerings().find((p) => p.id === id) || { id }), active: false }, false);
  GIX.setOfferings = (next) => {
    const cur = GIX.offerings(),
      list = typeof next === 'function' ? next(cur) : next;
    (list || []).forEach((p) => {
      const was = cur.find((x) => x.id === p.id);
      if (!was) savePackage(p, true);
      else if (was.active !== p.active || was.title !== p.title || was.price !== p.price) savePackage(p, false);
    });
  };

  // ---------------------------------------------------------------------------------------------------------------
  // The shared store, rebuilt from each snapshot in the shapes the screens read
  // ---------------------------------------------------------------------------------------------------------------
  let shadow = null; // what the store held right after the rebuild: what the screens changed since is sent on emit

  function offerRecord(o) {
    const vs = (M.versions.get(o.id) || []).map((v) => ({
      v: v.version, by: v.by_side === 'brand' ? 'you' : 'creator', amt: toD(v.amount_cents),
      items: (v.items || []).map((x) => ({ label: x.label, days: x.days || 7 })), note: v.note || '', at: at(v.created_at),
    }));
    return {
      id: o.id, bid: o.brand_id, creator: creatorName(o.creator_id), cid: o.campaign_id, title: o.title,
      status: o.status, expiresAt: at(o.expires_at), msgs: [], versions: vs,
      acceptedAt: at(o.accepted_at) || undefined,
      acceptedBy: o.accepted_by_side ? (o.accepted_by_side === 'brand' ? 'you' : 'creator') : undefined,
      dealId: o.deal_id || undefined,
      declinedBy: o.status === 'declined' ? (o.closed_by_side === 'brand' ? 'you' : 'creator') : undefined,
      closedAt: at(o.closed_at) || undefined, reason: o.close_reason || undefined,
      pitch: o.source === 'pitch' || o.source === 'book_again' ? 1 : 0, again: o.previous_deal_id || null,
      campaign: null, src: o.source, live: 1,
    };
  }

  // a deal's deliverables in order, and the ones on screen now: a monthly deal shows its current month
  function itemsOf(d) {
    const all = M.deliverables.get(d.id) || [];
    const periods = M.periods.get(d.id) || [];
    if (d.type !== 'monthly' || !periods.length) return { all, scope: all, period: null, periods };
    const msOf = new Map((M.milestones.get(d.id) || []).map((m) => [m.id, m]));
    const inPeriod = (p) => all.filter((dl) => (msOf.get(dl.milestone_id) || {}).period_id === p.id);
    const cur = periods.find((p) => inPeriod(p).some((dl) => dl.status !== 'done')) || periods[periods.length - 1];
    return { all, scope: inPeriod(cur), period: cur, periods, inPeriod };
  }
  const latestProof = (dl) => {
    const L = M.proofs.get(dl.id) || [];
    return L.length ? L[L.length - 1] : null;
  };
  function proofRecord(p) {
    const d = M.deals.get(p.deal_id) || {},
      all = M.deliverables.get(p.deal_id) || [],
      i = all.findIndex((x) => x.id === p.deliverable_id),
      dl = all[i] || {};
    return {
      id: p.id, dealId: p.deal_id, bid: d.brand_id, creator: creatorName(d.creator_id), deal: d.title, item: dl.label,
      idx: i, n: all.length, value: toD(p.value_cents), status: PROOF_ST[p.status] || 'review', at: at(p.submitted_at),
      releaseAt: p.status === 'releasing' ? at(p.release_at) : undefined, relAt: at(p.released_at) || undefined,
      chAt: at(p.changes_at) || undefined, did: p.deliverable_id, link: p.link_url, file: p.file_path, note: p.note, live: 1,
    };
  }
  function renewalRecord(d) {
    const L = (M.renewals.get(d.id) || []).filter((r) => r.status !== 'withdrawn');
    const r = L.find((x) => x.status === 'sent' || x.status === 'requested') || L[L.length - 1];
    if (!r) return null;
    return {
      id: r.id, st: r.status, by: r.by_side === 'creator' ? 'creator' : undefined, months: r.months, price: toD(r.price_cents),
      auto: !!r.auto_renew, at: dateLabel(at(r.created_at)), ts: at(r.created_at),
      accTs: r.status === 'accepted' ? at(r.answered_at) : undefined, decTs: r.status === 'declined' ? at(r.answered_at) : undefined,
      acc: r.status === 'accepted' ? dateLabel(at(r.answered_at)) : undefined,
    };
  }
  function ratingRecord(d, side) {
    const r = (M.ratings.get(d.id) || []).find((x) => x.by_side === side);
    if (!r) return null;
    return {
      v: [r.score, r.score, r.score, r.score, r.score, r.score], txt: r.comment || '', again: r.score >= 3, avg: r.score,
      at: dateLabel(at(r.created_at)), ts: at(r.created_at), creator: creatorName(d.creator_id), brand: brandName(d.brand_id),
      deal: d.title, bid: d.brand_id, live: 1,
    };
  }

  function rebuild() {
    const x = X();
    if (!x || !M) return;
    // profiles
    const creators = [...M.creators.values()].map(creatorEntity);
    meEntity = creators.find((c) => c.id === myCreatorId()) || null;
    const others = creators.filter((c) => c !== meEntity).sort((a, b) => a.name.localeCompare(b.name));
    x.jB.splice(0, x.jB.length, ...(meEntity ? [meEntity] : []), ...others);
    const brands = [...M.brands.values()].map(brandEntity).sort((a, b) => a.name.localeCompare(b.name));
    x._w.splice(0, x._w.length, ...brands);

    // the store
    const S = x.GBX.S;
    const offers = [...M.offers.values()].map(offerRecord).sort((a, b) => b.versions[b.versions.length - 1].at - a.versions[a.versions.length - 1].at);
    const deals = [],
      esc = {},
      ren = {},
      rate = {},
      crate = {};
    for (const d of M.deals.values()) {
      const ms = M.milestones.get(d.id) || [];
      const { all } = itemsOf(d);
      deals.push({
        id: d.id, brandId: d.brand_id, creator: creatorName(d.creator_id), title: d.title, type: DEAL_TYPE[d.type] || 'one-time',
        amount: toD(d.amount_cents), period: periodLabel(d), contract: d.contract_label || 'v1 · accepted', perItem: 0,
        fromOffer: d.offer_id || null, createdAt: at(d.created_at), note: dealNote(d), live: 1,
        deliverables: all.map((dl) => ({ label: dl.label, due: dayLabel(onDay(dl.due_on)), ts: onDay(dl.due_on), status: dl.status })),
        milestones: ms.map((m) => ({ label: m.label, d: dayLabel(onDay(m.due_on)), amt: toD(m.amount_cents), st: MS_ST[m.status] })),
        log: [],
      });
      ms.forEach((m, i) => {
        const p = m.payment_id && M.payments.get(m.payment_id);
        if (p)
          esc[d.id + ':' + i] = {
            st: MS_ST[m.status], method: p.method_label, ref: p.reference, at: dateLabel(at(p.created_at)), ts: at(p.created_at),
            pay: p.id, k: p.method, cleared: p.method !== 'card' && p.status === 'succeeded' ? dateLabel(at(p.succeeded_at)) : undefined,
            cts: p.method !== 'card' && p.status === 'succeeded' ? at(p.succeeded_at) : undefined,
          };
      });
      const rn = renewalRecord(d);
      if (rn) ren[d.id] = rn;
      const r1 = ratingRecord(d, 'brand'),
        r2 = ratingRecord(d, 'creator');
      if (r1) rate['deal:' + d.id] = r1;
      if (r2) crate['deal:' + d.id] = r2;
    }
    const proofs = (M.w.proofs || []).map(proofRecord).sort((a, b) => b.at - a.at);
    const inv = (M.w.payments || [])
      .slice()
      .sort((a, b) => at(b.created_at) - at(a.created_at))
      .map((p) => {
        const d = M.deals.get(p.deal_id) || {},
          ms = M.milestones.get(p.deal_id) || [],
          pm = (M.w.paymentMilestones || []).filter((x) => x.payment_id === p.id);
        return {
          id: p.id, bid: p.brand_id, date: dateLabel(at(p.created_at)), deal: d.title, creator: creatorName(d.creator_id), dealId: p.deal_id,
          ts: at(p.created_at), ref: p.reference, pay: p.id, k: p.method,
          ms: pm.map((x) => ms.findIndex((m) => m.id === x.milestone_id)), amts: pm.map((x) => +x.amount_cents),
          amt: toD(p.total_cents), base: toD(p.base_cents), fee: toD(p.fee_cents), method: p.method_label,
          st: p.status === 'succeeded' ? 'paid' : p.status === 'awaiting_wire' ? 'awaiting wire' : p.status,
          cleared: p.method !== 'card' && p.status === 'succeeded' ? dateLabel(at(p.succeeded_at)) : undefined,
          cts: p.method !== 'card' && p.status === 'succeeded' ? at(p.succeeded_at) : undefined,
        };
      });
    // read times, as the screens keep them: the creator's per brand, the brand's per thread
    const readAt = {},
      cread = {};
    for (const c of M.convs.values()) {
      const rb = M.reads.get(c.id + '|brand'),
        rc = M.reads.get(c.id + '|creator');
      if (rb) readAt[c.brand_id + ':cv:' + c.id] = at(rb.last_read_at);
      if (c.creator_id === myCreatorId()) {
        if (rb) readAt[c.brand_id + ':me'] = at(rb.last_read_at);
        if (rc) cread[c.brand_id] = at(rc.last_read_at);
      }
    }
    Object.assign(S, { offers, deals, proofs, esc, inv, ren, rate, crate, msg: {}, cmsg: {}, read: {}, readAt, cread, v: 3 });
    shadow = JSON.stringify({ msg: S.msg, cmsg: S.cmsg, rate: S.rate, crate: S.crate, readAt: S.readAt });
    shadowObj = JSON.parse(shadow);
    // an account without a brand, or without a creator profile, is offered to make one where the other would open
    GIX.bxGoBrand = M.brandSeats.length ? undefined : () => newSeatSheet('brand');
    GIX.bxGoCreator = M.creatorSeat ? undefined : () => newSeatSheet('creator');
    GIX.GibBrandHQ = M.brandSeats.length ? undefined : noBrandView;
    x.GBX.note();
    const L = window.GameInLoop;
    if (L && L.emit) L.emit();
  }

  // the brand workspace for an account with no brand yet: one step to make it
  function noBrandView() {
    const H = X().React.createElement;
    return H('div', { className: 'gbw-stack', style: { maxWidth: 560, margin: '48px auto', textAlign: 'center' } },
      H('h2', null, 'Set up your brand'),
      H('p', null, 'Name your brand to send offers, fund escrow and approve creators’ work. You can keep your creator profile too.'),
      H('button', { type: 'button', className: 'gib-btn is-primary', onClick: () => newSeatSheet('brand') }, 'create a brand'));
  }
  function newSeatSheet(side) {
    const brand = side === 'brand';
    sheet(
      '<h2>' + (brand ? 'Create your brand' : 'Create your creator profile') + '</h2><p class="gob__p">' +
        (brand ? 'Brands send offers, fund escrow and approve proof. You can switch between your brand and creator seats any time.' : 'Creators get offers, deliver and get paid from escrow. You can switch between seats any time.') + '</p>' +
        '<label class="gob__f"><span>' + (brand ? 'brand name' : 'creator name') + '</span><input data-f="name" type="text" maxlength="80" placeholder="' + (brand ? 'e.g. Voltedge' : 'e.g. NovaPlays') + '"></label>' +
        (brand ? '' : '<label class="gob__f"><span>handle</span><input data-f="handle" type="text" maxlength="32" placeholder="novaplays"></label>') +
        '<p class="gsi-err" role="alert"></p><button type="button" class="gib-btn is-primary gsi-go" data-k="go">' + (brand ? 'create brand' : 'create profile') + '</button>',
      (e, close, ov) => {
        const k = e.target.closest('[data-k="go"]');
        if (!k) return;
        const name = ov.querySelector('[data-f="name"]').value.trim(),
          err = ov.querySelector('.gsi-err'),
          h = ov.querySelector('[data-f="handle"]'),
          handle = h ? (h.value.trim() || name).replace(/[^A-Za-z0-9_.-]+/g, '').slice(0, 32) : null;
        if (name.length < 2) return (err.textContent = 'Enter a name.');
        k.disabled = true;
        live.act(brand ? 'create_brand' : 'create_creator_profile', brand ? { p_name: name } : { p_handle: handle, p_display_name: name })
          .then((id) => {
            close();
            const a = app();
            if (!a) return;
            if (brand) {
              const L = window.GameInLoop;
              if (L) L.setBrand(id);
              a.go('dashboard');
              setTimeout(() => app().go('brandHQ'), 50);
            } else a.go('dashboard');
            notify(brand ? name + ' is ready. Send your first offer from the brand view.' : 'Your creator profile is ready.');
          })
          .catch((x) => {
            k.disabled = false;
            err.textContent = x.message;
          });
      },
      brand ? 'Create your brand' : 'Create your creator profile',
    );
  }
  let shadowObj = null;

  function periodLabel(d) {
    const a = onDay(d.starts_on),
      b = onDay(d.ends_on);
    if (!a && !b) return '';
    if (!b) return 'from ' + dayLabel(a);
    return dayLabel(a || b) + ' – ' + dayLabel(b) + ', ' + new Date(b).getFullYear();
  }
  function dealNote(d) {
    const vs = d.offer_id ? M.versions.get(d.offer_id) || [] : [];
    const v = vs.find((x) => x.note);
    return v ? v.note : '';
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Projections: a brand's deals (bxDeals), one deal (bxDealNow), the creator's deals, offers, threads
  // ---------------------------------------------------------------------------------------------------------------
  function dealView(d) {
    const x = X(),
      S = x.GBX.S;
    const base = S.deals.find((y) => y.id === d.id) || {};
    const msRows = M.milestones.get(d.id) || [];
    const ms = msRows.map((m, i) => {
      const p = m.payment_id && M.payments.get(m.payment_id);
      const e = S.esc[d.id + ':' + i] || {};
      return {
        id: m.id, label: m.label, d: m.due_on ? dayLabel(onDay(m.due_on)) : 'on completion', amt: toD(m.amount_cents),
        st: MS_ST[m.status] || 'pending', i, method: e.method || (p && p.method_label), ref: e.ref, at: e.at, ts: e.ts, cts: e.cts,
        part: m.status === 'in_escrow' && +m.released_cents > 0 ? toD(m.released_cents) : 0,
        byProof: m.status === 'released' ? 1 : 0, ren: m.renewal_id ? 1 : 0, pid: m.payment_id || null, period: m.period_id,
      };
    });
    const msById = new Map(msRows.map((m, i) => [m.id, ms[i]]));
    const { scope, period, periods, inPeriod } = itemsOf(d);
    const items = scope.map((dl) => {
      const m = msById.get(dl.milestone_id) || {},
        p = latestProof(dl),
        st =
          dl.status === 'done' ? 'done'
            : dl.status === 'in_review' ? 'review'
              : dl.status === 'changes_requested' ? 'changes'
                : m.st === 'in escrow' ? 'due' : 'upcoming';
      return {
        id: dl.id, mid: dl.milestone_id, label: dl.label, due: dayLabel(onDay(dl.due_on)), ts: onDay(dl.due_on), status: st,
        proof: dl.status === 'done', pf: p ? proofRecord(p) : undefined, st: m.st, amt: toD(dl.amount_cents),
      };
    });
    let nextUp = null,
      waitFund = false,
      waitClear = false;
    items.forEach((it, i) => {
      if (nextUp == null && it.st === 'in escrow' && it.status !== 'done' && it.status !== 'review') nextUp = i;
      if (it.status !== 'done' && it.st === 'pending') waitFund = true;
      if (it.status !== 'done' && (it.st === 'processing' || it.st === 'awaiting wire')) waitClear = true;
    });
    const mo = M.money.get(d.id) || {};
    const cyc = (periods || []).map((p) => {
      const L = inPeriod ? inPeriod(p) : [];
      const dn = L.filter((dl) => dl.status === 'done').length;
      const m = L.length ? msById.get(L[0].milestone_id) : null;
      return {
        label: p.label, range: dayLabel(onDay(p.starts_on)) + ' – ' + dayLabel(onDay(p.ends_on)),
        status: L.length && dn === L.length ? 'complete' : period && p.id === period.id ? 'current' : 'upcoming', n: L.length, dn,
        st: m ? m.st : 'pending', amt: m ? m.amt : 0,
        items: L.map((dl) => ({
          label: dl.label, m: X().bxMod(dl.label), due: dayLabel(onDay(dl.due_on)), id: dl.id,
          status: dl.status === 'done' ? 'done' : dl.status === 'in_review' ? 'review' : dl.status === 'changes_requested' ? 'changes' : m && m.st === 'in escrow' ? 'due' : 'upcoming',
          proof: dl.status === 'done',
        })),
      };
    });
    const done = d.status === 'completed';
    return {
      ...base,
      cr: x.bxEnt(creatorName(d.creator_id), x.jB, GIX.me()),
      creator: creatorName(d.creator_id),
      og: 1,
      perItem: 0,
      ms,
      rel: toD(mo.released_cents),
      held: toD(mo.in_escrow_cents),
      proc: toD(mo.clearing_cents),
      open: toD(mo.not_funded_cents),
      tot: toD(mo.total_cents),
      done,
      status: done ? 'completed' : d.status === 'awaiting_funding' ? 'awaiting funding' : 'in progress',
      items,
      cycle: period ? { label: period.label, range: cyc.find((c) => c.label === period.label).range, status: 'current', items } : undefined,
      cyc,
      ren: S.ren[d.id] || null,
      nextUp,
      waitFund,
      waitClear,
      dbStatus: d.status,
    };
  }
  GIX.bxDeals = (bid) => (M ? [...M.deals.values()].filter((d) => d.brand_id === bid).sort((a, b) => at(b.created_at) - at(a.created_at)).map(dealView) : []);
  GIX.bxDealNow = (id) => (M && M.deals.get(id) ? dealView(M.deals.get(id)) : null);
  GIX.bxDealFor = (e) => (e ? GIX.bxDealNow(e.id) : null);
  GIX.bxExtra = () => [];
  GIX.bxSeed = () => {};
  GIX.bxSeed3 = () => {};

  // the creator's view of a deal (the shape the creator screens read)
  function creatorView(v) {
    const x = X();
    // the next payout: the next deliverable still to be paid (each one pays its share when its proof is approved)
    const nextItem = (M.deliverables.get(v.id) || []).find((dl) => dl.status !== 'done');
    const nm = nextItem ? { amt: toD(nextItem.amount_cents), due: nextItem.due_on } : null;
    // a monthly deal's price is per month
    const month = v.type === 'monthly' && v.ms.length ? (v.cycle ? v.ms.find((m) => m.period === (itemsOf(M.deals.get(v.id)).period || {}).id) : null) || v.ms[0] : null;
    const dl = v.items.map((it) => ({
      label: it.label, due: it.due, ts: it.ts, m: x.bxMod(it.label),
      status: it.status === 'done' ? 'done' : it.status === 'review' ? 'review' : it.status === 'changes' ? 'changes' : it.st === 'in escrow' ? 'due' : 'upcoming',
      proof: it.status === 'done', st: it.st, id: it.id,
    }));
    const offer = v.fromOffer && x.GBX.S.offers.find((o) => o.id === v.fromOffer);
    return {
      id: v.id, brandId: v.brandId, title: v.title, type: v.type || 'one-time', amount: month ? month.amt : v.amount,
      nextAmt: nm ? nm.amt : 0, payIn: nm ? onDay(nm.due) || Date.now() : 0,
      stage: v.done ? 3 : v.status === 'awaiting funding' ? 1 : 2, escrow: v.held, period: v.period, contract: v.contract,
      info: [...new Set(dl.map((y) => y.m))].join(' · ') + (v.period ? ' — ' + v.period : ''),
      items: x.bxEqItems(v.items.map((y) => ({ label: y.label })), v.items.reduce((s, y) => s + y.amt, 0) || v.amount),
      deliverables: dl, milestones: v.ms.map((m) => ({ label: m.label, d: m.d, amt: m.amt, st: m.st })),
      files: [{ n: 'deal contract ' + (v.contract || ''), s: 'PDF' }],
      nlog: (offer ? logOf(offer) : []).concat([{ v: offer ? offer.versions.length : 1, by: 'system', time: x.bxStamp(v.createdAt || Date.now()), changes: ['deal activated at ' + money(v.amount)] }]),
      bx: 1, bxs: v.status, bxDone: v.done, waitFund: v.waitFund, waitClear: v.waitClear, nextUp: v.nextUp, bxNote: v.note || '',
      cycles: v.cyc && v.cyc.length
        ? v.cyc.map((c) => ({
            label: c.label, range: c.range, status: c.status, items: c.items,
            pay: c.status === 'complete' ? '✓ cycle complete — ' + c.label.toLowerCase() + ' payout released'
              : c.st === 'in escrow' ? money(c.amt) + ' in escrow, released as each deliverable is approved'
                : c.st === 'pending' ? money(c.amt) + ' not funded yet' : money(c.amt) + ' clearing',
            resets: '',
          }))
        : undefined,
      live: 1,
    };
  }
  GIX.bxCreatorDeals = () => {
    const cid = myCreatorId();
    if (!M || !cid) return [];
    return [...M.deals.values()].filter((d) => d.creator_id === cid).sort((a, b) => at(b.created_at) - at(a.created_at)).map((d) => creatorView(dealView(d)));
  };
  GIX.bxMeAll = () => {
    const cid = myCreatorId();
    return M && cid ? [...M.deals.values()].filter((d) => d.creator_id === cid).map(dealView) : [];
  };

  // the creator's deliverable rows on a deal page: each row knows its own milestone
  GIX.bxCreatorItems = (e, h, icon, r, upload) => {
    const d = GIX.bxDealFor(e),
      x = X();
    if (!d) return [];
    const b = x.bxBrandOf(e.brandId);
    return d.items.map((it, i) => {
      const st =
        it.status === 'done' ? 'done'
          : it.status === 'review' ? 'review'
            : it.status === 'changes' ? 'changes'
              : i === d.nextUp ? 'next'
                : it.st === 'in escrow' ? 'funded'
                  : it.st === 'processing' || it.st === 'awaiting wire' ? 'clearing' : 'unfunded';
      const lab = { done: 'Released', review: 'In review', changes: 'Fix and re-upload', next: 'Ready to deliver', funded: 'Funded', clearing: 'Funding clears', unfunded: 'Not funded yet' }[st];
      const click = () =>
        st === 'next' || (st === 'changes' && it.st === 'in escrow')
          ? (GIX._target = it.id, upload())
          : r(
              st === 'done' ? it.label + ': approved, ' + money(it.amt) + ' released.'
                : st === 'review' ? it.label + ' is in review with ' + b.name + '.'
                  : st === 'unfunded' ? b.name + ' hasn’t funded ' + it.label + ' yet.'
                    : st === 'clearing' ? b.name + '’s payment for ' + it.label + ' is clearing.'
                      : st === 'changes' ? b.name + ' asked for changes on ' + it.label + '. Upload a new proof once its money is in escrow.'
                        : it.label + ' is funded. Deliver the earlier items first.',
            );
      return h(
        'button',
        { type: 'button', className: 'gi-v5-check-row', key: 'bx' + i, 'data-done': st === 'done', 'data-status': st, onClick: click, 'aria-label': it.label + ': ' + lab },
        h('span', { className: 'gi-v5-checkmark', 'aria-hidden': 'true' }, st === 'done' ? icon('check-badge') : null),
        h('span', { className: 'gi-v5-check-copy' }, h('span', { className: 'gi-v5-check-label' }, it.label), h('span', { className: 'gi-v5-check-meta' }, 'Due ' + it.due + ' · ' + money(it.amt))),
        h('small', { 'data-state': st === 'done' ? 'done' : st === 'next' || st === 'changes' ? 'next' : 'pending', className: 'gbx-cst is-' + st }, lab),
      );
    });
  };

  // offers on the creator seat: open ones, newest version first, in the creator inbox's card shape
  const cur = (o) => o.versions[o.versions.length - 1];
  function logOf(o) {
    const x = X(),
      vs = o.versions;
    return vs.map((v, i) => {
      const p = vs[i - 1];
      const ch = i === 0 ? v.items.map((y) => y.label + (y.days ? ', within ' + y.days + ' days' : '')) : [p && p.amt !== v.amt ? 'price: ' + money(p.amt) + ' → ' + money(v.amt) : 'terms confirmed'];
      return { v: v.v, by: v.by === 'creator' ? 'you' : 'sponsor', time: x.bxStamp(v.at), changes: ch };
    });
  }
  function eqOffer(o) {
    const x = X(),
      c = cur(o),
      f0 = o.versions[0],
      fn = o.versions.find((v) => v.note && v.by === 'you');
    return {
      id: o.id, brandId: o.bid, pkg: o.title, title: o.title, price: c.amt, orig: f0.amt, version: c.v,
      adjustments: Math.min(8, o.versions.length - 1), deadline: o.expiresAt, lastBy: c.by === 'creator' ? 'me' : 'sponsor',
      stage: Math.min(3, o.versions.length), start: x.bxDate(Date.now() + 2 * 864e5), note: fn ? 'sponsor notes: ' + fn.note : '',
      log: logOf(o), items: x.bxEqItems(c.items, c.amt), bx: 1, pitch: !!o.pitch, live: 1,
    };
  }
  GIX.bxCreatorOffers = () => {
    const x = X(),
      cid = myCreatorId();
    if (!M || !cid || !x) return [];
    const mine = new Set([...M.offers.values()].filter((o) => o.creator_id === cid).map((o) => o.id));
    return x.GBX.S.offers
      .filter((o) => mine.has(o.id) && (o.status === 'sent' || o.status === 'countered') && o.expiresAt > Date.now())
      .sort((a, b) => cur(b).at - cur(a).at)
      .map(eqOffer);
  };

  // ---------------------------------------------------------------------------------------------------------------
  // Conversations: one per brand and creator. bxLink lists what happened between them in the app's own row format;
  // the app's phrasing (bxBrandEv, bxCreatorEv) turns the rows into each seat's messages
  // ---------------------------------------------------------------------------------------------------------------
  GIX._pair = null; // the creator of the conversation being phrased (the signed-in creator unless set)
  const pending = []; // messages sent but not in a snapshot yet: { conv, brand, creator, side, body, at }

  GIX.bxLink = (bid) => {
    const out = [];
    const cid = GIX._pair || myCreatorId();
    if (!M || !cid) return out;
    const S = X().GBX.S;
    // offers: every version, its note, and how the offer closed
    for (const o of M.offers.values()) {
      if (o.brand_id !== bid || o.creator_id !== cid) continue;
      const rec = S.offers.find((x) => x.id === o.id);
      if (!rec) continue;
      const vs = rec.versions,
        last = vs.length - 1;
      vs.forEach((v, i) => {
        const by = v.by === 'creator' ? 'creator' : 'brand';
        out.push({
          k: 'ver', by, oid: o.id, title: o.title, v: v.v, amt: v.amt, last: i === last, tpl: false,
          vst: i < last ? 'countered' : o.status === 'sent' ? 'waiting' : o.status === 'countered' ? 'needs you' : o.status,
          note: v.items.map((y) => y.label).join(', '), at: v.at,
        });
        if (v.note) out.push({ k: 'note', by, t: v.note, at: v.at + 1 });
      });
      if (o.status === 'accepted' && o.accepted_at)
        out.push({ k: 'acc', by: o.accepted_by_side === 'brand' ? 'brand' : 'creator', title: o.title, amt: cur(rec).amt, at: at(o.accepted_at) + 2 });
      if (o.status === 'declined' && o.closed_at) out.push({ k: 'dec', by: o.closed_by_side === 'brand' ? 'brand' : 'creator', title: o.title, at: at(o.closed_at) + 2 });
      if (o.status === 'withdrawn' && o.closed_at) out.push({ k: 'wd', by: o.closed_by_side === 'creator' ? 'creator' : 'brand', title: o.title, at: at(o.closed_at) + 2 });
      if (o.status === 'expired') out.push({ k: 'exp', by: cur(rec).by === 'you' ? 'brand' : 'creator', title: o.title, at: rec.expiresAt + 2 });
    }
    // deals: funding (from the event log, which both sides see), renewals, ratings, proofs
    for (const d of M.deals.values()) {
      if (d.brand_id !== bid || d.creator_id !== cid) continue;
      (M.eventsByDeal.get(d.id) || []).forEach((e) => {
        const data = e.data || {};
        const n = +data.milestones || 1;
        const what = n > 1 ? n + ' milestones of ' + d.title : 'a milestone of ' + d.title;
        if (e.kind === 'payment_started')
          out.push({ k: 'fund', by: 'brand', amt: toD(e.amount_cents), st: data.method === 'wire' ? 'awaiting wire' : 'processing', at: at(e.at), deal: d.title, what });
        else if (e.kind === 'escrow_funded' && data.cleared) out.push({ k: 'clear', by: 'brand', at: at(e.at), deal: d.title, what });
        else if (e.kind === 'escrow_funded') out.push({ k: 'fund', by: 'brand', amt: toD(e.amount_cents), st: 'in escrow', at: at(e.at), deal: d.title, what });
      });
      (M.renewals.get(d.id) || []).forEach((r) => {
        const req = r.by_side === 'creator',
          base = { months: r.months, price: toD(r.price_cents), mo: d.type === 'monthly', deal: d.title };
        out.push({ k: 'ren', by: req ? 'creator' : 'brand', st: req ? 'requested' : 'sent', ...base, at: at(r.created_at) });
        if (r.status === 'accepted' || r.status === 'declined')
          out.push({ k: 'ren', by: req ? 'brand' : 'creator', st: r.status, ...base, at: at(r.answered_at) });
      });
      (M.ratings.get(d.id) || []).forEach((r) => out.push({ k: 'rate', by: r.by_side, avg: r.score, deal: d.title, at: at(r.created_at) }));
      (M.proofsByDeal.get(d.id) || []).forEach((p) => {
        const label = ((M.deliverables.get(d.id) || []).find((x) => x.id === p.deliverable_id) || {}).label;
        out.push({ k: 'proof', by: 'creator', item: label, at: at(p.submitted_at) });
        if (p.changes_at) out.push({ k: 'chg', by: 'brand', item: label, at: at(p.changes_at) });
        const rl = M.releases.get(p.id);
        if (rl) out.push({ k: 'rel', by: 'brand', item: label, amt: toD(rl.gross_cents), net: toD(rl.net_cents), at: at(rl.released_at) });
      });
    }
    // messages, saved and on their way
    const conv = M.convByPair.get(bid + '|' + cid);
    if (conv) (M.messages.get(conv.id) || []).forEach((m) => out.push({ k: 'msg', by: m.sender_side, t: m.body, at: at(m.created_at), seq: m.seq }));
    pending.filter((p) => p.brand === bid && p.creator === cid).forEach((p) => out.push({ k: 'msg', by: p.side, t: p.body, at: p.at }));
    return out.sort((a, b) => a.at - b.at);
  };

  const unreadFor = (conv, side) => {
    const r = M.reads.get(conv.id + '|' + side),
      upto = r ? +r.last_read_seq : 0;
    return (M.messages.get(conv.id) || []).filter((m) => m.sender_side !== side && +m.seq > upto).length;
  };

  // the creator inbox: one thread per brand ("bx:<brand id>"), most recent first
  GIX.bxCreatorThreads = () => {
    const cid = myCreatorId(),
      x = X();
    if (!M || !cid || !x) return [];
    const out = [];
    for (const c of M.convs.values()) {
      if (c.creator_id !== cid) continue;
      GIX._pair = cid;
      const msgs = x.bxCreatorEv(c.brand_id);
      GIX._pair = null;
      if (!msgs.length) continue;
      out.push({ id: 'bx:' + c.brand_id, who: c.brand_id, unread: unreadFor(c, 'creator'), msgs, bxLast: msgs.reduce((m, y) => Math.max(m, y.at || 0), 0), ord: -1, conv: c.id });
    }
    out.sort((a, b) => b.bxLast - a.bxLast);
    // the inbox always has a thread to open: with no brand conversations yet, a welcome from GameIn
    if (!out.length)
      out.push({
        id: 'gamein', who: 'gamein', unread: 0, ord: 0, bxLast: 0,
        msgs: [{ from: 'them', kind: 'sys', time: x.bxStamp(Date.now()), text: 'Welcome to GameIn. When a brand sends you an offer, or you pitch one, the conversation shows up here.' }],
      });
    return out;
  };
  const convOfThread = (tid) => {
    if (!M || !tid) return null;
    const bid = String(tid).indexOf('bx:') === 0 ? String(tid).slice(3) : null;
    return bid ? M.convByPair.get(bid + '|' + myCreatorId()) || null : null;
  };
  GIX.bxCreatorUnread = (tid) => {
    const c = convOfThread(tid);
    return c ? unreadFor(c, 'creator') : 0;
  };
  GIX.bxCreatorRead = (tid) => {
    const c = convOfThread(tid);
    if (!c || !unreadFor(c, 'creator')) return;
    live.act('mark_read', { p_conversation: c.id, p_as: 'creator', p_upto_seq: +c.last_message_seq || null }).catch(() => {});
  };
  GIX.bxCreatorSay = (tid, K, text) => {
    const bid = String(tid || '').indexOf('bx:') === 0 ? String(tid).slice(3) : null,
      cid = myCreatorId();
    if (!bid || !cid) return false;
    const body = String(text || '').trim();
    if (!body) return true;
    pending.push({ brand: bid, creator: cid, side: 'creator', body, at: Date.now() });
    X().GBX.note();
    run('send_message', { p_brand: bid, p_creator: cid, p_as: 'creator', p_body: body }, () => clearPending(bid, cid, body));
    return true;
  };
  const clearPending = (bid, cid, body) => {
    const i = pending.findIndex((p) => p.brand === bid && p.creator === cid && p.body === body);
    if (i >= 0) pending.splice(i, 1);
  };

  // the brand inbox: one thread per creator ("cv:<conversation id>")
  GIX.bxThreads = (bid) => {
    const x = X();
    if (!M || !x) return [];
    const S = x.GBX.S,
      out = [];
    for (const c of M.convs.values()) {
      if (c.brand_id !== bid) continue;
      const name = creatorName(c.creator_id);
      GIX._pair = c.creator_id;
      let msgs = x.bxBrandEv(bid, name);
      GIX._pair = null;
      const k = bid + ':cv:' + c.id;
      (S.msg[k] || []).forEach((m) => msgs.push(['you', m.t, m.at]));
      msgs = msgs.sort((a, b) => a[2] - b[2]);
      const lastOffer = [...M.offers.values()].filter((o) => o.brand_id === bid && o.creator_id === c.creator_id).sort((a, b) => at(b.created_at) - at(a.created_at))[0];
      out.push({
        id: 'cv:' + c.id, who: name, deal: lastOffer ? lastOffer.title : 'Conversation', base: 0, live: 0, msgs,
        last: msgs.length ? msgs[msgs.length - 1][2] : 0, unread: unreadFor(c, 'brand'), conv: c.id, creatorId: c.creator_id,
      });
    }
    return out.sort((a, b) => b.last - a.last);
  };

  // ---------------------------------------------------------------------------------------------------------------
  // Seats, counts, wallet
  // ---------------------------------------------------------------------------------------------------------------
  const lastBrandKey = 'gib-live-brand';
  // the brand seat to open: the last one used, else the one with the most waiting on it, then the most deals
  GIX.bxLastBrand = () => {
    const mine = myBrandIds();
    let b = null;
    try {
      b = localStorage.getItem(lastBrandKey);
    } catch (e) { /* storage blocked */ }
    if (mine.includes(b)) return b;
    const score = (id) =>
      M.todos.filter((t) => t.side === 'brand' && t.brand_id === id).length * 1000 + [...M.deals.values()].filter((d) => d.brand_id === id).length;
    return mine.slice().sort((x, y) => score(y) - score(x) || brandName(x).localeCompare(brandName(y)))[0] || null;
  };
  // remember the brand seat in use (the app keeps its own key for the demo's brand ids)
  const keepBrand = () => {
    const L = window.GameInLoop,
      b = L && L.S.brandId;
    if (b && myBrandIds().includes(b))
      try {
        localStorage.setItem(lastBrandKey, b);
      } catch (e) { /* storage blocked */ }
  };
  GIX.bxCurBrand = () => {
    const L = window.GameInLoop,
      mine = myBrandIds(),
      b = L && L.S.brandId;
    return mine.includes(b) ? b : GIX.bxLastBrand();
  };
  GIX.bxBrandList = (BR) => {
    const mine = new Set(myBrandIds());
    return (BR || []).filter((b) => mine.has(b.id));
  };
  GIX.bxBrandTodo = (bid) => (M ? M.todos.filter((t) => t.side === 'brand' && t.brand_id === bid).length : 0);

  // the creator wallet: what's available is releases less payouts; lifetime is everything earned
  GIX.walletNet = () => (M && M.wallet ? toD(M.wallet.available_cents) : 0);
  GIX.lifetimeBase = () => (M && M.wallet ? toD(M.wallet.earned_cents) - toD(M.wallet.available_cents) : 0);
  GIX.walletTx = () => {
    const x = X();
    if (!M || !x) return [];
    return (M.w.walletLines || [])
      .slice()
      .sort((a, b) => at(b.at) - at(a.at))
      .map((l) => {
        const d = dateLabel(at(l.at)),
          deal = l.deal_id && M.deals.get(l.deal_id),
          brand = deal ? brandName(deal.brand_id) : '';
        if (l.kind === 'release') return { d, type: 'escrow release', desc: brand + ' — ' + (l.deliverable || l.title), amt: toD(l.amount_cents), st: 'released', c: '#5CE5B0' };
        if (l.kind === 'fee') return { d, type: 'fee', desc: 'GameIn fee 5% — ' + brand + ' deal', amt: toD(l.amount_cents), st: 'fee', c: '#E6E8EB' };
        return { d, type: l.kind === 'instant_payout' ? 'instant payout' : 'payout', desc: 'To your bank', amt: toD(l.amount_cents), st: 'paid', c: '#E6E8EB' };
      });
  };
  GIX.bxMeTx = () => GIX.walletTx();
  GIX.bxAllRel = () => {
    const cid = myCreatorId();
    if (!M || !cid) return [];
    return (M.w.releases || [])
      .filter((r) => r.creator_id === cid)
      .map((r) => {
        const d = M.deals.get(r.deal_id) || {},
          p = (M.w.proofs || []).find((x) => x.id === r.proof_id) || {},
          dl = (M.deliverables.get(r.deal_id) || []).find((x) => x.id === p.deliverable_id) || {};
        return { id: r.proof_id, dealId: r.deal_id, value: toD(r.gross_cents), relAt: at(r.released_at), brand: brandName(d.brand_id), item: dl.label, fee: toD(r.fee_cents), net: toD(r.net_cents) };
      });
  };
  GIX.bxNetOfId = (id) => {
    const r = M && M.releases.get(id);
    return r ? toD(r.net_cents) : null;
  };

  // a proof's evidence on the brand's proof card: the creator's link and file (files open through a link that works
  // for an hour; only the deal's two parties can get one)
  GIX.proofEvidence = (p, H) => {
    const rows = [];
    if (p.link)
      rows.push(H('li', { key: 'l' }, H('a', { href: p.link, target: '_blank', rel: 'noopener noreferrer', className: 'gib-link' }, 'open the link: ' + String(p.link).replace(/^https?:\/\//, '').slice(0, 60))));
    if (p.file)
      rows.push(
        H('li', { key: 'f' }, H('a', {
          href: '#', className: 'gib-link',
          onClick: (e) => {
            e.preventDefault();
            const w = window.open('', '_blank');
            live.proofFileUrl(p.file).then((u) => { if (w) w.location = u; else window.open(u, '_blank', 'noopener'); }).catch((x) => { if (w) w.close(); notify(x.message); });
          },
        }, 'open the file: ' + String(p.file).split('/').pop().replace(/^[a-z0-9]+-/, ''))),
      );
    if (p.note) rows.push(H('li', { key: 'n' }, '“' + p.note + '”'));
    if (!rows.length) rows.push(H('li', { key: 'x' }, 'no evidence attached'));
    return H('ul', { className: 'gbw-checks', 'aria-label': 'Proof' }, rows);
  };

  // ---------------------------------------------------------------------------------------------------------------
  // Moves: offers
  // ---------------------------------------------------------------------------------------------------------------
  const findOffer = (o0) => X().GBX.S.offers.find((x) => x.id === (o0 && (o0.id || o0)));
  const items = (L) => (L || []).map((x) => ({ label: String(x.label || '').trim().slice(0, 120), days: Math.max(1, Math.min(365, +x.days || 7)) }));

  GIX.bxSendOffer = (x) => {
    x = x || {};
    const cid = isUuid(x.creatorId) ? x.creatorId : creatorIdByName(x.creator);
    if (!(toC(x.amt) > 0) || !(x.items && x.items.length) || !cid || !x.bid) return null;
    const now = Date.now();
    const o = {
      id: 'pending-' + now, bid: x.bid, creator: x.creator, title: String(x.title || 'Sponsorship').toUpperCase(), status: 'sent',
      expiresAt: now + 24 * 36e5, cid: null, msgs: [], live: 1,
      versions: [{ v: 1, by: 'you', amt: toD(toC(x.amt)), items: items(x.items), note: x.note || '', at: now }],
    };
    X().GBX.S.offers.unshift(o);
    X().GBX.note();
    run('send_offer', {
      p_brand: x.bid, p_creator: cid, p_title: o.title.slice(0, 120), p_amount_cents: toC(x.amt), p_items: items(x.items),
      p_note: x.note || '', p_campaign: isUuid(x.cid) ? x.cid : null,
    });
    return o;
  };
  GIX.bxReply = (o0, kind, NT) => {
    const o = findOffer(o0);
    say(NT)((o ? o.creator : 'The creator') + ' answers from their own account in the live app.');
    return false;
  };
  function offerMove(o0, NT, check, fn, args, optimistic, msg) {
    const o = findOffer(o0);
    if (!o) return false;
    const why = check(o);
    if (why) {
      say(NT)(why);
      return false;
    }
    if (optimistic) {
      optimistic(o);
      X().GBX.note();
    }
    run(fn, args(o), () => msg && say(NT)(typeof msg === 'function' ? msg(o) : msg));
    return true;
  }
  const isOpen = (o) => (o.status === 'sent' || o.status === 'countered') && o.expiresAt > Date.now();
  GIX.bxAcceptCounter = (o0, NT) =>
    offerMove(
      o0, NT,
      (o) => (!isOpen(o) ? 'This offer is no longer open' : cur(o).by !== 'creator' ? 'Waiting on ' + o.creator + '. You can’t accept your own offer.' : ''),
      'accept_offer', (o) => ({ p_offer: o.id, p_as: 'brand' }),
      (o) => { o.status = 'accepted'; o.acceptedAt = Date.now(); o.acceptedBy = 'you'; },
      (o) => 'Accepted. ' + o.title + ' is in deals, waiting for escrow.',
    );
  GIX.bxCounter = (o0, amt, note, NT) =>
    offerMove(
      o0, NT,
      (o) => (!isOpen(o) ? 'This offer is no longer open'
        : cur(o).by !== 'creator' ? 'Waiting on ' + o.creator + ' to reply to your last version'
          : o.versions.length - 1 >= 8 ? 'Adjustment limit reached (8 of 8). Accept or decline instead.'
            : !(toC(amt) > 0) ? 'Enter an amount above $0' : ''),
      'counter_offer', (o) => ({ p_offer: o.id, p_as: 'brand', p_amount_cents: toC(amt), p_note: note || '', p_items: null }),
      (o) => { o.versions.push({ v: cur(o).v + 1, by: 'you', amt: toD(toC(amt)), items: cur(o).items, note: note || '', at: Date.now() }); o.status = 'sent'; o.expiresAt = Date.now() + 24 * 36e5; },
      (o) => 'Counter-offer v' + o.versions.length + ' sent: ' + money(toD(toC(amt))),
    );
  GIX.bxCloseOffer = (o0, st, NT) =>
    offerMove(
      o0, NT,
      (o) => (!isOpen(o) ? 'This offer is no longer open'
        : st === 'withdrawn' && cur(o).by !== 'you' ? o.creator + ' already replied. Decline their version instead.'
          : st === 'declined' && cur(o).by !== 'creator' ? 'It’s waiting on ' + o.creator + '. Withdraw it instead.' : ''),
      st === 'withdrawn' ? 'withdraw_offer' : 'decline_offer',
      (o) => (st === 'withdrawn' ? { p_offer: o.id, p_as: 'brand' } : { p_offer: o.id, p_as: 'brand', p_reason: '' }),
      (o) => { o.status = st; o.closedAt = Date.now(); if (st === 'declined') o.declinedBy = 'you'; },
      st === 'withdrawn' ? 'Offer withdrawn' : 'Declined',
    );
  GIX.bxCreatorAct = (id, kind, val, ctx) => {
    const o = findOffer(id),
      NT = ctx && ctx.notify;
    if (!o) return false;
    const b = X().bxBrandOf(o.bid);
    if (!isOpen(o)) {
      say(NT)('This offer is no longer open');
      return true;
    }
    const mine = cur(o).by === 'creator';
    if (mine && kind !== 'decline') {
      say(NT)('Waiting on ' + b.name + ' to reply to your last version');
      return true;
    }
    if (kind === 'accept') {
      o.status = 'accepted';
      o.acceptedBy = 'creator';
      o.acceptedAt = Date.now();
      X().GBX.note();
      run('accept_offer', { p_offer: o.id, p_as: 'creator' }, () => {
        say(NT)('Deal accepted. ' + b.name + ' funds escrow next, then you can start.');
        if (ctx && ctx.feed) ctx.feed(o, b);
      });
      return true;
    }
    if (kind === 'decline') {
      o.status = mine ? 'withdrawn' : 'declined';
      o.closedAt = Date.now();
      X().GBX.note();
      run(mine ? 'withdraw_offer' : 'decline_offer', mine ? { p_offer: o.id, p_as: 'creator' } : { p_offer: o.id, p_as: 'creator', p_reason: '' }, () =>
        say(NT)(mine ? 'Your version is withdrawn. ' + b.name + ' can send a new offer.' : 'Offer declined. ' + b.name + ' can send a new one.'),
      );
      return true;
    }
    if (kind === 'counter') {
      if (o.versions.length - 1 >= 8) {
        say(NT)('Adjustment limit reached (8 of 8)');
        return true;
      }
      const a = Math.max(0.01, toD(toC(val || cur(o).amt)));
      o.versions.push({ v: cur(o).v + 1, by: 'creator', amt: a, items: cur(o).items, note: '', at: Date.now() });
      o.status = 'countered';
      X().GBX.note();
      run('counter_offer', { p_offer: o.id, p_as: 'creator', p_amount_cents: toC(a), p_note: '', p_items: null }, () =>
        say(NT)('Counter-offer sent: ' + money(a) + '. ' + b.name + ' has 24 hours to reply.'),
      );
      return true;
    }
    return false;
  };
  GIX.bxPitch = (x) => {
    x = x || {};
    const cid = myCreatorId();
    if (!cid) {
      notify('Create your creator profile first');
      return null;
    }
    const p0 = x.pkg || {},
      it0 = x.items || X().bxPkgItems(p0),
      amt = toC(x.amt || p0.price);
    if (!(amt > 0) || !it0 || !it0.length || !x.bid) return null;
    const now = Date.now(),
      title = String(x.title || p0.title || 'Sponsorship').replace(/\s+—\s+/g, ', ').toUpperCase();
    const o = {
      id: 'pending-' + now, bid: x.bid, creator: (meEntity || {}).name, title, status: 'countered', expiresAt: now + 72 * 36e5,
      cid: null, msgs: [], pitch: 1, again: x.again || null, live: 1,
      versions: [{ v: 1, by: 'creator', amt: toD(amt), items: items(it0), note: x.note || '', at: now }],
    };
    X().GBX.S.offers.unshift(o);
    X().GBX.note();
    if (x.again && isUuid(x.again)) run('book_again', { p_deal: x.again, p_note: x.note || 'Same package again? Happy to run it back.' });
    else
      run('pitch_offer', {
        p_creator: cid, p_brand: x.bid, p_package: isUuid(p0.id) ? p0.id : null, p_title: title.slice(0, 120), p_amount_cents: amt,
        p_items: items(it0), p_note: x.note || '',
      });
    return o;
  };

  // ---------------------------------------------------------------------------------------------------------------
  // Moves: escrow
  // ---------------------------------------------------------------------------------------------------------------
  GIX.bxFundNow = (dealId, idxs, sel) => {
    const d = GIX.bxDealNow(dealId);
    if (!d || !sel) return null;
    const want = new Set(idxs || []),
      list = d.ms.filter((m) => m.st === 'pending' && want.has(m.i));
    if (!list.length) return null;
    const x = X(),
      amt = toD(list.reduce((s, m) => s + toC(m.amt), 0)),
      fee = x.bxFeeStep(d.tot - d.open, amt),
      st = sel.kind === 'card' ? 'in escrow' : sel.kind === 'bank' ? 'processing' : 'awaiting wire',
      method = x.bxPmLabel(sel),
      k = sel.kind === 'card' ? 'card' : sel.kind === 'bank' ? 'bank' : 'wire';
    const res = { st, total: toD(toC(amt) + toC(fee)), amt, fee, method, ref: 'shown in Payments' };
    run('fund_milestones', { p_deal: dealId, p_method: k, p_scope: 'next', p_milestones: list.map((m) => m.id), p_method_label: method }, (payId) => {
      const p = M && M.payments.get(payId);
      if (p && k === 'wire') notify('Wire reference ' + p.reference + '. Quote it on the transfer.');
    });
    return res;
  };
  GIX.bxClearNow = (dealId, i) => {
    const d = GIX.bxDealNow(dealId),
      m = d && d.ms[i];
    if (!m || !m.pid || (m.st !== 'processing' && m.st !== 'awaiting wire')) return false;
    run('simulate_payment', { p_payment: m.pid, p_outcome: 'cleared' });
    return true;
  };

  // ---------------------------------------------------------------------------------------------------------------
  // Moves: proof and release
  // ---------------------------------------------------------------------------------------------------------------
  GIX.bxUpload = (d0, NT) => {
    const d = d0 && GIX.bxDealNow(d0.id);
    say(NT)(d ? (d.cr && d.cr.name ? d.cr.name : 'The creator') + ' uploads proof from their own account in the live app.' : 'This deal could not be found');
    return null;
  };
  // the creator delivers: the deliverable that's next (or the one tapped), with a link or a file
  function deliver(e, r) {
    const d = GIX.bxDealFor(e),
      b = X().bxBrandOf(e.brandId);
    if (!d) return r('This deal could not be found');
    const it = d.items.find((y) => y.id === GIX._target && y.st === 'in escrow' && y.status !== 'done' && y.status !== 'review') || d.items[d.nextUp];
    GIX._target = null;
    if (!it) {
      const why = d.done ? 'Every deliverable is approved and paid.'
        : d.items.some((y) => y.status === 'review') ? 'Your proof is in review with ' + b.name + '. You can upload the next one when it’s funded.'
          : d.waitClear ? b.name + '’s payment is still clearing. You can start once it’s in escrow.'
            : d.waitFund ? b.name + ' hasn’t funded escrow for the next deliverable yet. You can start once it’s funded.'
              : 'Nothing to upload right now.';
      return r(why);
    }
    proofSheet(it.label, (ev) => {
      live.submitProof(d.id, it.id, ev)
        .then(() => {
          r('Proof sent for ' + it.label + '. ' + b.name + ' reviews it next.');
        })
        .catch((err) => {
          r(err.message || 'The upload didn’t go through');
          live.load().catch(() => {});
        });
    });
  }
  GIX.bxTryUpload = (e, r) => deliver(e, r);
  GIX.bxUploadC = (e, r) => deliver(e, r);

  const timers = new Map();
  function finishAt(id, releaseAt) {
    clearTimeout(timers.get(id));
    timers.set(id, setTimeout(() => {
      timers.delete(id);
      live.act('finalize_release', { p_proof: id }).catch(() => live.load().catch(() => {}));
    }, Math.max(0, releaseAt - Date.now()) + 400));
  }
  GIX.bxRelease = (p0, NT) => {
    const S = X().GBX.S,
      p = S.proofs.find((x) => x.id === (p0 && p0.id));
    if (!p || p.status !== 'review') {
      say(NT)(p && p.status === 'released' ? 'Already released' : p && p.status === 'releasing' ? 'Already releasing' : 'This proof isn’t waiting for approval');
      return false;
    }
    p.status = 'releasing';
    p.releaseAt = Date.now() + 6e3;
    X().GBX.note();
    run('approve_proof', { p_proof: p.id, p_undo_seconds: 6 }, (until) => {
      finishAt(p.id, at(until) || Date.now() + 6e3);
      say(NT)('Approved. ' + money(p.value) + ' releases to ' + p.creator + ' in a few seconds, unless you undo.');
    });
    return true;
  };
  GIX.bxUndoRelease = (p0) => {
    const S = X().GBX.S,
      p = S.proofs.find((x) => x.id === (p0 && p0.id));
    if (!p || p.status !== 'releasing') return false;
    clearTimeout(timers.get(p.id));
    p.status = 'review';
    delete p.releaseAt;
    X().GBX.note();
    run('undo_approval', { p_proof: p.id });
    return true;
  };
  GIX.bxChanges = (p0, NT) => {
    const S = X().GBX.S,
      p = S.proofs.find((x) => x.id === (p0 && p0.id));
    if (!p || p.status !== 'review') {
      say(NT)('This proof isn’t waiting for approval');
      return false;
    }
    p.status = 'changes';
    p.chAt = Date.now();
    X().GBX.note();
    run('request_changes', { p_proof: p.id, p_note: '' }, () => say(NT)('Change request sent to ' + p.creator));
    return true;
  };

  // ---------------------------------------------------------------------------------------------------------------
  // Moves: renewals
  // ---------------------------------------------------------------------------------------------------------------
  GIX.bxRenAct = (id, kind, x) => {
    x = x || {};
    const d = M && M.deals.get(id);
    if (!d) return 'This deal could not be found';
    const S = X().GBX.S,
      curR = S.ren[id],
      months = Math.max(1, Math.min(24, Math.round(+x.months || 1))),
      price = toC(x.price);
    if (kind === 'offer') {
      if (curR && (curR.st === 'sent' || curR.st === 'requested')) return 'A renewal is already open on this deal';
      if (!(price > 0)) return 'Enter a price above $0';
      if (d.type !== 'monthly' && months !== 1) return 'Renewing this deal adds one more period: choose 1 month';
      run('offer_renewal', { p_deal: id, p_months: months, p_price_cents: price, p_auto_renew: !!x.auto });
    } else if (kind === 'request') {
      if (curR && curR.st === 'sent') return (x.brand || 'The brand') + ' already offered a renewal. Accept or decline it on this deal.';
      if (curR && curR.st === 'requested') return 'Renewal request already sent to ' + (x.brand || 'the brand');
      if (!(price > 0)) return 'Enter a price above $0';
      run('request_renewal', { p_deal: id, p_months: d.type === 'monthly' ? months : 1, p_price_cents: price });
    } else if (kind === 'answer') {
      const want = x.by === 'creator' ? 'sent' : 'requested';
      if (!curR || curR.st !== want) return x.by === 'creator' ? 'This renewal offer was already answered' : 'This renewal request was already answered';
      if (x.st !== 'accepted' && x.st !== 'declined') return 'Accept or decline';
      run('answer_renewal', { p_renewal: curR.id, p_as: x.by === 'creator' ? 'creator' : 'brand', p_accept: x.st === 'accepted' });
    } else if (kind === 'withdraw') {
      if (!curR || (curR.st !== 'sent' && curR.st !== 'requested')) return 'The renewal was already answered';
      run('withdraw_renewal', { p_renewal: curR.id, p_as: curR.by === 'creator' ? 'creator' : 'brand' });
    } else return 'Unknown renewal move';
    return '';
  };
  GIX.bxCreatorRenew = (e, r) => {
    const d = M && M.deals.get(e.id),
      b = X().bxBrandOf(e.brandId);
    if (!d) return r('This deal could not be found');
    if (d.status === 'completed') {
      run('book_again', { p_deal: d.id, p_note: 'Same package again? Happy to run it back.' }, () => r('Sent ' + b.name + ' the same package again.'));
      return;
    }
    const ms = M.milestones.get(d.id) || [];
    const lastMonth = ms.filter((m) => m.period_id).pop();
    const w = GIX.bxRenAct(d.id, 'request', {
      brand: b.name, months: d.type === 'monthly' ? 3 : 1, price: toD(d.type === 'monthly' && lastMonth ? lastMonth.amount_cents : d.amount_cents),
    });
    r(w || 'Renewal request sent to ' + b.name);
  };

  // ---------------------------------------------------------------------------------------------------------------
  // What the screens changed in the store themselves (messages typed in the brand inbox, threads opened, ratings):
  // sent to the database when they emit
  // ---------------------------------------------------------------------------------------------------------------
  GIX.onEmit = () => {
    const x = X();
    if (!x || !M || !shadowObj) return;
    const S = x.GBX.S;
    // brand messages: S.msg["<brand>:cv:<conversation>"]
    Object.keys(S.msg || {}).forEach((k) => {
      const was = (shadowObj.msg[k] || []).length,
        now = S.msg[k] || [];
      if (now.length <= was) return;
      const m = /^([0-9a-f-]{36}):cv:([0-9a-f-]{36})$/.exec(k),
        c = m && M.convs.get(m[2]);
      if (!c) return;
      now.slice(was).forEach((msg) => {
        const body = typeof msg === 'string' ? msg : msg.t;
        if (body && body.trim()) live.act('send_message', { p_brand: c.brand_id, p_creator: c.creator_id, p_as: 'brand', p_body: body.trim() }).catch((e) => notify(e.message));
      });
    });
    // a brand opened a thread: mark it read up to the last message on screen
    Object.keys(S.readAt || {}).forEach((k) => {
      const m = /^([0-9a-f-]{36}):cv:([0-9a-f-]{36})$/.exec(k);
      if (!m || (S.readAt[k] || 0) <= (shadowObj.readAt[k] || 0)) return;
      const c = M.convs.get(m[2]);
      if (c && unreadFor(c, 'brand')) live.act('mark_read', { p_conversation: c.id, p_as: 'brand', p_upto_seq: +c.last_message_seq || null }).catch(() => {});
    });
    // ratings (the database keeps one score from 1 to 5 and the comment)
    [['rate', 'brand'], ['crate', 'creator']].forEach(([key, side]) => {
      Object.keys(S[key] || {}).forEach((k) => {
        if (shadowObj[key][k] || k.indexOf('deal:') !== 0) return;
        const r = S[key][k],
          dealId = k.slice(5);
        if (!isUuid(dealId)) return;
        const score = Math.max(1, Math.min(5, Math.round(+r.avg || (r.v || []).reduce((a, b) => a + b, 0) / Math.max(1, (r.v || []).length) || 5)));
        live.act('rate_deal', { p_deal: dealId, p_as: side, p_score: score, p_comment: r.txt || '' }).catch((e) => {
          notify(e.message);
          live.load().catch(() => {});
        });
      });
    });
    shadowObj = JSON.parse(JSON.stringify({ msg: S.msg, cmsg: S.cmsg, rate: S.rate, crate: S.crate, readAt: S.readAt }));
  };

  // ---------------------------------------------------------------------------------------------------------------
  // Proof sheet: a link, a file, or both
  // ---------------------------------------------------------------------------------------------------------------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // HTML from the app's own messages, with names and titles in it that other people typed: only plain formatting
  // survives (bold, italics, line breaks, without attributes). Any other tag becomes its text, so an image, a link or
  // a script can't come in through someone's name.
  const PLAIN = new Set(['B', 'STRONG', 'EM', 'I', 'U', 'SMALL', 'BR']);
  function plainHtml(html) {
    const t = document.createElement('template'); // parsed inert: nothing loads or runs
    t.innerHTML = String(html == null ? '' : html);
    const clean = (node) =>
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) return;
        if (n.nodeType !== 1 || !PLAIN.has(n.tagName)) return n.replaceWith(document.createTextNode(n.nodeType === 1 ? n.textContent : ''));
        [...n.attributes].forEach((a) => n.removeAttribute(a.name));
        clean(n);
      });
    clean(t.content);
    return t.innerHTML;
  }
  GIX.plainHtml = plainHtml;
  function sheet(html, onClick, label) {
    const ov = document.createElement('div');
    ov.className = 'gob gsi gil';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', label);
    ov.innerHTML = '<div class="gob__card"><div class="gob__top"><span class="gob__glint">' + (G().glintHello || '') + '</span><p class="gob__say" aria-live="polite"></p><button type="button" class="gob__x" aria-label="Close">×</button></div><div class="gob__body">' + html + '</div></div>';
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.addEventListener('click', (e) => {
      if (e.target === ov || e.target.closest('.gob__x')) return close();
      onClick(e, close, ov);
    });
    ov.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
    setTimeout(() => {
      const i = ov.querySelector('input');
      i && i.focus();
    }, 40);
    return ov;
  }
  function proofSheet(label, done) {
    sheet(
      '<h2>Proof for ' + esc(label) + '</h2><p class="gob__p">Add the link to the post or stream, a file (a screenshot or the video), or both. The brand reviews it and approving releases the money.</p>' +
        '<label class="gob__f"><span>link</span><input data-f="link" type="url" placeholder="https://"></label>' +
        '<label class="gob__f"><span>file (optional)</span><input data-f="file" type="file" accept="image/*,video/*,application/pdf"></label>' +
        '<p class="gsi-err" role="alert"></p><button type="button" class="gib-btn is-primary gsi-go" data-k="send">send proof</button>',
      (e, close, ov) => {
        if (!e.target.closest('[data-k="send"]')) return;
        const link = ov.querySelector('[data-f="link"]').value.trim(),
          file = ov.querySelector('[data-f="file"]').files[0] || null,
          err = ov.querySelector('.gsi-err');
        if (!link && !file) return (err.textContent = 'Add a link or a file.');
        if (link && !/^https?:\/\/\S+$/i.test(link)) return (err.textContent = 'Links start with http:// or https://');
        if (file && file.size > 50 * 1024 * 1024) return (err.textContent = 'Files can be up to 50 MB.');
        e.target.disabled = true;
        e.target.textContent = 'sending…';
        close();
        done({ link: link || null, file });
      },
      'Send proof',
    );
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Sign in, sign up, sign out
  // ---------------------------------------------------------------------------------------------------------------
  const EM = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const here = () => location.origin + location.pathname + '?live';
  let wantSide = null; // where to land after signing in: 'brand' opens the brand workspace
  let entered = false;

  function signInSheet(role) {
    const st = { role: role || 'creator', view: 'signin' };
    const html = () =>
      st.view === 'forgot'
        ? '<h2>Reset your password</h2><p class="gob__p">Enter the email you signed up with. We’ll send a link to set a new password.</p>' +
          '<label class="gob__f"><span>email</span><input data-f="email" type="email" autocomplete="email" placeholder="you@example.com"></label>' +
          '<p class="gsi-err" role="alert"></p><button type="button" class="gib-btn is-primary gsi-go" data-k="send">send reset link</button>' +
          '<p class="gsi-foot"><button type="button" class="gib-link" data-k="back">back to sign in</button></p>'
        : '<h2>Sign in</h2><div class="gsi-seg" role="radiogroup" aria-label="Account type">' +
          ['creator', 'brand'].map((k) => '<button type="button" role="radio" data-role="' + k + '" aria-checked="' + (st.role === k) + '">' + k + '</button>').join('') +
          '</div><label class="gob__f"><span>' + (st.role === 'brand' ? 'work email' : 'email') + '</span><input data-f="email" type="email" autocomplete="email" placeholder="' + (st.role === 'brand' ? 'you@company.com' : 'you@example.com') + '"></label>' +
          '<label class="gob__f"><span>password</span><span class="gob__pw"><input data-f="pw" type="password" autocomplete="current-password" placeholder="your password"><button type="button" class="gob__eye" data-k="eye" aria-pressed="false">show</button></span></label>' +
          '<div class="gsi-row"><span></span><button type="button" class="gib-link" data-k="forgot">forgot password?</button></div>' +
          '<p class="gsi-err" role="alert"></p><button type="button" class="gib-btn is-primary gsi-go" data-k="go">sign in</button>' +
          '<p class="gsi-foot">New to GameIn? <button type="button" class="gib-link" data-k="new">create a ' + st.role + ' account</button></p>';
    const ov = sheet(html(), (e, close, ov) => {
      const t = e.target,
        err = ov.querySelector('.gsi-err');
      const r = t.closest('[data-role]');
      if (r) {
        st.role = r.dataset.role;
        return redraw();
      }
      const k = t.closest('[data-k]');
      if (!k) return;
      const a = k.dataset.k;
      if (a === 'eye') {
        const i = ov.querySelector('[data-f="pw"]'),
          on = i.type === 'password';
        i.type = on ? 'text' : 'password';
        k.textContent = on ? 'hide' : 'show';
        return;
      }
      if (a === 'forgot') {
        st.view = 'forgot';
        return redraw();
      }
      if (a === 'back') {
        st.view = 'signin';
        return redraw();
      }
      if (a === 'new') {
        close();
        return signUpSheet(st.role);
      }
      const email = (ov.querySelector('[data-f="email"]') || {}).value.trim();
      if (!EM.test(email)) return (err.textContent = 'Enter a valid email address.');
      if (a === 'send') {
        k.disabled = true;
        live.resetPassword(email, here())
          .then(() => {
            err.textContent = '';
            ov.querySelector('.gob__body').innerHTML = '<h2>Check your inbox</h2><p class="gob__p">If an account exists for <b>' + esc(email) + '</b>, a reset link is on its way.</p>';
          })
          .catch((x) => {
            k.disabled = false;
            err.textContent = x.message;
          });
        return;
      }
      if (a === 'go') {
        const pw = ov.querySelector('[data-f="pw"]').value;
        if (pw.length < 6) return (err.textContent = 'Enter your password.');
        k.disabled = true;
        k.textContent = 'signing in…';
        try {
          localStorage.setItem('gib-signin-role', st.role);
        } catch (x) { /* storage blocked */ }
        wantSide = st.role;
        live.signIn(email, pw)
          .then(() => {
            k.textContent = 'opening GameIn…';
            return start();
          })
          .then((ok) => {
            close();
            if (ok === false) loadFailedSheet();
          })
          .catch((x) => {
            k.disabled = false;
            k.textContent = 'sign in';
            err.textContent = /invalid/i.test(x.message) ? 'That email and password don’t match.' : x.message;
          });
      }
    }, 'Sign in to GameIn');
    const redraw = () => {
      ov.querySelector('.gob__body').innerHTML = html();
      ov.querySelector('.gob__say').textContent = st.view === 'forgot' ? 'No problem. I’ll send you a link to set a new password.' : 'Welcome back. Sign in and pick up where you left off.';
      const i = ov.querySelector('input');
      i && i.focus();
    };
    ov.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches('input')) {
        e.preventDefault();
        const b = ov.querySelector('.gsi-go');
        b && b.click();
      }
    });
    redraw();
  }

  function signUpSheet(role) {
    const st = { role: role === 'brand' ? 'brand' : 'creator' };
    const html = () =>
      '<h2>Create your account</h2><div class="gsi-seg" role="radiogroup" aria-label="Account type">' +
      ['creator', 'brand'].map((k) => '<button type="button" role="radio" data-role="' + k + '" aria-checked="' + (st.role === k) + '">' + (k === 'creator' ? 'I’m a creator' : 'I’m a brand') + '</button>').join('') +
      '</div><label class="gob__f"><span>' + (st.role === 'brand' ? 'company name' : 'creator name') + '</span><input data-f="name" type="text" maxlength="80" placeholder="' + (st.role === 'brand' ? 'e.g. Voltedge' : 'e.g. NovaPlays') + '"></label>' +
      '<label class="gob__f"><span>' + (st.role === 'brand' ? 'work email' : 'email') + '</span><input data-f="email" type="email" autocomplete="email" placeholder="you@example.com"></label>' +
      '<label class="gob__f"><span>password</span><input data-f="pw" type="password" autocomplete="new-password" placeholder="at least 8 characters"></label>' +
      '<label class="gob__ck"><input type="checkbox" data-f="terms"><span>I agree to the GameIn <b>Terms</b> and <b>Privacy Policy</b>' + (st.role === 'brand' ? ', including the <b>Brand Agreement</b> on escrow, fees and refunds' : '') + '</span></label>' +
      '<p class="gsi-err" role="alert"></p><button type="button" class="gib-btn is-primary gsi-go" data-k="go">create account</button>' +
      '<p class="gsi-foot">Already have an account? <button type="button" class="gib-link" data-k="signin">sign in</button></p>';
    const ov = sheet(html(), (e, close, ov) => {
      const t = e.target,
        err = ov.querySelector('.gsi-err');
      const r = t.closest('[data-role]');
      if (r) {
        st.role = r.dataset.role;
        ov.querySelector('.gob__body').innerHTML = html();
        return;
      }
      const k = t.closest('[data-k]');
      if (!k) return;
      if (k.dataset.k === 'signin') {
        close();
        return signInSheet(st.role);
      }
      const f = (n) => ov.querySelector('[data-f="' + n + '"]');
      const name = f('name').value.trim(),
        email = f('email').value.trim(),
        pw = f('pw').value;
      if (name.length < 2) return (err.textContent = st.role === 'brand' ? 'Enter your company name.' : 'Enter your creator name.');
      if (!EM.test(email)) return (err.textContent = 'Enter a valid email address.');
      if (pw.length < 8) return (err.textContent = 'Passwords are at least 8 characters.');
      if (!f('terms').checked) return (err.textContent = 'Agree to the terms to continue.');
      const handle = name.replace(/[^A-Za-z0-9_.-]+/g, '').slice(0, 32) || 'creator' + Date.now().toString(36);
      k.disabled = true;
      k.textContent = 'creating…';
      wantSide = st.role;
      live.signUp({ email, password: pw, name, side: st.role, handle, brandName: name, redirectTo: here() })
        .then((res) => {
          if (res.confirm) {
            ov.querySelector('.gob__body').innerHTML = '<h2>Confirm your email</h2><p class="gob__p">We sent a link to <b>' + esc(email) + '</b>. Open it on this device to finish setting up your account.</p>';
            return;
          }
          k.textContent = 'opening GameIn…';
          return start().then((ok) => {
            close();
            if (ok === false) loadFailedSheet();
          });
        })
        .catch((x) => {
          k.disabled = false;
          k.textContent = 'create account';
          err.textContent = x.message;
        });
    }, 'Create your GameIn account');
  }

  function newPasswordSheet() {
    sheet(
      '<h2>Set a new password</h2><label class="gob__f"><span>new password</span><input data-f="pw" type="password" autocomplete="new-password" placeholder="at least 8 characters"></label><p class="gsi-err" role="alert"></p><button type="button" class="gib-btn is-primary gsi-go" data-k="go">save password</button>',
      (e, close, ov) => {
        if (!e.target.closest('[data-k="go"]')) return;
        const pw = ov.querySelector('[data-f="pw"]').value,
          err = ov.querySelector('.gsi-err');
        if (pw.length < 8) return (err.textContent = 'Passwords are at least 8 characters.');
        live.setPassword(pw).then(() => {
          close();
          notify('Password saved');
          open();
        }).catch((x) => (err.textContent = x.message));
      },
      'Set a new password',
    );
  }

  // into the app: the website's "explore" button opens it; then the brand workspace for brand accounts
  function enter() {
    if (!M) return;
    const A = app(),
      inApp = !!document.querySelector('#gamein-root .gamein-sidebar-shell');
    const toBrand = (wantSide === 'brand' && M.brandSeats.length) || (!M.creatorSeat && M.brandSeats.length);
    const go = () => {
      const a = app();
      if (!a || !a.go) return;
      if (toBrand) {
        const L = window.GameInLoop,
          b = GIX.bxCurBrand();
        if (L && b) L.setBrand(b);
        a.go('brandHQ');
      } else if (!inApp) a.go('dashboard');
    };
    if (!inApp || !(A && A.loggedIn)) {
      entering = true;
      const d = document.querySelector('#gi-market-site [data-gi-action="demo"]');
      if (d) d.click();
      else if (A && A.login) A.login();
      entering = false;
      let n = 0;
      const t = setInterval(() => {
        if (document.querySelector('#gamein-root .gamein-sidebar-shell') || ++n > 80) {
          clearInterval(t);
          setTimeout(go, 200);
        }
      }, 100);
    } else go();
    entered = true;
  }
  let entering = false;

  // signed in: finish a new account's setup, load what it may see, follow the database, open the app. Says whether
  // the account loaded (the client already tries a failed read three more times, over about seven seconds)
  async function start() {
    const u = await live.user().catch(() => null);
    if (!u) return null;
    await live.finishSetup(u).catch((e) => notify(e.message));
    try {
      await live.load();
    } catch (e) {
      console.error('GameIn live load', e);
      return false;
    }
    live.watch();
    enter();
    return true;
  }
  // start(), and if the account didn't load, say so and offer to try again (signed in either way)
  const open = () => start().then((ok) => ok === false && loadFailedSheet());
  function loadFailedSheet() {
    sheet(
      '<h2>GameIn didn’t load</h2><p class="gob__p">You’re signed in, but your account didn’t load. Check your connection, then try again.</p>' +
        '<p class="gsi-err" role="alert"></p><button type="button" class="gib-btn is-primary gsi-go" data-k="go">try again</button>',
      (e, close, ov) => {
        const k = e.target.closest('[data-k="go"]');
        if (!k) return;
        k.disabled = true;
        k.textContent = 'trying…';
        start().then((ok) => {
          if (ok !== false) return close();
          k.disabled = false;
          k.textContent = 'try again';
          ov.querySelector('.gsi-err').textContent = 'Still not loading. Check your connection.';
        });
      },
      'GameIn didn’t load',
    );
  }

  function signOut() {
    live.signOut().finally(() => {
      try {
        sessionStorage.setItem('gamein-mode', 'live');
      } catch (e) { /* storage blocked */ }
      location.href = here();
    });
  }
  GIX.signOut = signOut;

  // the top bar badge says this is the live app; on a computer it opens the account menu (sign out). The demo's own
  // badge menu (play the story, reset, ops view) doesn't apply here, so init() catches the click before it does.
  const OUT_ICON =
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M10 4.5 H6.6 A1.6 1.6 0 0 0 5 6.1 V17.9 A1.6 1.6 0 0 0 6.6 19.5 H10"/><path d="M14.2 8 L18.2 12 L14.2 16 M18.2 12 H9.6" style="stroke:#5CE5B0"/></svg>';
  const whoAmI = () => (M && M.w.me && M.w.me.email) || '';
  function accountMenu(anchor) {
    const open = document.querySelector('.gix-acct');
    if (open) return open.remove();
    const r = anchor.getBoundingClientRect();
    const m = document.createElement('div');
    m.className = 'gdm gix-acct';
    m.setAttribute('role', 'menu');
    m.setAttribute('aria-label', 'Account');
    m.innerHTML =
      '<small>' + (whoAmI() ? 'signed in as ' + esc(whoAmI()) : 'signed in') + '</small>' +
      '<button type="button" role="menuitem" data-k="out"><b>sign out</b><span>Back to the website. Your deals, money and messages stay in your account.</span></button>';
    m.style.top = r.bottom + 8 + 'px';
    m.style.left = Math.max(8, Math.min(innerWidth - 308, r.left)) + 'px';
    document.body.appendChild(m);
    const close = () => {
      m.remove();
      document.removeEventListener('click', away);
    };
    const away = (e) => !m.contains(e.target) && !anchor.contains(e.target) && close();
    setTimeout(() => document.addEventListener('click', away), 0);
    m.addEventListener('click', (e) => {
      if (!e.target.closest('[data-k="out"]')) return;
      close();
      signOut();
    });
    m.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      close();
      anchor.focus();
    });
    m.querySelector('button').focus();
  }
  function badge() {
    document.querySelectorAll('.gi-launch-demo-badge').forEach((b) => {
      if (b.dataset.live) return;
      b.dataset.live = '1';
      b.textContent = 'LIVE · TEST';
      b.style.cursor = 'pointer';
      b.setAttribute('role', 'button');
      b.setAttribute('tabindex', '0');
      b.setAttribute('aria-haspopup', 'menu');
      b.title = whoAmI() ? 'Signed in as ' + whoAmI() : 'Your account';
      b.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        accountMenu(b);
      });
    });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------------------------------------------
  let lastPaid = null;
  live.on((w) => {
    if (!w) {
      M = null;
      return;
    }
    const prev = M;
    M = index(w);
    rebuild();
    badge();
    // the creator sees the celebration when one of their proofs is paid
    const cid = myCreatorId();
    if (prev && cid) {
      const was = new Set((prev.w.releases || []).map((r) => r.id));
      const fresh = (w.releases || []).filter((r) => r.creator_id === cid && !was.has(r.id));
      if (fresh.length && G().paid && lastPaid !== fresh[0].id) {
        lastPaid = fresh[0].id;
        try {
          G().paid({ value: toD(fresh.reduce((s, r) => s + +r.gross_cents, 0)) });
        } catch (e) { /* the overlay is optional */ }
      }
    }
  });

  function init() {
    const g = G();
    const L = window.GameInLoop;
    if (L && L.setBrand && !L.setBrand.live) {
      const set0 = L.setBrand;
      L.setBrand = (id) => {
        set0.call(L, id);
        keepBrand();
      };
      L.setBrand.live = 1;
    }
    g.signIn = (role) => signInSheet(role);
    g.onboard = (role) => signUpSheet(role);
    g.proofSheet = (cb) => cb && cb();
    const demoOnly = () => notify('This runs in the demo version: open the page with ?demo');
    g.demoPlay = demoOnly;
    g.demoReset = demoOnly;
    g.testStart = demoOnly;
    // Glint's speech bubble takes HTML, and some of the app's messages put a creator's or brand's name straight in it
    const say0 = g.glintSay;
    if (say0 && !say0.live) {
      g.glintSay = function (html, acts, pose) {
        return say0.call(this, plainHtml(html), acts, pose);
      };
      g.glintSay.live = 1;
    }
    // the badge opens the account menu, not the demo's menu
    window.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('#gamein-root .gi-launch-demo-badge');
      if (!b) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      accountMenu(b);
    }, true);
    // the phone's More sheet: no demo story or usability test here, and a way to sign out
    const more0 = g.moreSheet;
    if (more0 && !more0.live) {
      g.moreSheet = function () {
        const r = more0.apply(this, arguments);
        const grid = document.querySelector('.gm-sheet .gm-grid');
        if (grid) {
          grid.querySelectorAll('[data-go="#demo"],[data-go="#test"]').forEach((t) => t.remove());
          const t = document.createElement('button');
          t.type = 'button';
          t.className = 'gm-tile';
          t.dataset.k = 'signout';
          t.innerHTML = '<i>' + OUT_ICON + '</i><b>Sign out</b><small>' + esc(whoAmI() || 'back to the website') + '</small>';
          t.addEventListener('click', () => signOut());
          grid.appendChild(t);
        }
        return r;
      };
      g.moreSheet.live = 1;
    }
    if (window.GameInLaunch) window.GameInLaunch.showSignIn = () => signInSheet();
    // the website's "explore the product" buttons: signed in, they open the app; signed out, sign in first
    window.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('#gi-market-site [data-gi-action="demo"]');
      if (!b || entering) return;
      if (!M) {
        e.preventDefault();
        e.stopImmediatePropagation();
        signInSheet();
      }
    }, true);
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        badge();
      });
    }).observe(document.body, { childList: true, subtree: true });
    live.onAuth((event) => {
      if (event === 'PASSWORD_RECOVERY') newPasswordSheet();
      if (event === 'SIGNED_OUT') M = null;
    });
    open().catch((e) => console.error('GameIn live start', e));
    // ready: a website button pressed while the page was still starting is pressed again now
    GIX.ready = true;
    const held = GIX.held;
    GIX.held = null;
    if (held && document.contains(held)) held.click();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
