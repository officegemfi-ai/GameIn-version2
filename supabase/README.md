# GameIn on Supabase

The database for GameIn: every table, a database function for every move, row-level security for both seats, the
demo workspace, and tests. The design and the reasons behind it are in the architecture doc ("GameIn on Supabase:
database architecture").

| File | What it holds |
|---|---|
| `migrations/20261025000100_core.sql` | Types and tables: accounts, marketplace, offers, deals, milestones, deliverables, proofs, payments, releases, payouts, the ledger, renewals, ratings, conversations, events. The checks that make impossible states impossible. |
| `migrations/20261025000200_helpers.sql` | The private helpers: who is asking, refusals with rule ids, the ledger, the event log and notifications, deal status, the money audit. |
| `migrations/20261025000300_actions.sql` | Every move, as one locked transaction each (the table below). |
| `migrations/20261025000400_views.sql` | What the screens read: seats, offers, money, wallet, to-dos, the conversation timeline. |
| `migrations/20261025000500_security.sql` | Row-level security, grants, the `proofs` Storage bucket, Realtime, the scheduler. |
| `seed.sql` | The prototype's demo workspace (local and demo projects only). |
| `cron.sql` | The scheduler by hand, if pg_cron wasn't enabled when the migrations ran. |
| `config.toml` | The Supabase CLI's project settings for local development. |

## Put it on a Supabase project

```bash
npx supabase login
npx supabase link --project-ref <your project ref>   # Project Settings > General
npx supabase db push                                 # applies supabase/migrations, never the seed
```

Then check the scheduler: `select jobname, schedule from cron.job;` should list `gamein-release-due` and
`gamein-expire-offers`. If it doesn't, enable pg_cron (Database > Extensions) and run `cron.sql` in the SQL editor.

Without the CLI, paste the five migration files into the SQL editor in order.

## Run it on your computer

```bash
npx supabase start       # needs Docker; loads the migrations and the demo seed
npx supabase db reset    # start again from scratch
```

Studio opens at http://127.0.0.1:54323 and the API is at http://127.0.0.1:54321. The demo accounts all use the
password `gamein-demo`:

| Account | Sits in |
|---|---|
| `demo@gamein.test` | Instant Shock (creator) and all six brands, like the prototype's seat switch |
| `manager@hypercore.test` | HYPERCORE only |
| `readyplayerone@creators.test`, `qwerty2000@creators.test`, `fspartan@creators.test`, `testy@creators.test`, `outpost@creators.test` | the demo creators |

## From the app

The app reads tables and views directly and makes every change through a function. Row-level security decides what
each person sees; the functions decide what each person can do.

```js
// what waits on the brand seat (S3), and the offers with who they wait on
const { data: todos } = await supabase.from('todos').select('*').eq('side', 'brand').eq('brand_id', brandId);
const { data: offers } = await supabase.from('offer_board').select('*').eq('brand_id', brandId);

// a move: one call, all or nothing
const { data: dealId, error } = await supabase.rpc('accept_offer', { p_offer: offerId, p_as: 'creator' });
if (error) showMessage(error.message);     // "This offer is waiting on the brand to reply to your last version"
                                            // error.hint names the rule: O9

// the other seat's changes as they happen (row-level security applies)
supabase.channel('deal').on('postgres_changes',
  { event: '*', schema: 'public', table: 'milestones', filter: `deal_id=eq.${dealId}` }, reload).subscribe();

// proof files go to the deal's folder, then the proof points at them
await supabase.storage.from('proofs').upload(`${dealId}/${file.name}`, file);
await supabase.rpc('submit_proof', { p_deliverable: deliverableId, p_file_path: `${dealId}/${file.name}` });
```

Moves that can be made from either seat take `p_as: 'brand' | 'creator'`: one person can sit on both sides (the demo
account does), so the function needs to know which seat the move comes from, and checks the person sits there.

| Function | Who | Rules |
|---|---|---|
| `send_offer`, `book_package` | brand | O1, K1 |
| `pitch_offer`, `book_again` | creator | O2, R5 |
| `counter_offer`, `accept_offer`, `decline_offer` | the side the offer waits on | O3-O6, O8-O11, M1 |
| `withdraw_offer` | the side whose version is waiting | O7 |
| `fund_milestones` | brand | E1-E5, M2 |
| `simulate_payment` | brand, demo payments only | E3, E4 |
| `submit_proof` | creator | P1, E6 |
| `approve_proof`, `undo_approval`, `request_changes` | brand | P2-P4, P6 |
| `finalize_release` | either party (the app calls it when the undo window ends) | P2, P5, P6, M3 |
| `offer_renewal`, `request_renewal`, `answer_renewal`, `withdraw_renewal` | brand, creator, the other side, the opener | R1-R4 |
| `rate_deal` | either side, once, after completion | T1, T2 |
| `send_message`, `mark_read` | either side | C1 |
| `request_payout` | creator | M5 |
| `mark_notifications_read`, `create_brand`, `create_creator_profile` | anyone signed in | |
| `confirm_payment`, `fail_payment`, `complete_payout` | service key only (payment webhooks) | E3, E4 |
| `release_due`, `expire_offers` | service key only (the scheduler) | P2, O8 |

Refusals come back as errors with the reason in `message` and the rule in `hint`; over the API a refused move is a
400, a move from a seat you don't sit in is a 403, and a missing row is a 404.

## Payments

Payments start simulated, as in the prototype: a card is in escrow at once, and the brand clears a bank payment or a
wire by hand (`simulate_payment`). To use Stripe, set the provider in the SQL editor:

```sql
update private.settings set value = 'stripe' where key = 'payments_provider';
```

Every payment then waits for Stripe: an Edge Function receives Stripe's webhook and calls `confirm_payment` or
`fail_payment` with the service key (and `complete_payout` for payouts).

## Tests

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run test:db
```

Each test gets a fresh database built from these migrations (plus `db/tests/supabase-shim.sql`, which stands in for
the parts of Supabase a plain Postgres doesn't have), acts as real users through row-level security, and ends with the
money audit (`private.audit_money()`), which must find nothing. They cover every action from both seats, every blocked
move, two connections acting at the same instant, and random walks of hundreds of moves. GitHub runs them on every
push on Postgres 15 and 17, and on Supabase's own Postgres after loading the migrations and the seed with the Supabase
CLI (`.github/workflows/database.yml`).
