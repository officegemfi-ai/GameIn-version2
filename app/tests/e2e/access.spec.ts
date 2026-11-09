// Who may see what. The database's row-level security decides; these check the app shows it plainly.
import { DEMO_PASSWORD, SEED_DEAL, expect, onboardBrand, signIn, signUp, test, uid } from './support';

test('signed out, a deal link leads to sign-in and back to the deal', async ({ page }) => {
  await page.goto(SEED_DEAL);
  await expect(page).toHaveURL(/\/sign-in$/);
  await signIn(page, 'manager@hypercore.test', DEMO_PASSWORD);
  await expect(page).toHaveURL(new RegExp(`${SEED_DEAL}$`));
  await expect(page.getByRole('heading', { name: 'ULTIMATE PACKAGE Q3' })).toBeVisible();
});

test('another brand can’t open someone else’s deal, and sees none of their money', async ({ page }) => {
  const id = uid();
  await signUp(page, 'brand', 'Outsider', `outsider-${id}@gamein.test`);
  await onboardBrand(page, `OUTSIDER ${id.toUpperCase()}`);
  await page.goto(SEED_DEAL);
  await expect(page.getByText('That deal wasn’t found. It may have been removed, or it isn’t yours to see.')).toBeVisible();
  await page.goto('/deals');
  await expect(page.getByText('No active deals')).toBeVisible();
  await page.goto('/payments');
  await expect(page.getByText('No payments yet')).toBeVisible();
});
