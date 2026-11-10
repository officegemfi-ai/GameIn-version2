#!/usr/bin/env bash
# Builds the two databases the benchmark compares, on a Postgres server you can throw away:
#
#   gamein_scale         the schema as it was before a migration, grown to a few hundred thousand accounts
#   gamein_scale_after   a copy of it with that migration applied
#
#   db/bench/setup.sh [the migration to measure; default: the newest one]
#
#   PGURL   the server, as a superuser                                     default postgres://postgres@localhost:5432
#   SCALE   how big: 1 is 200,000 creators and a million offers            default 1
#           (two 7.5 GB databases and about ten minutes; 0.05 for a quick try)
#   NAME    what to call the databases (NAME and NAME_after)               default gamein_scale
#
# It also gives the API roles the time limits Supabase gives them (8 seconds signed in, 3 for visitors) and a password
# for the role the API connects as. Roles belong to the whole server: don't point this at one you share.
set -euo pipefail

PGURL=${PGURL:-postgres://postgres@localhost:5432}
SCALE=${SCALE:-1}
NAME=${NAME:-gamein_scale}
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
NEW=${1:-$(ls "$ROOT"/supabase/migrations/*.sql | tail -1)}
NEW=$(cd "$(dirname "$NEW")" && pwd)/$(basename "$NEW")
run() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }

echo "before: every migration up to $(basename "$NEW"), at scale $SCALE"
run "$PGURL/postgres" -c "drop database if exists ${NAME}_after with (force)" -c "drop database if exists $NAME with (force)" -c "create database $NAME"
run "$PGURL/$NAME" -f "$ROOT/db/tests/supabase-shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  [ "$f" = "$NEW" ] && break
  run "$PGURL/$NAME" -f "$f"
done
run "$PGURL/$NAME" -v scale="$SCALE" -f "$HERE/scale-data.sql"
run "$PGURL/$NAME" -c "vacuum (analyze)"

echo "after: a copy, with $(basename "$NEW")"
run "$PGURL/postgres" -c "create database ${NAME}_after template $NAME"
time run "$PGURL/${NAME}_after" -f "$NEW"
run "$PGURL/${NAME}_after" -c "vacuum (analyze)"

# Plan as the live server plans. These are the settings of the Supabase compute GameIn runs on (a Micro): what the
# planner believes about memory and disks decides which plan it picks, and the plans are what is being measured.
for db in "$NAME" "${NAME}_after"; do
  run "$PGURL/postgres" \
    -c "alter database $db set random_page_cost = 1.1" \
    -c "alter database $db set effective_cache_size = '768MB'" \
    -c "alter database $db set work_mem = '3500kB'" \
    -c "alter database $db set jit = off" \
    -c "alter database $db set max_parallel_workers_per_gather = 1"
done
run "$PGURL/postgres" \
  -c "alter role authenticated set statement_timeout = '8s'" \
  -c "alter role anon set statement_timeout = '3s'" \
  -c "alter role authenticator password 'local-authenticator'"

run "$PGURL/postgres" -At -c "select datname || ': ' || pg_size_pretty(pg_database_size(datname)) from pg_database where datname in ('$NAME', '${NAME}_after') order by 1"
echo "next: start an API in front of each (db/bench/README.md), then run bench.mjs"
