// Who can see and do what: row-level security for each seat, outsiders and visitors, writes that only the action
// functions may make, the backend-only functions, Storage, and the ledger.
import assert from 'node:assert/strict';
import { refusal } from './harness.mjs';
import { dbTest, DEMO } from './fixtures.mjs';

const count = async (actor, table) => (await actor.query(`select count(*)::int as n from public.${table}`))[0].n;

const DEAL_TABLES = ['offers', 'offer_versions', 'deals', 'milestones', 'deliverables', 'proofs', 'releases',
  'conversations', 'messages', 'events'];

async function busyDeal(w) {
  const deal = await w.deal({ amount: 100001 });
  await w.fund(deal, 'card', 'next');
  await w.B.rpc('send_message', { p_brand: w.brand, p_creator: w.creator, p_as: 'brand', p_body: 'Hi' });
  const proof = await w.deliver(deal, 1);
  await w.release(proof);
  await w.C.rpc('request_payout', { p_creator: w.creator, p_amount_cents: 1000 });
  return deal;
}

dbTest('outsiders see nothing of a deal between others; the parties see all of it', async (w) => {
  await busyDeal(w);
  for (const t of DEAL_TABLES) {
    assert.equal(await count(w.X, t), 0, `outsider sees ${t}`);
    assert.ok(await count(w.B, t) > 0, `brand sees ${t}`);
    assert.ok(await count(w.C, t) > 0, `creator sees ${t}`);
  }
  for (const v of ['offer_board', 'deal_money', 'conversation_timeline', 'todos', 'wallet_lines', 'creator_wallet', 'brand_money']) {
    const rows = await w.X.query(`select * from public.${v}`);
    assert.ok(rows.every((r) => r.brand_id !== w.brand && r.creator_id !== w.creator), `outsider sees ${v}`);
  }
});

dbTest('money privacy: payments are the brand\'s, payouts the creator\'s, the ledger GameIn staff\'s', async (w) => {
  await busyDeal(w);
  assert.equal(await count(w.B, 'payments'), 1);
  assert.equal(await count(w.C, 'payments'), 0);
  assert.equal(await count(w.C, 'payment_milestones'), 0);
  assert.equal(await count(w.C, 'payouts'), 1);
  assert.equal(await count(w.B, 'payouts'), 0);
  assert.equal(await count(w.B, 'ledger_entries'), 0);
  assert.equal(await count(w.C, 'ledger_entries'), 0);
  // GameIn staff see every deal and the ledger
  await w.db.q('insert into public.platform_admins (user_id) values ($1)', [w.X.id]);
  assert.ok(await count(w.X, 'ledger_entries') > 0);
  assert.equal(await count(w.X, 'deals'), 1);
  assert.equal(await count(w.X, 'payments'), 1);
});

dbTest('a brand\'s people see that brand\'s deals only: the HYPERCORE manager sees HYPERCORE\'s, not NEXAWEAR\'s', async (w) => {
  const deals = await w.manager.query('select demo_key from public.deals order by demo_key');
  assert.deepEqual(deals.map((d) => d.demo_key), ['bx1', 'bx2', 'sp1']);
  const all = await w.demo.query('select demo_key from public.deals order by demo_key');
  assert.deepEqual(all.map((d) => d.demo_key), ['bx1', 'bx2', 'sp1', 'sp2', 'sp3']);
  const qwerty = await w.db.userByEmail('qwerty2000@creators.test');
  assert.deepEqual((await qwerty.query('select demo_key from public.deals')).map((d) => d.demo_key), ['bx1']);
  assert.equal((await refusal(w.manager.rpc('fund_milestones', { p_deal: DEMO.sp2, p_method: 'card' }))).code, '42501');
  // ...and may act for HYPERCORE: approve the proof waiting on ULTIMATE PACKAGE Q3
  const inReview = (await w.db.one("select id from public.proofs where status = 'in_review'")).id;
  assert.ok(await w.manager.rpc('approve_proof', { p_proof: inReview }));
  await w.manager.rpc('undo_approval', { p_proof: inReview });
}, { seed: true });

