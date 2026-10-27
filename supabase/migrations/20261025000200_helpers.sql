-- Helpers the actions and the access rules share. They live in the private schema, which the Supabase API doesn't
-- expose: nobody can call them over the API, and only the few the access rules need are granted to signed-in users
-- (security migration).

create schema private;
revoke all on schema private from public;
-- functions here are not callable by anyone unless granted (Postgres would otherwise let everyone execute them)
alter default privileges in schema private revoke execute on functions from public;

-- ---------------------------------------------------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------------------------------------------------
-- payments_provider: 'stripe' (every payment waits for Stripe's webhook, which calls confirm_payment with the service
-- key) or 'simulated' (the demo: cards clear at once, bank and wire clear by hand). Every project starts on 'stripe',
-- so nothing is ever funded for free on a real project: until Stripe is connected, payments simply wait. Only the demo
-- seed switches to 'simulated'. The provider can change only before any money has moved, so simulated money can never
-- be paid out as real money
create table private.settings (
  key text primary key,
  value text not null,
  constraint settings_known check (key <> 'payments_provider' or value in ('simulated', 'stripe'))
);
insert into private.settings (key, value) values ('payments_provider', 'stripe');

create function private.settings_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.key = 'payments_provider' and new.value is distinct from old.value
     and (exists (select 1 from public.payments) or exists (select 1 from public.payouts)) then
    raise exception 'The payments provider can only change before any money has moved (this database has payments or payouts)';
  end if;
  return new;
end
$$;
create trigger settings_guard before update on private.settings for each row execute function private.settings_guard();

create function private.setting(p_key text) returns text
language sql stable
set search_path = ''
as $$ select s.value from private.settings s where s.key = p_key $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Refusals. Every refusal names the rule it enforces in the error's hint (O9, E6, P6 ...: the rules table in the spec),
-- so the app can show the message and tests can check which rule said no. Over the API: P0001 is a 400, P0002 a 404,
-- 42501 a 401 or 403.
-- ---------------------------------------------------------------------------------------------------------------------
create function private.refuse(p_rule text, p_message text) returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using message = p_message, errcode = 'P0001', hint = p_rule;
end
$$;

create function private.not_found(p_what text) returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using message = p_what || ' not found', errcode = 'P0002', hint = 'not_found';
end
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Who is asking. One person can sit on both sides (the demo account owns Instant Shock and works for six brands), so
-- every action says which side it is taken for, and this checks the person really sits there.
-- ---------------------------------------------------------------------------------------------------------------------
create function private.my_brand_ids() returns setof uuid
language sql stable security definer set search_path = public, pg_temp
as $$ select m.brand_id from public.brand_members m where m.user_id = auth.uid() $$;

create function private.my_creator_ids() returns setof uuid
language sql stable security definer set search_path = public, pg_temp
as $$ select c.id from public.creators c where c.owner_id = auth.uid() $$;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select exists (select 1 from public.platform_admins a where a.user_id = auth.uid()) $$;

