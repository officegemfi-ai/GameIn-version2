-- Scale, stage one: every request reads what the person has, never what the whole of GameIn has.
--
-- Measured on a database grown to 200,000 creators, 20,000 brands, a million offers and five million messages
-- (db/bench): an ordinary brand's dashboard read 100,000 pages (800 MB) to show 13 deals, and a busy brand's offers
-- and messages ran into the API's time limit, because the access rules and a few views walked whole tables to find
-- one person's rows. Nothing here changes what anyone can see or do, or a figure on a screen: the same rules,
-- written so the database can follow an index to the rows. See SYSTEM_DESIGN.md.
--
--   1. The checks that run when a move commits: as the database's owner, not as whoever made the move.
--   2. Access rules: a row is checked against the one deal, offer or conversation it belongs to, not against a list of
--      everything the person can see (which was built by reading whole tables).
--   3. Indexes for what the screens ask: a seat's newest deals, its open offers, its latest conversations; the bell.
--   4. Unread messages are written down when they happen, instead of being worked out from every conversation.
--   5. Views: the seats, the to-dos and their counts, a creator's work that is ready to deliver.
--   6. The scheduler finds its work by index instead of reading every proof every ten seconds.
--   7. Search (creators, brands) and a creator's page by its handle.
--
-- Safe to run on a database in use: it adds indexes and one small table (filled here from the messages nobody has
-- read yet), and replaces functions, views and policies. No existing row is changed. The app that is live today
-- keeps working unchanged against it (nothing it reads is removed or renamed). While an index is being built, writes
-- to its table wait: no time at all on today's database, and 33 seconds for the whole file on the 7 GB test one.
--
-- Two things about row-level security decide how the indexes below are shaped. Both were measured, not assumed:
--   * A condition someone's request adds can only steer an index on a table with access rules if its comparison is
--     one Postgres trusts not to leak (uuid, number, date and text equality are; a comparison of an enum such as a
--     status, and LIKE, are not). So "this seat's offers in this state" can't be an index on (seat, status); the
--     state goes into the index's WHERE instead (a partial index), which Postgres may always use.
--   * An access rule is checked on each row found; it never finds the rows. So every list the app asks for names its
--     seat (or deal, or conversation) itself, and that is what the indexes are keyed by.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Commit-time checks run as the owner
-- ---------------------------------------------------------------------------------------------------------------------
-- "A ledger transaction balances" and "a milestone's deliverables share exactly its amount" are checked when the
-- transaction commits. By then the action function that made the changes has returned, so (before Postgres 18) these
-- ran as the signed-in person, under row-level security. Two consequences:
--   * the ledger is staff-only, so for a move made by anyone else the balance check saw no entries at all and passed
--     without checking anything. (Every action posts through private.post_ledger, which refuses an unbalanced posting
--     itself, and the audit finds none; but this check is the last line under that, and it wasn't there.)
--   * the milestone check went through the access rules for every row, twice per milestone: on the big database,
--     accepting one offer took 0.5 to 0.9 seconds, nearly all of it here.
-- As the owner they see the rows they are checking, whoever committed.
alter function public.ledger_txn_balanced() security definer;
alter function public.check_milestone_shares() security definer;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Whose rows: checked row by row against their own deal, offer or conversation, and found by index
-- ---------------------------------------------------------------------------------------------------------------------
-- A seat's deals, newest first: the lists and the dashboards. The other party rides along, so the access rule on a
-- deal (the brand is mine, or the creator is) can be checked from the index, without opening the deal. These
-- replace the two single-column indexes.
create index deals_brand_recent_idx on public.deals (brand_id, created_at desc, id desc) include (creator_id);
create index deals_creator_recent_idx on public.deals (creator_id, created_at desc, id desc) include (brand_id);
drop index public.deals_brand_idx, public.deals_creator_idx;
-- ...and the ones still running, which is what a dashboard and the deals page open on. These stay small however
-- much history a seat builds up.
create index deals_brand_active_idx on public.deals (brand_id, created_at desc, id desc) include (creator_id) where status in ('awaiting_funding', 'in_progress');
create index deals_creator_active_idx on public.deals (creator_id, created_at desc, id desc) include (brand_id) where status in ('awaiting_funding', 'in_progress');

-- A seat's open offers, soonest deadline first: the two open tabs and the to-dos. Open means closed_at is null (the
-- table's own check ties that to the status), and "is null" is a test Postgres can always use.
create index offers_brand_open_idx on public.offers (brand_id, expires_at, id) where closed_at is null;
create index offers_creator_open_idx on public.offers (creator_id, expires_at, id) where closed_at is null;
-- All of a seat's offers, the latest closed first (the open ones sort ahead of them): the closed tab, and every
-- other question about a seat's offers. These replace (brand_id, status) and (creator_id, status), which the access
-- rules kept Postgres from using for the status.
create index offers_brand_closed_idx on public.offers (brand_id, closed_at desc, id desc);
create index offers_creator_closed_idx on public.offers (creator_id, closed_at desc, id desc);
drop index public.offers_brand_idx, public.offers_creator_idx;

-- A seat's conversations, latest first. Until now only brands had an index to find theirs by (the unique one starts
-- with brand_id): a creator's messages page read every conversation on GameIn.
-- (the other party rides along: "who do I deal with" is answered from the index)
create index conversations_brand_recent_idx on public.conversations (brand_id, last_message_at desc nulls last, created_at desc, id desc) include (creator_id);
create index conversations_creator_recent_idx on public.conversations (creator_id, last_message_at desc nulls last, created_at desc, id desc) include (brand_id);

