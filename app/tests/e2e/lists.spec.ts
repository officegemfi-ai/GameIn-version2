// Lists that are longer than a page. A seat's offers, deals, conversations, payments and wallet history are read a
// page at a time, and what waits on a seat is counted by the database: this builds a seat with more offers than a
// page holds and checks that nothing is lost, repeated or miscounted on the way.
import type { Page } from '@playwright/test';
import { expect, onboardBrand, onboardCreator, person, signUp, test, uid } from './support';

const ARRIVES = { timeout: 45_000 };

/**
 * The API as this page's person: the address and the headers are taken from one of the app's own requests, so the
 * test asks the same server as the same signed-in account. Used to set the scene (27 offers) faster than clicking.
 */
async function apiOf(page: Page) {
  const own = page.waitForRequest((r) => {
    const h = r.headers();
    return r.url().includes('/rest/v1/') && !!h.authorization && h.authorization !== `Bearer ${h.apikey}`;
  });
  await page.reload();
  const request = await own;
  const base = `${request.url().split('/rest/v1/')[0]}/rest/v1`;
  const headers = { apikey: request.headers().apikey, authorization: request.headers().authorization, 'content-type': 'application/json' };
  return {
    async get<T>(path: string): Promise<T> {
      const res = await page.request.get(base + path, { headers });
      expect(res.ok(), `${path}: ${await res.text()}`).toBeTruthy();
      return (await res.json()) as T;
    },
    async rpc(fn: string, args: Record<string, unknown>): Promise<void> {
      const res = await page.request.post(`${base}/rpc/${fn}`, { headers, data: args });
      expect(res.ok(), `${fn}: ${await res.text()}`).toBeTruthy();
    },
  };
}

const offerLinks = (page: Page) => page.getByRole('link', { name: /Paged offer \d\d/ });
/** The count beside a place in the navigation, on whichever of the two bars this screen size shows. */
const waiting = (page: Page, n: number) => page.getByLabel(`${n} waiting`).filter({ visible: true });

test('a seat with more offers than a page reads them a page at a time, and its counts are the database’s', async ({ browser }, testInfo) => {
  test.setTimeout(240_000);
  const id = uid();
  const handle = `page${id}`;
  const creator = await person(browser, testInfo);
  const brand = await person(browser, testInfo);
  await signUp(creator, 'creator', `Paige ${id}`, `paige-${id}@gamein.test`);
  await onboardCreator(creator, `Paige ${id}`, handle);
  await signUp(brand, 'brand', 'Lee Brand', `lists-${id}@gamein.test`);
  await onboardBrand(brand, `LISTS ${id.toUpperCase()}`);

  await test.step('the brand sends 27 offers: two more than a page', async () => {
    const api = await apiOf(brand);
    const [seat] = await api.get<{ brand_id: string }[]>('/my_seats?select=brand_id&side=eq.brand');
    const [to] = await api.get<{ id: string }[]>(`/creators?select=id&handle=eq.${handle}`);
    for (let i = 1; i <= 27; i++) {
      await api.rpc('send_offer', {
        p_brand: seat.brand_id, p_creator: to.id, p_title: `Paged offer ${String(i).padStart(2, '0')}`, p_amount_cents: 10_000 + i, p_items: [{ label: 'One stream', days: 3 }],
      });
    }
  });

  await test.step('the brand’s offers open on what it is waiting for: one page, then the rest', async () => {
    await brand.goto('/offers');
    // nothing waits on the brand, 27 wait on the creator: the page opens on those
    await expect(brand.getByRole('tab', { name: /waiting on them/ })).toHaveAttribute('aria-selected', 'true');
    await expect(offerLinks(brand)).toHaveCount(25);
    // soonest deadline first: the first one sent runs out first
    await expect(offerLinks(brand).first()).toContainText('Paged offer 01');
    await brand.getByRole('button', { name: 'show more' }).click();
    await expect(offerLinks(brand)).toHaveCount(27);
    await expect(brand.getByRole('button', { name: 'show more' })).toHaveCount(0);
    // every one of them once
    const titles = await offerLinks(brand).locator('.g-item__title').allTextContents();
    expect(new Set(titles).size).toBe(27);
  });

  await test.step('the creator is told about all 27, wherever the count shows', async () => {
    // on the page the creator already had open: the navigation's count arrives by itself
    await expect(waiting(creator, 27)).toHaveCount(1, ARRIVES);
    await creator.goto('/offers');
    await expect(creator.getByRole('tab', { name: /your turn\s*27/ })).toHaveAttribute('aria-selected', 'true');
    await expect(offerLinks(creator)).toHaveCount(25);
    await creator.getByRole('button', { name: 'show more' }).click();
    await expect(offerLinks(creator)).toHaveCount(27);
    // the dashboard lists the first twenty and says how many more there are
    await creator.goto('/dashboard');
    await expect(creator.getByRole('link', { name: /Answer Paged offer/ })).toHaveCount(20);
    await expect(creator.getByText('and 7 more')).toBeVisible();
  });

  await test.step('answering one moves it: 26 wait, one deal is under way, one offer is closed', async () => {
    await creator.goto('/offers');
    await offerLinks(creator).first().click();
    await creator.getByRole('button', { name: 'accept offer' }).click();
    await creator.getByRole('dialog', { name: 'Accept this offer?' }).getByRole('button', { name: 'accept $100.01' }).click();
    await expect(creator).toHaveURL(/\/deals\/[0-9a-f-]{36}$/);
    await expect(waiting(creator, 26)).toHaveCount(1);
    await creator.goto('/deals');
    await expect(creator.getByRole('tab', { name: /active\s*1/ })).toHaveAttribute('aria-selected', 'true');
    await expect(creator.getByRole('link', { name: /Paged offer 01/ })).toHaveCount(1);
    await creator.goto('/offers');
    await expect(creator.getByRole('tab', { name: /your turn\s*26/ })).toBeVisible();
    await expect(offerLinks(creator).first()).toContainText('Paged offer 02');
    await creator.getByRole('tab', { name: 'closed' }).click();
    await expect(offerLinks(creator)).toHaveCount(1);
    await expect(offerLinks(creator).first()).toContainText('Paged offer 01');
    // and for the brand, without a reload: 26 still out, the accepted one under "closed"
    await brand.getByRole('tab', { name: 'closed' }).click();
    await expect(offerLinks(brand)).toHaveCount(1, ARRIVES);
  });
});
