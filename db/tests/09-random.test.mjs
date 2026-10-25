// Random walks: hundreds of random moves from both seats of two brands and two creators, many of them wrong on
// purpose (the wrong side, a closed offer, money not in escrow, a window not ended). After every move the money audit
// must find nothing, and every refusal must be a clean one (a rule, a permission or a missing row), never a table
// constraint tripping or a crash. Both seats must show the same figures for every deal they share.
//   GAMEIN_RANDOM_STEPS  moves per walk (default 250)   GAMEIN_RANDOM_SEEDS  comma-separated seeds (default 1,2,3)
import assert from 'node:assert/strict';
import { dbTest } from './fixtures.mjs';

const STEPS = Number(process.env.GAMEIN_RANDOM_STEPS || 250);
const SEEDS = (process.env.GAMEIN_RANDOM_SEEDS || '1,2,3').split(',').map(Number);
const CLEAN = new Set(['P0001', 'P0002', '42501']);

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

for (const seed of SEEDS) {
  dbTest(`random walk ${seed}: ${STEPS} moves, the audit clean after each, every refusal a clean one`, async (w) => {
    const r = rng(seed);
    const pick = (a) => a[Math.floor(r() * a.length)];
    const chance = (p) => r() < p;
    const B2 = await w.db.user('VOLTEDGE second manager');
    await w.db.q("insert into public.brand_members (brand_id, user_id, role) values ($1, $2, 'member')", [w.brand, B2.id]);
    const members = { [w.brand]: [w.B, B2], [w.otherBrand]: [w.X] };
    const owners = { [w.creator]: w.C, [w.otherCreator]: w.X };
    const brands = [w.brand, w.otherBrand];
    const creators = [w.creator, w.otherCreator];
    const everyone = [w.B, B2, w.C, w.X];
    // who acts: usually someone on that side, sometimes anyone (to check the refusals)
    const as = (side, row) => (chance(0.1) ? pick(everyone) : side === 'brand' ? pick(members[row.brand_id]) : owners[row.creator_id]);
    const side = () => (chance(0.5) ? 'brand' : 'creator');
    const items = () => Array.from({ length: 1 + Math.floor(r() * 5) }, (_, i) => ({ label: `Deliverable ${i + 1}`, days: 1 + Math.floor(r() * 30) }));
    const amount = () => pick([1, 3, 99, 101, 999, 1001, 27450, 33333, 53840, 100001, Math.floor(r() * 500000)]);
    const any = async (sql, params = []) => { const rows = await w.db.q(sql, params); return rows.length ? pick(rows) : null; };

    const moves = {
      async send() {
        const brand = pick(brands);
        return pick(members[brand]).rpc('send_offer', { p_brand: brand, p_creator: pick(creators), p_title: 'Walk offer', p_amount_cents: amount(), p_items: items() });
      },
      async pitch() {
        const creator = pick(creators);
        return owners[creator].rpc('pitch_offer', { p_creator: creator, p_brand: pick(brands), p_title: 'Walk pitch', p_amount_cents: amount(), p_items: items() });
      },
      async counter() {
        const o = await any("select * from public.offers where status in ('sent', 'countered')");
        if (!o) return;
        const s = side();
        return as(s, o).rpc('counter_offer', { p_offer: o.id, p_as: s, p_amount_cents: amount(), ...(chance(0.3) ? { p_items: items() } : {}) });
      },
      async accept() {
        const o = await any("select * from public.offers where status in ('sent', 'countered')");
        if (!o) return;
        const s = chance(0.8) ? (o.status === 'sent' ? 'creator' : 'brand') : side();
        return as(s, o).rpc('accept_offer', { p_offer: o.id, p_as: s });
      },
      async decline() {
        const o = await any('select * from public.offers');
        if (!o) return;
        const s = side();
        return as(s, o).rpc('decline_offer', { p_offer: o.id, p_as: s });
      },
      async withdraw() {
        const o = await any('select * from public.offers');
        if (!o) return;
        const s = side();
        return as(s, o).rpc('withdraw_offer', { p_offer: o.id, p_as: s });
      },
      async expire() {
        const o = await any("select * from public.offers where status in ('sent', 'countered')");
        if (o) await w.db.q("update public.offers set expires_at = now() - interval '1 second' where id = $1", [o.id]);
        if (chance(0.5)) return w.db.service().rpc('expire_offers');
      },
      async fund() {
        const d = await any('select * from public.deals');
        if (!d) return;
        const args = { p_deal: d.id, p_method: pick(['card', 'card', 'bank', 'wire']) };
        if (chance(0.3)) {
          const m = await any('select id from public.milestones where deal_id = $1', [d.id]);
          args.p_milestones = [m.id];
        } else args.p_scope = pick(['next', 'all']);
        return as('brand', d).rpc('fund_milestones', args);
      },
      async clear() {
        const p = await any("select p.*, d.creator_id from public.payments p join public.deals d on d.id = p.deal_id where p.status in ('processing', 'awaiting_wire')");
        if (!p) return;
        if (chance(0.25)) return w.db.service().rpc('fail_payment', { p_payment: p.id });
        if (chance(0.25)) return w.db.service().rpc('confirm_payment', { p_payment: p.id });
        return as('brand', p).rpc('simulate_payment', { p_payment: p.id, p_outcome: chance(0.85) ? 'cleared' : 'failed' });
      },
      async submit() {
        const d = await any('select dl.id, d.brand_id, d.creator_id from public.deliverables dl join public.deals d on d.id = dl.deal_id');
        if (!d) return;
        return as('creator', d).rpc('submit_proof', { p_deliverable: d.id, p_link_url: 'https://walk.test/' + Math.floor(r() * 1e6) });
      },
      async approve() {
        const p = await any("select p.id, d.brand_id, d.creator_id from public.proofs p join public.deals d on d.id = p.deal_id where p.status in ('in_review', 'releasing', 'released')");
        if (!p) return;
        return as('brand', p).rpc('approve_proof', { p_proof: p.id, p_undo_seconds: pick([0, 0, 6]) });
      },
      async undo() {
        const p = await any("select p.id, d.brand_id, d.creator_id from public.proofs p join public.deals d on d.id = p.deal_id where p.status <> 'changes_requested'");
        if (!p) return;
        return as('brand', p).rpc('undo_approval', { p_proof: p.id });
      },
      async changes() {
        const p = await any('select p.id, d.brand_id, d.creator_id from public.proofs p join public.deals d on d.id = p.deal_id');
        if (!p) return;
        return as('brand', p).rpc('request_changes', { p_proof: p.id, p_note: 'walk' });
      },
      async finalize() {
        const p = await any("select p.id, d.brand_id, d.creator_id from public.proofs p join public.deals d on d.id = p.deal_id where p.status in ('releasing', 'released')");
        if (!p) return;
        if (chance(0.7)) await w.db.q("update public.proofs set release_at = now() - interval '1 second' where id = $1 and status = 'releasing'", [p.id]);
        return chance(0.3) ? w.db.service().rpc('release_due') : as(side(), p).rpc('finalize_release', { p_proof: p.id });
      },
      async autoApprove() {
        const p = await any("select id from public.proofs where status = 'in_review'");
        if (p) await w.db.q("update public.proofs set submitted_at = now() - interval '6 days' where id = $1", [p.id]);
        return w.db.service().rpc('release_due');
      },
      async renew() {
        const d = await any('select * from public.deals');
        if (!d) return;
        const months = d.type === 'monthly' ? 1 + Math.floor(r() * 3) : 1;
        return chance(0.5)
          ? as('brand', d).rpc('offer_renewal', { p_deal: d.id, p_months: chance(0.9) ? months : 3, p_price_cents: amount() })
          : as('creator', d).rpc('request_renewal', { p_deal: d.id });
      },
      async answerRenewal() {
        const x = await any('select r.*, d.brand_id, d.creator_id from public.renewals r join public.deals d on d.id = r.deal_id');
        if (!x) return;
        const s = chance(0.8) ? (x.by_side === 'brand' ? 'creator' : 'brand') : side();
        if (chance(0.2)) return as(x.by_side, x).rpc('withdraw_renewal', { p_renewal: x.id, p_as: x.by_side });
        return as(s, x).rpc('answer_renewal', { p_renewal: x.id, p_as: s, p_accept: chance(0.7) });
      },
      async payout() {
        const creator = pick(creators);
        return owners[creator].rpc('request_payout', { p_creator: creator, p_amount_cents: chance(0.5) ? null : 1 + Math.floor(r() * 50000), p_instant: chance(0.3) });
      },
      async rate() {
        const d = await any('select * from public.deals');
        if (!d) return;
        const s = side();
        return as(s, d).rpc('rate_deal', { p_deal: d.id, p_as: s, p_score: 1 + Math.floor(r() * 5) });
      },
      async message() {
        const s = side();
        const row = { brand_id: pick(brands), creator_id: pick(creators) };
        return as(s, row).rpc('send_message', { p_brand: row.brand_id, p_creator: row.creator_id, p_as: s, p_body: 'walk message' });
      },
      async bookAgain() {
        const d = await any("select * from public.deals where status = 'completed'");
        if (!d) return;
        return as('creator', d).rpc('book_again', { p_deal: d.id });
      },
    };
    // early on, mostly make deals; then everything
    const weights = { send: 3, pitch: 1, counter: 2, accept: 4, decline: 1, withdraw: 1, expire: 1, fund: 4, clear: 3, submit: 5,
      approve: 4, undo: 1, changes: 1, finalize: 3, autoApprove: 1, renew: 1, answerRenewal: 2, payout: 2, rate: 1, message: 1, bookAgain: 1 };
    const bag = Object.entries(weights).flatMap(([k, n]) => Array(n).fill(k));
    const tally = { ok: 0, refused: 0 };
    for (let step = 0; step < STEPS; step++) {
      const name = pick(bag);
      try {
        await moves[name]();
        tally.ok++;
      } catch (e) {
        if (!CLEAN.has(e.code)) throw new Error(`walk ${seed}, move ${step} (${name}): ${e.code} ${e.message}`);
        tally.refused++;
      }
      const bad = await w.db.audit();
      assert.deepEqual(bad, [], `walk ${seed}, after move ${step} (${name})`);
      if (step % 25 === 24) {
        // both seats of every deal see the same figures
        for (const d of await w.db.q('select deal_id as id, brand_id, creator_id from public.deal_money')) {
          const fromBrand = await members[d.brand_id][0].query('select * from public.deal_money where deal_id = $1', [d.id]);
          const fromCreator = await owners[d.creator_id].query('select * from public.deal_money where deal_id = $1', [d.id]);
          assert.deepEqual(fromBrand, fromCreator, `walk ${seed}: deal ${d.id} looks different from the two seats`);
        }
        for (const c of creators) {
          const [wl] = await owners[c].query('select available_cents from public.creator_wallet where creator_id = $1', [c]);
          const [lines] = await owners[c].query('select coalesce(sum(amount_cents), 0)::bigint as s from public.wallet_lines where creator_id = $1', [c]);
          assert.equal(lines.s, wl.available_cents, `walk ${seed}: wallet rows and balance differ`);
        }
      }
    }
    if (process.env.GAMEIN_RANDOM_VERBOSE) {
      const kinds = await w.db.q('select kind, count(*)::int as n from public.events group by kind order by kind');
      console.log(`walk ${seed}`, JSON.stringify(tally), kinds.map((k) => `${k.kind}=${k.n}`).join(' '));
    }
    const [{ n: deals }] = await w.db.q('select count(*)::int as n from public.deals');
    const [{ n: released }] = await w.db.q('select count(*)::int as n from public.releases');
    assert.ok(tally.ok > STEPS * 0.25 && deals > 0 && released > 0, `walk ${seed} did too little: ${JSON.stringify(tally)}, ${deals} deals, ${released} releases`);
  });
}
