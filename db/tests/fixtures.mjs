// Shared set-ups: a brand and a creator who do business, an outsider, and short ways to get a deal to any stage.
// Every test gets its own database and ends with the money audit, which must find nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './harness.mjs';

export const ITEMS3 = [
  { label: 'Launch stream with logo overlay', days: 5 },
  { label: 'TikTok recap clip', days: 7 },
  { label: 'Instagram story', days: 9 },
];

export const DEMO = {
  demo: 'demo@gamein.test',
  manager: 'manager@hypercore.test',
  voltedge: '00000000-0000-4000-8000-0000000000b1',
  hypercore: '00000000-0000-4000-8000-0000000000b2',
  gridfuel: '00000000-0000-4000-8000-0000000000b3',
  nexawear: '00000000-0000-4000-8000-0000000000b4',
  orbital: '00000000-0000-4000-8000-0000000000b5',
  shieldpoint: '00000000-0000-4000-8000-0000000000b6',
  shock: '00000000-0000-4000-8000-0000000000c1',
  rp1: '00000000-0000-4000-8000-0000000000c2',
  qwerty: '00000000-0000-4000-8000-0000000000c3',
  fspartan: '00000000-0000-4000-8000-0000000000c4',
  testy: '00000000-0000-4000-8000-0000000000c5',
  outpost: '00000000-0000-4000-8000-0000000000c6',
  sp1: '00000000-0000-4000-8000-00000000d001',
  sp2: '00000000-0000-4000-8000-00000000d002',
  sp3: '00000000-0000-4000-8000-00000000d003',
  bx2: '00000000-0000-4000-8000-00000000d005',
};

// a database test: fresh database, the world, the test, then the audit
export function dbTest(name, fn, { seed = false, only = false } = {}) {
  (only ? test.only : test)(name, async (t) => {
    const db = await freshDb({ seed });
    try {
      const ctx = seed ? await demoWorld(db) : await world(db);
      await fn(ctx, t);
      assert.deepEqual(await db.audit(), [], 'the money audit found problems');
    } finally {
      await db.close();
    }
  });
}

export async function world(db) {
  const B = await db.user('VOLTEDGE manager');
  const C = await db.user('Instant Shock');
  const X = await db.user('Outsider');
  const brand = await B.rpc('create_brand', { p_name: 'VOLTEDGE' });
  const creator = await C.rpc('create_creator_profile', { p_handle: 'instantshock', p_display_name: 'Instant Shock' });
  const otherBrand = await X.rpc('create_brand', { p_name: 'OTHERBRAND' });
  const otherCreator = await X.rpc('create_creator_profile', { p_handle: 'outsider', p_display_name: 'Outsider' });
  return helpers({ db, B, C, X, brand, creator, otherBrand, otherCreator });
}

export async function demoWorld(db) {
  const demo = await db.userByEmail(DEMO.demo);
  const manager = await db.userByEmail(DEMO.manager);
  const X = await db.user('Outsider');
  return helpers({ db, demo, manager, X, B: demo, C: demo, brand: DEMO.hypercore, creator: DEMO.shock });
}

function helpers(ctx) {
  const { db } = ctx;
  return Object.assign(ctx, {
    // an offer from the brand (or a pitch from the creator)
    async offer({ amount = 100000, items = ITEMS3, by = 'brand', title = 'Launch week' } = {}) {
      if (by === 'brand') {
        return ctx.B.rpc('send_offer', { p_brand: ctx.brand, p_creator: ctx.creator, p_title: title, p_amount_cents: amount, p_items: items });
      }
      return ctx.C.rpc('pitch_offer', { p_creator: ctx.creator, p_brand: ctx.brand, p_title: title, p_amount_cents: amount, p_items: items });
    },
    // an accepted offer: a deal awaiting funding
    async deal({ amount = 100000, items = ITEMS3 } = {}) {
      const offer = await ctx.offer({ amount, items });
      return ctx.C.rpc('accept_offer', { p_offer: offer, p_as: 'creator' });
    },
    milestones: (deal) => db.q('select * from public.milestones where deal_id = $1 order by seq', [deal]),
    deliverables: (deal) => db.q('select * from public.deliverables where deal_id = $1 order by seq', [deal]),
    async fund(deal, method = 'card', scope = 'all') {
      return ctx.B.rpc('fund_milestones', { p_deal: deal, p_method: method, p_scope: scope });
    },
    async deliver(deal, seq = 1) {
      const dl = (await ctx.deliverables(deal)).find((d) => d.seq === seq);
      return ctx.C.rpc('submit_proof', { p_deliverable: dl.id, p_link_url: `https://twitch.tv/videos/${seq}` });
    },
    // approve with no undo window: released now
    async release(proof) {
      await ctx.B.rpc('approve_proof', { p_proof: proof, p_undo_seconds: 0 });
    },
    // deliver and release every deliverable of a funded deal
    async completeAll(deal) {
      for (const dl of await ctx.deliverables(deal)) {
        if (dl.status === 'done') continue;
        const p = await ctx.C.rpc('submit_proof', { p_deliverable: dl.id, p_link_url: `https://x.test/${dl.seq}` });
        await ctx.release(p);
      }
    },
    money: (deal) => db.one('select * from public.deal_money where deal_id = $1', [deal]),
    endWindow: (proof) => db.q("update public.proofs set release_at = now() - interval '1 second' where id = $1", [proof]),
    expire: (offer) => db.q("update public.offers set expires_at = now() - interval '1 second' where id = $1", [offer]),
    offerRow: (offer) => db.one('select * from public.offers where id = $1', [offer]),
    events: (kind) => db.q('select * from public.events where kind = $1 order by id', [kind]),
  });
}

// the prototype's arithmetic, to compare against
export const js = {
  fee: (c) => Math.round(c / 20),
  split(total, n) {
    const b = Math.floor(total / n);
    return Array.from({ length: n }, (_, i) => (i === n - 1 ? total - b * (n - 1) : b));
  },
};
