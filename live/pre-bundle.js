/* GameIn live mode, just before the app: GameInLoop (the prototype's engine for its seeded deals, campaigns and the
 * wallet total) stops keeping its own records. Every deal lives in the database, so the app's own wallet patch, saved
 * proofs, release timers and made-up proof are switched off (_bx = 1 tells the app the loop is already set up), and
 * the wallet figures come from the adapter. Does nothing in demo mode. */
(function () {
  'use strict';
  if (window.GAMEIN_MODE !== 'live') return;
  var L = window.GameInLoop;
  if (!L) return;
  var GIX = (window.GIX = window.GIX || {});
  L._bx = 1;
  L.S.proofs = [];
  L.S.releases = [];
  L.S.released = 0;
  L.S.campaigns = [];
  L.S.account = null;
  // the creator's wallet, from the database (see the adapter)
  L.released = function () { return GIX.walletNet ? GIX.walletNet() : 0; };
  L.txs = function () { return GIX.walletTx ? GIX.walletTx() : []; };
  // no made-up proof, and nothing left that works on the prototype's seeded deals
  L.seed = function () {};
  L.pull = function () { return false; };
  var none = function () { return false; };
  L.submit = none;
  L.approve = none;
  L.approveLater = none;
  L.cancelRelease = none;
  L.changes = none;
  L.next = function () { return null; };
})();
