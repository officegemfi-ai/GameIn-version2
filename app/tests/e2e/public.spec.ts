// What a visitor sees before joining.
import { expect, test } from './support';

test('a visitor browses the landing page and a creator’s public page', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Brands book creators/ })).toBeVisible();
  await expect(page.getByText('5% from each side, nothing else')).toBeVisible();
  await page.getByRole('link', { name: /Instant Shock/ }).click();
  await expect(page).toHaveURL(/\/c\/instantshock$/);
  await expect(page.getByRole('heading', { name: 'Instant Shock' })).toBeVisible();
  await expect(page.getByText('ULTIMATE PROMOTING PACKAGE')).toBeVisible();
  await page.getByRole('link', { name: 'join as a brand to book' }).click();
  await expect(page).toHaveURL(/\/sign-up\?role=brand$/);
  await expect(page.getByRole('radio', { name: 'brand', exact: true })).toHaveAttribute('aria-checked', 'true');
});

test('unknown addresses get a page that says so', async ({ page }) => {
  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await page.goto('/c/nobody-by-this-name');
  await expect(page.getByText('That creator wasn’t found. It may have been removed, or it isn’t yours to see.')).toBeVisible();
});