create function private.is_brand_member(p_brand uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select exists (select 1 from public.brand_members m where m.brand_id = p_brand and m.user_id = auth.uid()) $$;

create function private.is_creator_owner(p_creator uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select exists (select 1 from public.creators c where c.id = p_creator and c.owner_id = auth.uid()) $$;

-- the deals someone may see: their brands' deals, their creator profile's deals, every deal for GameIn staff
create function private.my_deal_ids() returns setof uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select d.id from public.deals d
  where d.brand_id in (select m.brand_id from public.brand_members m where m.user_id = auth.uid())
     or d.creator_id in (select c.id from public.creators c where c.owner_id = auth.uid())
     or exists (select 1 from public.platform_admins a where a.user_id = auth.uid())
$$;

-- the people someone deals with: their brands' teammates, and the people on the other side of every conversation they
-- are in (every offer and deal has one). Profile names are visible to these people only
create function private.my_contact_ids() returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select auth.uid()
  union
  select m.user_id from public.brand_members m
  where m.brand_id in (select x.brand_id from public.brand_members x where x.user_id = auth.uid())
  union
  select c.owner_id from public.conversations v join public.creators c on c.id = v.creator_id
  where v.brand_id in (select x.brand_id from public.brand_members x where x.user_id = auth.uid())
  union
  select m.user_id from public.conversations v join public.brand_members m on m.brand_id = v.brand_id
  where v.creator_id in (select c.id from public.creators c where c.owner_id = auth.uid())
$$;

create function private.side_label(p_side public.side) returns text
language sql immutable
set search_path = ''
as $$ select case p_side when 'brand' then 'the brand' else 'the creator' end $$;

-- the person acting, after checking they sit on that side of this brand and creator
create function private.assert_acting(p_as public.side, p_brand uuid, p_creator uuid) returns uuid
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception using message = 'Sign in first', errcode = '42501', hint = 'sign_in';
  end if;
  if p_as = 'brand' then
    if not exists (select 1 from public.brand_members m where m.brand_id = p_brand and m.user_id = uid) then
      raise exception using message = 'You don''t work for this brand', errcode = '42501', hint = 'not_your_brand';
    end if;
  elsif p_as = 'creator' then
    if not exists (select 1 from public.creators c where c.id = p_creator and c.owner_id = uid) then
      raise exception using message = 'This isn''t your creator profile', errcode = '42501', hint = 'not_your_creator';
    end if;
  else
    raise exception using message = 'Say which side you are acting for: brand or creator', errcode = '42501', hint = 'no_side';
  end if;
  return uid;
end
$$;

-- proof files live in the proofs bucket under <deal id>/...
create function private.deal_of_path(p_name text) returns uuid
language plpgsql immutable
set search_path = ''
as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when invalid_text_representation then
  return null;
end
$$;

create function private.can_upload_proof(p_name text) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.deals d join public.creators c on c.id = d.creator_id
    where d.id = private.deal_of_path(p_name) and c.owner_id = auth.uid() and d.status <> 'cancelled')
$$;

create function private.can_read_proof(p_name text) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select private.deal_of_path(p_name) in (select private.my_deal_ids()) $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- The ledger: one balanced transaction per money move
-- ---------------------------------------------------------------------------------------------------------------------
create function private.post_ledger(
  p_accounts text[], p_amounts bigint[], p_memo text,
  p_deal uuid default null, p_payment uuid default null, p_release uuid default null, p_payout uuid default null
) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  txn uuid := gen_random_uuid();
begin
  if coalesce(array_length(p_accounts, 1), 0) <> coalesce(array_length(p_amounts, 1), 0) then
    raise exception 'Ledger posting "%": % accounts but % amounts', p_memo, array_length(p_accounts, 1), array_length(p_amounts, 1);
  end if;
  if (select coalesce(sum(x), 0) from unnest(p_amounts) as x) <> 0 then
    raise exception 'Ledger posting "%" does not balance', p_memo;
  end if;
  insert into public.ledger_entries (txn_id, account, amount_cents, deal_id, payment_id, release_id, payout_id, memo)
  select txn, t.account, t.amount, p_deal, p_payment, p_release, p_payout, p_memo
  from unnest(p_accounts, p_amounts) as t(account, amount)
  where t.amount <> 0;
  return txn;
end
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- The event log, the conversations' event lines and the notifications
-- ---------------------------------------------------------------------------------------------------------------------
-- p_side is the side that made the move; the other side is notified. A move by nobody (an expiry, a scheduled release)
-- notifies both.
create function private.log_event(
  p_kind text, p_side public.side, p_brand uuid, p_creator uuid,
  p_offer uuid default null, p_deal uuid default null, p_payment uuid default null, p_proof uuid default null,
  p_renewal uuid default null, p_amount bigint default null, p_data jsonb default '{}'::jsonb
) returns bigint
language plpgsql
set search_path = ''
as $$
declare
  eid bigint;
begin
  if p_brand is not null and p_creator is not null then
    perform private.ensure_conversation(p_brand, p_creator);
  end if;
  insert into public.events (kind, actor_id, actor_side, brand_id, creator_id, offer_id, deal_id, payment_id, proof_id,
                             renewal_id, amount_cents, data)
  values (p_kind, auth.uid(), p_side, p_brand, p_creator, p_offer, p_deal, p_payment, p_proof, p_renewal, p_amount,
          coalesce(p_data, '{}'::jsonb))
  returning id into eid;

  insert into public.notifications (user_id, event_id, kind)
  select distinct t.user_id, eid, p_kind
  from (
    select c.owner_id as user_id from public.creators c
    where c.id = p_creator and (p_side is null or p_side = 'brand')
    union
    select m.user_id from public.brand_members m
    where m.brand_id = p_brand and (p_side is null or p_side = 'creator')
  ) t;
  return eid;
end
$$;

create function private.ensure_conversation(p_brand uuid, p_creator uuid) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  cid uuid;
begin
  insert into public.conversations (brand_id, creator_id) values (p_brand, p_creator)
  on conflict (brand_id, creator_id) do nothing;
  select c.id into cid from public.conversations c where c.brand_id = p_brand and c.creator_id = p_creator;
  return cid;
end
$$;

-- a deal is completed when every milestone is released, in progress once anything is funded or paid, otherwise
-- awaiting funding. A renewal adds milestones to fund, so a completed deal can go back to in progress.
create function private.refresh_deal_status(p_deal uuid) returns public.deal_status
language plpgsql
set search_path = ''
as $$
declare
  d public.deals;
  n_all integer;
  n_released integer;
  n_pending integer;
  next_status public.deal_status;
begin
  select * into d from public.deals where id = p_deal;
  if d.status = 'cancelled' then
    return d.status;
  end if;
  select count(*), count(*) filter (where m.status = 'released'), count(*) filter (where m.status = 'pending')
    into n_all, n_released, n_pending
  from public.milestones m where m.deal_id = p_deal;
  next_status := case
    when n_all > 0 and n_released = n_all then 'completed'
    when n_pending < n_all then 'in_progress'
    else 'awaiting_funding' end;
  if next_status <> d.status then
    update public.deals
       set status = next_status,
           completed_at = case when next_status = 'completed' then now() end
     where id = p_deal;
    if next_status = 'completed' then
      perform private.log_event('deal_completed', null, d.brand_id, d.creator_id, p_deal => d.id, p_amount => d.amount_cents);
    end if;
  end if;
  return next_status;
end
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- The money audit: every way the books could disagree, checked against the raw rows. Empty means all is well. The
-- tests run it after every test; operations can run it any time (select * from private.audit_money()).
-- ---------------------------------------------------------------------------------------------------------------------
create function private.audit_money() returns setof text
language plpgsql stable
set search_path = ''
as $$
begin
  -- the ledger: every transaction balances
  return query
    select format('ledger transaction %s sums to %s', e.txn_id, sum(e.amount_cents))
    from public.ledger_entries e group by e.txn_id having sum(e.amount_cents) <> 0;

  -- M1: a deal's original milestones add up to the accepted amount; renewals add their own; deliverables share their
  -- milestone exactly
  return query
    select format('deal %s: milestones add up to %s, the deal is %s', d.id, coalesce(sum(m.amount_cents), 0), d.amount_cents)
    from public.deals d left join public.milestones m on m.deal_id = d.id and m.renewal_id is null
    group by d.id having coalesce(sum(m.amount_cents), 0) <> d.amount_cents;
  return query
    select format('milestone %s is %s but its deliverables share %s', m.id, m.amount_cents, coalesce(sum(dl.amount_cents), 0))
    from public.milestones m left join public.deliverables dl on dl.milestone_id = m.id
    group by m.id having coalesce(sum(dl.amount_cents), 0) <> m.amount_cents;
  return query
    select format('offer %s was accepted at %s but its deal is %s', o.id, v.amount_cents, d.amount_cents)
    from public.offers o
    join public.offer_versions v on v.offer_id = o.id and v.version = o.versions
    join public.deals d on d.id = o.deal_id
    where v.amount_cents <> d.amount_cents;
  return query
    select format('offer %s has %s versions but says %s', o.id, count(v.*), o.versions)
    from public.offers o left join public.offer_versions v on v.offer_id = o.id
    group by o.id having count(v.*) <> o.versions;

  -- a milestone is paid by one payment, and its state follows that payment
  return query
    select format('milestone %s is %s but its payment is %s', m.id, m.status, coalesce(p.status::text, 'missing'))
    from public.milestones m left join public.payments p on p.id = m.payment_id
    where (m.status = 'pending' and m.payment_id is not null)
       or (m.status in ('processing') and coalesce(p.status::text, '') <> 'processing')
       or (m.status in ('awaiting_wire') and coalesce(p.status::text, '') <> 'awaiting_wire')
       or (m.status in ('in_escrow', 'released') and coalesce(p.status::text, '') <> 'succeeded');
  return query
    select format('payment %s covers %s in milestones but charged a base of %s', p.id, coalesce(sum(pm.amount_cents), 0), p.base_cents)
    from public.payments p left join public.payment_milestones pm on pm.payment_id = p.id
    group by p.id having coalesce(sum(pm.amount_cents), 0) <> p.base_cents;
  return query
    select format('payment %s lists milestone %s at %s, the milestone is %s', pm.payment_id, pm.milestone_id, pm.amount_cents, m.amount_cents)
    from public.payment_milestones pm join public.milestones m on m.id = pm.milestone_id
    where pm.amount_cents <> m.amount_cents;
  return query
    select format('payment %s is %s but milestone %s it paid for is held by %s', p.id, p.status, pm.milestone_id, coalesce(m.payment_id::text, 'nothing'))
    from public.payments p
    join public.payment_milestones pm on pm.payment_id = p.id
    join public.milestones m on m.id = pm.milestone_id
    where p.status <> 'failed' and m.payment_id is distinct from p.id;
  return query
    select format('milestone %s is held by %s payments that did not fail', pm.milestone_id, count(*))
    from public.payment_milestones pm join public.payments p on p.id = pm.payment_id
    where p.status <> 'failed'
    group by pm.milestone_id having count(*) > 1;

  -- M2: the brand fee is 5% of everything funded on a deal, rounded once. Each payment is priced on what the deal had
  -- funded, and been charged, before it among payments that hadn't failed. (a) With no failed payment on a deal, that is
  -- exactly every payment before it
  return query
    select format('payment %s was priced on %s funded and %s in fees, but the deal had %s and %s before it',
                  p.id, p.fee_basis_cents, p.fees_before_cents, b.base, b.fees)
    from public.payments p
    cross join lateral (select coalesce(sum(q.base_cents), 0) as base, coalesce(sum(q.fee_cents), 0) as fees
                        from public.payments q where q.deal_id = p.deal_id and q.seq < p.seq) b
    where not exists (select 1 from public.payments f where f.deal_id = p.deal_id and f.status = 'failed')
      and (p.fee_basis_cents <> b.base or p.fees_before_cents <> b.fees);
  -- (b) a deal's fees are exactly 5% of what it has funded, unless a payment failed after its latest payment was priced:
  -- then they can be a cent off per failure, until the next payment takes it up
  return query
    with nf as (select q.* from public.payments q where q.status <> 'failed'),
         tot as (select nf.deal_id, sum(nf.base_cents)::bigint as base, sum(nf.fee_cents)::bigint as fees from nf group by nf.deal_id),
         lst as (select distinct on (nf.deal_id) nf.* from nf order by nf.deal_id, nf.seq desc),
         nfail as (select q.deal_id, count(*)::bigint as n from public.payments q where q.status = 'failed' group by q.deal_id)
    select format('deal %s: brand fees %s, 5%% of %s funded is %s', t.deal_id, t.fees, t.base, public.five_percent(t.base))
    from tot t join lst l on l.deal_id = t.deal_id left join nfail f on f.deal_id = t.deal_id
    where case
      when t.base - l.base_cents = l.fee_basis_cents and t.fees - l.fee_cents = l.fees_before_cents
        then t.fees <> greatest(l.fees_before_cents, public.five_percent(t.base))
      else abs(t.fees - public.five_percent(t.base)) > coalesce(f.n, 0)
    end;

  -- simulated money and real money never meet on one database
  return query
    select 'simulated and real payments or payouts are on the same database'::text
    where exists (select 1 from public.payments q where q.provider = 'simulated'
                  union all select 1 from public.payouts o where o.provider = 'simulated')
      and exists (select 1 from public.payments q where q.provider <> 'simulated'
                  union all select 1 from public.payouts o where o.provider <> 'simulated');

  -- M3: the creator fee is 5% of everything released on a deal, rounded once
  return query
    select format('deal %s: creator fees %s, 5%% of %s released is %s', r.deal_id, sum(r.fee_cents), sum(r.gross_cents), public.five_percent(sum(r.gross_cents)::bigint))
    from public.releases r group by r.deal_id having sum(r.fee_cents) <> public.five_percent(sum(r.gross_cents)::bigint);

  -- M4: money is conserved on every deal: what came in is in escrow or released
  return query
    select format('deal %s: escrow account holds %s, milestones say %s is in escrow', d.id, coalesce(l.bal, 0), coalesce(m.held, 0))
    from public.deals d
    left join (select e.account, sum(e.amount_cents) as bal from public.ledger_entries e where e.account like 'escrow:%' group by e.account) l
      on l.account = 'escrow:' || d.id
    left join (select m.deal_id, sum(m.amount_cents - m.released_cents) as held from public.milestones m
               where m.status in ('in_escrow', 'released') group by m.deal_id) m on m.deal_id = d.id
    where coalesce(l.bal, 0) <> coalesce(m.held, 0);
  return query
    select format('deal %s: %s came in from the brand, %s is in escrow or released', d.id, coalesce(p.base, 0), coalesce(m.funded, 0))
    from public.deals d
    left join (select q.deal_id, sum(q.base_cents) as base from public.payments q where q.status = 'succeeded' group by q.deal_id) p on p.deal_id = d.id
    left join (select m.deal_id, sum(m.amount_cents) as funded from public.milestones m where m.status in ('in_escrow', 'released') group by m.deal_id) m on m.deal_id = d.id
    where coalesce(p.base, 0) <> coalesce(m.funded, 0);
  return query
    select format('brand %s: account is %s, its cleared payments total %s', b.id, coalesce(l.bal, 0), -coalesce(p.paid, 0))
    from public.brands b
    left join (select e.account, sum(e.amount_cents) as bal from public.ledger_entries e where e.account like 'brand:%' group by e.account) l
      on l.account = 'brand:' || b.id
    left join (select q.brand_id, sum(q.total_cents) as paid from public.payments q where q.status = 'succeeded' group by q.brand_id) p on p.brand_id = b.id
    where coalesce(l.bal, 0) <> -coalesce(p.paid, 0);
  return query
    select format('fees account is %s; payments and releases and payouts say %s', coalesce((select sum(e.amount_cents) from public.ledger_entries e where e.account = 'fees'), 0),
                  coalesce((select sum(q.fee_cents) from public.payments q where q.status = 'succeeded'), 0)
                + coalesce((select sum(r.fee_cents) from public.releases r), 0)
                + coalesce((select sum(o.fee_cents) from public.payouts o where o.status <> 'failed'), 0))
    where coalesce((select sum(e.amount_cents) from public.ledger_entries e where e.account = 'fees'), 0)
       <> coalesce((select sum(q.fee_cents) from public.payments q where q.status = 'succeeded'), 0)
        + coalesce((select sum(r.fee_cents) from public.releases r), 0)
        + coalesce((select sum(o.fee_cents) from public.payouts o where o.status <> 'failed'), 0);

  -- M5: the creator's balance is their releases less their payouts
  return query
    select format('creator %s: account is %s, releases less payouts are %s', c.id, coalesce(l.bal, 0), coalesce(r.net, 0) - coalesce(o.paid, 0))
    from public.creators c
    left join (select e.account, sum(e.amount_cents) as bal from public.ledger_entries e where e.account like 'creator:%' group by e.account) l
      on l.account = 'creator:' || c.id
    left join (select r.creator_id, sum(r.net_cents) as net from public.releases r group by r.creator_id) r on r.creator_id = c.id
    left join (select o.creator_id, sum(o.amount_cents) as paid from public.payouts o where o.status <> 'failed' group by o.creator_id) o on o.creator_id = c.id
    where coalesce(l.bal, 0) <> coalesce(r.net, 0) - coalesce(o.paid, 0);
  return query
    select format('creator %s: payout account is %s, payouts sent are %s', c.id, coalesce(l.bal, 0), coalesce(o.net, 0))
    from public.creators c
    left join (select e.account, sum(e.amount_cents) as bal from public.ledger_entries e where e.account like 'payouts:%' group by e.account) l
      on l.account = 'payouts:' || c.id
    left join (select o.creator_id, sum(o.net_cents) as net from public.payouts o where o.status <> 'failed' group by o.creator_id) o on o.creator_id = c.id
    where coalesce(l.bal, 0) <> coalesce(o.net, 0);
  return query
    select format('creator %s has paid out %s but released only %s', c.id, coalesce(o.paid, 0), coalesce(r.net, 0))
    from public.creators c
    left join (select r.creator_id, sum(r.net_cents) as net from public.releases r group by r.creator_id) r on r.creator_id = c.id
    left join (select o.creator_id, sum(o.amount_cents) as paid from public.payouts o where o.status <> 'failed' group by o.creator_id) o on o.creator_id = c.id
    where coalesce(o.paid, 0) > coalesce(r.net, 0);

  -- releases: one per proof, the deliverable's share, never more than the milestone holds
  return query
    select format('release %s pays %s for a deliverable worth %s', r.id, r.gross_cents, dl.amount_cents)
    from public.releases r join public.proofs p on p.id = r.proof_id join public.deliverables dl on dl.id = p.deliverable_id
    where r.gross_cents <> dl.amount_cents or p.value_cents <> dl.amount_cents;
  return query
    select format('milestone %s says %s released, its releases total %s', m.id, m.released_cents, coalesce(sum(r.gross_cents), 0))
    from public.milestones m left join public.releases r on r.milestone_id = m.id
    group by m.id having coalesce(sum(r.gross_cents), 0) <> m.released_cents;
  return query
    select format('deliverable %s was paid %s times', dl.id, count(r.*))
    from public.deliverables dl join public.proofs p on p.deliverable_id = dl.id join public.releases r on r.proof_id = p.id
    group by dl.id having count(r.*) > 1;

  -- proofs: released exactly when paid; live only on money in escrow; a deliverable is done exactly when paid
  return query
    select format('proof %s is %s but %s', p.id, p.status, case when r.id is null then 'has no release' else 'has a release' end)
    from public.proofs p left join public.releases r on r.proof_id = p.id
    where (p.status = 'released') <> (r.id is not null);
  return query
    select format('proof %s is %s but its milestone is %s', p.id, p.status, m.status)
    from public.proofs p join public.milestones m on m.id = p.milestone_id
    where p.status in ('in_review', 'releasing', 'released') and m.status not in ('in_escrow', 'released');
  return query
    select format('deliverable %s is %s but %s', dl.id, dl.status, case when exists (
             select 1 from public.proofs p where p.deliverable_id = dl.id and p.status = 'released') then 'it was paid' else 'it was not paid' end)
    from public.deliverables dl
    where (dl.status = 'done') <> exists (select 1 from public.proofs p where p.deliverable_id = dl.id and p.status = 'released');
  return query
    select format('proof %s belongs to milestone %s, its deliverable to %s', p.id, p.milestone_id, dl.milestone_id)
    from public.proofs p join public.deliverables dl on dl.id = p.deliverable_id
    where dl.milestone_id <> p.milestone_id or dl.deal_id <> p.deal_id;

  -- P5: a deal is completed exactly when everything is released
  return query
    select format('deal %s is %s with %s of %s milestones released', d.id, d.status,
                  count(*) filter (where m.status = 'released'), count(m.*))
    from public.deals d left join public.milestones m on m.deal_id = d.id
    where d.status <> 'cancelled'
    group by d.id
    having (d.status = 'completed') <> (count(m.*) > 0 and count(*) filter (where m.status = 'released') = count(m.*));
end
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- A package's updated_at follows its edits
-- ---------------------------------------------------------------------------------------------------------------------
create function private.touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;
create trigger packages_touch before update on public.packages for each row execute function private.touch_updated_at();
