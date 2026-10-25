-- The demo workspace, as the prototype starts it. For local development and demo projects only: `supabase db reset`
-- and `supabase start` load it; `supabase db push` never does. It creates sign-in accounts with a known password.
--
--   demo@gamein.test           Instant Shock's account, and owner of all six brands (the prototype's seat switch)
--   manager@hypercore.test     a HYPERCORE manager, who sees HYPERCORE only
--   <handle>@creators.test     the demo creators: qwerty2000, readyplayerone, fspartan, testy, outpost
--   password for every account: gamein-demo
--
-- Deals and offers are made through the same functions the app calls, acting as these people, so the seed obeys every
-- rule (shares, fees, escrow) and the money audit at the end must come back empty. Dates in the past are then set to
-- the prototype's (June to September 2026); open offers keep the prototype's time left to reply.

-- ---------------------------------------------------------------------------------------------------------------------
-- People, brands, creators, packages (fixed ids, so links and tests can name them)
-- ---------------------------------------------------------------------------------------------------------------------
-- (Supabase Auth reads the token columns as text, so they are '' rather than null)
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data,
                        raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
                        email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', u.id::uuid, 'authenticated', 'authenticated', u.email,
       extensions.crypt('gamein-demo', extensions.gen_salt('bf')), now(),
       '{"provider": "email", "providers": ["email"]}'::jsonb, jsonb_build_object('name', u.name), now(), now(), '', '', '', ''
from (values
  ('00000000-0000-4000-8000-0000000000a1', 'demo@gamein.test', 'Instant Shock'),
  ('00000000-0000-4000-8000-0000000000a2', 'manager@hypercore.test', 'HYPERCORE manager'),
  ('00000000-0000-4000-8000-0000000000a3', 'readyplayerone@creators.test', 'ReadyPlayerOne'),
  ('00000000-0000-4000-8000-0000000000a4', 'qwerty2000@creators.test', 'Qwerty2000'),
  ('00000000-0000-4000-8000-0000000000a5', 'fspartan@creators.test', 'FortniteSpartanXYZ'),
  ('00000000-0000-4000-8000-0000000000a6', 'testy@creators.test', 'Testy'),
  ('00000000-0000-4000-8000-0000000000a7', 'outpost@creators.test', 'Community Outpost')
) as u(id, email, name);

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
from auth.users u where u.email like '%.test';

insert into public.brands (id, name, slug, verified) values
  ('00000000-0000-4000-8000-0000000000b1', 'VOLTEDGE', 'voltedge', true),
  ('00000000-0000-4000-8000-0000000000b2', 'HYPERCORE', 'hypercore', true),
  ('00000000-0000-4000-8000-0000000000b3', 'GRIDFUEL', 'gridfuel', true),
  ('00000000-0000-4000-8000-0000000000b4', 'NEXAWEAR', 'nexawear', true),
  ('00000000-0000-4000-8000-0000000000b5', 'ORBITAL AUDIO', 'orbital-audio', true),
  ('00000000-0000-4000-8000-0000000000b6', 'SHIELDPOINT', 'shieldpoint', true);

insert into public.brand_members (brand_id, user_id, role)
select b.id, '00000000-0000-4000-8000-0000000000a1'::uuid, 'owner'::public.brand_role from public.brands b
union all
select '00000000-0000-4000-8000-0000000000b2'::uuid, '00000000-0000-4000-8000-0000000000a2'::uuid, 'admin'::public.brand_role;

insert into public.creators (id, owner_id, handle, display_name, bio, platforms) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'instantshock', 'Instant Shock',
   'FPS creator and live-show host. Daily Valorant + CS2 streams, weekly highlights.',
   '[{"platform": "twitch", "followers": "350K"}, {"platform": "youtube", "followers": "410K"}, {"platform": "tiktok", "followers": "380K"}, {"platform": "instagram", "followers": "240K"}]'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000a3', 'rp1', 'ReadyPlayerOne', '', '[]'),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000a4', 'qwerty2000', 'Qwerty2000', '', '[]'),
  ('00000000-0000-4000-8000-0000000000c4', '00000000-0000-4000-8000-0000000000a5', 'fspartan', 'FortniteSpartanXYZ', '', '[]'),
  ('00000000-0000-4000-8000-0000000000c5', '00000000-0000-4000-8000-0000000000a6', 'testy', 'Testy', '', '[]'),
  ('00000000-0000-4000-8000-0000000000c6', '00000000-0000-4000-8000-0000000000a7', 'outpost', 'Community Outpost', '', '[]');