-- A brand's payments, newest first (the payments page, the brand's money).
create index payments_brand_recent_idx on public.payments (brand_id, created_at desc) include (id);

-- The people someone deals with: their brands' teammates and whoever is on the other side of a conversation. The
-- same people as before; each part now starts from the person's own seats and follows indexes from there, where it
-- used to read every conversation.
create or replace function private.my_contact_ids() returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select auth.uid()
  union all
  select t.user_id from public.brand_members mine
  join public.brand_members t on t.brand_id = mine.brand_id
  where mine.user_id = auth.uid()
  union all
  select c.owner_id from public.brand_members mine
  join public.conversations v on v.brand_id = mine.brand_id
  join public.creators c on c.id = v.creator_id
  where mine.user_id = auth.uid()
  union all
  select t.user_id from public.creators mine
  join public.conversations v on v.creator_id = mine.id
  join public.brand_members t on t.brand_id = v.brand_id
  where mine.owner_id = auth.uid()
$$;

-- a proof file's deal is looked up as that one deal, not searched for in a list of all of someone's deals
create or replace function private.can_read_proof(p_name text) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.deals d
    where d.id = private.deal_of_path(p_name)
      and (private.is_brand_member(d.brand_id) or private.is_creator_owner(d.creator_id) or private.is_admin()))
$$;

-- How long these lists usually are. Postgres assumes a function returns 1,000 rows and prices every index lookup
-- that sits behind an access rule as if it carried a list that long, which made reading whole tables look cheaper
-- than following an index. Most people have one or two seats.
alter function private.my_brand_ids() rows 2;
alter function private.my_creator_ids() rows 1;
alter function private.my_contact_ids() rows 100;

