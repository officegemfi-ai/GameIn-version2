// Stage one of the scaling plan (supabase/migrations/20261110000100_scale.sql): what it adds must say exactly what the
// rest of the database says. Unread messages recorded as they happen against the messages and read marks themselves;
// the badge counts against the to-do list; search against the directory; and the checks that run when a move commits,
// which must see the rows they check whoever is committing.
import assert from 'node:assert/strict';
import { refusal } from './harness.mjs';
import { assertCountsMatch, assertUnreadInStep, dbTest } from './fixtures.mjs';

const RECORDED = 'select conversation_id, to_side::text, seq from public.unread_messages order by 1, 2, 3';

dbTest('a message is recorded as unread for the other side when it is sent, and no longer once they read past it', async (w) => {
  const say = (who, as, body) => who.rpc('send_message', { p_brand: w.brand, p_creator: w.creator, p_as: as, p_body: body });
  await say(w.B, 'brand', 'one');
  await say(w.B, 'brand', 'two');
  const [conv] = await w.db.q('select id from public.conversations');
  const mine = (who) => who.query('select to_side::text, seq from public.unread_messages order by seq');
  assert.deepEqual(await mine(w.C), [{ to_side: 'creator', seq: 1 }, { to_side: 'creator', seq: 2 }]);
  // each side sees its own unread only; an outsider sees none
  assert.deepEqual(await mine(w.B), []);
  assert.deepEqual(await mine(w.X), []);
  await assertUnreadInStep(w.db, 'after two messages');

  // read up to the first: the second stays unread
  await w.C.rpc('mark_read', { p_conversation: conv.id, p_as: 'creator', p_upto_seq: 1 });
  assert.deepEqual(await mine(w.C), [{ to_side: 'creator', seq: 2 }]);
  assert.deepEqual((await w.C.query("select kind from public.todos where side = 'creator'")).map((t) => t.kind), ['unread_messages']);
  // a read mark never moves back
  await w.C.rpc('mark_read', { p_conversation: conv.id, p_as: 'creator', p_upto_seq: 0 });
  assert.deepEqual(await mine(w.C), [{ to_side: 'creator', seq: 2 }]);

  // answering reads everything before the answer, and is unread for the brand
  await say(w.C, 'creator', 'three');
  assert.deepEqual(await mine(w.C), []);
  assert.deepEqual(await mine(w.B), [{ to_side: 'brand', seq: 3 }]);
  await assertUnreadInStep(w.db, 'after an answer');
  await w.B.rpc('mark_read', { p_conversation: conv.id, p_as: 'brand' });
  assert.deepEqual(await w.db.q(RECORDED), []);
  assert.deepEqual(await w.B.query('select * from public.todos'), []);

  // nobody writes the record themselves
  assert.equal((await refusal(w.C.query('delete from public.unread_messages'))).code, '42501');
  assert.equal((await refusal(w.C.query(`insert into public.unread_messages (conversation_id, to_side, seq, brand_id, creator_id)
                                           values ($1, 'brand', 9, $2, $3)`, [conv.id, w.brand, w.creator]))).code, '42501');
});

dbTest('a message still being sent is not unread yet, and opening the thread meanwhile does not wait for it', async (w) => {
  await w.B.rpc('send_message', { p_brand: w.brand, p_creator: w.creator, p_as: 'brand', p_body: 'first' });
  const [conv] = await w.db.q('select id from public.conversations');
  const sending = await w.B.hold();
  await sending.rpc('send_message', { p_brand: w.brand, p_creator: w.creator, p_as: 'brand', p_body: 'second' });
  // returns at once (it would hang here if reading waited on the send), and clears only what it could see
  assert.equal(await w.C.rpc('mark_read', { p_conversation: conv.id, p_as: 'creator' }), 1);
  assert.deepEqual(await w.C.query('select seq from public.unread_messages'), []);
  await sending.commit();
  assert.deepEqual(await w.C.query('select seq from public.unread_messages'), [{ seq: 2 }]);
  await assertUnreadInStep(w.db, 'after a send that overlapped a read');
});

