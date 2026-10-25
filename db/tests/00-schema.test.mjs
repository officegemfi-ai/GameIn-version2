// The schema itself: row-level security everywhere, nothing callable that shouldn't be, and the money arithmetic
// (M1 splits, M2/M3 fees) against the prototype's own formulas for thousands of amounts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './harness.mjs';
import { js } from './fixtures.mjs';

const ACTIONS = [
  'accept_offer', 'answer_renewal', 'approve_proof', 'book_again', 'book_package', 'counter_offer', 'create_brand',
  'create_creator_profile', 'decline_offer', 'finalize_release', 'fund_milestones', 'mark_notifications_read',
  'mark_read', 'offer_renewal', 'pitch_offer', 'rate_deal', 'request_changes', 'request_payout', 'request_renewal',
  'send_message', 'send_offer', 'simulate_payment', 'submit_proof', 'undo_approval', 'withdraw_offer', 'withdraw_renewal',
];
const MATH = ['fee_step', 'five_percent', 'instant_payout_fee', 'items_valid', 'split_cents'];
const BACKEND = ['complete_payout', 'confirm_payment', 'expire_offers', 'fail_payment', 'release_due'];

test('schema: row-level security, grants and arithmetic', async (t) => {
  const db = await freshDb();
  try {
    await t.test('every table has row-level security on', async () => {
      const rows = await db.q(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
                               where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
      assert.deepEqual(rows, []);
    });

    await t.test('signed-in users can call the actions and the arithmetic, nothing else', async () => {
      const rows = await db.q(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                               where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')
                               order by 1`);
      assert.deepEqual(rows.map((r) => r.proname), [...ACTIONS, ...MATH].sort());
    });

    await t.test('visitors can only call the arithmetic', async () => {
      const rows = await db.q(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                               where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') order by 1`);
      assert.deepEqual(rows.map((r) => r.proname), MATH);
    });

    await t.test('the backend-only functions need the service key', async () => {
      for (const fn of BACKEND) {
        const r = await db.one(`select has_function_privilege('authenticated', p.oid, 'execute') as a,
                                       has_function_privilege('service_role', p.oid, 'execute') as s
                                from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                where n.nspname = 'public' and p.proname = $1`, [fn]);
        assert.deepEqual(r, { a: false, s: true }, fn);
      }
    });

    await t.test('of the private helpers, signed-in users can only call the read-only ones the access rules use', async () => {
      const rows = await db.q(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                               where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute') order by 1`);
      assert.deepEqual(rows.map((r) => r.proname), ['can_read_proof', 'can_upload_proof', 'deal_of_path', 'is_admin',
        'is_brand_member', 'is_creator_owner', 'my_brand_ids', 'my_creator_ids', 'my_deal_ids', 'waiting_on']);
    });

    await t.test('every action runs as its owner with a fixed search path', async () => {
      const rows = await db.q(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                               where n.nspname = 'public' and p.proname = any ($1)
                                 and not (p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path=public, pg_temp%')`,
                              [[...ACTIONS, ...BACKEND]]);
      assert.deepEqual(rows, []);
    });

    await t.test('M1: splits add up to the cent, every part but the last rounded down', async () => {
      const cases = [];
      for (let n = 1; n <= 20; n++) for (const total of [n, n + 1, 99, 100, 101, 999, 1001, 27450, 53840, 100001, 1234567, 99999999]) {
        if (total >= n) cases.push([total, n]);
      }
      for (let i = 0; i < 300; i++) {
        const n = 1 + Math.floor(Math.random() * 20);
        cases.push([n + Math.floor(Math.random() * 5_000_000), n]);
      }
      const rows = await db.q('select t, n, public.split_cents(t, n) as parts from unnest($1::bigint[], $2::int[]) as x(t, n)',
        [cases.map((c) => c[0]), cases.map((c) => c[1])]);
      for (const r of rows) {
        const parts = r.parts.map(Number);
        assert.deepEqual(parts, js.split(Number(r.t), r.n), `split ${r.t} in ${r.n}`);
        assert.equal(parts.reduce((a, b) => a + b, 0), Number(r.t));
        assert.ok(parts.every((p) => p > 0));
      }
    });

    await t.test('M2, M3: 5% rounded half up, and fees on a running total add up to 5% of the total', async () => {
      const amounts = Array.from({ length: 4000 }, (_, i) => i).concat([9999, 10010, 27450, 33333, 100001, 123456789]);
      const rows = await db.q('select a, public.five_percent(a) as f from unnest($1::bigint[]) as a', [amounts]);
      for (const r of rows) assert.equal(r.f, js.fee(Number(r.a)), `5% of ${r.a}`);
      for (let k = 0; k < 200; k++) {
        const parts = Array.from({ length: 1 + Math.floor(Math.random() * 8) }, () => 1 + Math.floor(Math.random() * 100000));
        const r = await db.one(`select sum(public.fee_step(coalesce(before, 0)::bigint, x))::bigint as fees, public.five_percent(sum(x)::bigint) as whole
                                from (select x, sum(x) over (order by i rows between unbounded preceding and 1 preceding) as before
                                      from unnest($1::bigint[]) with ordinality as u(x, i)) s`, [parts]);
        assert.equal(r.fees, r.whole, `fees on ${parts}`);
        assert.equal(r.whole, js.fee(parts.reduce((a, b) => a + b, 0)));
      }
    });

    await t.test('instant payouts cost 1.5%, rounded half up', async () => {
      const amounts = Array.from({ length: 3000 }, (_, i) => i * 7 + 1);
      const rows = await db.q('select a, public.instant_payout_fee(a) as f from unnest($1::bigint[]) as a', [amounts]);
      for (const r of rows) assert.equal(r.f, Math.floor((Number(r.a) * 3 + 100) / 200), `1.5% of ${r.a}`);
      assert.equal((await db.one('select public.instant_payout_fee(95001) as f')).f, 1425);
      assert.equal((await db.one('select public.instant_payout_fee(1034) as f')).f, 16);
    });

    await t.test('deliverables lists: 1 to 20 items with a name', async () => {
      const ok = (v) => db.one('select public.items_valid($1::jsonb) as ok', [JSON.stringify(v)]).then((r) => r.ok);
      assert.equal(await ok([{ label: 'A' }]), true);
      assert.equal(await ok([{ label: 'A', days: 7 }]), true);
      assert.equal(await ok([]), false);
      assert.equal(await ok([{ label: ' ' }]), false);
      assert.equal(await ok([{ label: 'A', days: 0 }]), false);
      assert.equal(await ok([{ label: 'A', days: 'x' }]), false);
      assert.equal(await ok(Array.from({ length: 21 }, (_, i) => ({ label: 'D' + i }))), false);
      assert.equal(await ok({ label: 'A' }), false);
    });
  } finally {
    await db.close();
  }
});
