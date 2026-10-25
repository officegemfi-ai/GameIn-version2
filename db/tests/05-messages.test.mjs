// Messages and the shared conversation (C1, C2), the seats (S1), what waits on each seat (S3), notifications.
import assert from 'node:assert/strict';
import { refusal } from './harness.mjs';
import { dbTest, DEMO } from './fixtures.mjs';

dbTest('C1: a message reaches the other side, unread until opened, then seen', async (w) => {
  await w.B.rpc('send_message', { p_brand: w.brand, p_creator: w.creator, p_as: 'brand', p_body: 'Logo files are on their way' });
  const [conv] = await w.C.query('select id from public.conversations');
  assert.deepEqual((await w.C.query("select kind, ref_id from public.todos where side = 'creator'")),
    [{ kind: 'unread_messages', ref_id: conv.id }]);
  assert.deepEqual(await w.B.query("select * from public.todos where side = 'brand'"), [], 'your own message isn\'t unread for you');
  assert.deepEqual((await w.C.query('select kind from public.notifications')).map((n) => n.kind), ['message']);
  // the brand sees "seen" once the creator has read past the message
  const seen = () => w.B.query(`select r.last_read_at >= m.created_at as seen from public.messages m
                                 join public.conversation_reads r on r.conversation_id = m.conversation_id and r.side = 'creator'`);
  assert.deepEqual(await seen(), []);
  await w.C.rpc('mark_read', { p_conversation: conv.id, p_as: 'creator' });
  assert.deepEqual(await seen(), [{ seen: true }]);
  assert.deepEqual(await w.C.query('select * from public.todos'), []);
  await w.C.rpc('send_message', { p_brand: w.brand, p_creator: w.creator, p_as: 'creator', p_body: 'Got them, thanks!' });
  assert.deepEqual((await w.B.query("select kind from public.todos where side = 'brand'")).map((t) => t.kind), ['unread_messages']);
  const thread = await w.C.query("select side, body from public.conversation_timeline where kind = 'message' order by at");
  assert.deepEqual(thread, [{ side: 'brand', body: 'Logo files are on their way' }, { side: 'creator', body: 'Got them, thanks!' }]);
  // only the two parties write in a thread, from their own seat
  assert.equal((await refusal(w.X.rpc('send_message', { p_brand: w.brand, p_creator: w.creator, p_as: 'brand', p_body: 'hi' }))).code, '42501');
  assert.equal((await refusal(w.C.rpc('send_message', { p_brand: w.brand, p_creator: w.creator, p_as: 'brand', p_body: 'hi' }))).code, '42501');
  assert.equal((await refusal(w.C.rpc('send_message', { p_brand: w.brand, p_creator: w.creator, p_as: 'creator', p_body: '   ' }))).rule, 'C1');
  assert.equal((await refusal(w.X.rpc('mark_read', { p_conversation: conv.id, p_as: 'creator' }))).code, '42501');
  assert.deepEqual(await w.X.query('select * from public.messages'), []);
});

dbTest('C2: offer, deal, funding, proof and payout events appear in the shared conversation, for both sides', async (w) => {
  const offer = await w.offer({ amount: 30000 });
  await w.C.rpc('counter_offer', { p_offer: offer, p_as: 'creator', p_amount_cents: 33000 });
  const deal = await w.B.rpc('accept_offer', { p_offer: offer, p_as: 'brand' });
  const bank = await w.fund(deal, 'bank', 'all');
  await w.B.rpc('simulate_payment', { p_payment: bank });
  const proof = await w.deliver(deal, 1);
  await w.B.rpc('request_changes', { p_proof: proof, p_note: 'Brighter logo' });
  const again = await w.deliver(deal, 1);
  await w.release(again);
  const expected = ['offer_sent', 'offer_countered', 'offer_accepted', 'payment_started', 'escrow_funded', 'proof_submitted',
    'changes_requested', 'proof_submitted', 'proof_approved', 'payment_released'];
  for (const actor of [w.B, w.C]) {
    const kinds = (await actor.query('select kind from public.conversation_timeline order by at')).map((r) => r.kind);
    assert.deepEqual(kinds, expected);
  }
  const [line] = await w.C.query("select side, amount_cents, data from public.conversation_timeline where kind = 'payment_released'");
  assert.equal(line.amount_cents, 11000);
  assert.equal(line.data.net, 11000 - 550);
  assert.deepEqual(await w.X.query('select * from public.conversation_timeline'), []);
});