-- The policies. The same people see the same rows; what changes is how the question is put.
--
-- A deal, an offer and a conversation each name their two parties, and are checked directly (as before, with staff
-- let through on their own). Everything that belongs to one of them (a deal's milestones, deliverables, proofs,
-- releases, renewals and ratings; an offer's versions; a conversation's messages and read marks; a payment's
-- milestones) is visible exactly when the deal, offer, conversation or payment it belongs to is: one lookup of that
-- one row.
--
-- Before, each such row was checked against a list of everything the person could see: every deal of theirs, built
-- by one pass over every deal on GameIn ("the brand is mine OR the creator is mine OR I'm staff" can use no index),
-- or every offer or conversation, built the same way. Building the list was the cost of most requests, it grew with
-- GameIn rather than with the person, and for staff it was the whole table.
alter policy "deals: the two parties" on public.deals
  using (brand_id in (select private.my_brand_ids()) or creator_id in (select private.my_creator_ids()) or (select private.is_admin()));
alter policy "deal periods: the two parties" on public.deal_periods
  using (exists (select 1 from public.deals d where d.id = deal_periods.deal_id));
alter policy "milestones: the two parties" on public.milestones
  using (exists (select 1 from public.deals d where d.id = milestones.deal_id));
alter policy "deliverables: the two parties" on public.deliverables
  using (exists (select 1 from public.deals d where d.id = deliverables.deal_id));
alter policy "proofs: the two parties" on public.proofs
  using (exists (select 1 from public.deals d where d.id = proofs.deal_id));
alter policy "releases: the two parties" on public.releases
  using (exists (select 1 from public.deals d where d.id = releases.deal_id));
alter policy "renewals: the two parties" on public.renewals
  using (exists (select 1 from public.deals d where d.id = renewals.deal_id));
alter policy "ratings: the two parties" on public.ratings
  using (exists (select 1 from public.deals d where d.id = ratings.deal_id));

alter policy "offer versions: the two parties" on public.offer_versions
  using (exists (select 1 from public.offers o where o.id = offer_versions.offer_id));
alter policy "messages: the two parties" on public.messages
  using (exists (select 1 from public.conversations c where c.id = messages.conversation_id));
alter policy "reads: the two parties" on public.conversation_reads
  using (exists (select 1 from public.conversations c where c.id = conversation_reads.conversation_id));
alter policy "payment milestones: the brand" on public.payment_milestones
  using (exists (select 1 from public.payments p where p.id = payment_milestones.payment_id));
-- your own profile first: reading it (every settings page does) then never builds the list of everyone you deal with
alter policy "profiles: the people you deal with" on public.profiles
  using (id = (select auth.uid()) or (select private.is_admin()) or id in (select private.my_contact_ids()));

-- the list of all of someone's deals isn't asked for by anything any more
drop function private.my_deal_ids();

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. What every page asks
-- ---------------------------------------------------------------------------------------------------------------------
-- The bell: a person's latest 30 notifications, asked for by every open tab every 30 seconds. With (user_id, read_at)
-- to go by, the database fetched every notification the person ever had, looked up each one's event, brand and
-- creator, sorted the lot and kept 30: 1.8 seconds and a million page reads for a busy account.
create index notifications_latest_idx on public.notifications (user_id, id desc);
-- "mark all read" goes to the unread ones only
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
drop index public.notifications_user_idx;

-- a deal's renewals (only the open one was indexed)
create index renewals_deal_idx on public.renewals (deal_id);

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Unread messages, written down when they happen
-- ---------------------------------------------------------------------------------------------------------------------
-- "Which of my conversations have something I haven't read" was worked out on every page (the navigation shows the
-- count): for each of the seat's conversations, look up how far the seat has read, then look for a later message from
-- the other side. That is a few lookups per conversation the seat has ever had, on every page it opens. It can't be
-- an index either, because the two halves of the question sit in different rows written by different people (the
-- conversation's last message; the reader's mark).
--
-- So it is recorded as it happens: a row here for each message the other side hasn't read, added when the message is
-- sent and removed when that side reads past it. The question becomes "the rows with my seat on them".
--   * The sender never touches a row the reader writes, and the reader only removes rows it can already see, so
--     opening a thread still never waits for a message that is being sent (db/tests: C1).
--   * Read marks only move forward (mark_read and send_message keep the greater one), so a row is never owed back.
create table public.unread_messages (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  to_side public.side not null,                            -- the side that hasn't read it yet
  seq bigint not null,                                     -- the message's number in its conversation
  brand_id uuid not null,
  creator_id uuid not null,
  primary key (conversation_id, to_side, seq)
);
-- a seat's unread conversations, read from the index alone
create index unread_messages_brand_idx on public.unread_messages (brand_id, conversation_id) include (creator_id) where to_side = 'brand';
create index unread_messages_creator_idx on public.unread_messages (creator_id, conversation_id) include (brand_id) where to_side = 'creator';

