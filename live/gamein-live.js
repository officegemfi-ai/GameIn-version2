/* GameIn live mode: the data layer between the screens and the Supabase database.
 *
 * Configure with window.GAMEIN_SUPABASE = { url, anonKey } (live/config.js) and load supabase-js first
 * (vendor/supabase-js-*.js). Without a config the page stays the in-browser demo.
 *
 *   GameInLive.signIn(email, password) / signUp({...}) / signOut()
 *   GameInLive.load()          everything the signed-in person may see, in one snapshot (row-level security decides)
 *   GameInLive.world()         the latest snapshot
 *   GameInLive.act(fn, args)   one move: calls a database function; a refusal throws an error with .rule and .message
 *   GameInLive.on(f)           called after every new snapshot
 *   GameInLive.watch()         reload when the other side changes something (Supabase Realtime)
 *
 * Runs in the browser and in Node (tests), wherever globalThis.supabase is supabase-js.
 */
(function (root) {
  'use strict';

  const TABLES_WATCHED = ['offers', 'offer_versions', 'deals', 'milestones', 'deliverables', 'proofs', 'releases',
    'renewals', 'ratings', 'messages', 'conversation_reads', 'events', 'notifications', 'payouts', 'payments'];

  function create(config, supabaseLib) {
    const lib = supabaseLib || root.supabase;
    if (!config || !config.url || !config.anonKey || !lib) return null;
    const sb = lib.createClient(config.url, config.anonKey, {
      auth: { persistSession: config.persistSession !== false, autoRefreshToken: true, storageKey: 'gamein-live-auth' },
    });
    const subs = new Set();
    let world = null;
    let loading = null;
    let channel = null;
    let reloadTimer = null;

    const notify = () => subs.forEach((f) => { try { f(world); } catch (e) { console.error(e); } });

    // a database refusal, as the app shows it: the message, and the rule it enforces (O9, E6, ...)
    function refusal(error, status) {
      const e = new Error(error.message || 'Something went wrong');
      e.rule = error.hint || null;
      e.code = error.code || null;
      e.status = status || null;
      e.refused = error.code === 'P0001' || error.code === 'P0002' || error.code === '42501';
      return e;
    }

    async function rows(query) {
      const { data, error, status } = await query;
      if (error) throw refusal(error, status);
      return data || [];
    }

    async function signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw refusal({ message: error.message, code: error.code || 'auth' }, error.status);
      return data.user;
    }

    // a new account: the person's name, then their creator profile or their brand. What they chose at sign-up rides
    // along in the account's own metadata, so that if the project asks people to confirm their email first, the
    // profile or brand is made the first time they're signed in (finishSetup)
    async function signUp({ email, password, name, side, handle, brandName, extra = {}, redirectTo }) {
      const setup = { side: side || null, handle: handle || null, brand_name: brandName || null };
      const { data, error } = await sb.auth.signUp({
        email, password,
        options: { data: { name: name || '', gamein_setup: setup, ...extra }, emailRedirectTo: redirectTo },
      });
      if (error) throw refusal({ message: error.message, code: error.code || 'auth' }, error.status);
      if (!data.session) return { user: data.user, confirm: true };      // email confirmation is on: finish after it
      await finishSetup(data.user);
      return { user: data.user, confirm: false };
    }

    // the 6-digit code from the confirmation email (when the project's email template includes it)
    async function verifySignupCode(email, code) {
      const { data, error } = await sb.auth.verifyOtp({ email, token: code, type: 'signup' });
      if (error) throw refusal({ message: error.message, code: error.code || 'auth' }, error.status);
      await finishSetup(data.user);
      return data.user;
    }

    // make the creator profile or brand chosen at sign-up, once, if this account doesn't have it yet
    async function finishSetup(u) {
      const who = u || (await user());
      const setup = who && who.user_metadata && who.user_metadata.gamein_setup;
      if (!setup || !setup.side) return null;
      const seats = await rows(sb.from('my_seats').select('*'));
      if (setup.side === 'creator' && !seats.some((s) => s.side === 'creator')) {
        return act('create_creator_profile', { p_handle: setup.handle, p_display_name: who.user_metadata.name || setup.handle }, { reload: false });
      }
      if (setup.side === 'brand' && !seats.some((s) => s.side === 'brand')) {
        return act('create_brand', { p_name: setup.brand_name }, { reload: false });
      }
      return null;
    }

    async function resetPassword(email, redirectTo) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw refusal({ message: error.message, code: error.code || 'auth' }, error.status);
    }

    async function setPassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw refusal({ message: error.message, code: error.code || 'auth' }, error.status);
    }

    async function signOut() {
      unwatch();
      await sb.auth.signOut();
      world = null;
      notify();
    }

    // the signed-in person, from the saved session (no network call; the API checks the token on every request)
    async function user() {
      const { data } = await sb.auth.getSession();
      return data && data.session ? data.session.user : null;
    }

    // everything the signed-in person may see, at one moment
    async function fetchWorld() {
      const me = await user();
      if (!me) return null;
      const q = (t, sel = '*') => sb.from(t).select(sel);
      const [seats, profiles, creators, brands, packages, campaigns, offers, versions, deals, periods, milestones,
        deliverables, proofs, releases, payments, paymentMilestones, payouts, renewals, ratings, dealMoney, brandMoney,
        wallet, walletLines, todos, conversations, messages, reads, events, notifications] = await Promise.all([
        rows(q('my_seats')),
        rows(q('profiles')),
        rows(q('creators')),
        rows(q('brands')),
        rows(q('packages')),
        rows(q('campaigns')),
        rows(q('offer_board').order('created_at', { ascending: false })),
        rows(q('offer_versions').order('version')),
        rows(q('deals').order('created_at', { ascending: false })),
        rows(q('deal_periods').order('seq')),
        rows(q('milestones').order('seq')),
        rows(q('deliverables').order('seq')),
        rows(q('proofs').order('submitted_at')),
        rows(q('releases').order('released_at')),
        rows(q('payments').order('seq')),
        rows(q('payment_milestones')),
        rows(q('payouts').order('created_at')),
        rows(q('renewals').order('created_at')),
        rows(q('ratings')),
        rows(q('deal_money')),
        rows(q('brand_money')),
        rows(q('creator_wallet')),
        rows(q('wallet_lines').order('at')),
        rows(q('todos')),
        rows(q('conversations')),
        rows(q('messages').order('seq')),
        rows(q('conversation_reads')),
        rows(q('events').order('id')),
        rows(q('notifications').order('id', { ascending: false }).limit(200)),
      ]);
      return {
        at: Date.now(), me: { id: me.id, email: me.email }, seats, profiles, creators, brands, packages, campaigns, offers,
        versions, deals, periods, milestones, deliverables, proofs, releases, payments, paymentMilestones, payouts,
        renewals, ratings, dealMoney, brandMoney, wallet, walletLines, todos, conversations, messages, reads, events,
        notifications,
      };
    }

    // one load at a time; a load asked for while one runs starts again when it ends, so the snapshot is never stale
    async function load() {
      if (loading) {
        loading.again = true;
        return loading.promise;
      }
      const run = { again: false };
      run.promise = (async () => {
        try {
          do {
            run.again = false;
            world = await fetchWorld();
          } while (run.again);
          notify();
          return world;
        } finally {
          loading = null;
        }
      })();
      loading = run;
      return run.promise;
    }

    // one move; the snapshot reloads after it, so both the change and its knock-on effects (fees, completion) show
    async function act(fn, args = {}, { reload = true } = {}) {
      const { data, error, status } = await sb.rpc(fn, args);
      if (error) throw refusal(error, status);
      if (reload) await load();
      return data;
    }

    // proof for a deliverable: a link, a file, or both. The file goes to the deal's folder in the private proofs bucket
    // first (only the deal's creator may upload there), then the proof points at it
    async function submitProof(deal, deliverable, { link = null, file = null, note = '' } = {}) {
      let path = null;
      if (file) {
        const name = String(file.name || 'proof').normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(-80) || 'proof';
        path = `${deal}/${Date.now().toString(36)}-${name}`;
        const { error } = await sb.storage.from('proofs').upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (error) throw refusal({ message: error.message || 'The upload failed', code: 'storage' }, error.statusCode);
      }
      return act('submit_proof', { p_deliverable: deliverable, p_link_url: link || null, p_file_path: path, p_note: note || '' });
    }

    // a proof file for both parties to open: a link that works for an hour
    async function proofFileUrl(path, seconds = 3600) {
      const { data, error } = await sb.storage.from('proofs').createSignedUrl(path, seconds);
      if (error) throw refusal({ message: error.message, code: 'storage' }, error.statusCode);
      return data.signedUrl;
    }

    // the other side's moves arrive by themselves: through Realtime, or, while Realtime can't connect, by checking
    // every few seconds
    let poll = null;
    const POLL_MS = config.pollMs || 5000;
    function startPolling() {
      if (!poll) poll = setInterval(() => { if (!loading) load().catch(() => {}); }, POLL_MS);
    }
    function stopPolling() {
      clearInterval(poll);
      poll = null;
    }
    function watch() {
      if (channel) return;
      channel = sb.channel('gamein-live');
      TABLES_WATCHED.forEach((table) => {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
          clearTimeout(reloadTimer);
          reloadTimer = setTimeout(load, 150);
        });
      });
      const fallback = setTimeout(startPolling, config.realtimeWaitMs || 5000);
      // back on the page after a while (a phone asleep, another tab in front): catch up at once
      if (!watch.seen && typeof document !== 'undefined') {
        watch.seen = true;
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible' && channel && !loading) load().catch(() => {});
        });
      }
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(fallback);
          stopPolling();
          load().catch(() => {});        // anything that changed while connecting
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          startPolling();
        }
      });
    }

    function unwatch() {
      if (channel) sb.removeChannel(channel);
      channel = null;
      stopPolling();
    }

    function on(f) {
      subs.add(f);
      return () => subs.delete(f);
    }

    sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { world = null; notify(); }
    });

    // the account's events as they happen: SIGNED_IN, SIGNED_OUT, PASSWORD_RECOVERY (opened a reset link), ...
    function onAuth(f) {
      const { data } = sb.auth.onAuthStateChange((event, session) => { try { f(event, session); } catch (e) { console.error(e); } });
      return () => data.subscription.unsubscribe();
    }

    return {
      client: sb, signIn, signUp, verifySignupCode, finishSetup, resetPassword, setPassword, signOut, user, onAuth,
      load, act, submitProof, proofFileUrl, watch, unwatch, on, world: () => world, refusal,
    };
  }

  const api = { create, instance: null };
  const cfg = root.GAMEIN_SUPABASE;
  if (cfg && root.supabase) api.instance = create(cfg);
  root.GameInLive = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
