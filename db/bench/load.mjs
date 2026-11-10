// How many people one database serves. A number of simulated people use the app at once, each opening the screens
// people open most (the dashboard, offers, deals, messages) one after another with no pause, as random accounts from
// the scale database: mostly ordinary creators and brands, now and then one of the busiest. After a while it says how
// many screens were served per second, how long they took, and how many requests failed.
//
//   node db/bench/load.mjs --app now|next [--people 16] [--seconds 30] [--busy 0.01] [--out load.json] [--label today]
//
//   --busy   the share of visits that come from the three busiest accounts (default 1 in 100)
//   BENCH_REST, BENCH_DB, BENCH_JWT_SECRET as for bench.mjs
//
// No pauses means the people ask as fast as the answers come: what is measured is the most the database can serve
// (on this machine), not what a given number of real people would ask of it. See db/bench/README.md.
import fs from 'node:fs';
import pg from 'pg';
import { APPS, DB, requests, REST, send, signedIn } from './requests.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1] ?? '']] : a), []));
const APP = args.app || 'now';
if (!APPS.includes(APP) || APP === 'prototype') throw new Error('--app is now or next');
const PEOPLE = Number(args.people || 16);
const SECONDS = Number(args.seconds || 30);
const BUSY = Number(args.busy ?? 0.01);
const SCREENS = ['dashboard', 'offers', 'deals', 'messages'];

// --- who: a few hundred random accounts, and the busiest ---------------------------------------------------------------
const db = new pg.Client({ connectionString: DB });
await db.connect();
const creators = (await db.query(`select 'creator' as side, c.id as seat_id, c.owner_id as user_id from public.creators c order by random() limit 300`)).rows;
const brands = (await db.query(`select 'brand' as side, b.id as seat_id, (select m.user_id from public.brand_members m where m.brand_id = b.id limit 1) as user_id
                                from public.brands b order by random() limit 200`)).rows.filter((b) => b.user_id);
const busiest = (await db.query(`select name, side, seat_id, user_id from bench.personas where name in ('agency', 'top_creator', 'many_seats')`)).rows;
await db.end();

// a fixed sequence of "random" numbers, so two runs meet the same people in the same order
let seed = 20261110;
const random = () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (list) => list[Math.floor(random() * list.length)];
const ABOUT = { agency: 'the busiest brand', top_creator: 'the busiest creator', many_seats: 'the person with seven seats' };
const someone = () => (random() < BUSY ? pick(busiest) : random() < 0.6 ? pick(creators) : pick(brands));

// --- what: one screen's requests, sent together as a browser sends them ------------------------------------------------
const screens = { n: 0, ms: [], slowest: { ms: 0, screen: '', who: '' } };
const reqs = { n: 0, failed: 0, gaveUp: 0, noConnection: 0, cut: 0, ms: [] };
const perScreen = Object.fromEntries(SCREENS.map((s) => [s, []]));
let running = true;

async function ask(req, token) {
  const r = await send(req, token);
  reqs.n += 1;
  reqs.ms.push(r.ms);
  if (r.status >= 400) {
    reqs.failed += 1;
    // PGRST003: every connection to the database was busy for ten seconds (the requests ahead of this one were slow)
    if (r.text.includes('PGRST003')) reqs.noConnection += 1;
    // 57014: the database stopped it at the API's time limit (a counting request has no body to say so)
    else if (r.text.includes('57014') || (req.method === 'HEAD' && r.status >= 500)) reqs.gaveUp += 1;
    return null;
  }
  let data = null;
  try {
    data = JSON.parse(r.text);
  } catch { /* a counting request has no body */ }
  if (Array.isArray(data) && data.length === 1000 && !/[?&]limit=/.test(req.path)) reqs.cut += 1;
  return data;
}

/** One screen: its requests leave together; a request built from another's answer follows it. */
async function open(screen, list, token, who) {
  const started = performance.now();
  await Promise.all(list.map(async (req) => {
    const data = await ask(req, token);
    if (req.then === 'money' && Array.isArray(data) && data.length) {
      await ask({ method: 'GET', path: `/deal_money?select=*&deal_id=in.(${data.map((d) => d.id).join(',')})` }, token);
    }
  }));
  const took = performance.now() - started;
  screens.n += 1;
  screens.ms.push(took);
  perScreen[screen].push(took);
  if (took > screens.slowest.ms) screens.slowest = { ms: took, screen, who: who.name ? ABOUT[who.name] : `an ordinary ${who.side}` };
}

async function person() {
  while (running) {
    const who = someone();
    const token = signedIn(who.user_id);
    const all = requests({ name: who.name ?? 'someone', side: who.side, seat_id: who.seat_id, user_id: who.user_id }, APP).filter((r) => r.method !== 'POST');
    // the first screen of a visit also loads what every page shows (the seats, the bell, the badges)
    for (const screen of SCREENS) {
      if (!running) break;
      const list = all.filter((r) => r.screen === screen || (screen === 'dashboard' && r.screen === 'every page'));
      await open(screen, list, token, who);
    }
  }
}

console.log(`${PEOPLE} people for ${SECONDS} s, the ${APP === 'next' ? 'app with stage one' : 'app as it is on main'}, against ${REST}`);
const startedAt = performance.now();
setTimeout(() => (running = false), SECONDS * 1000);
await Promise.all(Array.from({ length: PEOPLE }, person));
const seconds = (performance.now() - startedAt) / 1000;

const at = (xs, q) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))] : 0);
const ms = (x) => (x >= 1000 ? `${(x / 1000).toFixed(1)} s` : `${Math.round(x)} ms`);
const result = {
  label: args.label || '', app: APP, people: PEOPLE, forSeconds: SECONDS, seconds: Math.round(seconds), busyShare: BUSY,
  screensPerSecond: +(screens.n / seconds).toFixed(1), requestsPerSecond: +(reqs.n / seconds).toFixed(1),
  screen: { half: at(screens.ms, 0.5), p95: at(screens.ms, 0.95), slowest: screens.slowest.ms, slowestWas: `${screens.slowest.who}, ${screens.slowest.screen}` },
  byScreen: Object.fromEntries(SCREENS.map((s) => [s, { n: perScreen[s].length, half: at(perScreen[s], 0.5), p95: at(perScreen[s], 0.95) }])),
  requests: reqs.n, failed: reqs.failed, gaveUp: reqs.gaveUp, noConnection: reqs.noConnection, cutOff: reqs.cut,
};
console.log(`  screens served        ${screens.n} (${result.screensPerSecond} a second), from ${reqs.n} requests (${result.requestsPerSecond} a second)`);
console.log(`  a screen took         half under ${ms(result.screen.half)}, 95 in 100 under ${ms(result.screen.p95)}, the slowest ${ms(result.screen.slowest)} (${result.screen.slowestWas})`);
for (const s of SCREENS) console.log(`    ${s.padEnd(10)}          half under ${ms(result.byScreen[s].half)}, 95 in 100 under ${ms(result.byScreen[s].p95)}`);
console.log(`  requests that failed  ${reqs.failed} (${reqs.gaveUp} stopped at the time limit, ${reqs.noConnection} found no free connection for ten seconds); answers cut off at 1,000 rows: ${reqs.cut}`);
if (args.out) {
  fs.writeFileSync(args.out, JSON.stringify(result, null, 1));
  console.log(`\nwritten to ${args.out}`);
}
