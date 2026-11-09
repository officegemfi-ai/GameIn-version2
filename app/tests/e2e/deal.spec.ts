// The whole marketplace between two brand-new accounts, each in their own browser: a creator lists a package, a
// brand books it, they agree a price, the brand funds escrow, the creator sends proof, the brand approves (and once
// undoes), the money is released, they rate each other and talk, and the creator pays out.
import { deliverable, expect, onboardBrand, onboardCreator, person, signUp, test, uid } from './support';

const withFiles = process.env.GAMEIN_STORAGE === '1'; // the stack has Storage (the Supabase CLI's does)
const withRealtime = process.env.GAMEIN_REALTIME === '1'; // and Realtime
// what one person does shows up on the other's open page: at once over Realtime, or within the app's fallbacks
const ARRIVES = { timeout: 45_000 };

test('a brand books a creator, they agree a price, and the work is paid from escrow', async ({ browser }, testInfo) => {
  test.setTimeout(300_000);
  const id = uid();
  const creatorName = `Nova ${id}`;
  const handle = `nova${id}`;
  const brandName = `ACME ${id.toUpperCase()}`;
  const creator = await person(browser, testInfo);
  const brand = await person(browser, testInfo);
  let dealPath = '';

  await test.step('the creator joins and lists a package', async () => {
    await signUp(creator, 'creator', creatorName, `nova-${id}@gamein.test`);
    await onboardCreator(creator, creatorName, handle);
    await creator.getByRole('button', { name: 'add your first package' }).click();
    const form = creator.getByRole('dialog', { name: 'New package' });
    await form.getByLabel('Title', { exact: true }).fill('Launch week');
    await form.getByLabel('Price', { exact: true }).fill('300');
    await form.getByLabel('Deliverable 1', { exact: true }).fill('Launch stream with logo');
    await form.getByLabel('Days for deliverable 1', { exact: true }).fill('5');
    await form.getByRole('button', { name: 'add a deliverable' }).click();
    await form.getByLabel('Deliverable 2', { exact: true }).fill('Recap clip');
    await form.getByRole('button', { name: 'add package' }).click();
    await expect(form).toBeHidden();
    await expect(creator.getByText('Launch week', { exact: true })).toBeVisible();
    await expect(creator.getByText('$300.00')).toBeVisible();
  });

  await test.step('a brand joins, finds the creator and books the package', async () => {
    await signUp(brand, 'brand', 'Rae Brand', `acme-${id}@gamein.test`);
    await onboardBrand(brand, brandName);
    // the top bar's live dot (hidden on a phone, so checked by its state)
    if (withRealtime) await expect(brand.locator('.g-livedot')).toHaveAttribute('data-state', 'live');
    await brand.getByRole('searchbox', { name: 'Search creators' }).fill(handle);
    await brand.getByRole('link', { name: new RegExp(creatorName) }).click();
    await expect(brand).toHaveURL(new RegExp(`/c/${handle}$`));
    await brand.getByRole('button', { name: 'book', exact: true }).click();
    const dialog = brand.getByRole('dialog', { name: 'Book Launch week' });
    await dialog.getByLabel('A note for the creator (optional)', { exact: true }).fill('Can you go live on Friday?');
    await dialog.getByRole('button', { name: 'book for $300.00' }).click();
    await expect(brand).toHaveURL(/\/offers\/[0-9a-f-]{36}$/);
    await expect(brand.getByText('waiting on the creator').first()).toBeVisible();
  });

  await test.step('the creator counters from their offers', async () => {
    await creator.goto('/offers');
    await creator.getByRole('link', { name: /Launch week/ }).click();
    await expect(creator.getByText('Can you go live on Friday?').first()).toBeVisible();
    await creator.getByRole('button', { name: 'counter' }).click();
    const dialog = creator.getByRole('dialog', { name: 'Counter-offer' });
    await dialog.getByLabel('Price (USD)', { exact: true }).fill('350');
    await dialog.getByLabel('Note (optional)', { exact: true }).fill('Friday works. Both pieces for $350?');
    await dialog.getByRole('button', { name: 'send counter' }).click();
    await expect(dialog).toBeHidden();
    await expect(creator.getByText('waiting on the brand').first()).toBeVisible();
  });

  await test.step('the brand sees the counter arrive and accepts it', async () => {
    // no reload: the open offer updates by itself
    await expect(brand.getByRole('button', { name: 'accept offer' })).toBeVisible(ARRIVES);
    await expect(brand.getByText('Both pieces for $350?').first()).toBeVisible();
    await brand.getByRole('button', { name: 'accept offer' }).click();
    await brand.getByRole('dialog', { name: 'Accept this offer?' }).getByRole('button', { name: 'accept $350.00' }).click();
    await expect(brand).toHaveURL(/\/deals\/[0-9a-f-]{36}$/);
    dealPath = new URL(brand.url()).pathname;
    await expect(brand.getByText('awaiting funding').first()).toBeVisible();
  });

  await test.step('the brand funds all of it by card: $350 plus the 5% fee', async () => {
    await brand.getByRole('button', { name: 'fund escrow' }).click();
    const dialog = brand.getByRole('dialog', { name: 'Fund escrow' });
    await dialog.getByRole('radio', { name: /everything/ }).click();
    await expect(dialog.getByText('$17.50')).toBeVisible();
    await dialog.getByRole('button', { name: 'fund $367.50' }).click();
    await expect(dialog).toBeHidden();
    await expect(brand.getByText('Escrow funded: $350.00 is in escrow.')).toBeVisible();
    await expect(deliverable(brand, 'Launch stream with logo').getByText('in escrow')).toBeVisible();
  });

  await test.step('the creator sends proof for the stream', async () => {
    await creator.goto(dealPath);
    const stream = deliverable(creator, 'Launch stream with logo');
    await stream.getByRole('button', { name: 'send proof' }).click();
    const dialog = creator.getByRole('dialog', { name: 'Proof for Launch stream with logo' });
    await dialog.getByLabel('Link', { exact: true }).fill('https://www.twitch.tv/videos/2299110');
    await dialog.getByLabel('Note (optional)', { exact: true }).fill('Went live Friday at 8pm.');
    await dialog.getByRole('button', { name: 'send proof' }).click();
    await expect(dialog).toBeHidden();
    await expect(stream.getByText('in review')).toBeVisible();
  });

  await test.step('the brand approves it, and the money is released after the undo window', async () => {
    const stream = deliverable(brand, 'Launch stream with logo');
    await expect(stream.getByRole('link', { name: /twitch\.tv\/videos\/2299110/ })).toBeVisible(ARRIVES);
    await stream.getByRole('button', { name: 'approve & release $175.00' }).click();
    await expect(stream.getByText(/Releasing/)).toBeVisible();
    await expect(stream.getByText(`$175.00 released to ${creatorName}.`)).toBeVisible({ timeout: 30_000 });
  });

  await test.step('the creator sends proof for the clip', async () => {
    const clip = deliverable(creator, 'Recap clip');
    await clip.getByRole('button', { name: 'send proof' }).click();
    const dialog = creator.getByRole('dialog', { name: 'Proof for Recap clip' });
    if (withFiles) {
      await dialog.getByLabel('File (optional)', { exact: true }).setInputFiles({ name: 'recap clip.txt', mimeType: 'text/plain', buffer: Buffer.from('recap clip, 45 seconds') });
    } else {
      await dialog.getByLabel('Link', { exact: true }).fill('https://www.tiktok.com/@nova/video/7311');
    }
    await dialog.getByRole('button', { name: 'send proof' }).click();
    await expect(dialog).toBeHidden();
    await expect(clip.getByText('in review')).toBeVisible();
  });

  await test.step('the brand approves, undoes, then approves for good', async () => {
    const clip = deliverable(brand, 'Recap clip');
    await expect(clip.getByText('in review')).toBeVisible(ARRIVES);
    if (withFiles) {
      // the file opens through a signed link that only the deal's two sides can get
      const [tab] = await Promise.all([brand.waitForEvent('popup'), clip.getByRole('button', { name: /open the file: recap-clip\.txt/ }).click()]);
      await expect.poll(() => tab.url()).toContain('/storage/v1/object/sign/proofs/');
      await tab.close();
    } else {
      await expect(clip.getByRole('link', { name: /tiktok\.com/ })).toBeVisible();
    }
    await clip.getByRole('button', { name: 'approve & release $175.00' }).click();
    await clip.getByRole('button', { name: 'undo' }).click();
    await expect(clip.getByRole('button', { name: 'approve & release $175.00' })).toBeVisible();
    await expect(clip.getByText('in review')).toBeVisible();
    await clip.getByRole('button', { name: 'approve & release $175.00' }).click();
    await expect(clip.getByText(`$175.00 released to ${creatorName}.`)).toBeVisible({ timeout: 30_000 });
    await expect(brand.getByText('Complete. Every deliverable was approved and released.')).toBeVisible();
  });

  await test.step('both sides rate the deal', async () => {
    await brand.getByRole('radio', { name: '5 out of 5' }).click();
    await brand.getByLabel('A few words (optional)', { exact: true }).fill('On time and on brand.');
    await brand.getByRole('button', { name: 'send rating' }).click();
    await expect(brand.getByText('Your rating')).toBeVisible();
    await expect(creator.getByText('$166.25 released to your wallet ($175.00 less the $8.75 fee).').first()).toBeVisible();
    await expect(creator.getByText(`${brandName}’s rating`)).toBeVisible(ARRIVES);
    await creator.getByRole('radio', { name: '4 out of 5' }).click();
    await creator.getByRole('button', { name: 'send rating' }).click();
    await expect(creator.getByText('Your rating')).toBeVisible();
  });

  await test.step('they message each other, live', async () => {
    await brand.getByRole('link', { name: 'message', exact: true }).click();
    await expect(brand).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);
    const box = brand.getByLabel(`Message ${creatorName}`, { exact: true });
    await box.fill('Great stream. Same again next month?');
    await box.press('Enter');
    await expect(brand.getByText('Great stream. Same again next month?')).toBeVisible();
    await creator.goto('/messages');
    await creator.getByRole('navigation', { name: 'Conversations' }).getByRole('link', { name: new RegExp(brandName) }).click();
    await expect(creator.getByText('Great stream. Same again next month?')).toBeVisible();
    const reply = creator.getByLabel(`Message ${brandName}`, { exact: true });
    await reply.fill('Count me in.');
    await reply.press('Enter');
    await expect(brand.getByText('Count me in.')).toBeVisible(ARRIVES);
  });

  await test.step('the creator pays out what was released, less GameIn’s 5%', async () => {
    await creator.goto('/wallet');
    await expect(creator.getByText('$332.50').first()).toBeVisible();
    await creator.getByRole('button', { name: 'pay out' }).click();
    const dialog = creator.getByRole('dialog', { name: 'Pay out' });
    await expect(dialog.getByLabel('Amount', { exact: true })).toHaveValue('332.50');
    await dialog.getByRole('button', { name: 'pay out $332.50' }).click();
    await expect(dialog).toBeHidden();
    await expect(creator.getByText('Payout to bank').first()).toBeVisible();
    // test mode pays out at once
    await expect(creator.locator('.g-stat', { hasText: 'Paid out' })).toContainText('$332.50');
    await expect(creator.locator('.g-stat', { hasText: 'Available' })).toContainText('$0.00');
  });
});
