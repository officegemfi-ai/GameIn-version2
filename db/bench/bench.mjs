// What each screen costs on a big database: the requests the app sends, sent the way the app sends them (through the
// API, as a signed-in person, under row-level security), timed, and explained by the database itself.
//
//   node db/bench/bench.mjs --app now|next|prototype --out results.json [--label before] [--only dashboard] [--persona agency] [--runs 5]
//
//   --app              whose requests: the app on main today (now, the default), the app with stage one (next), or the
//                      prototype's live mode (prototype)
//   BENCH_REST         the API (PostgREST) in front of the scale database       default http://127.0.0.1:3002
//   BENCH_DB           the scale database, as its owner (to look up who to sign in as)  default postgres://postgres@localhost:5432/gamein_scale
//   BENCH_JWT_SECRET   the secret the API checks sign-ins with                  default: the local stack's
//
// For every request it reports the time through the API (the middle of five runs), the time inside the database, how
// many 8 kB pages the database touched to answer (the honest measure of work: it doesn't depend on how fast this
// machine is), every table it read from end to end, and whether the answer was cut off at the API's 1,000 rows.
// See db/bench/README.md.
import fs from 'node:fs';
import pg from 'pg';
import { ANON, APPS, DB, publicRequests, requests, REST, send, signedIn } from './requests.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1] ?? '']] : a), []));
const RUNS = Number(args.runs || 5);
const APP = args.app || 'now';
if (!APPS.includes(APP)) throw new Error('--app is now, next or prototype');
const MAX_ROWS = 1000; // the API never answers with more rows than this (supabase/config.toml: max_rows)
const BIG = 5000; // a table read end to end counts as "the whole table" from this many rows

const db = new pg.Client({ connectionString: DB });
await db.connect();
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0] ?? {};

// ---------------------------------------------------------------------------------------------------------------------
// Sending, timing, explaining
// ---------------------------------------------------------------------------------------------------------------------
/** From the database's own account of a query: its time, the pages it touched, and the tables it read end to end. */
function readPlan(text) {
  let root;
  try {
    root = JSON.parse(text)[0];
  } catch {
    return null;
  }
  if (!root?.Plan) return null; // explaining it ran into the time limit
  const scans = new Map();
  const walk = (node) => {
    if (/Seq Scan/.test(node['Node Type']) && node['Relation Name']) {
      const loops = node['Actual Loops'] ?? 1;
      const read = ((node['Actual Rows'] ?? 0) + (node['Rows Removed by Filter'] ?? 0)) * loops;
      scans.set(node['Relation Name'], (scans.get(node['Relation Name']) ?? 0) + read);
    }
    (node.Plans ?? []).forEach(walk);
  };
  walk(root.Plan);
  return {
    dbMs: root['Execution Time'] + (root['Planning Time'] ?? 0),
    pages: (root.Plan['Shared Hit Blocks'] ?? 0) + (root.Plan['Shared Read Blocks'] ?? 0),
    wholeTables: [...scans].filter(([, rows]) => rows >= BIG).map(([table, rows]) => ({ table, rows: Math.round(rows) })),
  };
}

const middle = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function measure(req, token) {
  const about = { screen: req.screen, name: req.name, method: req.method };
  const first = await send(req, token);
  if (first.status >= 400) {
    let problem = {};
    try {
      problem = JSON.parse(first.text);
    } catch { /* not JSON */ }
    // 57014: the database gave up at the API's time limit (8 seconds signed in, 3 for visitors), as it does on Supabase
    if (problem.code === '57014' || (req.method === 'HEAD' && first.status >= 500)) return { m: { ...about, status: first.status, timedOut: true, ms: first.ms } };
    // a move the rules refuse (nothing to pay out, say) was still answered: its time counts, its refusal isn't a failure
    if (req.write && problem.code === 'P0001') return { m: { ...about, status: first.status, refused: problem.message, ms: first.ms } };
    return { m: { ...about, status: first.status, error: first.text.slice(0, 300) } };
  }
  const times = [];
  for (let i = 0; i < RUNS; i++) times.push((await send(req, token)).ms);
  let rows = null;
  let data = null;
  try {
    data = JSON.parse(first.text);
    rows = Array.isArray(data) ? data.length : 1;
  } catch { /* an empty answer */ }
  if (req.method === 'HEAD') rows = Number(first.total); // what it counted
  // a counting request's plan can't be asked for through the API (its answer is a header): its time is what's reported
  const plan = req.write || req.method === 'HEAD' ? null : readPlan((await send(req, token, { plan: true })).text);
  const m = { ...about, status: first.status, rows, bytes: first.text.length, ms: middle(times), slowest: Math.max(...times), ...plan };
  // exactly as many rows as the API ever gives, from a request that set no smaller limit: the rest was left out, silently
  if (rows === MAX_ROWS && !/[?&]limit=/.test(req.path)) m.cut = true;
  return { m, data };
}