dbTest('notifications go to the other side and can be marked read', async (w) => {
  const offer = await w.offer();
  await w.C.rpc('counter_offer', { p_offer: offer, p_as: 'creator', p_amount_cents: 120000 });
  assert.deepEqual((await w.C.query('select kind from public.notifications')).map((n) => n.kind), ['offer_sent']);
  assert.deepEqual((await w.B.query('select kind from public.notifications')).map((n) => n.kind), ['offer_countered']);
  assert.equal(await w.C.rpc('mark_notifications_read'), 1);
  assert.equal(await w.C.rpc('mark_notifications_read'), 0);
  assert.deepEqual(await w.C.query('select * from public.notifications where read_at is null'), []);
  assert.equal((await w.B.query('select count(*)::int as n from public.notifications where read_at is null'))[0].n, 1);
  assert.equal((await refusal(w.db.anon().rpc('mark_notifications_read'))).code, '42501');
});

dbTest('S1: the seat switch: the demo account sits in Instant Shock and six brands; a HYPERCORE manager only in HYPERCORE', async (w) => {
  const seats = await w.demo.query('select side, name, role from public.my_seats order by side, name');
  assert.deepEqual(seats.map((s) => `${s.side}:${s.name}`), ['brand:GRIDFUEL', 'brand:HYPERCORE', 'brand:NEXAWEAR',
    'brand:ORBITAL AUDIO', 'brand:SHIELDPOINT', 'brand:VOLTEDGE', 'creator:Instant Shock']);
  const mine = await w.manager.query('select side, name, role from public.my_seats');
  assert.deepEqual(mine, [{ side: 'brand', name: 'HYPERCORE', role: 'admin' }]);
}, { seed: true });

dbTest('S3: each seat counts what waits on it', async (w) => {
  // the demo creator: VOLTEDGE's and GRIDFUEL's offers to answer
  const creator = await w.demo.query("select kind, title from public.todos where side = 'creator' order by title");
  assert.deepEqual(creator.map((t) => t.title), ['INSTANTSHOCK ULTIMATE SPONSORSHIP PACKAGE', 'XMAS STREAM LOGO CAMPAIGN']);
  // HYPERCORE: FortniteSpartanXYZ's counter and the proof in review on ULTIMATE PACKAGE Q3
  const brand = await w.manager.query("select kind, title, amount_cents from public.todos where side = 'brand' order by kind");
  assert.deepEqual(brand, [
    { kind: 'answer_counter', title: 'FORTNITE SEASON DROP', amount_cents: 65000 },
    { kind: 'review_proof', title: 'Mid-roll segment #2', amount_cents: 25000 },
  ]);
  // a counter from the brand moves the count to the creator
  const [fsx] = await w.db.q("select id from public.offers where title = 'FORTNITE SEASON DROP'");
  await w.manager.rpc('counter_offer', { p_offer: fsx.id, p_as: 'brand', p_amount_cents: 70000 });
  assert.deepEqual(await w.manager.query("select kind from public.todos where side = 'brand' and kind = 'answer_counter'"), []);
  const fspartan = await w.db.userByEmail('fspartan@creators.test');
  assert.deepEqual((await fspartan.query('select kind, title from public.todos')).map((t) => t.title), ['FORTNITE SEASON DROP']);
  assert.ok(DEMO.hypercore);
}, { seed: true });