alter table public.unread_messages enable row level security;
revoke all on public.unread_messages from public, anon, authenticated;
revoke insert, update, delete, truncate on public.unread_messages from service_role;
grant select on public.unread_messages to authenticated;
create policy "unread: your own side" on public.unread_messages for select to authenticated
  using ((to_side = 'brand' and brand_id in (select private.my_brand_ids()))
      or (to_side = 'creator' and creator_id in (select private.my_creator_ids()))
      or (select private.is_admin()));

-- a message is unread by the other side from the moment it is saved
create function private.note_message_unread() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  insert into public.unread_messages (conversation_id, to_side, seq, brand_id, creator_id)
  select new.conversation_id, private.other_side(new.sender_side), new.seq, c.brand_id, c.creator_id
  from public.conversations c where c.id = new.conversation_id;
  return null;
end
$$;
create trigger messages_note_unread after insert on public.messages
  for each row execute function private.note_message_unread();

-- ...until that side's read mark passes it (opening the thread, or answering: sending moves the sender's own mark)
create function private.note_messages_read() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  delete from public.unread_messages u
   where u.conversation_id = new.conversation_id and u.to_side = new.side and u.seq <= new.last_read_seq;
  return null;
end
$$;
create trigger conversation_reads_note_read after insert or update of last_read_seq on public.conversation_reads
  for each row execute function private.note_messages_read();

revoke execute on function private.note_message_unread(), private.note_messages_read() from public, anon, authenticated;

-- what is unread right now
insert into public.unread_messages (conversation_id, to_side, seq, brand_id, creator_id)
select m.conversation_id, private.other_side(m.sender_side), m.seq, c.brand_id, c.creator_id
from public.messages m
join public.conversations c on c.id = m.conversation_id
left join public.conversation_reads r on r.conversation_id = m.conversation_id and r.side = private.other_side(m.sender_side)
where m.seq > coalesce(r.last_read_seq, 0);

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. Views
-- ---------------------------------------------------------------------------------------------------------------------
-- The seats of the person signed in. "(select auth.uid())" where it said "auth.uid()": row-level security won't let
-- the bare function near an index (it could be made to leak), so the brand half read every membership there is.
create or replace view public.my_seats with (security_invoker = true) as
  select 'creator'::public.side as side, null::uuid as brand_id, c.id as creator_id, c.display_name as name,
         null::public.brand_role as role
  from public.creators c where c.owner_id = (select auth.uid())
  union all
  select 'brand'::public.side, b.id, null::uuid, b.name, m.role
  from public.brand_members m join public.brands b on b.id = m.brand_id
  where m.user_id = (select auth.uid());

