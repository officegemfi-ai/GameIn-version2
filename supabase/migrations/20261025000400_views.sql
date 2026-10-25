-- What the screens read. Every view runs with the reader's own access (security_invoker), so row-level security
-- decides what each person sees; the views only do the arithmetic, so both seats always show the same numbers.

-- the seats the person signed in can take: their creator profile and every brand they work for (S1)
create view public.my_seats with (security_invoker = true) as
  select 'creator'::public.side as side, null::uuid as brand_id, c.id as creator_id, c.display_name as name,
         null::public.brand_role as role
  from public.creators c where c.owner_id = auth.uid()
  union all
  select 'brand'::public.side, b.id, null::uuid, b.name, m.role
  from public.brand_members m join public.brands b on b.id = m.brand_id
  where m.user_id = auth.uid();

-- an offer with its latest version, who it waits on, and whether its window has passed (O1-O11)
create view public.offer_board with (security_invoker = true) as
  select o.id, o.brand_id, o.creator_id, o.title, o.source, o.package_id, o.campaign_id, o.previous_deal_id,
         case when o.status in ('sent', 'countered') and o.expires_at <= now() then 'expired'::public.offer_status
              else o.status end as status,
         case when o.status in ('sent', 'countered') and o.expires_at > now() then private.waiting_on(o.status) end as waiting_on,
         o.versions, 9 - o.versions as changes_left, o.expires_at, o.created_at, o.closed_at, o.closed_by_side,
         o.close_reason, o.accepted_at, o.accepted_by_side, o.deal_id,
         v.amount_cents, v.items, v.note, v.by_side as last_by_side, v.created_at as last_version_at,
         prev.amount_cents as previous_amount_cents
  from public.offers o
  join public.offer_versions v on v.offer_id = o.id and v.version = o.versions
  left join public.offer_versions prev on prev.offer_id = o.id and prev.version = o.versions - 1;

-- M4: a deal's money: funded = in escrow + released, the same figures on both seats
create view public.deal_money with (security_invoker = true) as
  select d.id as deal_id, d.brand_id, d.creator_id, d.title, d.status,
         coalesce(sum(m.amount_cents), 0)::bigint as total_cents,
         coalesce(sum(m.amount_cents) filter (where m.status = 'pending'), 0)::bigint as not_funded_cents,
         coalesce(sum(m.amount_cents) filter (where m.status in ('processing', 'awaiting_wire')), 0)::bigint as clearing_cents,
         coalesce(sum(m.amount_cents) filter (where m.status in ('in_escrow', 'released')), 0)::bigint as funded_cents,
         coalesce(sum(m.amount_cents - m.released_cents) filter (where m.status = 'in_escrow'), 0)::bigint as in_escrow_cents,
         coalesce(sum(m.released_cents), 0)::bigint as released_cents,
         (select m2.id from public.milestones m2 where m2.deal_id = d.id and m2.status = 'pending' order by m2.seq limit 1) as next_to_fund
  from public.deals d left join public.milestones m on m.deal_id = d.id
  group by d.id;

-- a brand's money across its deals (S4: the brand seat's escrow figure), with what it paid and the fees
create view public.brand_money with (security_invoker = true) as
  select b.id as brand_id, b.name,
         coalesce(sum(dm.total_cents), 0)::bigint as total_cents,
         coalesce(sum(dm.not_funded_cents), 0)::bigint as not_funded_cents,
         coalesce(sum(dm.clearing_cents), 0)::bigint as clearing_cents,
         coalesce(sum(dm.in_escrow_cents), 0)::bigint as in_escrow_cents,
         coalesce(sum(dm.released_cents), 0)::bigint as released_cents,
         (select coalesce(sum(p.total_cents), 0) from public.payments p where p.brand_id = b.id and p.status = 'succeeded')::bigint as paid_cents,
         (select coalesce(sum(p.fee_cents), 0) from public.payments p where p.brand_id = b.id and p.status = 'succeeded')::bigint as fees_cents
  from public.brands b left join public.deal_money dm on dm.brand_id = b.id
  where b.id in (select private.my_brand_ids())
  group by b.id;

-- M5: the creator's wallet. Available = releases less payouts; what's in escrow is still the brands'
create view public.creator_wallet with (security_invoker = true) as
  select c.id as creator_id, c.display_name,
         ((select coalesce(sum(r.net_cents), 0) from public.releases r where r.creator_id = c.id)
          - (select coalesce(sum(o.amount_cents), 0) from public.payouts o where o.creator_id = c.id and o.status <> 'failed'))::bigint as available_cents,
         (select coalesce(sum(r.gross_cents), 0) from public.releases r where r.creator_id = c.id)::bigint as released_cents,
         (select coalesce(sum(r.fee_cents), 0) from public.releases r where r.creator_id = c.id)::bigint as fees_cents,
         (select coalesce(sum(r.net_cents), 0) from public.releases r where r.creator_id = c.id)::bigint as earned_cents,
         (select coalesce(sum(o.net_cents), 0) from public.payouts o where o.creator_id = c.id and o.status = 'paid')::bigint as paid_out_cents,
         (select coalesce(sum(o.amount_cents), 0) from public.payouts o where o.creator_id = c.id and o.status = 'pending')::bigint as payouts_pending_cents,
         (select coalesce(sum(dm.in_escrow_cents), 0) from public.deal_money dm where dm.creator_id = c.id)::bigint as in_escrow_cents
  from public.creators c
  where c.id in (select private.my_creator_ids());

