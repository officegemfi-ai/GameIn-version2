// The requests each version of the app sends, screen by screen, exactly as the app builds them
// (app/src/features/*/api.ts), and how to send them as one of the people in the scale database. Used by bench.mjs
// (what each request costs) and load.mjs (how many people one database serves).
//
//   now        the app on main today
//   next       the app with stage one (bounded lists, counts from the database, search as its own request)
//   prototype  the single-file prototype's live mode: everything the person may see, in one load (live/gamein-live.js)
import crypto from 'node:crypto';

export const REST = process.env.BENCH_REST || 'http://127.0.0.1:3002';
export const DB = process.env.BENCH_DB || 'postgres://postgres@localhost:5432/gamein_scale';
const SECRET = process.env.BENCH_JWT_SECRET || 'local-only-jwt-secret-at-least-32-characters-long';
export const APPS = ['now', 'next', 'prototype'];

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(claims) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ iss: 'bench', exp: Math.floor(Date.now() / 1000) + 3600, ...claims });
  return `${head}.${body}.${crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')}`;
}
/** The token of a visitor, and of a signed-in person: what the API checks, signed with the stack's own secret. */
export const ANON = jwt({ role: 'anon' });
export const signedIn = (userId) => jwt({ role: 'authenticated', sub: userId, aud: 'authenticated' });

/** Sends one request the way the browser would. `plan` asks the database to explain it instead of answering. */
export async function send(req, token, { plan = false } = {}) {
  const headers = { Authorization: `Bearer ${token}`, apikey: ANON };
  if (req.body) headers['Content-Type'] = 'application/json';
  if (req.write) headers.Prefer = 'tx=rollback';
  if (req.count) headers.Prefer = 'count=exact'; // a tab's total: the database counts, no rows travel
  if (plan) headers.Accept = 'application/vnd.pgrst.plan+json; for="application/json"; options=analyze|buffers';
  const started = performance.now();
  const res = await fetch(REST + req.path, { method: req.method, headers, body: req.body ? JSON.stringify(req.body) : undefined });
  const text = await res.text();
  return { ms: performance.now() - started, status: res.status, text, total: res.headers.get('content-range')?.split('/')[1] };
}

const PARTIES = 'brand:brands(id,name,slug),creator:creators(id,display_name,handle)';
const CARD = 'id,handle,display_name,bio,avatar_url,platforms,packages(id,title,price_cents,active)';
const BELL = '/notifications?select=id,kind,created_at,read_at,event:events(kind,data,amount_cents,deal_id,offer_id,actor_side,brand_id,creator_id,brand:brands(name),creator:creators(display_name))&order=id.desc&limit=30';
const DEAL_ROW = `id,title,status,type,created_at,ends_on,${PARTIES},deliverables(status,due_on)`;
const DEAL = `*,${PARTIES},milestones(*),deliverables(*),proofs(*),releases(*),ratings(*),payments(*)`;
const CONVERSATION = `id,brand_id,creator_id,created_at,last_message_at,last_message_seq,${PARTIES},conversation_reads(side,last_read_seq,last_read_at)`;
const PAGE = 25; // app/src/lib/paging.ts

/** A persona's moves (sent with "Prefer: tx=rollback": measured, then undone). The same in every version of the app. */
function moves(p, rpc) {
  if (p.name === 'staff') return; // staff look; they aren't a party to anything
  if (p.partner) {
    const pair = p.side === 'brand' ? { p_brand: p.seat_id, p_creator: p.partner } : { p_brand: p.partner, p_creator: p.seat_id };
    rpc('moves', 'send a message', 'send_message', { ...pair, p_as: p.side, p_body: 'Checking in about the stream.' });
    if (p.side === 'brand') {
      rpc('moves', 'send an offer', 'send_offer', { ...pair, p_title: 'Bench offer', p_amount_cents: 50000, p_items: [{ label: 'Sponsored stream', days: 7 }], p_note: '' });
    }
  }
  if (p.conversation) rpc('moves', 'mark a conversation read', 'mark_read', { p_conversation: p.conversation, p_as: p.side });
  rpc('moves', 'mark notifications read', 'mark_notifications_read', {});
  if (p.turn) rpc('moves', 'accept an offer', 'accept_offer', { p_offer: p.turn, p_as: p.side });
  if (p.side === 'brand' && p.unfunded) rpc('moves', 'fund escrow', 'fund_milestones', { p_deal: p.unfunded, p_method: 'card', p_scope: 'all' });
  if (p.side === 'brand' && p.review) rpc('moves', 'approve proof', 'approve_proof', { p_proof: p.review });
  if (p.side === 'creator') rpc('moves', 'request a payout', 'request_payout', { p_creator: p.seat_id, p_instant: false });
}

