-- A GameIn that has grown: a few hundred thousand accounts and tens of millions of rows, shaped like a real
-- marketplace (a few very busy brands and creators, a long tail of small ones), to measure what each screen costs
-- at that size. Loaded straight into the tables of a throwaway database (see db/bench/README.md). Never run this
-- on a database anyone uses.
--
--   psql -v scale=1 -f db/bench/scale-data.sql      scale 1 = 200,000 creators, 20,000 brands, 1,000,000 offers
--
-- The rows are consistent enough for every screen's query and for row-level security (who works for which brand,
-- who owns which creator, which deals are theirs). They don't go through the action functions, so the money audit
-- isn't expected to pass here: this measures reading, not the rules.
\set ON_ERROR_STOP on
\if :{?scale}
\else
  \set scale 1
\endif
select (200000 * :scale)::int as nc, (20000 * :scale)::int as nb, (1000000 * :scale)::int as no, (5000000 * :scale)::int as nm \gset
\echo creators :nc, brands :nb, offers :no, messages :nm

set synchronous_commit = off;
set work_mem = '256MB';
set maintenance_work_mem = '1GB';
-- triggers and foreign keys off for the load (check constraints stay on): the rows are consistent by construction
set session_replication_role = replica;
select setseed(0.42);

create schema if not exists bench;
-- ids that look random (as real ones do: they land all over an index) but can be worked out again from a number
create or replace function bench.id(kind text, i bigint) returns uuid language sql immutable parallel safe
as $$ select md5(kind || ':' || i::text)::uuid $$;
create or replace function bench.sub(kind text, parent uuid, i int default 0) returns uuid language sql immutable parallel safe
as $$ select md5(kind || ':' || parent::text || ':' || i::text)::uuid $$;
create or replace function bench.pair(kind text, a uuid, b uuid) returns uuid language sql immutable parallel safe
as $$ select md5(kind || ':' || a::text || ':' || b::text)::uuid $$;
-- 1..n, heavily towards the low numbers: number 1 is the busiest brand or creator, the high numbers the long tail
create or replace function bench.pick(n int, skew float8) returns int language sql volatile
as $$ select least(n, 1 + floor(n * power(random(), skew))::int) $$;
-- 0..99, fixed for a row (so a deal's parts agree with each other)
create or replace function bench.pct(salt text, id uuid) returns int language sql immutable parallel safe
as $$ select abs(hashtext(salt || id::text)) % 100 $$;

create table if not exists bench.words (n int primary key, a text, b text);
truncate bench.words;
insert into bench.words
select row_number() over (), a, b
from unnest(array['Shadow','Pixel','Turbo','Neon','Frost','Blaze','Ghost','Nova','Rogue','Echo','Viper','Storm','Lunar','Hyper','Iron',
                  'Crimson','Atomic','Silent','Rapid','Mystic','Cyber','Golden','Savage','Cosmic','Electric','Wild','Royal','Dark','Lucky','Prime']) a,
     unnest(array['Ninja','Wolf','Knight','Fox','Hawk','Wizard','Sniper','Dragon','Ranger','Samurai','Pilot','Hunter','Gamer','Raider','Ace',
                  'Phoenix','Titan','Bandit','Legend','Striker','Panda','Falcon','Reaper','Mage','Queen','King','Nomad','Rider','Monk','Scout']) b;

-- ---------------------------------------------------------------------------------------------------------------------
-- People, creators, brands
-- ---------------------------------------------------------------------------------------------------------------------
\echo people, creators, brands
insert into public.profiles (id, display_name, created_at)
select bench.id('u', i), 'Creator owner ' || i, now() - random() * interval '700 days' from generate_series(1, :nc) i;
insert into public.profiles (id, display_name, created_at)
select bench.id('bu', j), 'Brand owner ' || j, now() - random() * interval '700 days' from generate_series(1, :nb) j;
-- one brand in three has two more people on its team
insert into public.profiles (id, display_name)
select bench.id('bm', j * 10 + k), 'Brand member ' || j || '.' || k from generate_series(1, :nb) j, generate_series(1, 2) k where j % 3 = 0;
-- three more people: one with a creator profile and six brands (as the demo account has), GameIn staff, and a newcomer
insert into public.profiles (id, display_name) values
  (bench.id('multi', 1), 'Six brands and a creator'), (bench.id('admin', 1), 'GameIn staff'), (bench.id('new', 1), 'Signed up today');
insert into public.platform_admins (user_id) values (bench.id('admin', 1));

insert into public.creators (id, owner_id, handle, display_name, bio, platforms, created_at)
select bench.id('c', i),
       case when i = 50 then bench.id('multi', 1) else bench.id('u', i) end,
       w.a || w.b || '_' || i,
       w.a || w.b || ' ' || (i % 997),
       'Streams ' || w.b || ' games five nights a week. ' || repeat(md5(i::text), 2),
       jsonb_build_array(jsonb_build_object('name', 'Twitch', 'handle', lower(w.a || w.b) || i, 'followers', (random() * 500000)::int)),
       now() - random() * interval '700 days'
from generate_series(1, :nc) i join bench.words w on w.n = 1 + (i::bigint * 7919) % 900;

insert into public.brands (id, name, slug, verified, created_at)
select bench.id('b', j), upper(w.a) || ' ' || w.b || ' ' || j, 'brand-' || j, j % 5 = 0, now() - random() * interval '700 days'
from generate_series(1, :nb) j join bench.words w on w.n = 1 + (j::bigint * 104729) % 900;

insert into public.brand_members (brand_id, user_id, role)
select bench.id('b', j), bench.id('bu', j), 'owner' from generate_series(1, :nb) j;
insert into public.brand_members (brand_id, user_id, role)
select bench.id('b', j), bench.id('bm', j * 10 + k), 'member' from generate_series(1, :nb) j, generate_series(1, 2) k where j % 3 = 0;
insert into public.brand_members (brand_id, user_id, role)
select bench.id('b', j), bench.id('multi', 1), 'admin' from unnest(array[2, 3, 5, 8, 13, 21]) j;

\echo packages
insert into public.packages (creator_id, code, title, description, price_cents, length_label, items, active, created_at)
select bench.id('c', i), 'PKG' || k, 'Sponsored stream package ' || k, repeat(md5((i * 10 + k)::text), 2),
       (5000 + (random() * 495000)::int)::bigint, '1 month',
       jsonb_build_array(jsonb_build_object('label', 'Sponsored stream', 'days', 7), jsonb_build_object('label', 'Social post', 'days', 3)),
       random() < 0.8, now() - random() * interval '600 days'
from generate_series(1, :nc) i, generate_series(1, 3) k
where i % 5 < 3 and k <= 1 + i % 3;

-- ---------------------------------------------------------------------------------------------------------------------
-- Offers and their versions. Half were accepted, a tenth are still open.
-- ---------------------------------------------------------------------------------------------------------------------
\echo offers
insert into public.offers (id, brand_id, creator_id, title, source, status, versions, reply_hours, expires_at, created_by, created_at,
                           closed_at, closed_by_side, close_reason, accepted_at, accepted_by_side, deal_id)
select id, brand_id, creator_id, 'Sponsored streams, round ' || (n % 1000), 'direct', status, versions, 72,
       case when open then now() + (0.2 + rt) * interval '3 days' else created_at + interval '3 days' end,
       created_by, created_at,
       case when not open then created_at + interval '1 day' end,
       case when status in ('declined', 'withdrawn') then (case when status = 'declined' then 'creator' else 'brand' end)::public.side end,
       case when status = 'declined' then 'Not this month' end,
       case when status = 'accepted' then created_at + interval '1 day' end,
       case when status = 'accepted' then 'creator'::public.side end,
       case when status = 'accepted' then bench.sub('d', id) end
from (
  select n, id, brand_id, creator_id, created_by, rt, open,
         case when open then now() - rt * interval '2 days' else now() - (2 + rt * 700) * interval '1 day' end as created_at,
         -- an open offer waits on the creator after an odd version (the brand's), on the brand after an even one
         case when open then (case when v % 2 = 1 then 'sent' else 'countered' end)
              when rs < 0.50 then 'accepted' when rs < 0.65 then 'declined' when rs < 0.70 then 'withdrawn' else 'expired' end::public.offer_status as status,
         v as versions
  from (
    select n, bench.id('o', n) as id, bench.id('b', bi) as brand_id, bench.id('c', ci) as creator_id, bench.id('bu', bi) as created_by,
           rs, rt, rs >= 0.90 as open, 1 + floor(power(rv, 2) * 4)::int as v
    from (select n, bench.pick(:nb, 3.0) as bi, bench.pick(:nc, 2.5) as ci, random() as rs, random() as rt, random() as rv
          from generate_series(1, :no) n) picks
  ) shaped
) o;

\echo offer versions
insert into public.offer_versions (offer_id, version, by_side, amount_cents, items, note, created_by, created_at)
select o.id, v, (case when v % 2 = 1 then 'brand' else 'creator' end)::public.side,
       (20000 + bench.pct('amt', o.id) * 9000 + v * 2500)::bigint,
       jsonb_build_array(jsonb_build_object('label', 'Sponsored stream', 'days', 7), jsonb_build_object('label', 'Social post', 'days', 3)),
       case when v > 1 then 'Can we meet in the middle?' else '' end, o.created_by, o.created_at + (v - 1) * interval '3 hours'
from public.offers o, generate_series(1, o.versions) v;

-- ---------------------------------------------------------------------------------------------------------------------
-- Deals: one per accepted offer, with 1 to 5 milestones, one deliverable each
--   15% not funded yet, 45% under way (first milestone paid out, second in escrow), 40% finished
-- ---------------------------------------------------------------------------------------------------------------------
\echo deals
create temporary table d as
select bench.sub('d', o.id) as id, o.id as offer_id, o.brand_id, o.creator_id, o.title, o.accepted_at as created_at, o.created_by,
       (20000 + bench.pct('amt', o.id) * 9000 + o.versions * 2500)::bigint as amount_cents,
       (case when bench.pct('st', o.id) < 15 then 'awaiting_funding' when bench.pct('st', o.id) < 60 then 'in_progress' else 'completed' end)::public.deal_status as status,
       1 + bench.pct('k', o.id) % 5 as k
from public.offers o where o.status = 'accepted';

insert into public.deals (id, offer_id, brand_id, creator_id, title, type, amount_cents, status, starts_on, ends_on, created_at, completed_at)
select id, offer_id, brand_id, creator_id, title, 'one_time', amount_cents, status, created_at::date, (created_at + interval '60 days')::date,
       created_at, case when status = 'completed' then created_at + interval '45 days' end
from d;

\echo milestones, deliverables
create temporary table ms as
select bench.sub('m', d.id, s) as id, d.id as deal_id, d.brand_id, d.creator_id, d.created_at, d.created_by, s as seq, d.k,
       (public.split_cents(d.amount_cents, d.k))[s] as amount_cents,
       (case when d.status = 'awaiting_funding' then 'pending'
             when d.status = 'completed' then 'released'
             when d.k = 1 then 'in_escrow'
             when s = 1 then 'released' when s = 2 then 'in_escrow' else 'pending' end)::public.milestone_status as status
from d, generate_series(1, d.k) s;

insert into public.milestones (id, deal_id, seq, label, due_on, amount_cents, status, payment_id, released_cents, created_at)
select id, deal_id, seq, 'Milestone ' || seq, (created_at + seq * interval '14 days')::date, amount_cents, status,
       case when status <> 'pending' then bench.sub('p', deal_id) end,
       case when status = 'released' then amount_cents else 0 end, created_at
from ms;

-- of the deliverables whose money is in escrow, three in ten have proof waiting for the brand
insert into public.deliverables (id, deal_id, milestone_id, seq, label, due_on, amount_cents, status, done_at)
select bench.sub('dl', id), deal_id, id, seq, 'Sponsored stream ' || seq, (created_at + seq * interval '14 days')::date, amount_cents,
       (case when status = 'released' then 'done' when status = 'in_escrow' and bench.pct('rv', id) < 30 then 'in_review' else 'upcoming' end)::public.deliverable_status,
       case when status = 'released' then created_at + seq * interval '13 days' end
from ms;

\echo payments
insert into public.payments (id, deal_id, seq, brand_id, method, method_label, status, base_cents, fee_cents, fee_basis_cents, fees_before_cents,
                             total_cents, reference, provider, created_by, created_at, succeeded_at)
select bench.sub('p', deal_id), deal_id, 1, brand_id, 'card', 'Visa ending 4242', 'succeeded', sum(amount_cents), public.five_percent(sum(amount_cents)::bigint), 0, 0,
       sum(amount_cents) + public.five_percent(sum(amount_cents)::bigint), 'GI-' || replace(deal_id::text, '-', ''), 'simulated', created_by,
       created_at + interval '1 hour', created_at + interval '1 hour'
from ms where status <> 'pending' group by deal_id, brand_id, created_by, created_at;

insert into public.payment_milestones (payment_id, milestone_id, amount_cents)
select bench.sub('p', deal_id), id, amount_cents from ms where status <> 'pending';

\echo proofs, releases
insert into public.proofs (id, deal_id, deliverable_id, milestone_id, status, value_cents, link_url, note, submitted_by, submitted_at,
                           review_started_at, approved_by, approved_at, released_at)
select bench.sub('pf', ms.id), ms.deal_id, bench.sub('dl', ms.id), ms.id,
       (case when ms.status = 'released' then 'released' else 'in_review' end)::public.proof_status, ms.amount_cents,
       'https://twitch.tv/videos/' || abs(hashtext(ms.id::text)), '', c.owner_id,
       -- proof that is waiting came in over the last four days (after five it is approved automatically)
       case when ms.status = 'released' then ms.created_at + ms.seq * interval '12 days' else now() - bench.pct('age', ms.id) * interval '1 hour' end,
       case when ms.status = 'released' then ms.created_at + ms.seq * interval '12 days' else now() - bench.pct('age', ms.id) * interval '1 hour' end,
       case when ms.status = 'released' then ms.created_by end,
       case when ms.status = 'released' then ms.created_at + ms.seq * interval '13 days' end,
       case when ms.status = 'released' then ms.created_at + ms.seq * interval '13 days' end
from ms join public.creators c on c.id = ms.creator_id
where ms.status = 'released' or (ms.status = 'in_escrow' and bench.pct('rv', ms.id) < 30);

insert into public.releases (proof_id, deal_id, milestone_id, creator_id, gross_cents, fee_cents, net_cents, released_at)
select bench.sub('pf', id), deal_id, id, creator_id, amount_cents, public.five_percent(amount_cents), amount_cents - public.five_percent(amount_cents),
       created_at + seq * interval '13 days'
from ms where status = 'released';

\echo ratings, payouts
insert into public.ratings (deal_id, by_side, score, comment, created_by, created_at)
select d.id, s.side, 3 + bench.pct('sc' || s.side, d.id) % 3, 'Great to work with.', d.created_by, d.created_at + interval '50 days'
from d, (values ('brand'::public.side, 60), ('creator'::public.side, 50)) s(side, share)
where d.status = 'completed' and bench.pct('rt' || s.side, d.id) < s.share;

-- creators pay out about a third of what they have been paid, a release at a time
insert into public.payouts (creator_id, amount_cents, instant, fee_cents, net_cents, status, provider, created_at, paid_at)
select creator_id, amount_cents - public.five_percent(amount_cents), false, 0, amount_cents - public.five_percent(amount_cents), 'paid', 'simulated',
       created_at + seq * interval '14 days', created_at + seq * interval '15 days'
from ms where status = 'released' and bench.pct('po', id) < 33;

-- ---------------------------------------------------------------------------------------------------------------------
-- Conversations (one per brand and creator who ever dealt) and messages (most threads short, a few very long)
-- ---------------------------------------------------------------------------------------------------------------------
\echo conversations
create table if not exists bench.conv (n int primary key, id uuid, brand_id uuid, creator_id uuid);
truncate bench.conv;
insert into bench.conv
select row_number() over (order by md5(brand_id::text || creator_id::text)), bench.pair('cv', brand_id, creator_id), brand_id, creator_id
from (select distinct brand_id, creator_id from public.offers) p;
select count(*) as ncv from bench.conv \gset

insert into public.conversations (id, brand_id, creator_id, created_at)
select id, brand_id, creator_id, now() - interval '700 days' from bench.conv;

\echo messages
insert into public.messages (conversation_id, sender_side, sender_id, body, seq, created_at)
select cv.id, g.side, case when g.side = 'brand' then bm.user_id else c.owner_id end,
       'Sounds good. ' || repeat(md5(g.n::text), 1 + g.n % 4), row_number() over (partition by cv.id order by g.at, g.n), g.at
from (select n, bench.pick(:ncv, 2.2) as cn, (case when random() < 0.5 then 'brand' else 'creator' end)::public.side as side,
             now() - power(random(), 1.5) * interval '700 days' as at
      from generate_series(1, :nm) n) g
join bench.conv cv on cv.n = g.cn
join public.creators c on c.id = cv.creator_id
join public.brand_members bm on bm.brand_id = cv.brand_id and bm.role = 'owner';

update public.conversations c set last_message_seq = m.n, last_message_at = m.at
from (select conversation_id, max(seq) as n, max(created_at) as at from public.messages group by conversation_id) m
where m.conversation_id = c.id;

-- nine threads in ten are read to the end on each side; the rest have a few unread
insert into public.conversation_reads (conversation_id, side, last_read_seq, last_read_at)
select c.id, s.side, case when bench.pct('rd' || s.side, c.id) < 90 then c.last_message_seq else greatest(0, c.last_message_seq - 1 - bench.pct('un', c.id) % 5) end,
       c.last_message_at
from public.conversations c, (values ('brand'::public.side), ('creator'::public.side)) s(side)
where c.last_message_seq > 0;

-- ---------------------------------------------------------------------------------------------------------------------
-- The event log and the notifications, in the order things happened
-- ---------------------------------------------------------------------------------------------------------------------
\echo events
insert into public.events (at, kind, actor_id, actor_side, brand_id, creator_id, offer_id, deal_id, amount_cents, data)
select at, kind, actor_id, actor_side, brand_id, creator_id, offer_id, deal_id, amount_cents, '{}'::jsonb
from (
  select v.created_at as at, case when v.version = 1 then 'offer_sent' else 'offer_countered' end as kind, v.created_by as actor_id, v.by_side as actor_side,
         o.brand_id, o.creator_id, o.id as offer_id, null::uuid as deal_id, v.amount_cents
  from public.offer_versions v join public.offers o on o.id = v.offer_id
  union all
  select o.closed_at, 'offer_' || o.status, case when o.status = 'expired' then null else o.created_by end,
         case o.status when 'accepted' then 'creator' when 'declined' then 'creator' when 'withdrawn' then 'brand' end::public.side,
         o.brand_id, o.creator_id, o.id, o.deal_id, null
  from public.offers o where o.closed_at is not null
  union all
  select p.created_at, 'escrow_funded', p.created_by, 'brand', d.brand_id, d.creator_id, null, d.id, p.base_cents
  from public.payments p join public.deals d on d.id = p.deal_id
  union all
  select pf.submitted_at, 'proof_submitted', pf.submitted_by, 'creator', d.brand_id, d.creator_id, null, d.id, pf.value_cents
  from public.proofs pf join public.deals d on d.id = pf.deal_id
  union all
  select r.released_at, 'payment_released', null, 'brand', d.brand_id, d.creator_id, null, d.id, r.gross_cents
  from public.releases r join public.deals d on d.id = r.deal_id
  union all
  select d.completed_at, 'deal_completed', null, null, d.brand_id, d.creator_id, null, d.id, d.amount_cents
  from public.deals d where d.completed_at is not null
) e
order by at;

\echo notifications
-- the other side hears of every move (both sides when nobody made it); nine in ten have been read
insert into public.notifications (user_id, event_id, kind, created_at, read_at)
select t.user_id, t.id, t.kind, t.at, case when (t.id + t.salt) % 10 < 9 or t.at < now() - interval '30 days' then t.at + interval '2 hours' end
from (
  select e.id, e.kind, e.at, c.owner_id as user_id, 0 as salt
  from public.events e join public.creators c on c.id = e.creator_id
  where e.actor_side is distinct from 'creator'
  union all
  select e.id, e.kind, e.at, m.user_id, 3
  from public.events e join public.brand_members m on m.brand_id = e.brand_id
  where e.actor_side is distinct from 'brand'
) t
order by t.id;

-- ---------------------------------------------------------------------------------------------------------------------
-- Who the measurements sign in as
-- ---------------------------------------------------------------------------------------------------------------------
create table if not exists bench.personas (name text primary key, about text, user_id uuid, side public.side, seat_id uuid);
truncate bench.personas;
insert into bench.personas values
  ('creator',      'an ordinary creator (the middle of the range)',   bench.id('u', :nc / 2),  'creator', bench.id('c', :nc / 2)),
  ('top_creator',  'the busiest creator on GameIn',                   bench.id('u', 1),        'creator', bench.id('c', 1)),
  ('brand',        'an ordinary brand (the middle of the range)',     bench.id('bu', :nb / 2), 'brand',   bench.id('b', :nb / 2)),
  ('agency',       'the busiest brand on GameIn (an agency)',         bench.id('bu', 1),       'brand',   bench.id('b', 1)),
  ('many_seats',   'one person with a creator profile and six brands', bench.id('multi', 1),   'brand',   bench.id('b', 2)),
  ('newcomer',     'signed up today, nothing yet',                    bench.id('new', 1),      'brand',   null),
  ('staff',        'GameIn staff',                                    bench.id('admin', 1),    'brand',   bench.id('b', :nb / 2));

set session_replication_role = origin;
\echo analyze
vacuum (analyze);
select relname as "table", to_char(n_live_tup, '999G999G999') as rows, pg_size_pretty(pg_total_relation_size(relid)) as size
from pg_stat_user_tables where schemaname = 'public' order by pg_total_relation_size(relid) desc;
select pg_size_pretty(pg_database_size(current_database())) as database_size;