-- An offer with its latest version. One column more: raw_status, the state as stored. "status" turns to expired the
-- moment the window passes (nothing waits for the sweep), which makes it a calculation; a list's tab is chosen by
-- the stored state, which Postgres keeps statistics on and so plans well: asked for "the 25 that wait on me" by the
-- calculated column, it guessed almost none would match and sorted all of the seat's open offers to find them.
-- An offer whose window has just passed stays in its tab, shown as expired, until the sweep closes it within the minute.
create or replace view public.offer_board with (security_invoker = true) as
  select o.id, o.brand_id, o.creator_id, o.title, o.source, o.package_id, o.campaign_id, o.previous_deal_id,
         case when o.status in ('sent', 'countered') and o.expires_at <= now() then 'expired'::public.offer_status
              else o.status end as status,
         case when o.status in ('sent', 'countered') and o.expires_at > now() then private.waiting_on(o.status) end as waiting_on,
         o.versions, 9 - o.versions as changes_left, o.expires_at, o.created_at, o.closed_at, o.closed_by_side,
         o.close_reason, o.accepted_at, o.accepted_by_side, o.deal_id,
         v.amount_cents, v.items, v.note, v.by_side as last_by_side, v.created_at as last_version_at,
         prev.amount_cents as previous_amount_cents,
         o.status as raw_status
  from public.offers o
  join public.offer_versions v on v.offer_id = o.id and v.version = o.versions
  left join public.offer_versions prev on prev.offer_id = o.id and prev.version = o.versions - 1;

-- A deal's money. One column more: when the deal was made, so a list of deals' money can be asked for newest first.
create or replace view public.deal_money with (security_invoker = true) as
  select d.id as deal_id, d.brand_id, d.creator_id, d.title, d.status,
         coalesce(sum(m.amount_cents), 0)::bigint as total_cents,
         coalesce(sum(m.amount_cents) filter (where m.status = 'pending'), 0)::bigint as not_funded_cents,
         coalesce(sum(m.amount_cents) filter (where m.status in ('processing', 'awaiting_wire')), 0)::bigint as clearing_cents,
         coalesce(sum(m.amount_cents) filter (where m.status in ('in_escrow', 'released')), 0)::bigint as funded_cents,
         coalesce(sum(m.amount_cents - m.released_cents) filter (where m.status = 'in_escrow'), 0)::bigint as in_escrow_cents,
         coalesce(sum(m.released_cents), 0)::bigint as released_cents,
         (select m2.id from public.milestones m2 where m2.deal_id = d.id and m2.status = 'pending' order by m2.seq limit 1) as next_to_fund,
         d.created_at
  from public.deals d left join public.milestones m on m.deal_id = d.id
  group by d.id;

-- What waits on each seat: the same rows as before, found by index.
--   * offers: "closed_at is null" says nothing new (an offer that waits on someone is open) but lets the open-offers
--     index be used;
--   * renewals were asked as "this brand's OR this creator's" in one go; each side is now asked on its own, so each
--     follows its own index;
--   * unread conversations come from the rows above: the conversations a seat has unread messages in.
create or replace view public.todos with (security_invoker = true) as
  select 'brand'::public.side as side, o.brand_id, o.creator_id,
         case when o.source in ('pitch', 'book_again') and o.versions = 1 then 'answer_pitch' else 'answer_counter' end as kind,
         o.id as ref_id, o.title, v.amount_cents, o.expires_at as due_at
  from public.offers o join public.offer_versions v on v.offer_id = o.id and v.version = o.versions
  where o.status = 'countered' and o.closed_at is null and o.expires_at > now()
    and o.brand_id in (select private.my_brand_ids())
  union all
  select 'creator', o.brand_id, o.creator_id, 'answer_offer', o.id, o.title, v.amount_cents, o.expires_at
  from public.offers o join public.offer_versions v on v.offer_id = o.id and v.version = o.versions
  where o.status = 'sent' and o.closed_at is null and o.expires_at > now()
    and o.creator_id in (select private.my_creator_ids())
  union all
  select 'brand', d.brand_id, d.creator_id, 'review_proof', p.id, dl.label, p.value_cents, p.review_started_at + interval '5 days'
  from public.proofs p join public.deals d on d.id = p.deal_id join public.deliverables dl on dl.id = p.deliverable_id
  where p.status = 'in_review' and d.brand_id in (select private.my_brand_ids())
  union all
  select 'brand', d.brand_id, d.creator_id, 'answer_renewal', r.id, d.title, r.price_cents, null::timestamptz
  from public.renewals r join public.deals d on d.id = r.deal_id
  where r.status = 'requested' and d.brand_id in (select private.my_brand_ids())
  union all
  select 'creator', d.brand_id, d.creator_id, 'answer_renewal', r.id, d.title, r.price_cents, null::timestamptz
  from public.renewals r join public.deals d on d.id = r.deal_id
  where r.status = 'sent' and d.creator_id in (select private.my_creator_ids())
  union all
  select 'brand', u.brand_id, u.creator_id, 'unread_messages', u.conversation_id, null, null, null
  from (select distinct um.brand_id, um.creator_id, um.conversation_id
        from public.unread_messages um where um.to_side = 'brand') u
  where u.brand_id in (select private.my_brand_ids())
  union all
  select 'creator', u.brand_id, u.creator_id, 'unread_messages', u.conversation_id, null, null, null
  from (select distinct um.brand_id, um.creator_id, um.conversation_id
        from public.unread_messages um where um.to_side = 'creator') u
  where u.creator_id in (select private.my_creator_ids());