-- Instant Shock's packages: what brands can book, one deliverable per module
insert into public.packages (creator_id, code, title, description, price_cents, length_label, items) values
  ('00000000-0000-4000-8000-0000000000c1', 'SO3', 'STREAMING: LOGO PLACEMENT',
   'Logo placement across Twitch + YouTube streams, 150 px, full sponsorship period.', 5999, '3 months',
   '[{"label": "Streaming: logo placement", "days": 30}]'),
  ('00000000-0000-4000-8000-0000000000c1', 'SO5', 'SOCIAL MEDIA: 5x POSTING',
   '5 branded posts across TikTok + Instagram Reels, portrait.', 12999, '1 month',
   '[{"label": "Social media: 5x posting", "days": 30}]'),
  ('00000000-0000-4000-8000-0000000000c1', 'SO6', 'VIDEO: 2x BRAND INTEGRATION',
   '2 host-read integrations in YouTube videos, 60 sec, mid-roll.', 29999, '1 month',
   '[{"label": "Video: 2x brand integration", "days": 30}]'),
  ('00000000-0000-4000-8000-0000000000c1', 'SO8', 'CODES: SHOCK10 — 1 MONTH',
   'Discount code + chat command across stream panel and video descriptions, 10% commission per sale.', 8999, '1 month',
   '[{"label": "Codes: shock10, 1 month", "days": 30}]'),
  ('00000000-0000-4000-8000-0000000000c1', 'SO7', 'ULTIMATE PROMOTING PACKAGE',
   'STREAMING: LOGO PLACEMENT · VIDEO: 3x/m INTEGRATION · SOCIAL MEDIA: 3x/m POSTING · MERCH: jersey wear', 72999, '3 months',
   '[{"label": "Streaming: logo placement", "days": 14}, {"label": "Video: 3x/m integration", "days": 21}, {"label": "Social media: 3x/m posting", "days": 28}, {"label": "Merch: jersey wear", "days": 30}]');

-- ---------------------------------------------------------------------------------------------------------------------
-- Acting as someone, as the API would (the functions read auth.uid() from these claims)
-- ---------------------------------------------------------------------------------------------------------------------
create function pg_temp.act(p_user uuid) returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, false);
end
$$;

-- a seeded deal that didn't come from an offer in the demo: its milestones and the deliverables each one pays for
create function pg_temp.seed_deal(
  p_id uuid, p_brand uuid, p_creator uuid, p_title text, p_type public.deal_type, p_starts date, p_ends date,
  p_contract text, p_demo_key text, p_milestones jsonb
) returns void
language plpgsql
as $$
declare
  m jsonb;
  dl jsonb;
  v_ms uuid;
  v_period uuid;
  v_mseq integer := 0;
  v_dseq integer := 0;
begin
  insert into public.deals (id, brand_id, creator_id, title, type, amount_cents, starts_on, ends_on, contract_label, demo_key)
  values (p_id, p_brand, p_creator, p_title, p_type,
          (select sum((x ->> 'amount')::bigint) from jsonb_array_elements(p_milestones) x), p_starts, p_ends, p_contract, p_demo_key);
  for m in select value from jsonb_array_elements(p_milestones) loop
    v_mseq := v_mseq + 1;
    v_period := null;
    if m ? 'period' then
      insert into public.deal_periods (deal_id, seq, label, starts_on, ends_on)
      values (p_id, v_mseq, m ->> 'period', (m ->> 'starts')::date, (m ->> 'ends')::date)
      returning id into v_period;
    end if;
    insert into public.milestones (deal_id, seq, label, due_on, amount_cents, period_id)
    values (p_id, v_mseq, m ->> 'label', (m ->> 'due')::date, (m ->> 'amount')::bigint, v_period)
    returning id into v_ms;
    for dl in select value from jsonb_array_elements(m -> 'deliverables') loop
      v_dseq := v_dseq + 1;
      insert into public.deliverables (deal_id, milestone_id, seq, label, due_on, amount_cents)
      values (p_id, v_ms, v_dseq, dl ->> 'label', (dl ->> 'due')::date, (dl ->> 'amount')::bigint);
    end loop;
  end loop;
