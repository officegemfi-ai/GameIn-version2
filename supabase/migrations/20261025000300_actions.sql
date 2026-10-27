-- Every move in GameIn, as a database function the app calls over the API (supabase.rpc('accept_offer', {...})).
--
-- Each one runs as one transaction: it locks the rows it is about to change (always the deal first, so two moves on
-- one deal take turns instead of overwriting each other), checks the rules against what is stored now, makes the
-- change, writes the ledger and the event log, and notifies the other side. If any check fails nothing is saved and
-- the error says why, with the rule's id (O9, E6 ...) in its hint.
--
-- The moves that take a side (p_as) can be made from either seat; the person must really sit on that side.

-- ---------------------------------------------------------------------------------------------------------------------
-- Shared checks
-- ---------------------------------------------------------------------------------------------------------------------
create function private.waiting_on(p_status public.offer_status) returns public.side
language sql immutable
set search_path = ''
as $$ select case p_status when 'sent' then 'creator'::public.side when 'countered' then 'brand'::public.side end $$;

create function private.other_side(p_side public.side) returns public.side
language sql immutable
set search_path = ''
as $$ select case p_side when 'brand' then 'creator'::public.side else 'brand'::public.side end $$;

create function private.lock_offer(p_offer uuid) returns public.offers
language plpgsql
set search_path = ''
as $$
declare
  o public.offers;
begin
  select * into o from public.offers where id = p_offer for no key update;
  if not found then
    perform private.not_found('Offer');
  end if;
  return o;
end
$$;

create function private.lock_deal(p_deal uuid) returns public.deals
language plpgsql
set search_path = ''
as $$
declare
  d public.deals;
begin
  select * into d from public.deals where id = p_deal for no key update;
  if not found then
    perform private.not_found('Deal');
  end if;
  return d;
end
$$;

-- the same, after checking the person sits on that side, so someone who isn't a party never takes a lock
create function private.lock_offer_as(p_offer uuid, p_as public.side) returns public.offers
language plpgsql
set search_path = ''
as $$
declare
  v_brand uuid;
  v_creator uuid;
begin
  select o.brand_id, o.creator_id into v_brand, v_creator from public.offers o where o.id = p_offer;
  if not found then
    perform private.not_found('Offer');
  end if;
  perform private.assert_acting(p_as, v_brand, v_creator);
  return private.lock_offer(p_offer);
end
$$;

create function private.lock_deal_as(p_deal uuid, p_as public.side) returns public.deals
language plpgsql
set search_path = ''
as $$
declare
  v_brand uuid;
  v_creator uuid;
begin
  select d.brand_id, d.creator_id into v_brand, v_creator from public.deals d where d.id = p_deal;
  if not found then
    perform private.not_found('Deal');
  end if;
  perform private.assert_acting(p_as, v_brand, v_creator);
  return private.lock_deal(p_deal);
end
$$;

-- O8, O9, O11: you can answer an offer that is open, inside its reply window and waiting on you
create function private.check_your_turn(o public.offers, p_as public.side) returns void
language plpgsql
set search_path = ''
as $$
begin
  if o.status not in ('sent', 'countered') then
    perform private.refuse('O11', 'This offer is no longer open: it was ' || o.status);
  end if;
  if o.expires_at <= now() then
    perform private.refuse('O8', 'This offer expired: nobody replied in time');
  end if;
  if private.waiting_on(o.status) <> p_as then
    perform private.refuse('O9', 'This offer is waiting on ' || private.side_label(private.waiting_on(o.status))
                                 || ' to reply to your last version');
  end if;
end
$$;

create function private.check_terms(p_amount bigint, p_items jsonb) returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_amount is null or p_amount <= 0 then
    perform private.refuse('M1', 'Enter an amount above $0');
  end if;
  if not coalesce(public.items_valid(p_items), false) then
    perform private.refuse('K1', 'List 1 to 20 deliverables, each with a name of up to 120 characters');
  end if;
  if p_amount < jsonb_array_length(p_items) then
    perform private.refuse('M1', 'The amount has to cover at least a cent per deliverable');
  end if;
  if p_amount > 1000000000 then
    perform private.refuse('M1', 'One offer can be up to $10,000,000');
  end if;
end
$$;

create function private.check_title(p_title text) returns text
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(length(trim(p_title)), 0) not between 1 and 120 then
    perform private.refuse('O1', 'Give it a title of up to 120 characters');
  end if;
  return trim(p_title);
end
$$;

