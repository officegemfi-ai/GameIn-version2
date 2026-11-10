#!/usr/bin/env bash
# Has the live database got what this version of the app reads?
#
# The app and the database are published separately, and the database goes first. A migration only adds things, so
# the app that is live keeps working on the new database; a new app on the old database asks for things that aren't
# there, and everyone sees errors. Nothing but remembering kept that order, so the deploy checks it
# (.github/workflows/app.yml): this asks the live API for everything listed in database-needs.txt. The API answers
# 404 for a function, view or table it doesn't have, and anything else for one it has (mostly 401: it is there, and
# not for visitors). Only the public key is used, and nothing is written.
#
#   deploy/database-ready.sh [API address] [public key]        default: the hosted project in .env.production
#
#   exit 0   everything is there
#   exit 1   something is missing: the database needs a migration first (each missing thing is named)
#   exit 2   couldn't tell: the API didn't answer, or answered with a server error
set -uo pipefail
cd "$(dirname "$0")/.."

from_env() { grep "^$1=" .env.production | head -1 | cut -d= -f2-; }
API=${1:-$(from_env VITE_SUPABASE_URL)}
KEY=${2:-$(from_env VITE_SUPABASE_ANON_KEY)}
if [ -z "$API" ] || [ -z "$KEY" ]; then
  echo "no API address or key: give them, or set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.production"
  exit 2
fi

missing=0
unsure=0
while IFS= read -r need; do
  case "$need" in '' | '#'*) continue ;; esac
  # a server that is waking up or busy gets a few tries; a clear answer is taken at once
  code=000
  for attempt in 1 2 3 4; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -H "apikey: $KEY" "$API/rest/v1/$need" || true)
    case "$code" in 000 | 5??) [ "$attempt" -lt 4 ] && sleep $((attempt * 3)) ;; *) break ;; esac
  done
  name=${need%%\?*}
  case "$code" in
    404) echo "missing: $name"; missing=$((missing + 1)) ;;
    000 | 5??) echo "no answer for $name (HTTP $code)"; unsure=$((unsure + 1)) ;;
    *) echo "there: $name" ;;
  esac
done < deploy/database-needs.txt

if [ "$missing" -gt 0 ]; then exit 1; fi
if [ "$unsure" -gt 0 ]; then exit 2; fi
exit 0
