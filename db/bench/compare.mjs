// Runs of bench.mjs side by side, screen by screen, as Markdown.
//
//   node db/bench/compare.mjs today.json migration-only.json stage-one.json [load-*.json ...] [--note "..."] > db/bench/RESULTS.md
//
// Each file is one run (--out). The columns take their headings from the runs' labels. A screen's cell says how long
// the person waits for it (its requests leave together, so the slowest one; a request that follows from another's
// answer is added to it), how many 8 kB pages the database touched for it, and what went wrong: a request that hit
// the API's time limit, or an answer cut off at 1,000 rows. Results of load.mjs (--out) given with them become the
// "many people at once" table, and each --note a paragraph under the introduction.
import fs from 'node:fs';

const notes = [];
const files = [];
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--note') notes.push(process.argv[++i]);
  else files.push(process.argv[i]);
}
const given = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
const runs = given.filter((r) => r.personas);
if (runs.length < 2) throw new Error('give at least two runs to compare');
// a load test goes under the run with the same label, whatever order the files were given in
const column = (x) => { const i = runs.findIndex((r) => (r.label || r.app) === (x.label || x.app)); return i < 0 ? runs.length : i; };
const loads = given.filter((r) => r.screensPerSecond !== undefined).sort((a, b) => column(a) - column(b));
const n = (x) => Number(x).toLocaleString('en-US');
const ms = (x) => (x >= 1000 ? `${(x / 1000).toFixed(1)} s` : `${Math.max(1, Math.round(x))} ms`);
const LIMIT = { signedIn: '8 s', visitor: '3 s' };

/** One screen's requests as one cell. */
function cell(requests, visitor = false) {
  if (!requests.length) return '';
  const failed = requests.filter((m) => m.error);
  if (failed.length) return `error (${failed[0].status})`;
  const gaveUp = requests.filter((m) => m.timedOut);
  // a request built from another's answer waits for it
  let wait = 0;
  let chain = 0;
  for (const m of requests) {
    chain = m.name === 'money of those deals' ? chain + m.ms : m.ms;
    wait = Math.max(wait, chain);
  }
  const pages = requests.reduce((a, m) => a + (m.pages ?? 0), 0);
  const notes = [];
  if (gaveUp.length) notes.push(`**${gaveUp.length === requests.length ? 'fails' : `${gaveUp.length} of ${requests.length} requests fail`}: over the ${visitor ? LIMIT.visitor : LIMIT.signedIn} limit**`);
  const cut = requests.filter((m) => m.cut).length;
  if (cut) notes.push('**answer cut off at 1,000 rows**');
  const work = pages ? `${n(pages)} pages` : '';
  const time = gaveUp.length === requests.length ? '' : ms(wait);
  return [time, work, ...notes].filter(Boolean).join(' · ');
}

const screensOf = (list) => [...new Set(list.map((m) => m.screen))];
const label = (r) => r.label || r.app;

function table(lists, { visitor = false, byRequest = false } = {}) {
  const key = (m) => (byRequest ? `${m.screen} · ${m.name}` : m.screen);
  // screens in the order the first run that has them lists them
  const rows = [];
  for (const list of lists) for (const m of list) if (!rows.includes(key(m))) rows.push(key(m));
  console.log(`| ${byRequest ? 'Request' : 'Screen'} | ${runs.map(label).join(' | ')} |`);
  console.log(`|---|${runs.map(() => '---').join('|')}|`);
  for (const row of rows) {
    const cells = lists.map((list) => cell(list.filter((m) => key(m) === row), visitor));
    if (cells.some(Boolean)) console.log(`| ${decodeURIComponent(row)} | ${cells.map((c) => c || '(in the request above)').join(' | ')} |`);
  }
  console.log('');
}

const d = runs[0].database;
console.log('# What each screen costs on a big database');
console.log('');
console.log(`Made by \`db/bench/compare.mjs\` from runs of \`db/bench/bench.mjs\` (${runs.map((r) => r.at.slice(0, 10)).filter((x, i, a) => a.indexOf(x) === i).join(', ')}). See [README.md](README.md) for how to make it again and how to read it.`);
console.log('');
console.log(`The database: ${n(d.creators)} creators, ${n(d.brands)} brands, ${n(d.offers)} offers, ${n(d.deals)} deals, ${n(d.messages)} messages, ${n(d.notifications)} notifications; ${runs.map((r) => `${r.database.size} (${label(r)})`).filter((x, i, a) => a.indexOf(x) === i).join(', ')}.`);
console.log('');
console.log('A cell is one screen: how long the person waits for it, and how many 8 kB pages the database touched for all of its requests. The times are from one machine (2 cores, 7 GB of memory: about a Supabase Large); the pages are the same on any machine, and on a small one each page that isn’t in memory is a read from disk.');
console.log('');
for (const note of notes) {
  console.log(note);
  console.log('');
}

// most people first, the busiest accounts after
const ORDER = ['brand', 'creator', 'newcomer', 'top_creator', 'many_seats', 'agency', 'staff'];
const personas = Object.keys(runs[runs.length - 1].personas).sort((a, b) => (ORDER.indexOf(a) + 99) % 99 - (ORDER.indexOf(b) + 99) % 99);
for (const name of personas) {
  const p = runs[runs.length - 1].personas[name];
  const lists = runs.map((r) => (r.personas[name]?.requests ?? []).filter((m) => m.screen !== 'moves'));
  if (!lists.some((l) => l.length)) continue;
  const size = p.size ? `: ${n(p.size.offers)} offers, ${n(p.size.deals)} deals, ${n(p.size.conversations)} conversations, ${n(p.size.notifications)} notifications` : '';
  console.log(`## ${p.about[0].toUpperCase()}${p.about.slice(1)}${size}`);
  console.log('');
  table(lists);
}