-- How many of each kind wait on one seat: what the navigation's badges show. Counted here, because a list that is
-- fetched and then counted stops being right at the API's 1,000-row limit, and nobody is told.
create function public.todo_counts(p_side public.side, p_seat uuid) returns table (kind text, n bigint)
language sql stable set search_path = ''
as $$
  select t.kind, count(*) from public.todos t
  where p_side = 'brand' and t.side = 'brand' and t.brand_id = p_seat
  group by t.kind
  union all
  select t.kind, count(*) from public.todos t
  where p_side = 'creator' and t.side = 'creator' and t.creator_id = p_seat
  group by t.kind
$$;
revoke execute on function public.todo_counts(public.side, uuid) from public, anon;
grant execute on function public.todo_counts(public.side, uuid) to authenticated;

-- A creator's work that can be delivered now: the deal is under way, the money for it is in escrow, and it hasn't
-- been sent yet (or was sent back). The creator's dashboard asked the deliverables table for this, which meant
-- reading every deliverable on GameIn to find one creator's; starting from the creator's running deals, it is a
-- handful of index lookups. (Both parties to a deal can read its row here, as they can read its deliverables.)
create view public.ready_deliverables with (security_invoker = true) as
  select dl.id, dl.label, dl.due_on, dl.amount_cents, dl.status, dl.seq,
         d.id as deal_id, d.title as deal_title, d.brand_id, d.creator_id, b.name as brand_name
  from public.deals d
  join public.deliverables dl on dl.deal_id = d.id
  join public.milestones m on m.id = dl.milestone_id
  join public.brands b on b.id = d.brand_id
  where d.status = 'in_progress' and m.status = 'in_escrow' and dl.status in ('upcoming', 'changes_requested');
revoke all on public.ready_deliverables from public, anon, authenticated;
grant select on public.ready_deliverables to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 6. The scheduler finds its work by index
-- ---------------------------------------------------------------------------------------------------------------------
-- release_due runs every 10 seconds. It asked for "proof approved and due, or left in review for five days, in deal
-- order, the first 1,000", and Postgres answered by walking every proof ever submitted in deal order, expecting to
-- meet 1,000 due ones early. There are almost never any, so it read them all: a second of work and 400,000 page
-- reads, every ten seconds, growing with every proof submitted.
create index proofs_releasing_idx on public.proofs (release_at) where status = 'releasing';
create index proofs_in_review_idx on public.proofs (review_started_at) where status = 'in_review';
-- a deal's proof waiting for review (the to-dos)
create index proofs_deal_in_review_idx on public.proofs (deal_id) where status = 'in_review';

-- The same job, asking the two questions separately so each goes to its own small index; what is due is then put in
-- deal order as before. Nothing else in the function changed.
create or replace function public.release_due() returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r record;
  n integer := 0;
