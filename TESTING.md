# Testing the GameIn prototype

The prototype is one page with two seats: **Instant Shock** (the creator) and any **brand**. Both seats share every offer, deal, escrow payment, proof, payout, renewal, rating and message. These tests prove the two seats agree, on a desktop browser and a phone browser, down to the cent.

They run on GitHub on every push and pull request (`.github/workflows/tests.yml`): a desktop job and a phone job side by side. Each job's summary page shows the rules table, and the full report is attached to the run as `gamein-test-report-desktop` and `gamein-test-report-phone`. There are no retries: a test that only passes on a second try counts as failed.

## The rules

`tests/rules.json` lists every rule the tests check: 46 rules across the switch (S), offers (O), deals and escrow (E), proof (P), money (M), renewals (R), ratings (T), messages (C), packages (K) and saved data (D). Each test's title starts with the rule IDs it proves, and `tests/support/rules-reporter.js` turns a run into `test-results/rules.md`: every rule, desktop and phone, pass or fail, and why.

The money rules, which the tests implement a second time on their own in `tests/support/money.js`:

- The brand pays each milestone plus a **5% brand fee**. The creator receives **95%** of each release (a 5% creator fee).
- Fees are 5% of the **running total per deal**, rounded to the cent once (half up). Funding or releasing in parts costs exactly the same as all at once.
- A deal's price is split over its deliverables in whole cents: every share is rounded down, the last one takes the rest. A property test checks 3,000 random prices.
- Money is released only for approved proof, and never more than is in escrow. On the creator's existing (seeded) deals, each approved deliverable releases an even share of what its own period has in escrow, rounded down to the cent (a monthly deal's current month, never next month's or a renewal's money), and the last one releases what's left once that period is fully funded.
- Money is conserved: funded = in escrow + released, on every screen of both seats. Nothing released beyond what was in escrow may disappear into a capped total: the check fails on it.
- Both seats agree on every deal: the brand's receipts charge for exactly the milestones it funded (one receipt per payment), and the creator was paid exactly what the brand's deal shows as released.

After every scenario, `checkMoney` (`tests/support/app.js`) first checks every rule in `tests/support/invariants.js` against the saved data (offers, deals, payments, proofs, seeded deals, payouts), then reads every money figure on the brand's and the creator's screens and compares it to the cent.

## Running them

```bash
npm ci
npx playwright install --with-deps chromium
npx playwright test                    # desktop and phone
npx playwright test --project=phone    # phone only
npx playwright test tests/05-money.spec.js
```

The tests start a small web server for `index.html`. To test a single-file build instead, point them at it:

```bash
GAMEIN_URL=http://127.0.0.1:8820/v62.html npx playwright test
```

`tests/09-random.spec.js` plays hundreds of random actions from both seats with fixed seeds and checks the rules after every step. It also tries the moves the rules block (anything on a closed or expired offer, approving a proof that is already releasing or released) and lets time pass between steps with Playwright's clock: release windows run out and whole reply windows go by. To replay a failure, run it with the seed from the message, e.g. `GAMEIN_SEEDS=21 npx playwright test tests/09-random.spec.js`.

## How the tests drive the app

- Actions go through the real buttons and forms: offer cards, the fund-escrow dialog, the proof upload sheet, approve and release, the renewal and rating dialogs, the top-bar switch.
- Getting to a page or tab uses the app's own router, the same call the menu links make.
- Setting up a situation (an offer at a given price, a funded deal) and checking that blocked moves are refused uses `window.GameInBX.api`: the same guarded engine functions the buttons call. Every blocked move is checked twice: the button isn't offered, and the engine refuses it anyway.
- The cookie banner, guided tour and tips are hidden or marked as seen, because they sit on top of the page.

## Two tabs

Both seats can be open in two tabs of one browser. Every save carries a revision and the revisions it was built on. Before every tap, key press, timer and engine call a tab takes in any save it hasn't seen; if two tabs saved at the same moment, the tab whose save was overwritten merges both (by offer, deal, proof and receipt id, message by message) and saves again.

When both tabs change the same thing at once, the merge settles it before anything is saved:

- An acceptance stands over a counter, a decline or a withdrawal made at the same moment, and a deal exists only for an accepted offer.
- Two payments for the same milestone: the milestone is paid once, by the payment already in escrow, or else the one made first. The other payment keeps its other milestones and its receipt charges only for those, with the fees worked out again on the deal's running total. Nothing is charged twice, and a milestone a tab saw in escrow stays in escrow, so proof uploaded against it keeps its money.
- One live proof per deliverable: the most advanced one stays (released, then releasing, then in review), otherwise the first upload. Nothing is paid twice.
- Otherwise the tab that takes in the other's save keeps its own move: in practice the move saved first (approve against request changes, for example).
- If a tab can't find the state both saves started from, it keeps everything both tabs hold rather than dropping either one's changes.
- And approving needs the deliverable's money in escrow, checked again when the undo window ends, so no merge can release money that isn't there.

`tests/08-data.spec.js` has both tabs write as fast as they can at the same time and checks that nothing is lost. It then plays each of those collisions in both orders: each tab is held back from the other's saves (`GameInBX.api.hold`, standing in for the browser holding them back while a tab is writing), both act, both catch up, and the test checks that the two tabs and what's saved agree, every rule holds, and the money is right to the cent.

## Every button

`tests/inventory.spec.js` opens 20 places in both views from a fresh demo, lists every visible control, clicks each one from a fresh demo and records what it did. It runs on demand (`npm run inventory`, or Actions → Button inventory) and every Monday, writes `test-results/inventory/inventory-<browser>.md`, and fails only if a control throws a JavaScript error.

## The 15-minute user test

`tests/10-usertest.spec.js` walks the usability test mode the way a participant does, for both task sets, so the script handed to testers is known to work: each task's other-side move is prepared, completion is detected, and the session ends in the moderator panel.

## What isn't covered

The prototype has no server: data lives in the browser's local storage, so "both sides" means two seats or two tabs in one browser, not two people on two devices. Payments, bank clearing and wires are simulated (`clears (demo)`, `received (demo)`).
