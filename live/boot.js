/* GameIn: live or demo. Runs first, before the app.
 *
 * Live when live/config.js names a Supabase project and either the config makes live the default or the address has
 * ?live. ?demo always opens the in-browser demo (its own made-up data, saved in this browser only). The choice holds
 * for the rest of the visit.
 *
 * In live mode the demo's own saved state (offers, deals, proofs, messages...) stays in memory instead of this
 * browser's storage: the database is the only record, nothing from an earlier demo visit leaks in, and two tabs never
 * merge their copies (they both follow the database instead).
 */
(function () {
  'use strict';
  var cfg = window.GAMEIN_SUPABASE;
  var params = new URLSearchParams(location.search);
  var KEY = 'gamein-mode';
  var asked = params.has('demo') ? 'demo' : params.has('live') ? 'live' : null;
  var remembered = null;
  try {
    if (asked) sessionStorage.setItem(KEY, asked);
    remembered = sessionStorage.getItem(KEY);
  } catch (e) { /* storage blocked: the address decides */ }
  var want = asked || remembered || (cfg && cfg.liveByDefault ? 'live' : 'demo');
  var mode = cfg && cfg.url && cfg.anonKey && want === 'live' ? 'live' : 'demo';
  window.GAMEIN_MODE = mode;
  document.documentElement.setAttribute('data-gamein-mode', mode);
  if (mode !== 'live') return;

  // the demo's records, kept in memory in live mode
  var DEMO_STATE = /^gib-(bx|loop|pkgs|pkg-draft|campaigns|account|read|week|role-brand|autoenter)$/;
  var memory = new Map();
  var proto = Storage.prototype;
  var get = proto.getItem, set = proto.setItem, remove = proto.removeItem;
  var shielded = function (store, key) {
    return (store === window.localStorage || store === window.sessionStorage) && DEMO_STATE.test(String(key));
  };
  var slot = function (store, key) { return (store === window.sessionStorage ? 's:' : 'l:') + key; };
  proto.getItem = function (key) {
    if (!shielded(this, key)) return get.call(this, key);
    var k = slot(this, key);
    return memory.has(k) ? memory.get(k) : null;
  };
  proto.setItem = function (key, value) {
    if (!shielded(this, key)) return set.call(this, key, value);
    memory.set(slot(this, key), String(value));
  };
  proto.removeItem = function (key) {
    if (!shielded(this, key)) return remove.call(this, key);
    memory.delete(slot(this, key));
  };
  window.GAMEIN_DEMO_MEMORY = memory;

  // The app's shared store, defined before the app so the app uses it as is: no saving to this browser, no merging
  // between tabs, no demo seeding (v: 3), no release timers. The live adapter (live/gamein-adapter.js) fills it from
  // the database after every load and turns the app's changes into database calls. GIX is where the adapter plugs in:
  // the app's engine functions hand over to GIX.<name> when the adapter has one.
  var S = {
    esc: {}, inv: [], ren: {}, rate: {}, off: {}, msg: {}, sent: [], read: {}, readAt: {}, offers: [], deals: [],
    proofs: [], cmsg: {}, cread: {}, crate: {}, v: 3,
    pm: [
      { id: 'pm1', kind: 'card', brand: 'Visa', last4: '4242', exp: '08/28', def: true },
      { id: 'pm2', kind: 'bank', brand: 'Chase', last4: '6789', verified: true },
    ],
    bill: { legal: '', email: '', tax: '', addr: '', country: 'United States' },
  };
  var subs = new Set();
  var note = function () { subs.forEach(function (f) { try { f(); } catch (e) { /* a screen's own error */ } }); };
  var GIX = (window.GIX = window.GIX || {});
  // Until the live app is ready (GIX.ready), the website's sign-in, join and explore buttons wait: they would open the
  // demo's own screens otherwise. The last one pressed is pressed again once it's ready.
  window.addEventListener('click', function hold(e) {
    if (GIX.ready) return window.removeEventListener('click', hold, true);
    var b = e.target && e.target.closest && e.target.closest('#gi-market-site [data-gi-action]');
    if (!b) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    GIX.held = b;
  }, true);
  // the live scripts, in order: Supabase's client, the data layer, the adapter (they need nothing from the demo)
  var base = (document.currentScript && document.currentScript.src) || location.href;
  ['vendor/supabase-js-2.119.0.js', 'gamein-live.js', 'gamein-adapter.js'].forEach(function (p) {
    var s = document.createElement('script');
    s.src = new URL(p, base).href;
    s.async = false;
    document.head.appendChild(s);
  });

  window.GameInBX = {
    S: S,
    note: note,
    // a screen changed the store: the adapter sends what changed to the database, then everyone re-renders
    emit: function () { if (GIX.onEmit) GIX.onEmit(); note(); },
    save: function () { if (GIX.onEmit) GIX.onEmit(); },
    pull: function () { return false; },
    on: function (f) { subs.add(f); return function () { subs.delete(f); }; },
    sync: { hold: function () {}, forget: function () {}, blind: function () {}, merged: 0 },
  };
})();