if (runs.some((r) => r.public?.length)) {
  console.log('## Public pages and search');
  console.log('');
  table(runs.map((r) => r.public ?? []), { visitor: true, byRequest: true });
}

console.log('## Moves');
console.log('');
console.log('The slowest of each move across the people above (each is one transaction; measured, then rolled back).');
console.log('');
{
  const moves = (r) => Object.values(r.personas).flatMap((p) => p.requests.filter((m) => m.screen === 'moves' && !m.refused));
  const names = [...new Set(runs.flatMap((r) => moves(r).map((m) => m.name)))];
  console.log(`| Move | ${runs.map(label).join(' | ')} |`);
  console.log(`|---|${runs.map(() => '---').join('|')}|`);
  for (const name of names) {
    const cells = runs.map((r) => {
      const times = moves(r).filter((m) => m.name === name && m.ms !== undefined).map((m) => m.ms);
      return times.length ? ms(Math.max(...times)) : '';
    });
    console.log(`| ${name} | ${cells.join(' | ')} |`);
  }
  console.log('');
}

if (runs.some((r) => r.jobs?.length)) {
  console.log('## Scheduled jobs');
  console.log('');
  console.log(`| Job | ${runs.map(label).join(' | ')} |`);
  console.log(`|---|${runs.map(() => '---').join('|')}|`);
  for (const job of runs.find((r) => r.jobs?.length).jobs) {
    console.log(`| ${job.name} | ${runs.map((r) => { const j = (r.jobs ?? []).find((x) => x.name === job.name); return j ? `${ms(j.ms)} · ${n(j.pages)} pages` : ''; }).join(' | ')} |`);
  }
  console.log('');
}

if (loads.length) {
  const l = loads[0];
  const of = (pick) => loads.map(pick).join(' | ');
  console.log('## Many people at once');
  console.log('');
  console.log(`\`db/bench/load.mjs\`: ${l.people} simulated people open the dashboard, offers, deals and messages one after another without a pause, as accounts picked at random (1 visit in ${Math.round(1 / l.busyShare)} is one of the three busiest), for ${l.forSeconds ?? l.seconds} seconds. The people, the API and the database share the machine’s two cores: a database with a server to itself serves more.`);
  console.log('');
  console.log(`| | ${of((x) => x.label || x.app)} |`);
  console.log(`|---|${loads.map(() => '---').join('|')}|`);
  console.log(`| Screens served a second | ${of((x) => x.screensPerSecond)} |`);
  console.log(`| Half the screens took under | ${of((x) => ms(x.screen.half))} |`);
  console.log(`| 95 in 100 took under | ${of((x) => ms(x.screen.p95))} |`);
  console.log(`| The slowest | ${of((x) => `${ms(x.screen.slowest)}${x.screen.slowestWas ? ` (${x.screen.slowestWas})` : ''}`)} |`);
  console.log(`| Requests that failed | ${of((x) => (x.failed ? `${n(x.failed)} of ${n(x.requests)}: ${n(x.gaveUp)} stopped at the time limit${x.noConnection ? `, ${n(x.noConnection)} found no free connection for ten seconds` : ''}` : `none of ${n(x.requests)}`))} |`);
  console.log(`| Answers cut off at 1,000 rows | ${of((x) => x.cutOff || 'none')} |`);
  console.log('');
}

// every request, for whoever wants to see inside a cell
console.log('## Every request');
console.log('');
for (const [i, r] of runs.entries()) {
  if (i) console.log('');
  console.log(`<details><summary>${label(r)}</summary>`);
  console.log('');
  for (const name of Object.keys(r.personas)) {
    const list = r.personas[name].requests;
    if (!list.length) continue;
    console.log(`**${r.personas[name].about}**`);
    console.log('');
    console.log('| Request | Time | In the database | Pages | Rows | |');
    console.log('|---|---:|---:|---:|---:|---|');
    for (const m of list) {
      const notes = [m.timedOut ? 'over the time limit' : '', m.cut ? 'cut off at 1,000 rows' : '', m.refused ? `refused: ${m.refused}` : '', ...(m.wholeTables ?? []).map((t) => `reads all of ${t.table} (${n(t.rows)} rows)`)].filter(Boolean).join('; ');
      console.log(`| ${m.screen} · ${m.name} | ${m.timedOut ? '' : m.ms !== undefined ? ms(m.ms) : ''} | ${m.dbMs !== undefined ? ms(m.dbMs) : ''} | ${m.pages !== undefined ? n(m.pages) : ''} | ${m.rows ?? ''} | ${notes} |`);
    }
    console.log('');
  }
  if (r.public?.length) {
    console.log('**Public pages and search**');
    console.log('');
    console.log('| Request | Time | In the database | Pages | Rows | |');
    console.log('|---|---:|---:|---:|---:|---|');
    for (const m of r.public) {
      const notes = [m.timedOut ? 'over the time limit' : '', ...(m.wholeTables ?? []).map((t) => `reads all of ${t.table} (${n(t.rows)} rows)`)].filter(Boolean).join('; ');
      console.log(`| ${decodeURIComponent(m.screen + ' · ' + m.name)} | ${m.timedOut ? '' : ms(m.ms)} | ${m.dbMs !== undefined ? ms(m.dbMs) : ''} | ${m.pages !== undefined ? n(m.pages) : ''} | ${m.rows ?? ''} | ${notes} |`);
    }
    console.log('');
  }
  console.log('</details>');
}