-- M5: the wallet's rows: one release row and one fee row per payout from escrow, then payouts to the bank. The
-- balance moves by exactly these rows
create view public.wallet_lines with (security_invoker = true) as
  select r.creator_id, r.released_at as at, 'release'::text as kind, r.gross_cents as amount_cents,
         r.deal_id, d.title, dl.label as deliverable, r.id as release_id, null::uuid as payout_id
  from public.releases r
  join public.deals d on d.id = r.deal_id
  join public.proofs p on p.id = r.proof_id
  join public.deliverables dl on dl.id = p.deliverable_id
  where r.creator_id in (select private.my_creator_ids())
  union all
  select r.creator_id, r.released_at, 'fee', -r.fee_cents, r.deal_id, d.title, dl.label, r.id, null
  from public.releases r
  join public.deals d on d.id = r.deal_id
  join public.proofs p on p.id = r.proof_id
  join public.deliverables dl on dl.id = p.deliverable_id
  where r.creator_id in (select private.my_creator_ids()) and r.fee_cents > 0
  union all
  select o.creator_id, o.created_at, case when o.instant then 'instant_payout' else 'payout' end, -o.amount_cents,
         null, null, null, null, o.id
  from public.payouts o
  where o.creator_id in (select private.my_creator_ids()) and o.status <> 'failed';

-- S3: what waits on each seat. Brand: counter-offers and pitches to answer, proofs to review, renewal requests,
-- unread messages. Creator: offers to answer, renewal offers, unread messages
create view public.todos with (security_invoker = true) as
  select 'brand'::public.side as side, o.brand_id, o.creator_id,
         case when o.source in ('pitch', 'book_again') and o.versions = 1 then 'answer_pitch' else 'answer_counter' end as kind,
         o.id as ref_id, o.title, v.amount_cents, o.expires_at as due_at
  from public.offers o join public.offer_versions v on v.offer_id = o.id and v.version = o.versions
  where o.status = 'countered' and o.expires_at > now() and o.brand_id in (select private.my_brand_ids())
  union all
  select 'creator', o.brand_id, o.creator_id, 'answer_offer', o.id, o.title, v.amount_cents, o.expires_at
  from public.offers o join public.offer_versions v on v.offer_id = o.id and v.version = o.versions
  where o.status = 'sent' and o.expires_at > now() and o.creator_id in (select private.my_creator_ids())
  union all
  select 'brand', d.brand_id, d.creator_id, 'review_proof', p.id, dl.label, p.value_cents, p.submitted_at + interval '5 days'
  from public.proofs p join public.deals d on d.id = p.deal_id join public.deliverables dl on dl.id = p.deliverable_id
  where p.status = 'in_review' and d.brand_id in (select private.my_brand_ids())
  union all
  select case r.status when 'requested' then 'brand'::public.side else 'creator'::public.side end, d.brand_id, d.creator_id,
         'answer_renewal', r.id, d.title, r.price_cents, null::timestamptz
  from public.renewals r join public.deals d on d.id = r.deal_id
  where (r.status = 'requested' and d.brand_id in (select private.my_brand_ids()))
     or (r.status = 'sent' and d.creator_id in (select private.my_creator_ids()))
  union all
  select s.side, c.brand_id, c.creator_id, 'unread_messages', c.id, null, null, null
  from public.conversations c
  cross join lateral (values ('brand'::public.side), ('creator'::public.side)) s(side)
  left join public.conversation_reads cr on cr.conversation_id = c.id and cr.side = s.side
  where ((s.side = 'brand' and c.brand_id in (select private.my_brand_ids()))
      or (s.side = 'creator' and c.creator_id in (select private.my_creator_ids())))
    and exists (select 1 from public.messages m where m.conversation_id = c.id and m.sender_side <> s.side
                and m.created_at > coalesce(cr.last_read_at, '-infinity'::timestamptz));

-- C1, C2: a conversation as both sides see it: messages and the offer, deal, funding, proof and payout events
create view public.conversation_timeline with (security_invoker = true) as
  select c.id as conversation_id, c.brand_id, c.creator_id, m.created_at as at, 'message'::text as kind,
         m.sender_side as side, m.body, null::bigint as amount_cents, null::uuid as deal_id, null::uuid as offer_id,
         '{}'::jsonb as data, m.id::text as ref
  from public.conversations c join public.messages m on m.conversation_id = c.id
  union all
  select c.id, c.brand_id, c.creator_id, e.at, e.kind, e.actor_side, null, e.amount_cents, e.deal_id, e.offer_id,
         e.data, e.id::text
  from public.conversations c
  join public.events e on e.brand_id = c.brand_id and e.creator_id = c.creator_id
  where e.kind not in ('payout_requested', 'payout_paid', 'payout_failed');