dbTest('visitors (not signed in) browse creators, brands, active packages and open campaigns, nothing else', async (w) => {
  const anon = w.db.anon();
  assert.equal(await count(anon, 'creators'), 6);
  assert.equal(await count(anon, 'brands'), 6);
  assert.equal(await count(anon, 'packages'), 5);
  assert.equal(await count(anon, 'campaigns'), 0);
  for (const t of ['offers', 'deals', 'milestones', 'payments', 'profiles', 'messages', 'ledger_entries', 'offer_board', 'deal_money']) {
    assert.equal((await refusal(anon.query(`select * from public.${t}`))).code, '42501', t);
  }
  assert.equal((await refusal(anon.rpc('accept_offer', { p_offer: DEMO.sp1, p_as: 'creator' }))).code, '42501');
}, { seed: true });

dbTest('nobody writes deal or money tables directly, not even the parties: only the action functions do', async (w) => {
  const deal = await busyDeal(w);
  const [m] = await w.milestones(deal);
  const attempts = [
    ['insert into public.offers (brand_id, creator_id, title, status, expires_at, created_by) values ($1, $2, $3, $4, now(), $5)',
      [w.brand, w.creator, 'x', 'sent', w.B.id]],
    ["update public.deals set status = 'completed', completed_at = now() where id = $1", [deal]],
    ["update public.milestones set status = 'released', released_cents = amount_cents where id = $1", [m.id]],
    ['delete from public.proofs where deal_id = $1', [deal]],
    ["insert into public.releases (proof_id, deal_id, milestone_id, creator_id, gross_cents, fee_cents, net_cents, released_at) select id, deal_id, milestone_id, $2, 1, 0, 1, now() from public.proofs where deal_id = $1",
      [deal, w.creator]],
    ['insert into public.ledger_entries (txn_id, account, amount_cents) values (gen_random_uuid(), $1, 100)', [`creator:${w.creator}`]],
    ["update public.payments set status = 'succeeded'", []],
    ['insert into public.payouts (creator_id, amount_cents, net_cents) values ($1, 100, 100)', [w.creator]],
    ['insert into public.brand_members (brand_id, user_id) values ($1, $2)', [w.brand, w.X.id]],
    ['update public.offer_versions set amount_cents = 1', []],
    ['insert into public.notifications (user_id, kind) values ($1, $2)', [w.B.id, 'fake']],
  ];
  for (const actor of [w.B, w.C, w.X]) {
    for (const [sql, params] of attempts) {
      const r = await refusal(actor.query(sql, params));
      assert.equal(r.code, '42501', `${actor.name}: ${sql.slice(0, 60)}`);
    }
  }
});

dbTest('the private helpers and the backend-only functions are out of reach of signed-in people', async (w) => {
  for (const sql of [
    "select private.log_event('fake', 'brand', null, null)",
    "select private.post_ledger(array['fees'], array[0::bigint], 'x')",
    'select private.finalize_release(gen_random_uuid())',
    "select private.add_renewal_period(gen_random_uuid(), gen_random_uuid())",
    'select * from private.audit_money()',
    'select * from private.settings',
  ]) {
    assert.equal((await refusal(w.B.query(sql))).code, '42501', sql);
  }
  for (const fn of ['release_due', 'expire_offers']) {
    assert.equal((await refusal(w.B.rpc(fn))).code, '42501', fn);
  }
});

dbTest('profiles, creator profiles, packages, brands and campaigns: each person edits only their own', async (w) => {
  await w.C.query("update public.profiles set display_name = 'Shock' where id = $1", [w.C.id]);
  assert.equal((await w.db.one('select display_name from public.profiles where id = $1', [w.C.id])).display_name, 'Shock');
  await w.X.query("update public.profiles set display_name = 'hacked' where id = $1", [w.C.id]);
  assert.equal((await w.db.one('select display_name from public.profiles where id = $1', [w.C.id])).display_name, 'Shock',
    'someone else\'s profile is out of reach');
  await w.X.query("update public.creators set bio = 'hacked' where id = $1", [w.creator]);
  assert.equal((await w.db.one('select bio from public.creators where id = $1', [w.creator])).bio, '');
  assert.equal((await refusal(w.C.query('update public.creators set owner_id = $1 where id = $2', [w.X.id, w.creator]))).code, '42501');
  await w.X.query("update public.brands set name = 'hacked' where id = $1", [w.brand]);
  assert.equal((await w.db.one('select name from public.brands where id = $1', [w.brand])).name, 'VOLTEDGE');
  assert.equal((await refusal(w.B.query("update public.brands set verified = true where id = $1", [w.brand]))).code, '42501');
  await w.B.query("update public.brands set logo_url = 'https://x.test/logo.png' where id = $1", [w.brand]);
  assert.equal((await refusal(w.X.query(
    "insert into public.campaigns (brand_id, title, budget_cents, items) values ($1, 'x', 100, '[{\"label\": \"a\"}]')", [w.brand]))).code, '42501');
  // one creator profile each, and handles are unique
  assert.equal((await refusal(w.C.rpc('create_creator_profile', { p_handle: 'second', p_display_name: 'Second' }))).rule, 'account');
  const Y = await w.db.user('Someone');
  assert.equal((await refusal(Y.rpc('create_creator_profile', { p_handle: 'InstantShock', p_display_name: 'Copy' }))).rule, 'account');
  assert.equal((await refusal(Y.rpc('create_brand', { p_name: 'voltedge' }))).rule, 'account');
});