begin
  -- one pass in deal order, so two runs at once take their locks in the same order and never deadlock
  for r in
    with due as materialized (
      select p.id, p.deal_id, p.status from public.proofs p
      where p.status = 'releasing' and p.release_at <= now()
      union all
      select p.id, p.deal_id, p.status from public.proofs p
      where p.status = 'in_review' and p.review_started_at <= now() - interval '5 days'
    )
    select due.id, due.deal_id, due.status from due
    order by due.deal_id, due.id
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
-- 7. Search, and a creator's page by its handle
-- ---------------------------------------------------------------------------------------------------------------------
-- "name contains ..." can't use an ordinary index, so every search read every creator; and a creator's page is found
-- by its handle whatever the capitals, which the app asks as a pattern match: that read every creator too, for every
-- visitor to every creator's page. Trigram indexes answer both.
create extension if not exists pg_trgm with schema extensions;
create index creators_name_search_idx on public.creators using gin (display_name extensions.gin_trgm_ops);
create index creators_handle_search_idx on public.creators using gin (handle extensions.gin_trgm_ops);
create index brands_name_search_idx on public.brands using gin (name extensions.gin_trgm_ops);
create index brands_slug_search_idx on public.brands using gin (slug extensions.gin_trgm_ops);
-- the directory and the brand picker, in the order they are shown
create index creators_directory_idx on public.creators (display_name, id);
create index brands_name_idx on public.brands (name, id);

-- Search as its own request. A list is read from an index in its order and stops when the page is full. A search
-- has to find its matches first: asked as "the directory, filtered", Postgres walks the directory in name order
-- hoping to meet 24 matches soon, and for a name that few creators have it walks all of it (measured: slower than
-- having no index at all). So:
--   * three letters or more: the trigram indexes find the matches, and only those are sorted;
--   * one or two letters match so many names that walking the directory in order fills a page at once.
-- What is typed is matched as typed ("_" and "%" are not wildcards). The rows come back in name order, a page at a
-- time, with the reader's own access (creators and brands are public to anyone signed in).
create function public.search_creators(p_q text, p_limit integer default 24, p_offset integer default 0)
returns setof public.creators
language plpgsql stable set search_path = ''
as $$
declare
  v_q text := btrim(coalesce(p_q, ''));
  v_like text := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if char_length(v_q) >= 3 then
    return query
      with hits as materialized (
        select c.id, c.display_name from public.creators c
        where (c.display_name ilike v_like or c.handle ilike v_like) and c.handle not like 'deleted-%'
      ), page as (
        select h.id from hits h order by h.display_name, h.id limit v_limit offset v_offset
      )
      select c.* from page join public.creators c on c.id = page.id order by c.display_name, c.id;
  else
    return query
      select c.* from public.creators c
      where (c.display_name ilike v_like or c.handle ilike v_like) and c.handle not like 'deleted-%'
      order by c.display_name, c.id limit v_limit offset v_offset;
  end if;
end
$$;

create function public.search_brands(p_q text, p_limit integer default 20, p_offset integer default 0)
returns setof public.brands
language plpgsql stable set search_path = ''
as $$
declare
  v_q text := btrim(coalesce(p_q, ''));
  v_like text := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if char_length(v_q) >= 3 then
    return query
      with hits as materialized (
        select b.id, b.name from public.brands b where b.name ilike v_like or b.slug ilike v_like
      ), page as (
        select h.id from hits h order by h.name, h.id limit v_limit offset v_offset
      )
      select b.* from page join public.brands b on b.id = page.id order by b.name, b.id;
  else
    return query
      select b.* from public.brands b where b.name ilike v_like or b.slug ilike v_like
      order by b.name, b.id limit v_limit offset v_offset;
  end if;
end
$$;

revoke execute on function public.search_creators(text, integer, integer), public.search_brands(text, integer, integer) from public, anon;
grant execute on function public.search_creators(text, integer, integer), public.search_brands(text, integer, integer) to authenticated;