/** One request and, where the app follows it with another built from its answer (a page of deals, then their money), that one. */
async function measureAll(req, token) {
  const got = await measure(req, token);
  const out = [got.m];
  if (req.then === 'money' && Array.isArray(got.data) && got.data.length) {
    const ids = got.data.map((d) => d.id).join(',');
    out.push((await measure({ screen: req.screen, name: 'money of those deals', method: 'GET', path: `/deal_money?select=*&deal_id=in.(${ids})` }, token)).m);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Who to sign in as, and a few of their rows to open
// ---------------------------------------------------------------------------------------------------------------------
const personas = (await db.query('select * from bench.personas order by name')).rows;
for (const p of personas) {
  if (!p.seat_id) continue;
  const col = p.side === 'brand' ? 'brand_id' : 'creator_id';
  const other = p.side === 'brand' ? 'creator_id' : 'brand_id';
  // One of the person's own rows to open: the one in the middle of theirs, in the order the rows lie in the table.
  // What opening a row costs today depends on where it lies (anything from nothing to reading the whole table: see
  // README.md); the middle is what a row picked at random costs on average.
  const middleOf = async (table, where) => (await one(`select id from public.${table} where ${where} order by ctid
                                                       offset (select count(*) / 2 from public.${table} where ${where}) limit 1`, [p.seat_id])).id;
  Object.assign(p, {
    size: await one(`select (select count(*)::int from public.offers where ${col} = $1) as offers, (select count(*)::int from public.deals where ${col} = $1) as deals,
                            (select count(*)::int from public.conversations where ${col} = $1) as conversations, (select count(*)::int from public.notifications where user_id = $2) as notifications`, [p.seat_id, p.user_id]),
    offer: await middleOf('offers', `${col} = $1`),
    deal: await middleOf('deals', `${col} = $1 and status = 'in_progress'`),
    conversation: await middleOf('conversations', `${col} = $1 and last_message_seq > 0`),
    // ...and their longest conversation, for a thread of 200 lines
    longConversation: (await one(`select id from public.conversations where ${col} = $1 order by last_message_seq desc limit 1`, [p.seat_id])).id,
    partner: (await one(`select ${other} as id from public.conversations where ${col} = $1 order by last_message_seq desc limit 1`, [p.seat_id])).id,
    // an open offer waiting on this seat, a deal nobody has funded, proof waiting for review
    turn: (await one(`select id from public.offers where ${col} = $1 and status = $2 and expires_at > now() + interval '1 hour' limit 1`, [p.seat_id, p.side === 'brand' ? 'countered' : 'sent'])).id,
    unfunded: (await one(`select id from public.deals where ${col} = $1 and status = 'awaiting_funding' limit 1`, [p.seat_id])).id,
    review: (await one(`select pf.id from public.proofs pf join public.deals d on d.id = pf.deal_id where d.${col} = $1 and pf.status = 'in_review' limit 1`, [p.seat_id])).id,
  });
}
const someCreator = await one(`select c.handle, c.display_name, p.user_id from public.creators c join bench.personas p on p.seat_id = c.id where p.name = 'creator'`);
// a creator's page to open, a name only a few creators have, and someone to be signed in as for the searches
const anyone = { handle: someCreator.handle, rare: encodeURIComponent(someCreator.display_name), someone: someCreator.user_id };

const results = { label: args.label || '', app: APP, at: new Date().toISOString(), database: await one(`select pg_size_pretty(pg_database_size(current_database())) as size,
  (select count(*)::int from public.creators) as creators, (select count(*)::int from public.brands) as brands, (select count(*)::int from public.offers) as offers,
  (select count(*)::int from public.deals) as deals, (select count(*)::int from public.messages) as messages, (select count(*)::int from public.notifications) as notifications`), personas: {}, public: [], jobs: [] };

const wanted = (req) => !args.only || req.screen.includes(args.only) || req.name.includes(args.only);
const show = (m) => {
  const what = (m.screen + ' · ' + m.name).padEnd(52);
  if (m.error) return console.log(`  ${what} FAILED ${m.status} ${m.error.slice(0, 90)}`);
  if (m.timedOut) return console.log(`  ${what} GAVE UP after ${(m.ms / 1000).toFixed(1)} s: over the API's time limit, the screen shows an error`);
  const db = m.dbMs !== undefined ? `${m.dbMs.toFixed(1).padStart(8)} ms in db ${String(m.pages).padStart(8)} pages` : ''.padStart(31);
  const notes = [m.cut ? `CUT OFF at ${MAX_ROWS.toLocaleString()} rows` : '', ...(m.wholeTables ?? []).map((t) => `whole ${t.table} (${t.rows.toLocaleString()})`)].filter(Boolean).join(', ');
  console.log(`  ${what} ${m.ms.toFixed(0).padStart(6)} ms  ${db}  ${String(m.rows ?? '').padStart(5)} rows  ${m.refused ? `(refused: ${m.refused})` : notes}`);
};

console.log(`the ${APP === 'prototype' ? 'prototype’s live mode' : APP === 'next' ? 'app with stage one' : 'app as it is on main'}, against ${REST}`);
for (const p of personas) {
  if (args.persona && args.persona !== p.name) continue;
  console.log(`\n${p.name}: ${p.about}${p.size ? ` — ${p.size.offers.toLocaleString()} offers, ${p.size.deals.toLocaleString()} deals, ${p.size.conversations.toLocaleString()} conversations, ${p.size.notifications.toLocaleString()} notifications` : ''}`);
  const token = signedIn(p.user_id);
  const out = [];
  for (const req of requests(p, APP).filter(wanted)) {
    for (const m of await measureAll(req, token)) {
      out.push(m);
      show(m);
    }
  }
  results.personas[p.name] = { about: p.about, size: p.size ?? null, requests: out };
}

if (!args.persona) {
  if (APP !== 'prototype') console.log('\npublic pages and search');
  for (const req of publicRequests(anyone, APP).filter(wanted)) {
    for (const m of await measureAll(req, req.as ? signedIn(req.as) : ANON)) {
      results.public.push(m);
      show(m);
    }
  }

  // the scheduler's two jobs (every 10 seconds, every minute), run as the database runs them and undone
  console.log('\nscheduled jobs');
  for (const [name, sql] of [['release what is due (every 10 s)', 'select public.release_due()'], ['expire old offers (every minute)', 'select public.expire_offers()']]) {
    if (args.only && !name.includes(args.only)) continue;
    const times = [];
    let pages = 0;
    for (let i = 0; i < 3; i++) {
      await db.query('begin');
      const started = performance.now();
      await db.query(sql);
      times.push(performance.now() - started);
      await db.query('rollback');
    }
    await db.query('begin');
    const plan = (await db.query(`explain (analyze, buffers, format json) ${sql}`)).rows[0]['QUERY PLAN'][0];
    await db.query('rollback');
    pages = (plan.Plan['Shared Hit Blocks'] ?? 0) + (plan.Plan['Shared Read Blocks'] ?? 0);
    results.jobs.push({ name, ms: middle(times), pages });
    console.log(`  ${name.padEnd(46)} ${middle(times).toFixed(0).padStart(6)} ms  ${String(pages).padStart(8)} pages`);
  }
}

await db.end();
if (args.out) {
  fs.writeFileSync(args.out, JSON.stringify(results, null, 1));
  console.log(`\nwritten to ${args.out}`);
}