dbTest('Storage: the deal\'s creator uploads proof files to the deal\'s folder; both parties can open them', async (w) => {
  const deal = await w.deal();
  const other = await w.X.rpc('send_offer', { p_brand: w.otherBrand, p_creator: w.otherCreator, p_title: 'x', p_amount_cents: 100, p_items: [{ label: 'a' }] });
  const otherDeal = await w.X.rpc('accept_offer', { p_offer: other, p_as: 'creator' });
  const put = (actor, name) => actor.query("insert into storage.objects (bucket_id, name, owner) values ('proofs', $1, auth.uid()) returning name", [name]);
  await put(w.C, `${deal}/launch-stream.mp4`);
  assert.equal((await refusal(put(w.C, `${otherDeal}/x.mp4`))).code, '42501', 'not into someone else\'s deal');
  assert.equal((await refusal(put(w.B, `${deal}/x.mp4`))).code, '42501', 'the brand doesn\'t upload proof');
  assert.equal((await refusal(put(w.C, 'not-a-deal/x.mp4'))).code, '42501');
  assert.equal((await refusal(put(w.X, `${deal}/x.mp4`))).code, '42501');
  const see = (actor) => actor.query("select name from storage.objects where bucket_id = 'proofs'");
  assert.deepEqual((await see(w.B)).map((o) => o.name), [`${deal}/launch-stream.mp4`]);
  assert.deepEqual((await see(w.C)).map((o) => o.name), [`${deal}/launch-stream.mp4`]);
  assert.deepEqual(await see(w.X), []);
  // nobody overwrites or deletes evidence
  await w.C.query("update storage.objects set name = name || '.old'");
  await w.C.query("delete from storage.objects");
  assert.equal((await w.db.q('select count(*)::int as n from storage.objects'))[0].n, 1);
  const [bucket] = await w.db.q("select public from storage.buckets where id = 'proofs'");
  assert.equal(bucket.public, false);
});

dbTest('the ledger is append-only, even for the database owner', async (w) => {
  const deal = await w.deal();
  await w.fund(deal);
  const r = await refusal(w.db.q('update public.ledger_entries set amount_cents = amount_cents + 1'));
  assert.match(r.message, /never changed or deleted/);
  assert.match((await refusal(w.db.q('delete from public.ledger_entries'))).message, /never changed or deleted/);
  // and an unbalanced transaction can't be posted at all
  const bad = await refusal(w.db.q("insert into public.ledger_entries (txn_id, account, amount_cents) values (gen_random_uuid(), 'fees', 100)"));
  assert.match(bad.message, /does not balance/);
});

dbTest('the checks behind the functions: impossible states are refused by the tables themselves', async (w) => {
  const deal = await w.deal({ amount: 30000 });
  const [m] = await w.milestones(deal);
  const tries = [
    ["update public.milestones set released_cents = amount_cents + 1 where id = $1", [m.id], /milestones_release_(within|from_escrow)/],
    ["update public.milestones set status = 'in_escrow' where id = $1", [m.id], /milestones_funded_has_payment/],
    ["update public.deliverables set amount_cents = amount_cents + 1 where milestone_id = $1", [m.id], /deliverables share/],
    ["update public.deals set status = 'completed' where id = $1", [deal], /deals_completed_dated/],
    ["insert into public.offer_versions (offer_id, version, by_side, amount_cents, items, created_by) select offer_id, 2, 'brand', 5, items, created_by from public.offer_versions limit 1", [], /two versions in a row/],
  ];
  for (const [sql, params, why] of tries) {
    assert.match((await refusal(w.db.q(sql, params))).message, why, sql);
  }
});