create function private.money(p_cents bigint) returns text
language sql immutable
set search_path = ''
as $$ select '$' || to_char(p_cents / 100.0, 'FM999,999,999,990.00') $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Offers
-- ---------------------------------------------------------------------------------------------------------------------
-- O1: a brand sends a creator an offer. From a campaign it gets 48 hours to answer, otherwise 24
create function public.send_offer(
  p_brand uuid, p_creator uuid, p_title text, p_amount_cents bigint, p_items jsonb,
  p_note text default '', p_campaign uuid default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_offer uuid;
  v_title text;
  v_hours integer := 24;
begin
  v_uid := private.assert_acting('brand', p_brand, p_creator);
  if not exists (select 1 from public.creators c where c.id = p_creator) then
    perform private.not_found('Creator');
  end if;
  v_title := private.check_title(p_title);
  perform private.check_terms(p_amount_cents, p_items);
  if p_campaign is not null then
    if not exists (select 1 from public.campaigns c where c.id = p_campaign and c.brand_id = p_brand and c.status = 'open') then
      perform private.refuse('O1', 'That campaign isn''t open');
    end if;
    v_hours := 48;
  end if;

  insert into public.offers (brand_id, creator_id, title, source, campaign_id, status, versions, reply_hours, expires_at, created_by)
  values (p_brand, p_creator, v_title, case when p_campaign is null then 'direct' else 'campaign' end::public.offer_source,
          p_campaign, 'sent', 1, v_hours, now() + make_interval(hours => v_hours), v_uid)
  returning id into v_offer;
  insert into public.offer_versions (offer_id, version, by_side, amount_cents, items, note, created_by)
  values (v_offer, 1, 'brand', p_amount_cents, p_items, coalesce(p_note, ''), v_uid);
  if p_campaign is not null then
    insert into public.campaign_shortlist (campaign_id, creator_id, offer_id) values (p_campaign, p_creator, v_offer)
    on conflict (campaign_id, creator_id) do update set offer_id = excluded.offer_id;
  end if;

  perform private.ensure_conversation(p_brand, p_creator);
  perform private.log_event('offer_sent', 'brand', p_brand, p_creator, p_offer => v_offer, p_amount => p_amount_cents,
                            p_data => jsonb_build_object('title', v_title, 'version', 1, 'hours', v_hours));
  return v_offer;
end
$$;

-- O1, K1: a brand books one of the creator's packages as it is: its price, one deliverable per module
create function public.book_package(p_brand uuid, p_package uuid, p_note text default '',
                                    p_expected_price_cents bigint default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_offer uuid;
  pk public.packages;
begin
  select * into pk from public.packages where id = p_package;
  if not found then
    perform private.not_found('Package');
  end if;
  v_uid := private.assert_acting('brand', p_brand, pk.creator_id);
  if not pk.active then
    perform private.refuse('K1', 'This package isn''t available any more');
  end if;
  if p_expected_price_cents is not null and p_expected_price_cents <> pk.price_cents then
    perform private.refuse('K1', 'The price of this package is now ' || private.money(pk.price_cents) || '. Check it and book again');
  end if;
  perform private.check_terms(pk.price_cents, pk.items);

  insert into public.offers (brand_id, creator_id, title, source, package_id, status, versions, reply_hours, expires_at, created_by)
  values (p_brand, pk.creator_id, pk.title, 'package', pk.id, 'sent', 1, 24, now() + interval '24 hours', v_uid)
  returning id into v_offer;
  insert into public.offer_versions (offer_id, version, by_side, amount_cents, items, note, created_by)
  values (v_offer, 1, 'brand', pk.price_cents, pk.items, coalesce(p_note, ''), v_uid);

  perform private.ensure_conversation(p_brand, pk.creator_id);
  perform private.log_event('package_booked', 'brand', p_brand, pk.creator_id, p_offer => v_offer, p_amount => pk.price_cents,
                            p_data => jsonb_build_object('title', pk.title, 'package', pk.id, 'version', 1));
  return v_offer;
end
$$;

-- O2: a creator pitches a brand, from one of their packages or with their own terms. The brand has 72 hours
create function public.pitch_offer(
  p_creator uuid, p_brand uuid, p_package uuid default null, p_title text default null,
  p_amount_cents bigint default null, p_items jsonb default null, p_note text default ''
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_offer uuid;
  v_title text := p_title;
  v_amount bigint := p_amount_cents;
  v_items jsonb := p_items;
  pk public.packages;
begin
  v_uid := private.assert_acting('creator', p_brand, p_creator);
  if not exists (select 1 from public.brands b where b.id = p_brand) then
    perform private.not_found('Brand');
  end if;
  if p_package is not null then
    select * into pk from public.packages where id = p_package and creator_id = p_creator;
    if not found then
      perform private.refuse('K1', 'That package isn''t one of yours');
    end if;
    v_title := coalesce(p_title, pk.title);
    v_amount := coalesce(p_amount_cents, pk.price_cents);
    v_items := coalesce(p_items, pk.items);
  end if;
  v_title := private.check_title(v_title);
  perform private.check_terms(v_amount, v_items);

  insert into public.offers (brand_id, creator_id, title, source, package_id, status, versions, reply_hours, expires_at, created_by)
  values (p_brand, p_creator, v_title, 'pitch', p_package, 'countered', 1, 72, now() + interval '72 hours', v_uid)
  returning id into v_offer;
  insert into public.offer_versions (offer_id, version, by_side, amount_cents, items, note, created_by)
  values (v_offer, 1, 'creator', v_amount, v_items, coalesce(p_note, ''), v_uid);

  perform private.ensure_conversation(p_brand, p_creator);
  perform private.log_event('offer_pitched', 'creator', p_brand, p_creator, p_offer => v_offer, p_amount => v_amount,
                            p_data => jsonb_build_object('title', v_title, 'version', 1));
  return v_offer;
end
$$;

-- R5: after a deal is complete the creator can send the brand the same package again, as a pitch; one at a time
create function public.book_again(p_deal uuid, p_note text default 'Same package again? Happy to run it back.') returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_offer uuid;
  v_items jsonb;
  v_old record;
  d public.deals;
begin
  d := private.lock_deal_as(p_deal, 'creator');
  v_uid := auth.uid();
  if d.status <> 'completed' then
    perform private.refuse('R5', 'You can book this brand again once this deal is complete');
  end if;
  -- an earlier pitch whose reply window has passed is expired now, with its event, so it doesn't count
  for v_old in
    update public.offers set status = 'expired', closed_at = now()
     where previous_deal_id = d.id and status in ('sent', 'countered') and expires_at <= now()
    returning id, versions
  loop
    perform private.log_event('offer_expired', null, d.brand_id, d.creator_id, p_offer => v_old.id,
                              p_data => jsonb_build_object('version', v_old.versions));
  end loop;
  if exists (select 1 from public.offers o where o.previous_deal_id = d.id and o.status in ('sent', 'countered')) then
    perform private.refuse('R5', 'You already sent this package again. It''s waiting on their reply');
  end if;

  -- the deliverables as they were accepted, or the deal's own when it didn't come from an offer
  select v.items into v_items
  from public.offers o join public.offer_versions v on v.offer_id = o.id and v.version = o.versions
  where o.id = d.offer_id;
  if v_items is null then
    select jsonb_agg(jsonb_build_object('label', dl.label, 'days', 7) order by dl.seq) into v_items
    from public.deliverables dl join public.milestones m on m.id = dl.milestone_id
    where dl.deal_id = d.id and m.renewal_id is null;
  end if;
  perform private.check_terms(d.amount_cents, v_items);

  insert into public.offers (brand_id, creator_id, title, source, previous_deal_id, status, versions, reply_hours, expires_at, created_by)
  values (d.brand_id, d.creator_id, d.title, 'book_again', d.id, 'countered', 1, 72, now() + interval '72 hours', v_uid)
  returning id into v_offer;
  insert into public.offer_versions (offer_id, version, by_side, amount_cents, items, note, created_by)
  values (v_offer, 1, 'creator', d.amount_cents, v_items, coalesce(p_note, ''), v_uid);

  perform private.log_event('offer_pitched', 'creator', d.brand_id, d.creator_id, p_offer => v_offer, p_deal => d.id,
                            p_amount => d.amount_cents, p_data => jsonb_build_object('title', d.title, 'version', 1, 'again', true));
  return v_offer;
end
$$;

-- O3, O4, O10: a counter adds a version, at most 8 changes to one offer, and restarts the 24-hour window
create function public.counter_offer(
  p_offer uuid, p_as public.side, p_amount_cents bigint, p_note text default '', p_items jsonb default null
) returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_items jsonb;
  o public.offers;
  last public.offer_versions;
begin
  o := private.lock_offer_as(p_offer, p_as);
  v_uid := auth.uid();
  perform private.check_your_turn(o, p_as);
  if o.versions >= 9 then
    perform private.refuse('O10', 'Adjustment limit reached (8 of 8). Accept or decline instead');
  end if;
  select * into last from public.offer_versions where offer_id = o.id and version = o.versions;
  v_items := coalesce(p_items, last.items);
  perform private.check_terms(p_amount_cents, v_items);

  insert into public.offer_versions (offer_id, version, by_side, amount_cents, items, note, created_by)
  values (o.id, o.versions + 1, p_as, p_amount_cents, v_items, coalesce(p_note, ''), v_uid);
  update public.offers
     set status = case p_as when 'brand' then 'sent' else 'countered' end::public.offer_status,
         versions = o.versions + 1,
         expires_at = now() + interval '24 hours'
   where id = o.id;

  perform private.log_event('offer_countered', p_as, o.brand_id, o.creator_id, p_offer => o.id, p_amount => p_amount_cents,
                            p_data => jsonb_build_object('version', o.versions + 1, 'was', last.amount_cents,
                                                         'items_changed', v_items is distinct from last.items));
  return o.versions + 1;
end
$$;

-- O5: accepting the other side's latest version makes the deal: one milestone per deliverable, the amount split to
-- the cent (M1), nothing funded yet (E1)
create function public.accept_offer(p_offer uuid, p_as public.side) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_deal uuid;
  v_n integer;
  v_shares bigint[];
  v_item jsonb;
  v_due date;
  v_ms uuid;
  i integer;
  o public.offers;
  last public.offer_versions;
begin
  o := private.lock_offer_as(p_offer, p_as);
  v_uid := auth.uid();
  perform private.check_your_turn(o, p_as);
  select * into last from public.offer_versions where offer_id = o.id and version = o.versions;
  v_n := jsonb_array_length(last.items);
  v_shares := public.split_cents(last.amount_cents, v_n);

  insert into public.deals (offer_id, brand_id, creator_id, title, type, amount_cents, status, starts_on, ends_on)
  values (o.id, o.brand_id, o.creator_id, o.title, 'one_time', last.amount_cents, 'awaiting_funding', current_date,
          current_date + (select max(coalesce(ceil((e ->> 'days')::numeric)::integer, 7)) from jsonb_array_elements(last.items) e))
  returning id into v_deal;
  for i in 1 .. v_n loop
    v_item := last.items -> (i - 1);
    v_due := current_date + coalesce(ceil((v_item ->> 'days')::numeric)::integer, 7);
    insert into public.milestones (deal_id, seq, label, due_on, amount_cents)
    values (v_deal, i, trim(v_item ->> 'label'), v_due, v_shares[i])
    returning id into v_ms;
    insert into public.deliverables (deal_id, milestone_id, seq, label, due_on, amount_cents)
    values (v_deal, v_ms, i, trim(v_item ->> 'label'), v_due, v_shares[i]);
  end loop;

  update public.offers
     set status = 'accepted', accepted_at = now(), accepted_by_side = p_as, closed_at = now(), closed_by_side = p_as,
         deal_id = v_deal
   where id = o.id;

  perform private.log_event('offer_accepted', p_as, o.brand_id, o.creator_id, p_offer => o.id, p_deal => v_deal,
                            p_amount => last.amount_cents, p_data => jsonb_build_object('version', o.versions, 'title', o.title));
  return v_deal;
end
$$;

-- O6: declining the other side's latest version closes the offer; the conversation stays open
create function public.decline_offer(p_offer uuid, p_as public.side, p_reason text default '') returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  o public.offers;
begin
  o := private.lock_offer_as(p_offer, p_as);
  perform private.check_your_turn(o, p_as);
  update public.offers
     set status = 'declined', closed_at = now(), closed_by_side = p_as, close_reason = nullif(trim(p_reason), '')
   where id = o.id;
  perform private.log_event('offer_declined', p_as, o.brand_id, o.creator_id, p_offer => o.id,
                            p_data => jsonb_build_object('version', o.versions, 'reason', nullif(trim(p_reason), '')));
end
$$;

-- O7: the side whose version is waiting can take it back (the prototype only has this for brands; see the decisions)
create function public.withdraw_offer(p_offer uuid, p_as public.side) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  o public.offers;
begin
  o := private.lock_offer_as(p_offer, p_as);
  if o.status not in ('sent', 'countered') then
    perform private.refuse('O11', 'This offer is no longer open: it was ' || o.status);
  end if;
  if o.expires_at <= now() then
    perform private.refuse('O8', 'This offer expired: nobody replied in time');
  end if;
  if private.waiting_on(o.status) = p_as then
    perform private.refuse('O7', initcap(private.side_label(private.other_side(p_as)))
                                 || ' already replied. Decline their version instead');
  end if;
  update public.offers set status = 'withdrawn', closed_at = now(), closed_by_side = p_as where id = o.id;
  perform private.log_event('offer_withdrawn', p_as, o.brand_id, o.creator_id, p_offer => o.id,
                            p_data => jsonb_build_object('version', o.versions));
end
$$;

-- O8: offers nobody answered in time expire. Runs every minute (security migration); the app also shows an offer as
-- expired the moment its window passes (offer_board), so nothing waits on this
create function public.expire_offers() returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  o record;
  n integer := 0;
begin
  for o in
    select * from public.offers where status in ('sent', 'countered') and expires_at <= now()
    order by expires_at for no key update skip locked
  loop
    update public.offers set status = 'expired', closed_at = now() where id = o.id;
    perform private.log_event('offer_expired', null, o.brand_id, o.creator_id, p_offer => o.id,
                              p_data => jsonb_build_object('version', o.versions));
    n := n + 1;
  end loop;
  return n;
end
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Funding escrow
-- ---------------------------------------------------------------------------------------------------------------------
-- E2-E5, M2: the brand funds the next milestone, everything remaining, or the milestones it picks. One payment pays
-- for them plus the 5% brand fee on the deal's running total. A card is in escrow at once (in the demo; with Stripe
-- connected it waits for Stripe); a bank payment is processing until it clears; a wire waits until it arrives
create function public.fund_milestones(
  p_deal uuid, p_method public.payment_method, p_scope text default 'next', p_milestones uuid[] default null,
  p_method_label text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_pay uuid := gen_random_uuid();
  v_target uuid[];
  v_base bigint;
  v_basis bigint;
  v_fees_before bigint;
  v_fee bigint;
  v_seq integer;
  v_first integer;
  v_provider text := coalesce(private.setting('payments_provider'), 'simulated');
  v_status public.payment_status;
  d public.deals;
begin
  d := private.lock_deal_as(p_deal, 'brand');
  v_uid := auth.uid();
  if d.status = 'cancelled' then
    perform private.refuse('E5', 'This deal was cancelled');
  end if;

  if p_milestones is not null then
    if exists (select 1 from unnest(p_milestones) x
               where not exists (select 1 from public.milestones m where m.id = x and m.deal_id = d.id)) then
      perform private.refuse('E5', 'That milestone isn''t on this deal');
    end if;
    if exists (select 1 from public.milestones m where m.id = any (p_milestones) and m.status <> 'pending') then
      perform private.refuse('E5', 'One of those milestones is already funded');
    end if;
    v_target := array(select m.id from public.milestones m where m.id = any (p_milestones) order by m.seq);
  elsif p_scope = 'all' then
    v_target := array(select m.id from public.milestones m where m.deal_id = d.id and m.status = 'pending' order by m.seq);
  elsif p_scope = 'next' then
    v_target := array(select m.id from public.milestones m where m.deal_id = d.id and m.status = 'pending' order by m.seq limit 1);
  else
    perform private.refuse('E5', 'Fund the next milestone or everything remaining');
  end if;
  if coalesce(array_length(v_target, 1), 0) = 0 then
    perform private.refuse('E5', 'Everything on this deal is already funded');
  end if;

  select sum(m.amount_cents), min(m.seq) into v_base, v_first from public.milestones m where m.id = any (v_target);
  select coalesce(sum(p.base_cents), 0), coalesce(sum(p.fee_cents), 0) into v_basis, v_fees_before
  from public.payments p where p.deal_id = d.id and p.status <> 'failed';
  select coalesce(max(p.seq), 0) + 1 into v_seq from public.payments p where p.deal_id = d.id;
  -- 5% of everything funded, rounded once, less what the deal's payments were already charged
  v_fee := greatest(0, public.five_percent(v_basis + v_base) - v_fees_before);
  v_status := case
    when p_method = 'card' and v_provider = 'simulated' then 'succeeded'
    when p_method = 'wire' then 'awaiting_wire'
    else 'processing' end;

  insert into public.payments (id, deal_id, seq, brand_id, method, method_label, status, base_cents, fee_cents,
                               fee_basis_cents, fees_before_cents, total_cents, reference, provider, created_by, created_at,
                               succeeded_at)
  values (v_pay, d.id, v_seq, d.brand_id, p_method,
          coalesce(nullif(trim(p_method_label), ''), case p_method when 'card' then 'Card' when 'bank' then 'Bank (ACH)' else 'Wire transfer' end),
          v_status, v_base, v_fee, v_basis, v_fees_before, v_base + v_fee,
          'GI-' || upper(left(replace(v_pay::text, '-', ''), 12)),
          v_provider, v_uid, clock_timestamp(), case when v_status = 'succeeded' then now() end);
  insert into public.payment_milestones (payment_id, milestone_id, amount_cents)
  select v_pay, m.id, m.amount_cents from public.milestones m where m.id = any (v_target);
  update public.milestones
     set status = case v_status when 'succeeded' then 'in_escrow' when 'awaiting_wire' then 'awaiting_wire' else 'processing' end::public.milestone_status,
         payment_id = v_pay
   where id = any (v_target);

  if v_status = 'succeeded' then
    perform private.post_ledger(array['brand:' || d.brand_id, 'escrow:' || d.id, 'fees'],
                                array[-(v_base + v_fee), v_base, v_fee], 'escrow funded', p_deal => d.id, p_payment => v_pay);
  end if;
  perform private.refresh_deal_status(d.id);
  perform private.log_event(case when v_status = 'succeeded' then 'escrow_funded' else 'payment_started' end, 'brand',
                            d.brand_id, d.creator_id, p_deal => d.id, p_payment => v_pay, p_amount => v_base,
                            p_data => jsonb_build_object('method', p_method, 'milestones', array_length(v_target, 1)));
  return v_pay;
end
$$;

-- a bank payment or a wire clears as a whole: every milestone it paid for moves to escrow together. Clearing twice is
-- harmless (payment providers retry their webhooks)
create function private.clear_payment(p_payment uuid, p_side public.side) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  pay public.payments;
  d public.deals;
begin
  select * into pay from public.payments where id = p_payment;
  if not found then
    perform private.not_found('Payment');
  end if;
  d := private.lock_deal(pay.deal_id);
  select * into pay from public.payments where id = p_payment for no key update;
  if pay.status = 'succeeded' then
    return false;
  end if;
  if pay.status = 'failed' then
    perform private.refuse('E3', 'This payment failed. Fund the milestones again');
  end if;
  update public.payments set status = 'succeeded', succeeded_at = now() where id = pay.id;
  update public.milestones set status = 'in_escrow' where payment_id = pay.id;
  perform private.post_ledger(array['brand:' || pay.brand_id, 'escrow:' || pay.deal_id, 'fees'],
                              array[-pay.total_cents, pay.base_cents, pay.fee_cents], 'escrow funded',
                              p_deal => pay.deal_id, p_payment => pay.id);
  perform private.refresh_deal_status(pay.deal_id);
  perform private.log_event('escrow_funded', p_side, d.brand_id, d.creator_id, p_deal => d.id, p_payment => pay.id,
                            p_amount => pay.base_cents, p_data => jsonb_build_object('method', pay.method, 'cleared', true));
  return true;
end
$$;

-- a payment that didn't go through: its milestones are back to not funded and can be funded again
create function private.fail_payment(p_payment uuid, p_side public.side, p_reason text) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  pay public.payments;
  d public.deals;
begin
  select * into pay from public.payments where id = p_payment;
  if not found then
    perform private.not_found('Payment');
  end if;
  d := private.lock_deal(pay.deal_id);
  select * into pay from public.payments where id = p_payment for no key update;
  if pay.status = 'failed' then
    return false;
  end if;
  if pay.status = 'succeeded' then
    perform private.refuse('E3', 'This payment already cleared');
  end if;
  update public.payments set status = 'failed', failed_at = now() where id = pay.id;
  update public.milestones set status = 'pending', payment_id = null where payment_id = pay.id;
  perform private.refresh_deal_status(pay.deal_id);
  perform private.log_event('payment_failed', p_side, d.brand_id, d.creator_id, p_deal => d.id, p_payment => pay.id,
                            p_amount => pay.base_cents, p_data => jsonb_build_object('method', pay.method, 'reason', nullif(trim(p_reason), '')));
  return true;
end
$$;

-- E3, E4 in the demo: the brand says its bank payment cleared or its wire arrived (or failed). Only for simulated payments
create function public.simulate_payment(p_payment uuid, p_outcome text default 'cleared') returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  pay public.payments;
  v_creator uuid;
begin
  select * into pay from public.payments where id = p_payment;
  if not found then
    perform private.not_found('Payment');
  end if;
  select d.creator_id into v_creator from public.deals d where d.id = pay.deal_id;
  perform private.assert_acting('brand', pay.brand_id, v_creator);
  if pay.provider <> 'simulated' or coalesce(private.setting('payments_provider'), '') <> 'simulated' then
    perform private.refuse('E3', 'Only demo payments can be cleared by hand');
  end if;
  if p_outcome = 'cleared' then
    return private.clear_payment(p_payment, 'brand');
  elsif p_outcome = 'failed' then
    return private.fail_payment(p_payment, 'brand', 'demo');
  end if;
  perform private.refuse('E3', 'Say cleared or failed');
  return false;
end
$$;

-- the payment provider's webhook, with the service key: the money arrived, or it didn't
create function public.confirm_payment(p_payment uuid, p_provider_ref text default null) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_changed boolean;
begin
  v_changed := private.clear_payment(p_payment, null);
  if p_provider_ref is not null then
    update public.payments set provider_ref = p_provider_ref where id = p_payment and provider_ref is null;
  end if;
  return v_changed;
end
$$;

create function public.fail_payment(p_payment uuid, p_reason text default '') returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$ begin return private.fail_payment(p_payment, null, p_reason); end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Proof and release
-- ---------------------------------------------------------------------------------------------------------------------
-- P1, E6: the creator uploads proof for a deliverable whose money is in escrow; one live proof per deliverable
create function public.submit_proof(
  p_deliverable uuid, p_link_url text default null, p_file_path text default null, p_note text default ''
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_deal uuid;
  v_proof uuid;
  d public.deals;
  dl public.deliverables;
  m public.milestones;
  b public.brands;
begin
  select deal_id into v_deal from public.deliverables where id = p_deliverable;
  if not found then
    perform private.not_found('Deliverable');
  end if;
  d := private.lock_deal_as(v_deal, 'creator');
  v_uid := auth.uid();
  select * into dl from public.deliverables where id = p_deliverable;
  select * into m from public.milestones where id = dl.milestone_id;
  select * into b from public.brands where id = d.brand_id;
  if d.status = 'cancelled' then
    perform private.refuse('E6', 'This deal was cancelled');
  end if;
  if dl.status = 'done' then
    perform private.refuse('P6', 'This deliverable is already approved and paid');
  end if;
  if exists (select 1 from public.proofs p where p.deliverable_id = dl.id and p.status in ('in_review', 'releasing')) then
    perform private.refuse('P1', 'Your proof for ' || dl.label || ' is already in review with ' || b.name);
  end if;
  if m.status <> 'in_escrow' then
    perform private.refuse('E6', case
      when m.status in ('processing', 'awaiting_wire') then b.name || '''s payment is still clearing. You can upload once it''s in escrow'
      else b.name || ' hasn''t funded escrow for this yet. You can upload once it''s funded' end);
  end if;
  if p_link_url is null and p_file_path is null then
    perform private.refuse('P1', 'Add a link or a file as proof');
  end if;
  if p_link_url is not null and p_link_url !~* '^https?://\S+$' then
    perform private.refuse('P1', 'Links start with http:// or https://');
  end if;
  if p_file_path is not null and (private.deal_of_path(p_file_path) is distinct from d.id or p_file_path !~ '^[0-9a-f-]{36}/[^/].*') then
    perform private.refuse('P1', 'Upload the file to this deal''s folder in proofs');
  end if;

  insert into public.proofs (deal_id, deliverable_id, milestone_id, status, value_cents, link_url, file_path, note, submitted_by)
  values (d.id, dl.id, m.id, 'in_review', dl.amount_cents, p_link_url, p_file_path, coalesce(p_note, ''), v_uid)
  returning id into v_proof;
  update public.deliverables set status = 'in_review' where id = dl.id;
  perform private.log_event('proof_submitted', 'creator', d.brand_id, d.creator_id, p_deal => d.id, p_proof => v_proof,
                            p_amount => dl.amount_cents, p_data => jsonb_build_object('deliverable', dl.label));
  return v_proof;
end
$$;

-- P2, P6: approving starts a short undo window (6 seconds unless the app asks otherwise); the money releases when it
-- ends. Approving twice is refused. With no window the release happens now
create function public.approve_proof(p_proof uuid, p_undo_seconds integer default 6) returns timestamptz
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_deal uuid;
  v_at timestamptz;
  d public.deals;
  pf public.proofs;
  m public.milestones;
begin
  select deal_id into v_deal from public.proofs where id = p_proof;
  if not found then
    perform private.not_found('Proof');
  end if;
  d := private.lock_deal_as(v_deal, 'brand');
  v_uid := auth.uid();
  select * into pf from public.proofs where id = p_proof for no key update;
  if pf.status = 'releasing' then
    perform private.refuse('P6', 'Already approved: it releases when the undo window ends');
  elsif pf.status = 'released' then
    perform private.refuse('P6', 'Already released');
  elsif pf.status <> 'in_review' then
    perform private.refuse('P2', 'This proof isn''t waiting for approval');
  end if;
  if p_undo_seconds is null or p_undo_seconds not between 0 and 60 then
    perform private.refuse('P2', 'The undo window is 0 to 60 seconds');
  end if;
  select * into m from public.milestones where id = pf.milestone_id;
  if m.status <> 'in_escrow' then
    perform private.refuse('E6', 'The money for this isn''t in escrow');
  end if;

  v_at := now() + make_interval(secs => p_undo_seconds);
  update public.proofs set status = 'releasing', approved_by = v_uid, approved_at = now(), release_at = v_at where id = pf.id;
  perform private.log_event('proof_approved', 'brand', d.brand_id, d.creator_id, p_deal => d.id, p_proof => pf.id,
                            p_amount => pf.value_cents, p_data => jsonb_build_object('undo_seconds', p_undo_seconds));
  if p_undo_seconds = 0 then
    perform private.finalize_release(pf.id);
  end if;
  return v_at;
end
$$;

-- P3: undo during the window puts the proof back in review; approving again starts a new window
create function public.undo_approval(p_proof uuid) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_deal uuid;
  d public.deals;
  pf public.proofs;
begin
  select deal_id into v_deal from public.proofs where id = p_proof;
  if not found then
    perform private.not_found('Proof');
  end if;
  d := private.lock_deal_as(v_deal, 'brand');
  select * into pf from public.proofs where id = p_proof for no key update;
  if pf.status = 'released' then
    perform private.refuse('P3', 'Too late: this proof is already released');
  elsif pf.status <> 'releasing' then
    perform private.refuse('P3', 'This proof isn''t releasing');
  end if;
  if pf.release_at <= now() then
    perform private.refuse('P3', 'Too late: the undo window has ended');
  end if;
  update public.proofs set status = 'in_review', approved_by = null, approved_at = null, release_at = null,
                           review_started_at = now()
   where id = pf.id;
  perform private.log_event('approval_undone', 'brand', d.brand_id, d.creator_id, p_deal => d.id, p_proof => pf.id,
                            p_amount => pf.value_cents);
end
$$;

-- P4: requesting changes sends the deliverable back; a new upload goes back to review
create function public.request_changes(p_proof uuid, p_note text default '') returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_deal uuid;
  d public.deals;
  pf public.proofs;
begin
  select deal_id into v_deal from public.proofs where id = p_proof;
  if not found then
    perform private.not_found('Proof');
  end if;
  d := private.lock_deal_as(v_deal, 'brand');
  select * into pf from public.proofs where id = p_proof for no key update;
  if pf.status = 'releasing' then
    perform private.refuse('P4', 'Undo the approval first');
  elsif pf.status = 'released' then
    perform private.refuse('P4', 'Already released');
  elsif pf.status <> 'in_review' then
    perform private.refuse('P4', 'This proof isn''t waiting for approval');
  end if;
  update public.proofs set status = 'changes_requested', changes_note = nullif(trim(p_note), ''), changes_at = now()
   where id = pf.id;
  update public.deliverables set status = 'changes_requested' where id = pf.deliverable_id;
  perform private.log_event('changes_requested', 'brand', d.brand_id, d.creator_id, p_deal => d.id, p_proof => pf.id,
                            p_data => jsonb_build_object('note', nullif(trim(p_note), '')));
end
$$;

-- P2, P5, P6, M3: the release itself. Once per proof, whoever asks first (both tabs, the scheduler): the deliverable's
-- share leaves escrow, the creator gets it less the 5% creator fee on the deal's running total, and the deal completes
-- when everything is released. Asking again returns the same release
create function private.finalize_release(p_proof uuid) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_deal uuid;
  v_release uuid;
  v_before bigint;
  v_fee bigint;
  v_at timestamptz;
  d public.deals;
  pf public.proofs;
  m public.milestones;
  dl public.deliverables;
begin
  select deal_id into v_deal from public.proofs where id = p_proof;
  if not found then
    perform private.not_found('Proof');
  end if;
  d := private.lock_deal(v_deal);
  select * into pf from public.proofs where id = p_proof for no key update;
  if pf.status = 'released' then
    select r.id into v_release from public.releases r where r.proof_id = pf.id;
    return v_release;
  end if;
  if pf.status <> 'releasing' then
    perform private.refuse('P3', 'This proof isn''t approved');
  end if;
  if pf.release_at > now() then
    perform private.refuse('P2', 'The undo window hasn''t ended yet');
  end if;
  select * into m from public.milestones where id = pf.milestone_id for no key update;
  select * into dl from public.deliverables where id = pf.deliverable_id for no key update;
  if m.status <> 'in_escrow' or m.released_cents + pf.value_cents > m.amount_cents or pf.value_cents <> dl.amount_cents then
    raise exception 'Escrow for milestone % can''t cover proof %', m.id, pf.id;
  end if;

  select coalesce(sum(r.gross_cents), 0) into v_before from public.releases r where r.deal_id = d.id;
  v_fee := public.fee_step(v_before, pf.value_cents);
  v_at := pf.release_at;
  insert into public.releases (proof_id, deal_id, milestone_id, creator_id, gross_cents, fee_cents, net_cents, released_at)
  values (pf.id, d.id, m.id, d.creator_id, pf.value_cents, v_fee, pf.value_cents - v_fee, v_at)
  returning id into v_release;
  update public.proofs set status = 'released', released_at = v_at, release_at = null where id = pf.id;
  update public.milestones
     set released_cents = released_cents + pf.value_cents,
         status = case when released_cents + pf.value_cents = amount_cents then 'released' else status end::public.milestone_status
   where id = m.id;
  update public.deliverables set status = 'done', done_at = v_at where id = dl.id;
  perform private.post_ledger(array['escrow:' || d.id, 'creator:' || d.creator_id, 'fees'],
                              array[-pf.value_cents, pf.value_cents - v_fee, v_fee], 'released to creator',
                              p_deal => d.id, p_release => v_release);
  perform private.log_event('payment_released', 'brand', d.brand_id, d.creator_id, p_deal => d.id, p_proof => pf.id,
                            p_amount => pf.value_cents,
                            p_data => jsonb_build_object('deliverable', dl.label, 'fee', v_fee, 'net', pf.value_cents - v_fee));
  perform private.refresh_deal_status(d.id);
  return v_release;
end
$$;

-- the app calls this when the undo window ends (from either seat); the scheduler catches anything left over
create function public.finalize_release(p_proof uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  d public.deals;
begin
  select dd.* into d from public.deals dd join public.proofs p on p.deal_id = dd.id where p.id = p_proof;
  if not found then
    perform private.not_found('Proof');
  end if;
  if not (private.is_brand_member(d.brand_id) or private.is_creator_owner(d.creator_id)) then
    raise exception using message = 'This isn''t your deal', errcode = '42501', hint = 'not_your_deal';
  end if;
  return private.finalize_release(p_proof);
end
$$;

-- the scheduler: releases every approval whose undo window has ended, and approves proof a brand left unanswered for
-- 5 days (the prototype's auto-approval)
create function public.release_due() returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r record;
  n integer := 0;
begin
  -- one pass in deal order, so two runs at once take their locks in the same order and never deadlock
  for r in
    select p.id, p.deal_id, p.status from public.proofs p
    where (p.status = 'in_review' and p.review_started_at <= now() - interval '5 days')
       or (p.status = 'releasing' and p.release_at <= now())
    order by p.deal_id, p.id
    limit 1000
  loop
    begin
      perform private.lock_deal(r.deal_id);
      if r.status = 'in_review' then
        update public.proofs set status = 'releasing', approved_at = now(), release_at = now()
         where id = r.id and status = 'in_review' and review_started_at <= now() - interval '5 days';
        if found then
          perform private.log_event('proof_auto_approved', null, d.brand_id, d.creator_id, p_deal => d.id, p_proof => r.id)
          from public.deals d where d.id = r.deal_id;
        end if;
      end if;
      if exists (select 1 from public.proofs p where p.id = r.id and p.status = 'releasing' and p.release_at <= now()) then
        perform private.finalize_release(r.id);
        n := n + 1;
      end if;
    exception when others then
      raise warning 'release of proof % failed: %', r.id, sqlerrm;
    end;
  end loop;
  return n;
end
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Renewals
-- ---------------------------------------------------------------------------------------------------------------------
-- how many deliverables a new period repeats: a monthly deal repeats its latest month, any other deal its own
create function private.renewal_template_size(d public.deals) returns integer
language sql stable
set search_path = ''
as $$
  select case when d.type = 'monthly' then (
           select count(*)::integer from public.deliverables dl
           where dl.milestone_id = (select m.id from public.milestones m where m.deal_id = d.id and m.period_id is not null
                                    order by m.seq desc limit 1))
         else (
           select count(*)::integer from public.deliverables dl join public.milestones m on m.id = dl.milestone_id
           where dl.deal_id = d.id and m.renewal_id is null) end
$$;

create function private.check_renewal_terms(d public.deals, p_months integer, p_price bigint) returns void
language plpgsql
set search_path = ''
as $$
begin
  if d.status = 'cancelled' then
    perform private.refuse('R1', 'This deal was cancelled');
  end if;
  if p_months is null or p_months not between 1 and 24 then
    perform private.refuse('R1', 'Renew for 1 to 24 months');
  end if;
  if d.type <> 'monthly' and p_months <> 1 then
    perform private.refuse('R1', 'Renewing this deal adds one more period: months must be 1');
  end if;
  if p_price is null or p_price <= 0 then
    perform private.refuse('R1', 'Enter a price above $0');
  end if;
  if p_price < greatest(private.renewal_template_size(d), 1) then
    perform private.refuse('M1', 'The price has to cover at least a cent per deliverable');
  end if;
  if p_price > 1000000000 then
    perform private.refuse('M1', 'A renewal period can be up to $10,000,000');
  end if;
end
$$;

-- R3: an accepted renewal adds the new period as milestones to fund, with the same deliverables again
create function private.add_renewal_period(p_deal uuid, p_renewal uuid) returns void
language plpgsql
set search_path = ''
as $$
declare
  d public.deals;
  r public.renewals;
  v_last public.milestones;
  v_period public.deal_periods;
  v_labels text[];
  v_offsets integer[];
  v_shares bigint[];
  v_start date;
  v_end date;
  v_mseq integer;
  v_pseq integer;
  v_dseq integer;
  v_period_id uuid;
  v_ms uuid;
  v_n integer;
  k integer;
  j integer;
begin
  select * into d from public.deals where id = p_deal;
  select * into r from public.renewals where id = p_renewal;
  select coalesce(max(m.seq), 0) into v_mseq from public.milestones m where m.deal_id = d.id;
  select coalesce(max(x.seq), 0) into v_dseq from public.deliverables x where x.deal_id = d.id;

  if d.type = 'monthly' then
    select m.* into v_last from public.milestones m where m.deal_id = d.id and m.period_id is not null order by m.seq desc limit 1;
    select p.* into v_period from public.deal_periods p where p.id = v_last.period_id;
    select array_agg(x.label order by x.seq), array_agg(coalesce(x.due_on - v_period.starts_on, 0) order by x.seq)
      into v_labels, v_offsets
    from public.deliverables x where x.milestone_id = v_last.id;
    v_n := array_length(v_labels, 1);
    select coalesce(max(p.seq), 0) into v_pseq from public.deal_periods p where p.deal_id = d.id;
    v_start := coalesce(v_period.ends_on, current_date) + 1;
    for k in 1 .. r.months loop
      v_end := (v_start + interval '1 month')::date - 1;
      insert into public.deal_periods (deal_id, seq, label, starts_on, ends_on, renewal_id)
      values (d.id, v_pseq + k, upper(to_char(v_start, 'FMMonth')), v_start, v_end, r.id)
      returning id into v_period_id;
      insert into public.milestones (deal_id, seq, label, due_on, amount_cents, period_id, renewal_id)
      values (d.id, v_mseq + k, to_char(v_start, 'FMMonth') || ' payout', v_end, r.price_cents, v_period_id, r.id)
      returning id into v_ms;
      v_shares := public.split_cents(r.price_cents, v_n);
      for j in 1 .. v_n loop
        v_dseq := v_dseq + 1;
        insert into public.deliverables (deal_id, milestone_id, seq, label, due_on, amount_cents)
        values (d.id, v_ms, v_dseq, v_labels[j], least(v_start + v_offsets[j], v_end), v_shares[j]);
      end loop;
      v_start := v_end + 1;
    end loop;
    update public.deals set ends_on = v_start - 1 where id = d.id;
  else
    select array_agg(x.label order by x.seq), array_agg(greatest(coalesce(x.due_on - d.starts_on, 7), 1) order by x.seq)
      into v_labels, v_offsets
    from public.deliverables x join public.milestones m on m.id = x.milestone_id
    where x.deal_id = d.id and m.renewal_id is null;
    v_n := array_length(v_labels, 1);
    v_start := greatest(coalesce(d.ends_on, current_date), current_date);
    v_shares := public.split_cents(r.price_cents, v_n);
    insert into public.milestones (deal_id, seq, label, due_on, amount_cents, renewal_id)
    values (d.id, v_mseq + 1,
            'Renewal ' || (select count(*) from public.renewals x where x.deal_id = d.id and x.status = 'accepted'),
            v_start + (select max(o) from unnest(v_offsets) o), r.price_cents, r.id)
    returning id into v_ms;
    for j in 1 .. v_n loop
      v_dseq := v_dseq + 1;
      insert into public.deliverables (deal_id, milestone_id, seq, label, due_on, amount_cents)
      values (d.id, v_ms, v_dseq, v_labels[j], v_start + v_offsets[j], v_shares[j]);
    end loop;
    update public.deals set ends_on = v_start + (select max(o) from unnest(v_offsets) o) where id = d.id;
  end if;
end
$$;

-- R1: the brand offers to renew: more months (a monthly deal) or one more period, at a price per period
create function public.offer_renewal(p_deal uuid, p_months integer, p_price_cents bigint, p_auto_renew boolean default false)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_renewal uuid;
  d public.deals;
  open_one public.renewals;
begin
  d := private.lock_deal_as(p_deal, 'brand');
  v_uid := auth.uid();
  perform private.check_renewal_terms(d, p_months, p_price_cents);
  select * into open_one from public.renewals where deal_id = d.id and status in ('sent', 'requested');
  if found then
    perform private.refuse('R1', case open_one.status when 'sent' then 'A renewal is already open on this deal'
                                 else 'The creator already asked to renew. Accept or decline their request' end);
  end if;
  insert into public.renewals (deal_id, status, by_side, months, price_cents, auto_renew, created_by)
  values (d.id, 'sent', 'brand', p_months, p_price_cents, coalesce(p_auto_renew, false), v_uid)
  returning id into v_renewal;
  perform private.log_event('renewal_offered', 'brand', d.brand_id, d.creator_id, p_deal => d.id, p_renewal => v_renewal,
                            p_amount => p_price_cents, p_data => jsonb_build_object('months', p_months, 'auto_renew', coalesce(p_auto_renew, false)));
  return v_renewal;
end
$$;

-- R2: the creator asks the brand to renew; by default the same terms, 3 more months of a monthly deal
create function public.request_renewal(p_deal uuid, p_months integer default null, p_price_cents bigint default null)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_renewal uuid;
  v_months integer;
  v_price bigint;
  d public.deals;
  open_one public.renewals;
begin
  d := private.lock_deal_as(p_deal, 'creator');
  v_uid := auth.uid();
  v_months := coalesce(p_months, case when d.type = 'monthly' then 3 else 1 end);
  v_price := coalesce(p_price_cents, case when d.type = 'monthly' then (
                select m.amount_cents from public.milestones m where m.deal_id = d.id and m.period_id is not null
                order by m.seq desc limit 1) end, d.amount_cents);
  perform private.check_renewal_terms(d, v_months, v_price);
  select * into open_one from public.renewals where deal_id = d.id and status in ('sent', 'requested');
  if found then
    perform private.refuse('R2', case open_one.status when 'sent' then 'The brand already offered a renewal. Accept or decline it on this deal'
                                 else 'Renewal request already sent' end);
  end if;
  insert into public.renewals (deal_id, status, by_side, months, price_cents, created_by)
  values (d.id, 'requested', 'creator', v_months, v_price, v_uid)
  returning id into v_renewal;
  perform private.log_event('renewal_requested', 'creator', d.brand_id, d.creator_id, p_deal => d.id, p_renewal => v_renewal,
                            p_amount => v_price, p_data => jsonb_build_object('months', v_months));
  return v_renewal;
end
$$;

-- R3, R4: the other side accepts or declines, once
create function public.answer_renewal(p_renewal uuid, p_as public.side, p_accept boolean) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_deal uuid;
  d public.deals;
  r public.renewals;
begin
  select deal_id into v_deal from public.renewals where id = p_renewal;
  if not found then
    perform private.not_found('Renewal');
  end if;
  d := private.lock_deal_as(v_deal, p_as);
  v_uid := auth.uid();
  select * into r from public.renewals where id = p_renewal for no key update;
  if r.status not in ('sent', 'requested') then
    perform private.refuse('R4', 'This renewal was already ' || r.status);
  end if;
  if r.by_side = p_as then
    perform private.refuse('R4', 'This renewal is waiting on ' || private.side_label(private.other_side(p_as)) || ' to answer');
  end if;
  if p_accept is null then
    perform private.refuse('R4', 'Accept or decline');
  end if;
  if p_accept then
    perform private.check_renewal_terms(d, r.months, r.price_cents);
    update public.renewals set status = 'accepted', answered_by = v_uid, answered_at = now() where id = r.id;
    perform private.add_renewal_period(d.id, r.id);
    perform private.refresh_deal_status(d.id);
  else
    update public.renewals set status = 'declined', answered_by = v_uid, answered_at = now() where id = r.id;
  end if;
  perform private.log_event(case when p_accept then 'renewal_accepted' else 'renewal_declined' end, p_as,
                            d.brand_id, d.creator_id, p_deal => d.id, p_renewal => r.id,
                            p_amount => r.price_cents, p_data => jsonb_build_object('months', r.months));
end
$$;

-- R4: whoever opened a renewal can take it back before it's answered
create function public.withdraw_renewal(p_renewal uuid, p_as public.side) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_deal uuid;
  d public.deals;
  r public.renewals;
begin
  select deal_id into v_deal from public.renewals where id = p_renewal;
  if not found then
    perform private.not_found('Renewal');
  end if;
  d := private.lock_deal_as(v_deal, p_as);
  v_uid := auth.uid();
  select * into r from public.renewals where id = p_renewal for no key update;
  if r.status not in ('sent', 'requested') then
    perform private.refuse('R4', 'The renewal was already ' || r.status);
  end if;
  if r.by_side <> p_as then
    perform private.refuse('R4', 'Only ' || private.side_label(r.by_side) || ' can withdraw this; you can decline it');
  end if;
  update public.renewals set status = 'withdrawn', answered_by = v_uid, answered_at = now() where id = r.id;
  perform private.log_event('renewal_withdrawn', p_as, d.brand_id, d.creator_id, p_deal => d.id, p_renewal => r.id);
end
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Ratings and messages
-- ---------------------------------------------------------------------------------------------------------------------
-- T1, T2: each side rates the other once, after the deal is complete
create function public.rate_deal(p_deal uuid, p_as public.side, p_score integer, p_comment text default '') returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_rating uuid;
  d public.deals;
begin
  d := private.lock_deal_as(p_deal, p_as);
  v_uid := auth.uid();
  if d.status <> 'completed' then
    perform private.refuse('T1', 'You can rate once the deal is complete');
  end if;
  if p_score is null or p_score not between 1 and 5 then
    perform private.refuse('T1', 'Rate from 1 to 5');
  end if;
  if exists (select 1 from public.ratings x where x.deal_id = d.id and x.by_side = p_as) then
    perform private.refuse('T1', 'You already rated this deal');
  end if;
  insert into public.ratings (deal_id, by_side, score, comment, created_by)
  values (d.id, p_as, p_score, coalesce(p_comment, ''), v_uid)
  returning id into v_rating;
  perform private.log_event('deal_rated', p_as, d.brand_id, d.creator_id, p_deal => d.id,
                            p_data => jsonb_build_object('score', p_score));
  return v_rating;
end
$$;

-- C1: a message reaches the other side's thread, unread until they open it
create function public.send_message(p_brand uuid, p_creator uuid, p_as public.side, p_body text) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_conv uuid;
  v_msg uuid;
  v_seq bigint;
begin
  v_uid := private.assert_acting(p_as, p_brand, p_creator);
  if not exists (select 1 from public.brands b where b.id = p_brand) then
    perform private.not_found('Brand');
  end if;
  if not exists (select 1 from public.creators c where c.id = p_creator) then
    perform private.not_found('Creator');
  end if;
  if coalesce(length(trim(p_body)), 0) not between 1 and 4000 then
    perform private.refuse('C1', 'Write a message of up to 4,000 characters');
  end if;
  v_conv := private.ensure_conversation(p_brand, p_creator);
  -- messages in a thread take numbers in the order they're saved (the thread is locked while one is added), so
  -- "read up to message n" never covers a message that was still being sent
  select c.last_message_seq + 1 into v_seq from public.conversations c where c.id = v_conv for no key update;
  insert into public.messages (conversation_id, sender_side, sender_id, body, seq)
  values (v_conv, p_as, v_uid, trim(p_body), v_seq)
  returning id into v_msg;
  update public.conversations set last_message_at = now(), last_message_seq = v_seq where id = v_conv;
  insert into public.conversation_reads (conversation_id, side, last_read_seq, last_read_at)
  values (v_conv, p_as, v_seq, clock_timestamp())
  on conflict (conversation_id, side) do update
    set last_read_seq = greatest(public.conversation_reads.last_read_seq, excluded.last_read_seq),
        last_read_at = excluded.last_read_at;
  insert into public.notifications (user_id, kind)
  select t.user_id, 'message' from (
    select c.owner_id as user_id from public.creators c where c.id = p_creator and p_as = 'brand'
    union
    select m.user_id from public.brand_members m where m.brand_id = p_brand and p_as = 'creator'
  ) t;
  return v_msg;
end
$$;

-- C1: opening the thread marks it read for that side, up to the last message the app showed (or every message saved
-- so far); the other side then sees "seen"
create function public.mark_read(p_conversation uuid, p_as public.side, p_upto_seq bigint default null) returns bigint
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  c public.conversations;
  v_upto bigint;
begin
  select * into c from public.conversations where id = p_conversation;
  if not found then
    perform private.not_found('Conversation');
  end if;
  perform private.assert_acting(p_as, c.brand_id, c.creator_id);
  select coalesce(max(m.seq), 0) into v_upto from public.messages m where m.conversation_id = c.id;
  v_upto := least(coalesce(p_upto_seq, v_upto), v_upto);
  insert into public.conversation_reads (conversation_id, side, last_read_seq, last_read_at)
  values (c.id, p_as, v_upto, clock_timestamp())
  on conflict (conversation_id, side) do update
    set last_read_seq = greatest(public.conversation_reads.last_read_seq, excluded.last_read_seq),
        last_read_at = excluded.last_read_at;
  return v_upto;
end
$$;

create function public.mark_notifications_read(p_ids bigint[] default null) returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  if auth.uid() is null then
    raise exception using message = 'Sign in first', errcode = '42501', hint = 'sign_in';
  end if;
  update public.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics n = row_count;
  return n;
end
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Payouts
-- ---------------------------------------------------------------------------------------------------------------------
-- M5: the creator pays out from their available balance (releases less payouts). Weekly payouts are free, an instant
-- one costs 1.5%. In the demo a payout is paid at once; with Stripe it waits for the transfer (complete_payout)
create function public.request_payout(p_creator uuid, p_amount_cents bigint default null, p_instant boolean default false)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_payout uuid;
  v_available bigint;
  v_amount bigint;
  v_fee bigint;
  v_provider text := coalesce(private.setting('payments_provider'), 'simulated');
begin
  if not exists (select 1 from public.creators c where c.id = p_creator) then
    perform private.not_found('Creator');
  end if;
  v_uid := private.assert_acting('creator', null, p_creator);
  perform 1 from public.creators where id = p_creator for no key update;
  v_available := (select coalesce(sum(r.net_cents), 0) from public.releases r where r.creator_id = p_creator)
               - (select coalesce(sum(o.amount_cents), 0) from public.payouts o where o.creator_id = p_creator and o.status <> 'failed');
  v_amount := coalesce(p_amount_cents, v_available);
  if v_amount <= 0 then
    perform private.refuse('M5', 'Nothing to pay out yet');
  end if;
  if v_amount > v_available then
    perform private.refuse('M5', 'You can pay out up to ' || private.money(v_available));
  end if;
  v_fee := case when coalesce(p_instant, false) then public.instant_payout_fee(v_amount) else 0 end;
  if v_amount - v_fee <= 0 then
    perform private.refuse('M5', 'That payout is too small to cover the instant payout fee');
  end if;
  insert into public.payouts (creator_id, amount_cents, instant, fee_cents, net_cents, status, provider, created_by, paid_at)
  values (p_creator, v_amount, coalesce(p_instant, false), v_fee, v_amount - v_fee,
          case when v_provider = 'simulated' then 'paid' else 'pending' end::public.payout_status, v_provider, v_uid,
          case when v_provider = 'simulated' then now() end)
  returning id into v_payout;
  perform private.post_ledger(array['creator:' || p_creator, 'payouts:' || p_creator, 'fees'],
                              array[-v_amount, v_amount - v_fee, v_fee], 'payout', p_payout => v_payout);
  perform private.log_event('payout_requested', 'creator', null, p_creator, p_amount => v_amount,
                            p_data => jsonb_build_object('payout', v_payout, 'instant', coalesce(p_instant, false), 'fee', v_fee));
  return v_payout;
end
$$;

-- the payout provider's webhook, with the service key: the transfer went through, or it failed and the money goes
-- back to the available balance
create function public.complete_payout(p_payout uuid, p_paid boolean, p_provider_ref text default null) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  po public.payouts;
begin
  if p_paid is null then
    perform private.refuse('M5', 'Say whether the payout was paid');
  end if;
  select * into po from public.payouts where id = p_payout;
  if not found then
    perform private.not_found('Payout');
  end if;
  perform 1 from public.creators where id = po.creator_id for no key update;
  select * into po from public.payouts where id = p_payout for no key update;
  if po.status <> 'pending' then
    return false;
  end if;
  if p_paid then
    update public.payouts set status = 'paid', paid_at = now(), provider_ref = coalesce(p_provider_ref, provider_ref) where id = po.id;
  else
    update public.payouts set status = 'failed', failed_at = now(), provider_ref = coalesce(p_provider_ref, provider_ref) where id = po.id;
    perform private.post_ledger(array['payouts:' || po.creator_id, 'fees', 'creator:' || po.creator_id],
                                array[-po.net_cents, -po.fee_cents, po.amount_cents], 'payout failed', p_payout => po.id);
  end if;
  perform private.log_event(case when p_paid then 'payout_paid' else 'payout_failed' end, null, null, po.creator_id,
                            p_amount => po.amount_cents, p_data => jsonb_build_object('payout', po.id));
  return true;
end
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------------------------------------------------
-- anyone signed in can start a brand and owns it
create function public.create_brand(p_name text, p_slug text default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_brand uuid;
  v_slug text;
begin
  if auth.uid() is null then
    raise exception using message = 'Sign in first', errcode = '42501', hint = 'sign_in';
  end if;
  if coalesce(length(trim(p_name)), 0) not between 1 and 80 then
    perform private.refuse('account', 'Give the brand a name of up to 80 characters');
  end if;
  v_slug := coalesce(nullif(trim(p_slug), ''), trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g')));
  if v_slug !~ '^[a-z0-9-]{2,40}$' then
    perform private.refuse('account', 'The brand''s web name can use 2 to 40 lowercase letters, digits and dashes');
  end if;
  if exists (select 1 from public.brands b where b.slug = v_slug) then
    perform private.refuse('account', 'That brand name is taken');
  end if;
  begin
    insert into public.brands (name, slug) values (trim(p_name), v_slug) returning id into v_brand;
  exception when unique_violation then
    perform private.refuse('account', 'That brand name is taken');
  end;
  insert into public.brand_members (brand_id, user_id, role) values (v_brand, auth.uid(), 'owner');
  return v_brand;
end
$$;

-- a creator profile for the person signed in (one each for now)
create function public.create_creator_profile(p_handle text, p_display_name text) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_creator uuid;
begin
  if auth.uid() is null then
    raise exception using message = 'Sign in first', errcode = '42501', hint = 'sign_in';
  end if;
  if exists (select 1 from public.creators c where c.owner_id = auth.uid()) then
    perform private.refuse('account', 'You already have a creator profile');
  end if;
  if coalesce(p_handle, '') !~ '^[A-Za-z0-9_.-]{2,32}$' then
    perform private.refuse('account', 'A handle is 2 to 32 letters, digits, dots, dashes or underscores');
  end if;
  if exists (select 1 from public.creators c where lower(c.handle) = lower(p_handle)) then
    perform private.refuse('account', 'That handle is taken');
  end if;
  if coalesce(length(trim(p_display_name)), 0) not between 1 and 80 then
    perform private.refuse('account', 'Give your profile a name of up to 80 characters');
  end if;
  begin
    insert into public.creators (owner_id, handle, display_name) values (auth.uid(), p_handle, trim(p_display_name))
    returning id into v_creator;
  exception when unique_violation then
    perform private.refuse('account', 'That handle is taken, or you already have a creator profile');
  end;
  return v_creator;
end
$$;