end
$$;

-- deliver and approve one deliverable (no undo window), then date it
create function pg_temp.deliver(p_deal uuid, p_label text, p_at timestamptz, p_release boolean default true) returns uuid
language plpgsql
as $$
declare
  v_creator_user uuid;
  v_brand_user uuid;
  v_dl uuid;
  v_proof uuid;
begin
  select c.owner_id into v_creator_user from public.deals d join public.creators c on c.id = d.creator_id where d.id = p_deal;
  select m.user_id into v_brand_user from public.deals d join public.brand_members m on m.brand_id = d.brand_id
   where d.id = p_deal order by (m.role = 'owner') desc limit 1;
  select x.id into v_dl from public.deliverables x where x.deal_id = p_deal and x.label = p_label
   and x.status in ('upcoming', 'changes_requested') order by x.seq limit 1;
  perform pg_temp.act(v_creator_user);
  v_proof := public.submit_proof(v_dl, 'https://gamein.example/proof/' || left(replace(v_dl::text, '-', ''), 12));
  update public.proofs set submitted_at = p_at where id = v_proof;
  if p_release then
    perform pg_temp.act(v_brand_user);
    perform public.approve_proof(v_proof, 0);
    update public.proofs set approved_at = p_at, released_at = p_at where id = v_proof;
    update public.releases set released_at = p_at where proof_id = v_proof;
    update public.deliverables set done_at = p_at where id = v_dl;
  end if;
  update public.events set at = p_at where proof_id = v_proof;
  return v_proof;
end
$$;

-- an open offer's history: version k at the time given, and the reply window from the last one
create function pg_temp.date_offer(p_offer uuid, p_times timestamptz[], p_expires timestamptz) returns void
language plpgsql
as $$
declare
  k integer;
begin
  for k in 1 .. array_length(p_times, 1) loop
    update public.offer_versions set created_at = p_times[k] where offer_id = p_offer and version = k;
    update public.events set at = p_times[k] where offer_id = p_offer and (data ->> 'version')::integer = k;
  end loop;
  update public.offers set created_at = p_times[1], expires_at = coalesce(p_expires, expires_at) where id = p_offer;
end
$$;

do $$
declare
  demo uuid := '00000000-0000-4000-8000-0000000000a1';
  voltedge uuid := '00000000-0000-4000-8000-0000000000b1';
  hypercore uuid := '00000000-0000-4000-8000-0000000000b2';
  gridfuel uuid := '00000000-0000-4000-8000-0000000000b3';
  nexawear uuid := '00000000-0000-4000-8000-0000000000b4';
  orbital uuid := '00000000-0000-4000-8000-0000000000b5';
  shock uuid := '00000000-0000-4000-8000-0000000000c1';
  rp1 uuid := '00000000-0000-4000-8000-0000000000c2';
  qwerty uuid := '00000000-0000-4000-8000-0000000000c3';
  fspartan uuid := '00000000-0000-4000-8000-0000000000c4';
  testy uuid := '00000000-0000-4000-8000-0000000000c5';
  outpost uuid := '00000000-0000-4000-8000-0000000000c6';
  sp1 uuid := '00000000-0000-4000-8000-00000000d001';
  sp2 uuid := '00000000-0000-4000-8000-00000000d002';
  sp3 uuid := '00000000-0000-4000-8000-00000000d003';
  bx2 uuid := '00000000-0000-4000-8000-00000000d005';
  v_pay uuid;
  v_offer uuid;
  v_deal uuid;
  v_items jsonb;
  v_ms uuid[];
  t timestamptz := now();