/** What a persona's screens ask for. `p` is the persona with a few of its own rows looked up (an offer, a deal...). */
export function requests(p, app) {
  const col = p.side === 'brand' ? 'brand_id' : 'creator_id';
  const seat = `${col}=eq.${p.seat_id}`;
  const r = [];
  const get = (screen, name, path, extra = {}) => r.push({ screen, name, method: 'GET', path, ...extra });
  const rpc = (screen, name, fn, body) => r.push({ screen, name, method: 'POST', path: `/rpc/${fn}`, body, write: true });

  if (app === 'prototype') {
    if (!p.seat_id) return r;
    // one load: 29 reads, none of them narrowed to a seat or a page (the API cuts each off at 1,000 rows)
    for (const [name, path] of [
      ['seats', '/my_seats?select=*'], ['profiles', '/profiles?select=*'], ['creators', '/creators?select=*'], ['brands', '/brands?select=*'],
      ['packages', '/packages?select=*'], ['campaigns', '/campaigns?select=*'], ['offers', '/offer_board?select=*&order=created_at.desc'],
      ['offer versions', '/offer_versions?select=*&order=version'], ['deals', '/deals?select=*&order=created_at.desc'],
      ['deal periods', '/deal_periods?select=*&order=seq'], ['milestones', '/milestones?select=*&order=seq'],
      ['deliverables', '/deliverables?select=*&order=seq'], ['proofs', '/proofs?select=*&order=submitted_at'],
      ['releases', '/releases?select=*&order=released_at'], ['payments', '/payments?select=*&order=seq'],
      ['payment milestones', '/payment_milestones?select=*'], ['payouts', '/payouts?select=*&order=created_at'],
      ['renewals', '/renewals?select=*&order=created_at'], ['ratings', '/ratings?select=*'], ['money of every deal', '/deal_money?select=*'],
      ['brand money', '/brand_money?select=*'], ['wallet', '/creator_wallet?select=*'], ['wallet lines', '/wallet_lines?select=*&order=at'],
      ['what waits on you', '/todos?select=*'], ['conversations', '/conversations?select=*'], ['messages', '/messages?select=*&order=seq'],
      ['read marks', '/conversation_reads?select=*'], ['events', '/events?select=*&order=id'],
      ['notifications', '/notifications?select=*&order=id.desc&limit=200'],
    ]) get('one load', name, path);
    return r;
  }

  const next = app === 'next';
  get('every page', 'your seats', '/my_seats?select=*');
  get('every page', 'the bell', BELL);
  if (!p.seat_id) return r;
  // the navigation's badges: today the whole to-do list, fetched and counted; next, counted by the database
  if (next) get('every page', 'badges', `/rpc/todo_counts?p_side=${p.side}&p_seat=${p.seat_id}`);
  else get('every page', 'badges', `/todos?select=*&side=eq.${p.side}&${seat}`);

  // --- dashboard
  const activeDeals = `/deals?select=${DEAL_ROW}&${seat}&status=in.(awaiting_funding,in_progress)&order=created_at.desc,id.desc&offset=0&limit=${PAGE}`;
  if (next) {
    get('dashboard', 'what waits on you (first 20)', `/todos?select=*&side=eq.${p.side}&${seat}&limit=20`);
    get('dashboard', 'active deals', activeDeals, { then: 'money' });
    if (p.side === 'brand') get('dashboard', 'deals to fund', `/deals?select=id,title,status,creator:creators(display_name),milestones!inner(id)&${seat}&status=in.(awaiting_funding,in_progress)&milestones.status=eq.pending&order=created_at.desc,id.desc&limit=20`, { then: 'money' });
  } else {
    get('dashboard', 'deals (latest 200)', `/deals?select=${DEAL_ROW}&${seat}&order=created_at.desc&limit=200`);
    get('dashboard', 'money of every deal', `/deal_money?select=*&${seat}`);
  }
  if (p.side === 'creator') {
    get('dashboard', 'wallet', `/creator_wallet?select=*&creator_id=eq.${p.seat_id}`);
    if (next) get('dashboard', 'ready to deliver', `/ready_deliverables?select=id,label,due_on,amount_cents,status,deal_id,deal_title,brand_name&creator_id=eq.${p.seat_id}&order=due_on.asc.nullslast,id.asc&limit=20`);
    else get('dashboard', 'ready to deliver', `/deliverables?select=id,label,due_on,amount_cents,status,deal:deals!inner(id,title,creator_id,brand:brands(name)),milestone:milestones!inner(status)&deal.creator_id=eq.${p.seat_id}&milestone.status=eq.in_escrow&status=in.(upcoming,changes_requested)&order=due_on.asc.nullslast&limit=20`);
    get('dashboard', 'your packages', `/packages?select=*&creator_id=eq.${p.seat_id}&order=active.desc,created_at`);
  } else {
    get('dashboard', 'brand money', `/brand_money?select=*&brand_id=eq.${p.seat_id}`);
  }

  // --- offers
  if (next) {
    // an offer waits on the brand when it was countered (or pitched), on the creator when it was sent
    const [mine, theirs] = p.side === 'brand' ? ['countered', 'sent'] : ['sent', 'countered'];
    const open = `/offer_board?select=*,${PARTIES}&${seat}&closed_at=is.null&order=expires_at.asc,id.asc&offset=0&limit=${PAGE}`;
    get('offers', 'your turn', `${open}&raw_status=eq.${mine}`);
    get('offers', 'waiting on them', `${open}&raw_status=eq.${theirs}`);
    get('offers, closed tab', 'closed', `/offer_board?select=*,${PARTIES}&${seat}&closed_at=not.is.null&order=closed_at.desc,id.desc&offset=0&limit=${PAGE}`);
  } else {
    get('offers', 'offers (latest 200)', `/offer_board?select=*,${PARTIES}&${seat}&order=last_version_at.desc&limit=200`);
  }
  if (p.offer) {
    get('one offer', 'the offer', `/offer_board?select=*,${PARTIES}&id=eq.${p.offer}`);
    get('one offer', 'its versions', `/offer_versions?select=*&offer_id=eq.${p.offer}&order=version`);
  }

  // --- deals
  if (next) {
    get('deals', 'active deals', activeDeals, { then: 'money' });
    r.push({ screen: 'deals', name: 'how many are active', method: 'HEAD', path: `/deals?select=id&${seat}&status=in.(awaiting_funding,in_progress)`, count: true });
    get('deals, complete tab', 'finished deals', `/deals?select=${DEAL_ROW}&${seat}&status=in.(completed,cancelled)&order=created_at.desc,id.desc&offset=0&limit=${PAGE}`, { then: 'money' });
  } else {
    get('deals', 'deals (latest 200)', `/deals?select=${DEAL_ROW}&${seat}&order=created_at.desc&limit=200`);
    get('deals', 'money of every deal', `/deal_money?select=*&${seat}`);
  }
  if (p.deal) {
    get('one deal', 'the deal', `/deals?select=${DEAL}&id=eq.${p.deal}`);
    get('one deal', 'its money', `/deal_money?select=*&deal_id=eq.${p.deal}`);
  }

  // --- messages
  get('messages', next ? 'conversations' : 'conversations (latest 100)', `/conversations?select=${CONVERSATION}&${seat}&order=last_message_at.desc.nullslast,created_at.desc${next ? `,id.desc&offset=0&limit=${PAGE}` : '&limit=100'}`);
  const thread = (id) => `/conversation_timeline?select=*&conversation_id=eq.${id}&order=at.desc${next ? ',ref.desc' : ''}&limit=200`;
  if (p.conversation) {
    get('one conversation', 'the conversation', `/conversations?select=${CONVERSATION}&id=eq.${p.conversation}`);
    get('one conversation', 'its last 200 lines', thread(p.conversation));
  }
  if (p.longConversation) get('their longest conversation', 'its last 200 lines', thread(p.longConversation));

  // --- money
  if (p.side === 'creator') {
    get('wallet', 'wallet', `/creator_wallet?select=*&creator_id=eq.${p.seat_id}`);
    get('wallet', next ? 'wallet lines' : 'wallet lines (latest 100)', `/wallet_lines?select=*&creator_id=eq.${p.seat_id}&order=at.desc,kind.desc${next ? `,release_id.desc.nullslast,payout_id.desc.nullslast&offset=0&limit=${PAGE}` : '&limit=100'}`);
    get('packages', 'your packages', `/packages?select=*&creator_id=eq.${p.seat_id}&order=active.desc,created_at`);
  } else {
    get('payments', 'brand money', `/brand_money?select=*&brand_id=eq.${p.seat_id}`);
    get('payments', next ? 'payments' : 'payments (latest 100)', `/payments?select=*,deal:deals(id,title,creator:creators(display_name))&brand_id=eq.${p.seat_id}&order=created_at.desc${next ? `,id.desc&offset=0&limit=${PAGE}` : '&limit=100'}`);
  }
  get('settings', 'your name', `/profiles?select=display_name&id=eq.${p.user_id}`);

  moves(p, rpc);
  return r;
}

