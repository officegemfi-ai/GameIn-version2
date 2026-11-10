#!/usr/bin/env bash
# Has the live database got what this version of the app reads?
#
# The app and the database are published separately, and the database goes first. A migration only adds things, so
# the app that is live keeps working on the new database; a new app on the old database asks for things that aren't
# there, and everyone sees errors. Nothing but remembering kept that order, so the deploy checks it
# (.github/workflows/app.yml): this asks the live API for everything listed in database-needs.txt and reads the
# API's own answer:
#
#   there     an answer with rows, or "permission denied" (42501): it exists, and it isn't for visitors
#   missing   "no such function" or "no such table or view" (404: PGRST202, PGRST205)
#   anything else (no answer, a server error, a key the API doesn't accept) is "couldn't tell", never "there"
#
# Only the public key is used, and nothing is written.
#
#   deploy/database-ready.sh [API address] [public key]        default: the hosted project in .env.production
#
#   exit 0   everything is there
#   exit 1   something is missing: the database needs a migration first (each missing thing is named)
#   exit 2   couldn't tell
set -uo pipefail
cd "$(dirname "$0")/.."

from_env() { grep "^$1=" .env.production | head -1 | cut -d= -f2-; }
API=${1:-$(from_env VITE_SUPABASE_URL)}
KEY=${2:-$(from_env VITE_SUPABASE_ANON_KEY)}
if [ -z "$API" ] || [ -z "$KEY" ]; then
  echo "couldn't tell: no API address or key (give them, or set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.production)"
  exit 2
fi

missing=0
unsure=0
while IFS= read -r need; do
  case "$need" in '' | '#'*) continue ;; esac
  name=${need%%\?*}
  # a server that is waking up or busy gets three tries; a clear answer is taken at once
  status=000
  body=
  for attempt in 1 2 3; do
    answer=$(curl -s --connect-timeout 5 --max-time 10 -w '\n%{http_code}' -H "apikey: $KEY" "$API/rest/v1/$need" || true)
    status=${answer##*$'\n'}
    body=${answer%$'\n'*}
    case "$status" in 000 | 5??) [ "$attempt" -lt 3 ] && sleep $((attempt * 2)) ;; *) break ;; esac
  done
  # the API's own error code, when the answer is an error: {"code":"42501", ...}
  code=$(printf '%s' "$body" | sed -n 's/.*"code" *: *"\([A-Za-z0-9]*\)".*/\1/p' | head -1)
  case "$status:$code" in
    2??:*) echo "there: $name" ;;
    401:42501 | 403:42501) echo "there: $name" ;;
    404:PGRST202 | 404:PGRST205 | 404:42883 | 404:42P01) echo "missing: $name"; missing=$((missing + 1)) ;;
    *) echo "couldn't tell: $name (HTTP $status${code:+, $code})"; unsure=$((unsure + 1)) ;;
  esac
done < deploy/database-needs.txt

if [ "$missing" -gt 0 ]; then exit 1; fi
if [ "$unsure" -gt 0 ]; then exit 2; fi
exit 0
