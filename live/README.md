# GameIn live mode

The same app on the real database. People have accounts, row-level security decides what each one sees, and every
move is one database function (`supabase/`). The demo is still the default: it runs in the browser with made-up data
and nothing leaves it.

## Opening it

| Address | Opens |
|---|---|
| `index.html?live` | The live app. Sign in, or create a creator or brand account. |
| `index.html?demo` | The demo, always. |
| `index.html` | The demo. Once `liveByDefault` is on, it opens the live app instead. |

The choice holds for the rest of the visit (this tab's session). `live/config.js` names the Supabase project with its
URL and publishable key. Both are public by design: row-level security protects the data, not the key. Setting
`liveByDefault: true` is the launch switch. After that, `?demo` is the only way to reach the demo.

## How it works

- **`boot.js`** runs first and decides the mode. In live mode it does four things:
  - keeps the demo's saved state in memory, so nothing from an earlier demo visit leaks in;
  - gives the app an empty shared store;
  - loads Supabase's client (`live/vendor/supabase-js-2.119.0.js`, with its MIT license), then the data layer, then the adapter;
  - holds website buttons pressed before the adapter is ready, and presses them again once it is.
- **`gamein-live.js`** is the data layer:
  - signing in, signing up and password resets;
  - loading everything the account may see (one snapshot of 29 tables and views);
  - moves, as database functions;
  - proof uploads to Storage, and links to proof files that expire after an hour;
  - following the database. It listens through Realtime. If Realtime can't connect, it checks every 5 seconds. It
    also catches up as soon as the page is back in view, for example a phone waking up. As a safety net, every 15
    seconds it reads the account's newest notification (every move by the other side leaves one) and reloads if
    Realtime missed it. A load that hangs is given up after 20 seconds. `GIX.live.status()` shows what the connection
    has been doing.
- **`gamein-adapter.js`** connects the app's screens to the database:
  - it turns each snapshot into the records the screens already use (the demo's own shapes);
  - it turns each of the app's moves into the database function for it. When the database refuses a move, the
    person sees the reason and the screen reloads to what's true.
  - it adds the sign-in, sign-up and new-password sheets;
  - an account without a brand (or without a creator profile) is offered to create one;
  - the **LIVE · TEST** badge opens the account menu (sign out). On a phone, it's **More → Sign out**.
- **`pre-bundle.js`** switches off the demo's own engine: seeding, timers and saving.
- **`tools/patch-index.mjs`** wires a prototype build for live mode:
  - 47 engine functions hand over to the adapter when it is there (`if(window.GIX&&GIX.<name>)…`);
  - the app shares a few of its helpers with the adapter (`window.GIXI`);
  - a few demo-only constants are swapped;
  - the live scripts are added.

  In demo mode none of this does anything. After a new prototype build:

  ```bash
  node live/tools/patch-index.mjs index.html   # refuses to run on a page that's already wired
  npm run test:live                            # see TESTING.md
  ```

## The Supabase project

The hosted project is `gamein` (ref `fvqpwatjypsjniemhrxo`, us-west-1, in the GameIn organization):

- the migrations are applied, and both scheduler jobs run;
- the demo seed is loaded, so the demo accounts exist, with the password `gamein-demo`. Remove them before real
  people sign up;
- payments are simulated.

Two settings live in the dashboard, not in code:

- **Authentication → Sign In / Providers → Email → Confirm email: off**, until a real email sender (custom SMTP) is
  set up. Supabase's built-in sender is for trying things out: it only delivers to the project team's addresses, a
  few emails an hour. The app already handles confirmation for when it's turned back on. It asks people to check
  their inbox, and finishes setting up their creator profile or brand the first time they sign in.
- **Authentication → URL Configuration**: the Site URL and a Redirect URL set to where the app is served, for
  example `https://officegemfi-ai.github.io/GameIn-version2/` and `https://officegemfi-ai.github.io/GameIn-version2/**`.
  Password-reset links lead there.

## Still demo inside the live app

- **Payments are simulated.** A card payment is in escrow at once, and the brand clears bank payments and wires by hand
  (`clears (demo)`). No real money moves until Stripe Connect is set up. The database can't switch to real payments
  once simulated money exists, so simulated money can never be paid out.
- Saved payment methods and billing details stay in this browser and are placeholders.
- Some settings aren't connected yet, and say so when used.
- The reply window chosen on an offer (24, 48 or 72 hours) isn't sent. The database's own window applies.
- A rating is kept as one score per deal: the average of the questions on screen.
