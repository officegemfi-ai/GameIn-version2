# GameIn app

The production GameIn app: a sponsorship marketplace where brands book gaming creators, the money waits in escrow,
and each part of the work is paid when the brand approves its proof. React 19 and TypeScript on the Supabase backend
in [`../supabase`](../supabase). How it fits together (system, schema, API, screens, security, scaling) is in
[`../ARCHITECTURE.md`](../ARCHITECTURE.md).

## Run it on your computer

You need Node 22 and Docker (for Supabase's local stack).

```sh
# in the repository root: Postgres with the migrations and the demo seed, Auth, Realtime and Storage
npx supabase start

# then the app
cd app
npm ci
npm run dev          # http://localhost:5173
```

`.env.development` points the app at the local stack with the Supabase CLI's standard anon key. If
`npx supabase status -o env` prints a different `ANON_KEY`, put it in `app/.env.development.local`:

```sh
VITE_SUPABASE_ANON_KEY=<the ANON_KEY it printed>
```

The demo seed's accounts all use the password `gamein-demo` (local stacks only):

| Account | Seats |
|---|---|
| `demo@gamein.test` | the creator Instant Shock, and owner of six brands |
| `manager@hypercore.test` | the brand HYPERCORE |
| `readyplayerone@creators.test`, `qwerty2000@creators.test`, … | one creator each |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | The app with hot reload, against `.env.development` |
| `npm run build` | Typecheck, then the production build in `dist/` (against `.env.production` unless the environment says otherwise) |
| `npm run preview` | Serve `dist/` on port 4173 |
| `npm run typecheck` | TypeScript, strict |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest) |
| `npm run e2e` | End-to-end tests (Playwright), desktop and phone |
| `npm run types:db` | Regenerate `src/lib/database.types.ts` from the local database |

## Tests

Unit tests need nothing else: `npm test`.

The end-to-end tests use the built app against a Supabase stack, as real accounts in two browsers. With the local
stack running:

```sh
eval "$(npx supabase status -o env | sed 's/^/export /')"      # API_URL and ANON_KEY
VITE_SUPABASE_URL=$API_URL VITE_SUPABASE_ANON_KEY=$ANON_KEY npm run build
npx playwright install chromium                                 # once
GAMEIN_STORAGE=1 GAMEIN_REALTIME=1 npm run e2e                  # the CLI stack has Storage and Realtime: proof files, and a check that updates arrive live
```

`npm run e2e -- --project=phone` runs just the phone browser; `APP_URL=…` points the tests at an app that's already
running. GitHub runs all of this on every push (`.github/workflows/app.yml`), with the report attached to the run.

## Configuration

Everything is set at build time:

| Variable | What it is |
|---|---|
| `VITE_SUPABASE_URL` | The Supabase project's URL |
| `VITE_SUPABASE_ANON_KEY` | Its publishable (anon) key. Public by design: row-level security protects the data |
| `APP_BASE` | The path the app is served from, ending in `/` (default `/`). On GitHub Pages: `/GameIn-version2/app/` |

The production build carries a Content-Security-Policy that allows connections only to `VITE_SUPABASE_URL`.

## Deploying

**GitHub Pages (set up).** On every push to `main`, once the tests pass, `.github/workflows/app.yml` publishes the
prototype at the site's root as before and the app under `/app/`. It needs one setting: **Settings → Pages → Source →
GitHub Actions**. Until that's switched, the workflow skips publishing and says so on the run page.

**Any static host.** Build with the variables above and serve `dist/`. Send unknown paths to `index.html` (a rewrite
on Cloudflare Pages, Vercel or Netlify) so deep links like `/deals/123` work; on GitHub Pages, `deploy/404.html` does
that job.

**The Supabase project.** In Authentication → URL Configuration, the site URL and redirect URLs must include where the
app is served (for GitHub Pages: `https://officegemfi-ai.github.io/GameIn-version2/**`), so password-reset links come
back to it.