begin
  -- sp1 · HYPERCORE · ULTIMATE PACKAGE Q3: monthly, $1,500 a month for June, July and August. June is paid out in full;
  -- July is in escrow with two deliverables paid and Mid-roll segment #2 in review; August isn't funded yet
  perform pg_temp.seed_deal(sp1, hypercore, shock, 'ULTIMATE PACKAGE Q3', 'monthly', '2026-06-01', '2026-08-31',
    'v1 · signed', 'sp1', jsonb_build_array(
      jsonb_build_object('label', 'June payout', 'due', '2026-06-30', 'amount', 150000, 'period', 'JUNE',
        'starts', '2026-06-01', 'ends', '2026-06-30', 'deliverables', jsonb_build_array(
          jsonb_build_object('label', 'Mid-roll segment #1', 'due', '2026-06-12', 'amount', 25000),
          jsonb_build_object('label', 'Mid-roll segment #2', 'due', '2026-06-26', 'amount', 25000),
          jsonb_build_object('label', 'TikTok post #1 (@hypercore)', 'due', '2026-06-08', 'amount', 25000),
          jsonb_build_object('label', 'TikTok post #2', 'due', '2026-06-18', 'amount', 25000),
          jsonb_build_object('label', 'TikTok post #3', 'due', '2026-06-28', 'amount', 25000),
          jsonb_build_object('label', 'Hoodie highlight clip', 'due', '2026-06-22', 'amount', 25000))),
      jsonb_build_object('label', 'July payout', 'due', '2026-07-31', 'amount', 150000, 'period', 'JULY',
        'starts', '2026-07-01', 'ends', '2026-07-31', 'deliverables', jsonb_build_array(
          jsonb_build_object('label', 'Mid-roll segment #1 (Vortex GPU)', 'due', '2026-07-08', 'amount', 25000),
          jsonb_build_object('label', 'Mid-roll segment #2', 'due', '2026-07-26', 'amount', 25000),
          jsonb_build_object('label', 'TikTok post #1 (@hypercore)', 'due', '2026-07-10', 'amount', 25000),
          jsonb_build_object('label', 'TikTok post #2', 'due', '2026-07-24', 'amount', 25000),
          jsonb_build_object('label', 'TikTok post #3', 'due', '2026-07-30', 'amount', 25000),
          jsonb_build_object('label', 'Hoodie highlight clip', 'due', '2026-07-29', 'amount', 25000))),
      jsonb_build_object('label', 'August payout', 'due', '2026-08-31', 'amount', 150000, 'period', 'AUGUST',
        'starts', '2026-08-01', 'ends', '2026-08-31', 'deliverables', jsonb_build_array(
          jsonb_build_object('label', 'Mid-roll segment #1', 'due', '2026-08-12', 'amount', 25000),
          jsonb_build_object('label', 'Mid-roll segment #2', 'due', '2026-08-26', 'amount', 25000),
          jsonb_build_object('label', 'TikTok post #1', 'due', '2026-08-08', 'amount', 25000),
          jsonb_build_object('label', 'TikTok post #2', 'due', '2026-08-18', 'amount', 25000),
          jsonb_build_object('label', 'TikTok post #3', 'due', '2026-08-28', 'amount', 25000),
          jsonb_build_object('label', 'Hoodie highlight clip', 'due', '2026-08-22', 'amount', 25000)))));
  update public.deals set created_at = '2026-05-28 10:00+00' where id = sp1;
  perform pg_temp.act(demo);
  select array_agg(id order by seq) into v_ms from public.milestones where deal_id = sp1;
  v_pay := public.fund_milestones(sp1, 'card', p_milestones => array[v_ms[1]], p_method_label => 'Visa •••• 4242');
  update public.payments set created_at = '2026-06-01 09:00+00', succeeded_at = '2026-06-01 09:00+00' where id = v_pay;
  update public.events set at = '2026-06-01 09:00+00' where payment_id = v_pay;
  perform pg_temp.deliver(sp1, 'TikTok post #1 (@hypercore)', '2026-06-08 18:00+00');
  perform pg_temp.deliver(sp1, 'Mid-roll segment #1', '2026-06-12 18:00+00');
  perform pg_temp.deliver(sp1, 'TikTok post #2', '2026-06-18 18:00+00');
  perform pg_temp.deliver(sp1, 'Hoodie highlight clip', '2026-06-22 18:00+00');
  perform pg_temp.deliver(sp1, 'Mid-roll segment #2', '2026-06-26 18:00+00');
  perform pg_temp.deliver(sp1, 'TikTok post #3', '2026-06-28 18:00+00');
  perform pg_temp.act(demo);
  v_pay := public.fund_milestones(sp1, 'bank', p_milestones => array[v_ms[2]], p_method_label => 'Chase bank (ACH) •••• 6789');
  perform public.simulate_payment(v_pay, 'cleared');
  update public.payments set created_at = '2026-07-01 09:00+00', succeeded_at = '2026-07-03 09:00+00' where id = v_pay;
  update public.events set at = '2026-07-01 09:00+00' where payment_id = v_pay and kind = 'payment_started';
  update public.events set at = '2026-07-03 09:00+00' where payment_id = v_pay and kind = 'escrow_funded';
  perform pg_temp.deliver(sp1, 'Mid-roll segment #1 (Vortex GPU)', '2026-07-08 18:00+00');
  perform pg_temp.deliver(sp1, 'TikTok post #1 (@hypercore)', '2026-07-10 18:00+00');
  perform pg_temp.deliver(sp1, 'Mid-roll segment #2', t - interval '5 hours', false);

  -- sp2 · NEXAWEAR · XMAS TEASER DROP: one payment of $274.50 in escrow for three deliverables ($91.50 each); the teaser
  -- story is delivered and paid
  perform pg_temp.seed_deal(sp2, nexawear, shock, 'XMAS TEASER DROP', 'one_time', '2026-11-15', '2026-12-24',
    'v1 · signed', 'sp2', jsonb_build_array(
      jsonb_build_object('label', 'Sponsorship payment', 'due', '2026-12-24', 'amount', 27450, 'deliverables', jsonb_build_array(
        jsonb_build_object('label', 'Teaser story — jersey silhouette', 'due', '2026-11-20', 'amount', 9150),
        jsonb_build_object('label', 'Unboxing short (portrait)', 'due', '2026-12-05', 'amount', 9150),
        jsonb_build_object('label', 'Jersey reveal post', 'due', '2026-12-12', 'amount', 9150)))));
  perform pg_temp.act(demo);
  perform public.fund_milestones(sp2, 'card', 'all', p_method_label => 'Visa •••• 4242');
  perform pg_temp.deliver(sp2, 'Teaser story — jersey silhouette', t - interval '1 day');

  -- sp3 · ORBITAL AUDIO · CREATOR SERIES: three milestones of $215.36, $215.36 and $107.68. Day 1 is paid out, the
  -- campaign completion milestone is in escrow, the recap bonus isn't funded yet
  perform pg_temp.seed_deal(sp3, orbital, shock, 'ORBITAL AUDIO — CREATOR SERIES', 'milestone', '2026-08-22', '2026-09-04',
    'v1 · signed', 'sp3', jsonb_build_array(
      jsonb_build_object('label', 'Day 1 milestone', 'due', '2026-08-22', 'amount', 21536, 'deliverables', jsonb_build_array(
        jsonb_build_object('label', 'Launch shoutout — opening day', 'due', '2026-08-22', 'amount', 21536))),
      jsonb_build_object('label', 'Campaign completion', 'due', '2026-09-01', 'amount', 21536, 'deliverables', jsonb_build_array(
        jsonb_build_object('label', 'Logo overlay — campaign schedule', 'due', '2026-09-01', 'amount', 10768),
        jsonb_build_object('label', 'Creator testimonial clip', 'due', '2026-09-02', 'amount', 10768))),
      jsonb_build_object('label', 'Recap bonus', 'due', '2026-09-04', 'amount', 10768, 'deliverables', jsonb_build_array(
        jsonb_build_object('label', 'Recap post + results gallery', 'due', '2026-09-04', 'amount', 10768)))));
  update public.deals set created_at = '2026-06-20 10:00+00' where id = sp3;
  perform pg_temp.act(demo);
  select array_agg(id order by seq) into v_ms from public.milestones where deal_id = sp3;
  v_pay := public.fund_milestones(sp3, 'card', p_milestones => array[v_ms[1], v_ms[2]], p_method_label => 'Visa •••• 4242');
  update public.payments set created_at = '2026-08-20 09:00+00', succeeded_at = '2026-08-20 09:00+00' where id = v_pay;
  update public.events set at = '2026-08-20 09:00+00' where payment_id = v_pay;
  perform pg_temp.deliver(sp3, 'Launch shoutout — opening day', '2026-08-22 20:00+00');

  -- bx2 · HYPERCORE x ReadyPlayerOne · FORTNITE MAP SHOWCASE: finished, $1,200 in 40/40/20 milestones, paid by card
  -- ($1,260 with the fee) and released in full
  perform pg_temp.seed_deal(bx2, hypercore, rp1, 'FORTNITE MAP SHOWCASE', 'milestone', '2026-09-01', '2026-09-28',
    'v3 · signed', 'bx2', jsonb_build_array(
      jsonb_build_object('label', 'Kickoff (40%)', 'due', '2026-09-01', 'amount', 48000, 'deliverables', jsonb_build_array(
        jsonb_build_object('label', 'Kickoff stream', 'due', '2026-09-01', 'amount', 48000))),
      jsonb_build_object('label', 'Map reveal (40%)', 'due', '2026-09-14', 'amount', 48000, 'deliverables', jsonb_build_array(
        jsonb_build_object('label', 'Map reveal video', 'due', '2026-09-14', 'amount', 48000))),
      jsonb_build_object('label', 'Recap video (20%)', 'due', '2026-09-28', 'amount', 24000, 'deliverables', jsonb_build_array(
        jsonb_build_object('label', 'Recap video', 'due', '2026-09-28', 'amount', 24000)))));
  update public.deals set created_at = '2026-08-25 10:00+00' where id = bx2;
  perform pg_temp.act(demo);
  v_pay := public.fund_milestones(bx2, 'card', 'all', p_method_label => 'Visa •••• 4242');
  update public.payments set created_at = '2026-09-01 09:00+00', succeeded_at = '2026-09-01 09:00+00' where id = v_pay;
  update public.events set at = '2026-09-01 09:00+00' where payment_id = v_pay;
  perform pg_temp.deliver(bx2, 'Kickoff stream', '2026-09-01 20:00+00');
  perform pg_temp.deliver(bx2, 'Map reveal video', '2026-09-14 20:00+00');
  perform pg_temp.deliver(bx2, 'Recap video', '2026-09-28 20:00+00');
  update public.deals set completed_at = '2026-09-28 20:00+00' where id = bx2;
  update public.events set at = '2026-09-28 20:00+00' where deal_id = bx2 and kind = 'deal_completed';

  -- bx1 · HYPERCORE x Qwerty2000 · ROCKET LEAGUE CUP WEEK: accepted three days ago, $900 in three $300 deliverables,
  -- waiting for HYPERCORE to fund escrow
  perform pg_temp.act(demo);
  v_offer := public.send_offer(hypercore, qwerty, 'ROCKET LEAGUE CUP WEEK', 90000,
    '[{"label": "Cup stream with logo overlay", "days": 5}, {"label": "TikTok recap clip #1", "days": 8}, {"label": "TikTok recap clip #2", "days": 9}]');
  perform pg_temp.act('00000000-0000-4000-8000-0000000000a4');
  v_deal := public.accept_offer(v_offer, 'creator');
  update public.deals set demo_key = 'bx1' where id = v_deal;
  perform pg_temp.date_offer(v_offer, array[t - interval '4 days'], null);
  update public.offers set accepted_at = t - interval '3 days', closed_at = t - interval '3 days' where id = v_offer;
  update public.events set at = t - interval '3 days' where offer_id = v_offer and kind = 'offer_accepted';

  -- of_co · HYPERCORE x Community Outpost · MINECRAFT BUILD NIGHT: declined by the creator (schedule conflict)
  perform pg_temp.act(demo);
  v_offer := public.send_offer(hypercore, outpost, 'MINECRAFT BUILD NIGHT', 40000, '[{"label": "Community build night stream", "days": 10}]');
  perform pg_temp.act('00000000-0000-4000-8000-0000000000a7');
  perform public.decline_offer(v_offer, 'creator', 'schedule conflict');
  perform pg_temp.date_offer(v_offer, array[t - interval '12 days'], null);
  update public.offers set closed_at = t - interval '11 days' where id = v_offer;
  update public.events set at = t - interval '11 days' where offer_id = v_offer and kind = 'offer_declined';

  -- of1 · VOLTEDGE x Instant Shock · INSTANTSHOCK ULTIMATE SPONSORSHIP PACKAGE: six versions; VOLTEDGE's $1,500 waits on
  -- Instant Shock, 3.4 hours left to reply
  v_items := '[{"label": "Streaming logo placement (Twitch · YouTube, 150 px)", "days": 7}, {"label": "Video: brand integration (Youtube, host-read segment, 1x)", "days": 14}, {"label": "Social media posting (TikTok · Instagram, 2 x)", "days": 21}, {"label": "Merch, clothing, products (Twitch, clothing, pro jersey)", "days": 28}]';
  perform pg_temp.act(demo);
  v_offer := public.pitch_offer(shock, voltedge, null, 'INSTANTSHOCK ULTIMATE SPONSORSHIP PACKAGE', 150000, v_items,
                                'package sent — INSTANTSHOCK ULTIMATE · $1,500.00');
  perform public.counter_offer(v_offer, 'brand', 150000, '04 time mode: time span → highlight moments');
  perform public.counter_offer(v_offer, 'creator', 165000, 'price: $1,500.00 → $1,650.00');
  perform public.counter_offer(v_offer, 'brand', 148000, 'price: $1,650.00 → $1,480.00');
  perform public.counter_offer(v_offer, 'creator', 155000, 'price: $1,480.00 → $1,550.00');
  perform public.counter_offer(v_offer, 'brand', 150000, 'price: $1,550.00 → $1,500.00 · 03 posts: 3 x → 2 x');
  perform pg_temp.date_offer(v_offer, array[t - interval '68 hours', t - interval '60 hours', t - interval '44 hours',
                                            t - interval '36 hours', t - interval '27 hours', t - interval '20 hours 36 minutes'],
                             t + interval '3 hours 24 minutes');
  perform public.send_message(voltedge, shock, 'brand',
    'Logo files arrive via message system — we''d love the mid-roll to focus on the VE-X1 launch.');

  -- of2 · GRIDFUEL x Instant Shock · XMAS STREAM LOGO CAMPAIGN: GRIDFUEL's $380 waits on Instant Shock, 11.2 hours left
  perform pg_temp.act(demo);
  v_offer := public.pitch_offer(shock, gridfuel, null, 'XMAS STREAM LOGO CAMPAIGN', 38000,
    '[{"label": "Streaming logo placement (Twitch, 200 px)", "days": 7}]', 'package sent — XMAS LOGO CAMPAIGN · $380.00');
  perform public.counter_offer(v_offer, 'brand', 38000, '01 size: 150 px → 200 px');
  perform pg_temp.date_offer(v_offer, array[t - interval '40 hours', t - interval '12 hours 48 minutes'], t + interval '11 hours 12 minutes');
  perform public.send_message(gridfuel, shock, 'brand', 'Holiday-themed overlay preferred, we provide assets.');

  -- of_fsx · HYPERCORE x FortniteSpartanXYZ · FORTNITE SEASON DROP: the creator countered at $650 for two posts; it waits
  -- on HYPERCORE, 18 hours left
  perform pg_temp.act(demo);
  v_offer := public.send_offer(hypercore, fspartan, 'FORTNITE SEASON DROP', 80000,
    '[{"label": "TikTok post #1", "days": 2}, {"label": "TikTok post #2", "days": 4}, {"label": "TikTok post #3", "days": 7}]',
    'Three TikTok posts across launch week, tagged @hypercore.');
  perform pg_temp.act('00000000-0000-4000-8000-0000000000a5');
  perform public.counter_offer(v_offer, 'creator', 65000, 'Could we do two posts for $650? My schedule is packed this month.',
    '[{"label": "TikTok post #1 (season drop)", "days": 3}, {"label": "TikTok post #2", "days": 7}]');
  perform pg_temp.date_offer(v_offer, array[t - interval '48 hours', t - interval '6 hours'], t + interval '18 hours');

  -- of_testy · HYPERCORE x Testy · CS2 LAUNCH STREAM: $500, waiting on Testy, 22 hours left
  perform pg_temp.act(demo);
  v_offer := public.send_offer(hypercore, testy, 'CS2 LAUNCH STREAM', 50000,
    '[{"label": "Launch stream with logo overlay", "days": 5}, {"label": "Highlight clip for socials", "days": 7}]',
    'We''re launching the HC Vortex GPU and would love you on stream for it.');
  perform pg_temp.date_offer(v_offer, array[t - interval '2 hours'], t + interval '22 hours');

  -- a clean slate: Instant Shock has read the VOLTEDGE and GRIDFUEL threads, and every seed notification is read
  perform pg_temp.act(demo);
  perform public.mark_read(c.id, 'creator') from public.conversations c where c.creator_id = shock and c.brand_id in (voltedge, gridfuel);
  update public.notifications set read_at = now();
  perform set_config('request.jwt.claims', '', false);

  if exists (select 1 from private.audit_money()) then
    raise exception 'The seed broke the books: %', (select string_agg(v, '; ') from private.audit_money() v);
  end if;
end
$$;
