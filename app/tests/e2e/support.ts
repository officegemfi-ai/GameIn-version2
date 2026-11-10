// Helpers for the end-to-end tests: one browser per person, and the steps every account goes through.
import { test as base, expect, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';

/** The password of every account these tests sign up (test accounts on a local stack only). */
export const PASSWORD = 'e2e-pass-1234';
/** The demo seed's accounts (supabase/seed.sql) share this password; it exists only on local stacks. */
export const DEMO_PASSWORD = 'gamein-demo';
/** Deal d001 of the demo seed: HYPERCORE × Instant Shock. */
export const SEED_DEAL = '/deals/00000000-0000-4000-8000-00000000d001';

let n = 0;
/** Short and unique per run, for emails, handles and names. */
export function uid(): string {
  n += 1;
  return `${Date.now().toString(36).slice(-5)}${n}${Math.random().toString(36).slice(2, 4)}`;
}

const opened: BrowserContext[] = [];

/** The test runner: every browser refetches quickly without Realtime, and each test's extra browsers close with it. */
export const test = base.extend<{ closePeople: void }>({
  context: async ({ context }, use) => {
    await fastFallback(context);
    await use(context);
  },
  closePeople: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await use();
      while (opened.length) await opened.pop()!.close().catch(() => {});
    },
    { auto: true },
  ],
});
export { expect };

/**
 * A browser for one more person, the same size as the project's, signed out. `clockOffsetMs` gives it a device clock
 * that runs that far ahead of (or, negative, behind) the real one, as phones and laptops often do.
 */
export async function person(browser: Browser, testInfo: TestInfo, options: { clockOffsetMs?: number } = {}): Promise<Page> {
  const use = testInfo.project.use;
  const context = await browser.newContext({
    baseURL: use.baseURL,
    viewport: use.viewport,
    deviceScaleFactor: use.deviceScaleFactor,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
  });
  opened.push(context);
  await fastFallback(context);
  if (options.clockOffsetMs) await skewClock(context, options.clockOffsetMs);
  return context.newPage();
}

/** The pages of this browser tell the time `offsetMs` off; timers keep their real pace. */
async function skewClock(context: BrowserContext, offsetMs: number): Promise<void> {
  await context.addInitScript((offset) => {
    const RealDate = Date;
    class SkewedDate extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) super(RealDate.now() + offset);
        else super(...(args as [number]));
      }
      static override now(): number {
        return RealDate.now() + offset;
      }
    }
    (globalThis as { Date: DateConstructor }).Date = SkewedDate as unknown as DateConstructor;
  }, offsetMs);
}

/** Leaving the tab (hidden) or coming back to it (visible), as the page itself hears about it. */
export async function setTabVisible(page: Page, visible: boolean): Promise<void> {
  await page.evaluate((v) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (v ? 'visible' : 'hidden') });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => !v });
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
  }, visible);
}

/** Without Realtime (a bare local stack) the app refetches on a timer instead: quicker in tests. */
export async function fastFallback(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    (window as Window & { __gameinRealtime?: unknown }).__gameinRealtime = { pollMs: 1500, connectTimeoutMs: 3000 };
  });
}

export async function signUp(page: Page, role: 'creator' | 'brand', name: string, email: string): Promise<void> {
  await page.goto('/sign-up');
  await page.getByRole('radio', { name: role, exact: true }).click();
  await page.getByLabel('Your name', { exact: true }).fill(name);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'create account' }).click();
  await expect(page).toHaveURL(/\/onboarding/);
}

export async function onboardCreator(page: Page, name: string, handle: string): Promise<void> {
  await page.getByLabel('Creator name', { exact: true }).fill(name);
  await page.getByLabel('Handle', { exact: true }).fill(handle);
  await page.getByRole('button', { name: 'create my creator profile' }).click();
  await expect(page).toHaveURL(/\/packages$/);
}

export async function onboardBrand(page: Page, name: string): Promise<void> {
  await page.getByLabel('Brand name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'create the brand' }).click();
  await expect(page).toHaveURL(/\/discover$/);
}

export async function signIn(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'sign in' }).click();
}

export async function openSeatMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Switch seat/ }).click();
  await expect(page.getByRole('menu', { name: 'Seats' })).toBeVisible();
}

export async function signOut(page: Page): Promise<void> {
  await openSeatMenu(page);
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'sign in', exact: true }).first()).toBeVisible();
}

/** One deliverable on a deal page: the item of the deal's list that it names. */
export function deliverable(page: Page, label: string) {
  return page.getByRole('listitem').filter({ has: page.getByText(label, { exact: true }) });
}
