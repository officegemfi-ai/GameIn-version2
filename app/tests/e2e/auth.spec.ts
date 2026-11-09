// Joining, signing out and back in, and the mistakes people make on the way.
import { PASSWORD, expect, onboardCreator, signIn, signOut, signUp, test, uid } from './support';

test('join as a creator, sign out, and sign back in', async ({ page }) => {
  const id = uid();
  const name = `Joiner ${id}`;
  const email = `joiner-${id}@gamein.test`;
  await signUp(page, 'creator', name, email);
  await expect(page.getByRole('heading', { name: `Welcome, ${name}` })).toBeVisible();
  await onboardCreator(page, name, `joiner${id}`);
  await expect(page.getByText('Your creator profile is ready.')).toBeVisible();
  await signOut(page);

  // the same email can't join twice
  await page.goto('/sign-up');
  await page.getByLabel('Your name', { exact: true }).fill('Someone Else');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('another-pass-123');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'create account' }).click();
  await expect(page.getByText(/already an account/)).toBeVisible();

  // a wrong password, then the right one
  await signIn(page, email, 'not-the-password');
  await expect(page.getByText('That email and password don’t match.')).toBeVisible();
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: `Hi, ${name}` })).toBeVisible();
});

test('signed-in pages need an account, and the sign-up form checks its fields first', async ({ page }) => {
  await page.goto('/wallet');
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto('/sign-up');
  await page.getByLabel('Your name', { exact: true }).fill('Shorty');
  await page.getByLabel('Email', { exact: true }).fill(`shorty-${uid()}@gamein.test`);
  await page.getByLabel('Password', { exact: true }).fill('short');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'create account' }).click();
  await expect(page.getByText('Use at least 8 characters for the password')).toBeVisible();
  await expect(page).toHaveURL(/\/sign-up$/);
});