dbTest('the service key reads, but changes nothing directly: no inserts, updates, deletes or truncation', async (w) => {
  const deal = await w.deal();
  await w.fund(deal);
  const svc = w.db.service();
  assert.ok((await svc.query('select count(*)::int as n from public.ledger_entries'))[0].n > 0, 'it can read');
  for (const sql of [
    'truncate public.ledger_entries',
    'delete from public.ledger_entries',
    "update public.payments set status = 'failed'",
    "insert into public.payouts (creator_id, amount_cents, net_cents, provider) values ('" + w.creator + "', 1, 1, 'stripe')",
    'truncate public.payments cascade',
  ]) {
    assert.equal((await refusal(svc.query(sql))).code, '42501', sql);
  }
  // and the ledger can't be truncated even by the database owner
  assert.match((await refusal(w.db.q('truncate public.ledger_entries'))).message, /never changed or deleted/);
});

dbTest('profile names are visible to the people you deal with, not to every signed-in user; e-mails never become names', async (w) => {
  await w.deal();
  const names = async (actor) => (await actor.query('select display_name from public.profiles order by display_name')).map((p) => p.display_name);
  assert.deepEqual(await names(w.X), ['Outsider'], 'an outsider sees only themselves');
  assert.deepEqual(await names(w.B), ['Instant Shock', 'VOLTEDGE manager'], 'the brand sees the creator it deals with');
  assert.deepEqual(await names(w.C), ['Instant Shock', 'VOLTEDGE manager']);
  // a teammate is visible to the team
  const mate = await w.db.user('Second manager');
  await w.db.q("insert into public.brand_members (brand_id, user_id) values ($1, $2)", [w.brand, mate.id]);
  assert.ok((await names(w.B)).includes('Second manager'));
  // sign-up without a name: no name, never the part of the e-mail before the @
  const id = '0f000000-0000-4000-8000-000000000001';
  await w.db.q("insert into auth.users (id, email, aud, role) values ($1, 'john.q.public@example.com', 'authenticated', 'authenticated')", [id]);
  assert.equal((await w.db.one('select display_name from public.profiles where id = $1', [id])).display_name, '');
});

dbTest('visitors see a creator\'s public profile, not which account owns it', async (w) => {
  const anon = w.db.anon();
  const rows = await anon.query('select handle, display_name, bio from public.creators order by handle');
  assert.equal(rows.length, 2);
  assert.equal((await refusal(anon.query('select owner_id from public.creators'))).code, '42501');
});

dbTest('deleting an account keeps the books and removes the person: profile emptied, brands left, creator anonymised', async (w) => {
  const deal = await w.deal({ amount: 30000 });
  await w.fund(deal);
  await w.completeAll(deal);
  await w.C.query(`insert into public.packages (creator_id, title, price_cents, items) values ($1, 'PKG', 5000, '[{"label": "x"}]')`, [w.creator]);
  await w.db.q('delete from auth.users where id = $1', [w.C.id]);
  await w.db.q('delete from auth.users where id = $1', [w.B.id]);
  const [p] = await w.db.q('select display_name, deleted_at is not null as gone from public.profiles where id = $1', [w.C.id]);
  assert.deepEqual(p, { display_name: '', gone: true });
  const [c] = await w.db.q('select handle, display_name, bio from public.creators where id = $1', [w.creator]);
  assert.match(c.handle, /^deleted-[0-9a-f]{12}$/);
  assert.equal(c.display_name, 'Deleted creator');
  assert.equal((await w.db.q('select count(*)::int as n from public.packages where creator_id = $1 and active', [w.creator]))[0].n, 0);
  assert.equal((await w.db.q('select count(*)::int as n from public.brand_members where user_id = $1', [w.B.id]))[0].n, 0);
  assert.equal((await w.db.q('select count(*)::int as n from public.releases where deal_id = $1', [deal]))[0].n, 3, 'the books stay');
});
