// One account, several seats: the demo account is the creator Instant Shock and the owner of six brands.
import { DEMO_PASSWORD, expect, openSeatMenu, signIn, test } from './support';

test('switch between being a creator and being one of your brands', async ({ page }, testInfo) => {
  await signIn(page, 'demo@gamein.test', DEMO_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('button', { name: 'Acting as Instant Shock (creator). Switch seat' })).toBeVisible();

  await openSeatMenu(page);
  await page.getByRole('menuitemradio', { name: /HYPERCORE/ }).click();
  await expect(page.getByRole('button', { name: 'Acting as HYPERCORE (brand). Switch seat' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'HYPERCORE', exact: true })).toBeVisible();

  // the brand's pages, reached the way a person would on this screen size
  const nav = page.getByRole('navigation', { name: 'Main' });
  if (testInfo.project.name === 'phone') {
    await nav.getByRole('button', { name: 'More' }).click();
    await page.getByRole('dialog', { name: 'More' }).getByRole('link', { name: 'Payments' }).click();
  } else {
    await nav.getByRole('link', { name: 'Payments' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Payments', level: 1 })).toBeVisible();
  await expect(page.getByText('HYPERCORE’s money in escrow, and every payment into it.')).toBeVisible();

  // the choice sticks after a reload
  await page.reload();
  await expect(page.getByRole('button', { name: 'Acting as HYPERCORE (brand). Switch seat' })).toBeVisible();

  await openSeatMenu(page);
  await page.getByRole('menuitemradio', { name: /Instant Shock/ }).click();
  await page.goto('/wallet');
  await expect(page.getByRole('heading', { name: 'Wallet' })).toBeVisible();
});