/** The public pages, and the two searches (which need a sign-in in the app; anyone's will do). */
export function publicRequests(x, app) {
  const r = [];
  const get = (screen, name, path, extra = {}) => r.push({ screen, name, method: 'GET', path, anon: true, ...extra });
  if (app === 'prototype') return r;
  const next = app === 'next';
  get('landing page', 'featured creators', `/creators?select=id,handle,display_name,bio,avatar_url,platforms,packages!inner(id,title,price_cents,active)&packages.active=eq.true&handle=not.like.deleted-*&order=display_name,id&limit=6`);
  get('a creator’s page', 'the creator, by handle', `/creators?select=id,handle,display_name,bio,avatar_url,platforms,created_at,packages(*)&handle=ilike.${x.handle}`);
  get('directory', 'first page', `/creators?select=${CARD}&handle=not.like.deleted-*&order=display_name,id&offset=0&limit=24`);
  get('directory', 'page 200', `/creators?select=${CARD}&handle=not.like.deleted-*&order=display_name,id&offset=4776&limit=24`);
  const search = (q) => next
    ? `/rpc/search_creators?p_q=${q}&p_limit=24&p_offset=0&select=${CARD}&order=display_name,id`
    : `/creators?select=${CARD}&handle=not.like.deleted-*&or=(display_name.ilike.*${q}*,handle.ilike.*${q}*)&order=display_name,id&offset=0&limit=24`;
  // a name many creators have, one a handful have, one nobody has, and two letters
  for (const [name, q] of [['search "storm" (many)', 'storm'], [`search "${x.rare}" (a few)`, x.rare], ['search, no match', 'zzzqq'], ['search "st"', 'st']]) {
    get('directory', name, search(q), { anon: !next, as: next ? x.someone : undefined });
  }
  get('new offer', 'find a brand "nova"', next
    ? `/rpc/search_brands?p_q=nova&p_limit=20&select=id,name,slug,verified&order=name,id`
    : `/brands?select=id,name,slug,verified&order=name&limit=20&or=(name.ilike.*nova*,slug.ilike.*nova*)`, { anon: !next, as: next ? x.someone : undefined });
  return r;
}