dbTest('the navigation’s counts are the to-do list, counted, for the seat asked about and nobody else’s', async (w) => {
  // for the brand: a pitch to answer, proof to review, an unread message; for the creator: an offer, an unread message
  await w.offer({ by: 'creator', title: 'A pitch' });
  await w.offer({ title: 'An offer' });
  const deal = await w.deal();
  await w.fund(deal);
  await w.deliver(deal, 1);
  await w.B.rpc('send_message', { p_brand: w.brand, p_creator: w.creator, p_as: 'brand', p_body: 'hello' });
  await w.C.rpc('send_message', { p_brand: w.brand, p_creator: w.creator, p_as: 'creator', p_body: 'hi' });
  await w.B.rpc('send_message', { p_brand: w.brand, p_creator: w.creator, p_as: 'brand', p_body: 'one more' });

  assert.deepEqual(await assertCountsMatch(w.B, 'brand', w.brand), [{ kind: 'answer_pitch', n: 1 }, { kind: 'review_proof', n: 1 }]);
  assert.deepEqual(await assertCountsMatch(w.C, 'creator', w.creator), [{ kind: 'answer_offer', n: 1 }, { kind: 'unread_messages', n: 1 }]);
  // an offer whose time has run out stops counting at once, before the sweep closes it
  const [open] = await w.db.q("select id from public.offers where status = 'sent'");
  await w.expire(open.id);
  assert.deepEqual(await assertCountsMatch(w.C, 'creator', w.creator), [{ kind: 'unread_messages', n: 1 }]);
  // someone else's seat: nothing, whoever asks and whichever side they claim
  assert.deepEqual(await w.X.query("select * from public.todo_counts('brand', $1)", [w.brand]), []);
  assert.deepEqual(await w.C.query("select * from public.todo_counts('brand', $1)", [w.brand]), []);
  assert.deepEqual(await w.B.query("select * from public.todo_counts('creator', $1)", [w.brand]), []);
  assert.equal((await refusal(w.db.anon().query("select * from public.todo_counts('brand', $1)", [w.brand]))).code, '42501');
});

dbTest('an offer past its time shows as expired at once, and keeps its stored state until the sweep closes it', async (w) => {
  const offer = await w.offer();
  const board = () => w.C.query('select status::text, raw_status::text, waiting_on::text, closed_at from public.offer_board where id = $1', [offer]);
  assert.deepEqual(await board(), [{ status: 'sent', raw_status: 'sent', waiting_on: 'creator', closed_at: null }]);
  await w.expire(offer);
  assert.deepEqual(await board(), [{ status: 'expired', raw_status: 'sent', waiting_on: null, closed_at: null }]);
  await w.db.service().rpc('expire_offers');
  const [swept] = await board();
  assert.deepEqual([swept.status, swept.raw_status, swept.waiting_on], ['expired', 'expired', null]);
  assert.ok(swept.closed_at, 'closed by the sweep');
});

dbTest('ready to deliver: funded work in a running deal that hasn’t been sent, or was sent back; both parties see it', async (w) => {
  const unfunded = await w.deal();
  const deal = await w.deal();
  await w.fund(deal, 'card', 'next');                      // the first milestone only
  const ready = (who) => who.query('select deal_id, seq, status::text, brand_name from public.ready_deliverables order by seq');
  assert.deepEqual(await ready(w.C), [{ deal_id: deal, seq: 1, status: 'upcoming', brand_name: 'VOLTEDGE' }]);
  assert.deepEqual(await ready(w.B), await ready(w.C));
  assert.deepEqual(await ready(w.X), []);
  // sent: no longer waiting on the creator; sent back: waiting again
  const proof = await w.deliver(deal, 1);
  assert.deepEqual(await ready(w.C), []);
  await w.B.rpc('request_changes', { p_proof: proof, p_note: 'Brighter logo' });
  assert.deepEqual((await ready(w.C)).map((r) => r.status), ['changes_requested']);
  // funding the rest makes the rest ready; nothing from the deal nobody funded
  await w.fund(deal, 'card', 'all');
  assert.deepEqual((await ready(w.C)).map((r) => [r.deal_id === deal, r.seq]), [[true, 1], [true, 2], [true, 3]]);
  assert.equal((await w.db.q('select count(*)::int as n from public.deliverables where deal_id = $1', [unfunded]))[0].n, 3);
  assert.equal((await refusal(w.db.anon().query('select * from public.ready_deliverables'))).code, '42501');
});

