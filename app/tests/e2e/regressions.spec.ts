// Bugs that were found by reading the code and reproduced in a browser before they were fixed. Each test is the
// reproduction: it fails on the code as it was. (The undo window on a fast clock and the message box on a slow
// connection are in deal.spec.ts, where the deal they need already exists.)
import { DEMO_PASSWORD, SEED_DEAL, expect, onboardBrand, openSeatMenu, person, setTabVisible, signIn, signUp, test, uid } from './support';

const ARRIVES = { timeout: 45_000 };

test('an offer or deal opened from another seat says whose it is, and switching shows it from the right side', async ({ page }) => {
  // the demo account is the creator Instant Shock and owns six brands: seven seats, one bell, links from everywhere
  await signIn(page, 'demo@gamein.test', DEMO_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);

  // HYPERCORE's deal with Qwerty2000, which HYPERCORE still has to fund
  await openSeatMenu(page);
  await page.getByRole('menuitemradio', { name: /HYPERCORE/ }).click();
  await page.goto('/deals');
  await page.getByRole('link', { name: /ROCKET LEAGUE CUP WEEK/ }).click();
  await expect(page.getByRole('button', { name: 'fund escrow' })).toBeVisible();
  const deal = new URL(page.url()).pathname;

  // the same link while acting as VOLTEDGE: it used to open as "the brand", with HYPERCORE's fund button
  await openSeatMenu(page);
  await page.getByRole('menuitemradio', { name: /VOLTEDGE/ }).click();
  await expect(page.getByRole('button', { name: 'Acting as VOLTEDGE (brand). Switch seat' })).toBeVisible();
  await page.goto(deal);
  await expect(page.getByRole('heading', { name: 'This deal belongs to another of your seats' })).toBeVisible();
  await expect(page.getByText('You’re acting as VOLTEDGE. Switch to HYPERCORE to see it and act on it.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'fund escrow' })).toHaveCount(0);
  await page.getByRole('button', { name: 'switch to HYPERCORE' }).click();
  await expect(page.getByRole('button', { name: 'Acting as HYPERCORE (brand). Switch seat' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'fund escrow' })).toBeVisible();

  // a deal where the account sits on both sides, opened from a third seat: either of the two will do
  await openSeatMenu(page);
  await page.getByRole('menuitemradio', { name: /VOLTEDGE/ }).click();
  await page.goto(SEED_DEAL);
  await expect(page.getByRole('heading', { name: 'This deal belongs to two of your other seats' })).toBeVisible();
  await expect(page.getByRole('button', { name: /approve & release/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'switch to Instant Shock' }).click();
  await expect(page.getByRole('button', { name: 'Acting as Instant Shock (creator). Switch seat' })).toBeVisible();
  await expect(page.getByText(/to you, less 5%/)).toBeVisible();

  // and a conversation: HYPERCORE's thread with Testy isn't the creator's to read or to mark as read
  await openSeatMenu(page);
  await page.getByRole('menuitemradio', { name: /HYPERCORE/ }).click();
  await page.goto('/messages');
  await page.getByRole('navigation', { name: 'Conversations' }).getByRole('link', { name: /Testy/ }).click();
  await expect(page.getByLabel('Message Testy', { exact: true })).toBeVisible();
  const thread = new URL(page.url()).pathname;
  await openSeatMenu(page);
  await page.getByRole('menuitemradio', { name: /Instant Shock/ }).click();
  await page.goto(thread);
  await expect(page.getByRole('heading', { name: 'This conversation belongs to another of your seats' })).toBeVisible();
  await expect(page.getByLabel('Message Testy', { exact: true })).toHaveCount(0);
});

test('a "review proof" link lands on the proof, however far down a long deal it is', async ({ page }) => {
  await signIn(page, 'manager@hypercore.test', DEMO_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
  // the seed's deal with Instant Shock has 18 deliverables; the one in review is the eighth
  await page.getByRole('link', { name: /Review proof for Mid-roll segment #2/ }).click();
  await expect(page).toHaveURL(/\/deals\/[0-9a-f-]{36}#proof-[0-9a-f-]{36}$/);
  const proof = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: /approve & release/ }) });
  await expect(proof).toBeVisible();
  await expect(proof).toBeInViewport(); // it used to stay at the top of the page, the proof two screens below
});

test('a dashboard says when it couldn’t load, instead of showing $0.00 and "no deals"', async ({ page }) => {
  // the wallet request fails (a dropped connection); the others answer
  await page.route('**/rest/v1/creator_wallet*', (route) => route.abort());
  await signIn(page, 'demo@gamein.test', DEMO_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText('Can’t reach GameIn. Check your connection and try again.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('group', { name: 'Available' })).toHaveCount(0); // not "Available: $0.00"
  await page.unroute('**/rest/v1/creator_wallet*');
  await page.getByRole('button', { name: 'try again' }).click();
  await expect(page.getByRole('group', { name: 'Available' })).toContainText(/\$[\d,]+\.\d\d/);
  await expect(page.getByRole('heading', { name: 'Active deals' })).toBeVisible();
});

test('a brand whose deals couldn’t load isn’t told to book its first creator', async ({ page }) => {
  let asked = 0;
  await page.route('**/rest/v1/deals?*', (route) => {
    asked += 1;
    return route.abort();
  });
  await signIn(page, 'manager@hypercore.test', DEMO_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
  // the error shows once the data client's own retries are spent (seven seconds), not after a second round of them
  await expect(page.getByText('Can’t reach GameIn. Check your connection and try again.')).toBeVisible({ timeout: 15_000 });
  expect(asked).toBeLessThanOrEqual(4);
  await expect(page.getByText('Book your first creator')).toHaveCount(0);
  await expect(page.getByText('No active deals.')).toHaveCount(0);
});

test('a new offer started from a creator’s page can still be pointed at someone else', async ({ page }) => {
  await signIn(page, 'manager@hypercore.test', DEMO_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/c/testy');
  await page.getByRole('link', { name: 'custom offer' }).click();
  await expect(page).toHaveURL(/\/offers\/new\?creator=testy$/);
  await expect(page.getByText('@testy')).toBeVisible();
  await page.getByRole('button', { name: 'change' }).click(); // it used to put Testy straight back
  const search = page.getByPlaceholder('Find a creator by name or handle');
  await expect(search).toBeVisible();
  await search.fill('qwerty');
  await page.getByRole('option', { name: /Qwerty2000/ }).click();
  await expect(page.getByText('@qwerty2000')).toBeVisible();
  await expect(page.getByText('@testy')).toHaveCount(0);
});

test('a brand can be started under any name: long, in another script, or one letter', async ({ page }) => {
  const id = uid();
  await signUp(page, 'brand', 'Long Name', `longname-${id}@gamein.test`);
  // 80 characters are allowed for the name; the web name made from it can only be 40
  const long = `The Really Long Named Esports Energy Drink Company ${id.toUpperCase()}`;
  await onboardBrand(page, long);
  await expect(page.getByRole('button', { name: `Acting as ${long} (brand). Switch seat` })).toBeVisible();

  // a name with nothing a web name can be made from, and one with a single letter of it (each new on every run)
  const kana = [...id].map((c) => String.fromCharCode(0x3041 + parseInt(c, 36))).join('');
  for (const name of [`任天堂 ${kana}`, `X ${kana}`]) {
    await page.goto('/onboarding?role=brand');
    await page.getByLabel('Brand name', { exact: true }).fill(name);
    await page.getByRole('button', { name: 'create the brand' }).click();
    await expect(page).toHaveURL(/\/discover$/);
    await expect(page.getByRole('button', { name: `Acting as ${name} (brand). Switch seat` })).toBeVisible();
  }
});

test('a broken link says so at once, in plain words', async ({ page }) => {
  await signIn(page, 'manager@hypercore.test', DEMO_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
  for (const path of ['/offers/not-a-real-id', '/deals/1234', '/messages/abc']) {
    await page.goto(path);
    // it used to spin for three seconds, then show the database's "invalid input syntax for type uuid"
    await expect(page.getByText('That link doesn’t lead anywhere: part of it is missing or mistyped.')).toBeVisible({ timeout: 2500 });
  }
  await page.goto('/c/*');
  await expect(page.getByText('That creator wasn’t found. Check the address.')).toBeVisible();
});

test('typing into a dialog goes into its field', async ({ page }) => {
  await signIn(page, 'manager@hypercore.test', DEMO_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(SEED_DEAL);
  await page.getByRole('button', { name: 'request changes' }).click();
  const dialog = page.getByRole('dialog', { name: 'Request changes' });
  await expect(dialog).toBeVisible();
  // the cursor used to sit on the close button: the first space typed pressed it
  await page.keyboard.type('Please redo the intro, the logo is cut off.');
  await expect(dialog.getByLabel('What needs to change', { exact: true })).toHaveValue('Please redo the intro, the logo is cut off.');
  await dialog.getByRole('button', { name: 'cancel' }).click();
  await expect(dialog).toBeHidden();
});

test('a message is only "seen" once someone has looked at it', async ({ browser }, testInfo) => {
  const brand = await person(browser, testInfo);
  const creator = await person(browser, testInfo);
  await signIn(brand, 'manager@hypercore.test', DEMO_PASSWORD);
  await expect(brand).toHaveURL(/\/dashboard$/);
  await brand.goto('/messages');
  await brand.getByRole('navigation', { name: 'Conversations' }).getByRole('link', { name: /Testy/ }).click();
  await expect(brand.getByLabel('Message Testy', { exact: true })).toBeVisible();
  const thread = new URL(brand.url()).pathname;

  // the brand leaves the thread open and goes to another tab
  await setTabVisible(brand, false);
  await signIn(creator, 'testy@creators.test', DEMO_PASSWORD);
  await expect(creator).toHaveURL(/\/dashboard$/);
  await creator.goto(thread);
  const text = `Are you there? ${uid()}`;
  const box = creator.getByLabel('Message HYPERCORE', { exact: true });
  await box.fill(text);
  await box.press('Enter');
  await expect(creator.getByText(text)).toBeVisible();
  // it reaches the brand's open page, but nobody is looking at it
  await expect(brand.getByText(text)).toBeVisible(ARRIVES);
  await creator.waitForTimeout(2500);
  await expect(creator.getByText('seen', { exact: true })).toHaveCount(0);

  // the brand comes back to the tab
  await setTabVisible(brand, true);
  await expect(creator.getByText('seen', { exact: true })).toBeVisible(ARRIVES);
});

test('a package whose price changed while a brand was booking it can be booked at the new price', async ({ browser }, testInfo) => {
  const brand = await person(browser, testInfo);
  const creator = await person(browser, testInfo);
  await signIn(brand, 'manager@hypercore.test', DEMO_PASSWORD);
  await expect(brand).toHaveURL(/\/dashboard$/);
  await brand.goto('/c/instantshock');
  const card = brand.getByRole('article').filter({ has: brand.getByRole('heading', { name: 'CODES: SHOCK10 — 1 MONTH', exact: true }) });
  const was = (await card.locator('.g-package__price').innerText()).trim();
  await card.getByRole('button', { name: 'book', exact: true }).click();
  const dialog = brand.getByRole('dialog', { name: 'Book CODES: SHOCK10 — 1 MONTH' });
  await expect(dialog.getByRole('button', { name: `book for ${was}` })).toBeVisible();

  // meanwhile the creator raises the price by a dollar
  const dollars = Number(was.replace(/[$,]/g, '')) + 1;
  const now = `$${dollars.toFixed(2)}`;
  await signIn(creator, 'demo@gamein.test', DEMO_PASSWORD);
  await expect(creator).toHaveURL(/\/dashboard$/);
  await creator.goto('/packages');
  await creator.getByRole('article').filter({ has: creator.getByRole('heading', { name: 'CODES: SHOCK10 — 1 MONTH', exact: true }) }).getByRole('button', { name: 'edit' }).click();
  const form = creator.getByRole('dialog', { name: 'Edit package' });
  await form.getByLabel('Price', { exact: true }).fill(dollars.toFixed(2));
  await form.getByRole('button', { name: 'save', exact: true }).click();
  await expect(form).toBeHidden();

  // the brand's old price is refused, and the dialog now offers the new one (it used to keep offering the old)
  await dialog.getByRole('button', { name: `book for ${was}` }).click();
  await expect(brand.getByText(`The price of this package is now ${now}. Check it and book again`)).toBeVisible();
  await dialog.getByRole('button', { name: `book for ${now}` }).click();
  await expect(brand).toHaveURL(/\/offers\/[0-9a-f-]{36}$/);
  await expect(brand.getByText(now).first()).toBeVisible();
});

test('what’s typed for one conversation stays with it, and isn’t in the next one’s box', async ({ page }) => {
  // the creator Instant Shock talks to five brands
  await signIn(page, 'demo@gamein.test', DEMO_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('button', { name: 'Acting as Instant Shock (creator). Switch seat' })).toBeVisible();
  await page.goto('/messages');
  const list = page.getByRole('navigation', { name: 'Conversations' });
  await expect(list).toBeVisible();
  const box = (name: string) => page.getByLabel(`Message ${name}`, { exact: true });
  const open = async (name: string) => {
    // on a phone the open conversation covers the list: back to the list first
    if (!(await list.isVisible())) await page.getByRole('link', { name: 'All conversations' }).click();
    await list.getByRole('link', { name: new RegExp(name) }).click();
    await expect(box(name)).toBeVisible();
  };
  // both conversations have been looked at, as on any working day (the page has them at hand from then on)
  await open('VOLTEDGE');
  await open('GRIDFUEL');
  await open('VOLTEDGE');
  const draft = 'For you I can do $2,000, less than GRIDFUEL pays';
  await box('VOLTEDGE').fill(draft);

  // a glance at the other conversation: the text used to be sitting in its box, one Enter from GRIDFUEL
  await open('GRIDFUEL');
  await expect(box('GRIDFUEL')).toHaveValue('');
  // and it is still where it was written
  await open('VOLTEDGE');
  await expect(box('VOLTEDGE')).toHaveValue(draft);
});

test('a sheet opened for one offer is gone when Back leads to another offer', async ({ browser }, testInfo) => {
  const brand = await person(browser, testInfo);
  const creator = await person(browser, testInfo);
  // HYPERCORE books one of Instant Shock's packages: a new offer, and a notification about it on top of the bell
  await signIn(brand, 'manager@hypercore.test', DEMO_PASSWORD);
  await expect(brand).toHaveURL(/\/dashboard$/);
  await brand.goto('/c/instantshock');
  const card = brand.getByRole('article').filter({ has: brand.getByRole('heading', { name: 'CODES: SHOCK10 — 1 MONTH', exact: true }) });
  await card.getByRole('button', { name: 'book', exact: true }).click();
  await brand.getByRole('dialog', { name: 'Book CODES: SHOCK10 — 1 MONTH' }).getByRole('button', { name: /^book for/ }).click();
  await expect(brand).toHaveURL(/\/offers\/[0-9a-f-]{36}$/);
  const booked = new URL(brand.url()).pathname;

  // the creator is looking at GRIDFUEL's offer when it comes in, and presses the notification
  await signIn(creator, 'demo@gamein.test', DEMO_PASSWORD);
  await expect(creator).toHaveURL(/\/dashboard$/);
  await creator.goto('/offers');
  await creator.getByRole('link', { name: /XMAS STREAM LOGO CAMPAIGN/ }).click();
  await expect(creator.getByRole('heading', { name: 'XMAS STREAM LOGO CAMPAIGN' })).toBeVisible();
  await creator.getByRole('button', { name: /^Notifications/ }).click();
  await creator.getByRole('region', { name: 'Notifications' }).locator(`a[href$="${booked}"]`).first().click();
  await expect(creator).toHaveURL(new RegExp(`${booked}$`));
  await expect(creator.getByRole('heading', { name: 'CODES: SHOCK10 — 1 MONTH' })).toBeVisible();

  // a decline for HYPERCORE's offer, half written, and the phone's Back to get out of the sheet
  await creator.getByRole('button', { name: 'decline', exact: true }).click();
  await creator.getByRole('dialog').getByLabel(/^Reason/).fill('Not at this price, HYPERCORE.');
  await creator.goBack();
  await expect(creator.getByRole('heading', { name: 'XMAS STREAM LOGO CAMPAIGN' })).toBeVisible();
  // the sheet used to stay open over GRIDFUEL's offer with HYPERCORE's reason in it: "decline" declined the wrong one
  await expect(creator.getByRole('dialog')).toHaveCount(0);
  await expect(creator.getByRole('button', { name: 'accept offer' })).toBeVisible();
  // and Forward shows HYPERCORE's offer afresh, not mid-decline
  await creator.goForward();
  await expect(creator.getByRole('heading', { name: 'CODES: SHOCK10 — 1 MONTH' })).toBeVisible();
  await expect(creator.getByRole('dialog')).toHaveCount(0);
});
