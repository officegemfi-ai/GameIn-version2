# The scale benchmark

What each screen of GameIn costs once GameIn is big, measured rather than estimated.

It builds a database shaped like a marketplace a few years in (200,000 creators, 20,000 brands, a million offers,
five million messages), sends it the requests the app sends, the way the app sends them, and has the database account
for each one. [SYSTEM_DESIGN.md](../../SYSTEM_DESIGN.md) is built on its numbers, and
[RESULTS.md](RESULTS.md) is its latest output.

Use it before and after anything that changes how the database is read: a migration, a view, an access rule, an
index, a new screen's query. A request that reads a whole table looks fine on a development database with five deals in
it. Here it shows.

## What's in this folder

| File | What it does |
|---|---|
| `setup.sh` | Builds the two databases: the schema before a migration, grown to scale, and a copy with the migration applied |
| `scale-data.sql` | The data. A few very busy brands and creators, a long tail of small ones, as real marketplaces have |
| `requests.mjs` | The requests each version of the app sends, screen by screen, copied from `app/src/features/*/api.ts` |
| `bench.mjs` | Sends every request as each of seven people and reports its time, its work and what went wrong |
| `compare.mjs` | Puts runs side by side, screen by screen, as Markdown; adds the load test's results when given them |
| `load.mjs` | Simulated people using the app at once: how many screens a second one database serves, and what fails |
| `RESULTS.md` | The latest comparison |

## Running it

You need a Postgres server you can throw away (16 or 17, with about 16 GB of disk), `psql`, Node 20 or later with
`npm install` done at the repository root, and [PostgREST](https://github.com/PostgREST/postgrest/releases) (the API
server Supabase runs in front of the database; version 14 here).

```sh
# 1. the two databases (about ten minutes; SCALE=0.05 for a quick try)
db/bench/setup.sh

# 2. an API in front of each: ports 3002 (before) and 3003 (after)
for pair in 3002:gamein_scale 3003:gamein_scale_after; do
  PGRST_DB_URI="postgres://authenticator:local-authenticator@localhost:5432/${pair#*:}" PGRST_SERVER_PORT=${pair%:*} \
  PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_DB_EXTRA_SEARCH_PATH=public,extensions \
  PGRST_JWT_SECRET=local-only-jwt-secret-at-least-32-characters-long \
  PGRST_DB_PLAN_ENABLED=true PGRST_DB_TX_END=commit-allow-override PGRST_DB_MAX_ROWS=1000 postgrest &
done

# 3. every screen, three ways
BEFORE="BENCH_REST=http://127.0.0.1:3002 BENCH_DB=postgres://postgres@localhost:5432/gamein_scale"
AFTER="BENCH_REST=http://127.0.0.1:3003 BENCH_DB=postgres://postgres@localhost:5432/gamein_scale_after"
env $BEFORE node db/bench/bench.mjs --app now  --label "Before"         --out before.json
env $AFTER  node db/bench/bench.mjs --app now  --label "Migration only" --out migration.json
env $AFTER  node db/bench/bench.mjs --app next --label "Stage one"      --out stage-one.json

# 4. how many people one database serves (16 people for 40 seconds each)
env $BEFORE node db/bench/load.mjs --app now  --seconds 40 --label "Before"         --out load-before.json
env $AFTER  node db/bench/load.mjs --app now  --seconds 40 --label "Migration only" --out load-migration.json
env $AFTER  node db/bench/load.mjs --app next --seconds 40 --label "Stage one"      --out load-stage-one.json

# 5. side by side (a load test goes under the run with the same label)
node db/bench/compare.mjs before.json migration.json stage-one.json load-*.json > db/bench/RESULTS.md
```

`compare.mjs --note "…"` puts a paragraph under the introduction, for whatever a reader of the table has to know
(RESULTS.md has one about its middle column).

`--app now` sends what the app sent before stage one, and `--app next` what it sends with it. When a screen's query
changes in `app/src/features/*/api.ts`, change it in `requests.mjs` too: the benchmark only tells the truth about
requests the app really sends. To measure a later change against stage one, give `requests.mjs` a third version. `--app prototype` sends what the single-file prototype's live mode sends (everything a
person may see, in one load).

`bench.mjs --only offers --persona agency` runs part of it. Moves (send a message, accept an offer, fund escrow) are
sent with `Prefer: tx=rollback`: measured, then undone, so a run leaves the database as it found it.

## Who it signs in as

| Person | Who they are |
|---|---|
| an ordinary brand | The brand in the middle of the range: 31 offers, 13 deals. Most brands look like this |
| an ordinary creator | The creator in the middle: 2 offers, no deal yet |
| someone who signed up today | No seat, nothing to show |
| the busiest creator | Creator number one: 7,636 offers, 3,826 deals |
| one person with seven seats | A creator profile and six busy brands |
| the busiest brand | An agency: 36,886 offers, 18,685 deals, 29,068 conversations |
| GameIn staff | Sees everything; opens an ordinary brand's pages |

The ordinary accounts say what most people will feel. The busy ones say what breaks first.

## Reading the numbers

- **Time** is the request through the API, the middle of five runs, on whatever machine ran it. Compare times within
  one run of the benchmark, not with someone else's machine.
- **Pages** is how many 8 kB pages the database touched to answer, counting a page each time it is visited. It doesn't
  depend on the machine, and it is what turns into disk reads when the database is bigger than memory: Supabase's
  smallest paid compute reads about 500 pages a second from disk once its burst allowance is spent.
- **Reads all of a table** means the answer was found by going through every row of that table. The cost of such a
  request grows with GameIn, not with the person asking.
- **Cut off at 1,000 rows** means the API returned exactly its maximum to a request that set no smaller limit. The
  rows after that were left out without any sign: a count made from that answer is wrong, a sum is short.
- **Over the time limit** means the database stopped the request after 8 seconds (3 for a visitor), as Supabase does.
  The screen shows an error.
- **Found no free connection** (the load test) means every connection the API holds to the database was busy for
  ten seconds with the requests ahead of this one. The API here keeps its default of 10; on Supabase the number
  depends on the compute size. A database this far behind runs out of any number.

## What it doesn't measure

- **Real people.** The data is made up. The shape (how unequal the accounts are, how long threads get) is a guess
  at a marketplace's, turned up at the busy end on purpose. Proof waiting for review, for one, is far more common
  here than it would be.
- **Opening one row, exactly.** In the design before stage one, what opening one offer or conversation cost depended on
  where its row happened to lie in its table: anything from nothing to reading the whole table. The benchmark opens
  the one in the middle of the person's own rows, which is what a row picked at random costs on average.
- **Live updates.** Realtime's own work (checking each change against each person listening) happens in Supabase's
  Realtime service, which isn't part of this set-up. The design document reasons about it from Supabase's published
  limits.
- **Writing at volume.** Each move is timed alone. Many people writing at once, and the indexes that slows down, are
  covered by `db/tests/07-races.test.mjs` for correctness, not here for speed.
- **The ledger.** The made-up data has deals, payments and releases but no ledger entries (no screen reads the
  ledger; a move's own postings are measured with the move). At this size it would be about four million more rows.
- **Sign-in and file storage**, which Supabase runs as separate services.