dbTest('search finds creators and brands by any part of a name or handle, as typed, a page at a time in name order', async (w) => {
  const join = async (name, handle) => {
    const u = await w.db.user(name);
    return u.rpc('create_creator_profile', { p_handle: handle, p_display_name: name });
  };
  await join('Alpha Wolf', 'alpha_wolf');
  await join('Alphax Wolf', 'alphaxwolf');
  await join('Zed 100%', 'zed100');
  const gone = await join('Storm Chaser', 'stormchaser');
  const names = async (q, limit = 24, offset = 0) =>
    (await w.B.query('select display_name from public.search_creators($1, $2, $3)', [q, limit, offset])).map((r) => r.display_name);

  assert.deepEqual(await names('shock'), ['Instant Shock']);            // part of a name
  assert.deepEqual(await names('TANTSH'), ['Instant Shock']);           // part of a handle, any capitals
  assert.deepEqual(await names('wolf'), ['Alpha Wolf', 'Alphax Wolf']); // in name order
  assert.deepEqual(await names('wolf', 1, 0), ['Alpha Wolf']);          // a page at a time
  assert.deepEqual(await names('wolf', 1, 1), ['Alphax Wolf']);
  assert.deepEqual(await names('wolf', 1, 2), []);
  // what is typed is what is looked for: "_" and "%" are not wildcards
  assert.deepEqual(await names('alpha_w'), ['Alpha Wolf']);
  assert.deepEqual(await names('100%'), ['Zed 100%']);
  assert.deepEqual(await names('%'), ['Zed 100%']);
  // one or two letters work too (the other way of finding them)
  assert.deepEqual(await names('ze'), ['Zed 100%']);
  assert.deepEqual(await names('zq'), []);
  // nothing typed: the directory, in order
  assert.deepEqual(await names('', 2), ['Alpha Wolf', 'Alphax Wolf']);
  // a deleted account's creator page is not found
  assert.deepEqual(await names('storm'), ['Storm Chaser']);
  await w.db.q("update public.creators set handle = 'deleted-' || left(id::text, 8) where id = $1", [gone]);
  assert.deepEqual(await names('storm'), []);
  // the same answer as asking the directory directly
  const direct = await w.B.query(`select display_name from public.creators where handle not like 'deleted-%'
                                  and (display_name ilike '%wolf%' or handle ilike '%wolf%') order by display_name, id`);
  assert.deepEqual(await names('wolf'), direct.map((r) => r.display_name));

  const brands = async (q, limit = 20) => (await w.C.query('select name from public.search_brands($1, $2)', [q, limit])).map((r) => r.name);
  assert.deepEqual(await brands('volt'), ['VOLTEDGE']);
  assert.deepEqual(await brands('other'), ['OTHERBRAND']);
  assert.deepEqual(await brands('e'), ['OTHERBRAND', 'VOLTEDGE']);
  assert.deepEqual(await brands('e', 1), ['OTHERBRAND']);
  assert.deepEqual(await brands('nobody'), []);
  // signed in only, like the pages that search
  assert.equal((await refusal(w.db.anon().query("select * from public.search_creators('wolf')"))).code, '42501');
  assert.equal((await refusal(w.db.anon().query("select * from public.search_brands('volt')"))).code, '42501');
});

dbTest('the checks made when a move commits see the rows they check, whoever is committing', async (w) => {
  // Stand-ins for a bug in an action: one posts a single ledger entry with nothing to balance it, the other changes a
  // deliverable's share without its milestone. Both run with the owner's rights, as every action does, and are called
  // by someone the ledger and the deal are hidden from. Before stage one the checks ran as that person, saw no rows
  // through row-level security, and let both through.
  const deal = await w.deal();
  await w.db.q(`
    create function public.test_post_unbalanced() returns void language sql security definer set search_path = '' as $$
      insert into public.ledger_entries (txn_id, account, amount_cents, memo) values (gen_random_uuid(), 'fees', 100, 'half a posting')
    $$;
    create function public.test_break_shares(p_deal uuid) returns void language sql security definer set search_path = '' as $$
      update public.deliverables set amount_cents = amount_cents + 1 where deal_id = p_deal and seq = 1
    $$;
    grant execute on function public.test_post_unbalanced(), public.test_break_shares(uuid) to authenticated;`);
  for (const who of [w.X, w.C]) {
    await assert.rejects(who.rpc('test_post_unbalanced'), /does not balance/);
    await assert.rejects(who.rpc('test_break_shares', { p_deal: deal }), /deliverables share/);
  }
  assert.deepEqual(await w.db.q('select 1 from public.ledger_entries'), []);
});

dbTest('your own name is yours to read; other people’s only when you deal with them', async (w) => {
  const name = (who, id) => who.query('select display_name from public.profiles where id = $1', [id]);
  assert.deepEqual(await name(w.C, w.C.id), [{ display_name: 'Instant Shock' }]);
  assert.deepEqual(await name(w.C, w.B.id), [], 'no conversation yet');
  await w.offer();                                          // an offer opens their conversation
  assert.deepEqual(await name(w.C, w.B.id), [{ display_name: 'VOLTEDGE manager' }]);
  assert.deepEqual(await name(w.B, w.C.id), [{ display_name: 'Instant Shock' }]);
  assert.deepEqual(await name(w.X, w.B.id), []);
  // a teammate at the same brand
  const B2 = await w.db.user('Second manager');
  await w.db.q("insert into public.brand_members (brand_id, user_id, role) values ($1, $2, 'member')", [w.brand, B2.id]);
  assert.deepEqual(await name(w.B, B2.id), [{ display_name: 'Second manager' }]);
  assert.deepEqual(await name(B2, w.C.id), [{ display_name: 'Instant Shock' }]);
  assert.deepEqual((await w.X.query('select id from public.profiles')).map((r) => r.id), [w.X.id]);
});
