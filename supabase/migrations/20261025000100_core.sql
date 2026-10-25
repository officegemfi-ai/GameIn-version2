-- GameIn core schema.
--
-- Accounts, the marketplace (creators, brands, packages, campaigns), the deal lifecycle (offers and their versions, deals,
-- months, milestones, deliverables, proofs, renewals, ratings), money (payments, releases, payouts, the escrow ledger),
-- conversations and the event log.
--
-- Conventions
--   * Money is whole cents in bigint columns ending in _cents. Never floats.
--   * Every change that matters (offers, funding, proof, payouts, renewals, ratings) goes through a database function in
--     the actions migration, which locks the rows it reads and checks the rules in one transaction. The app reads tables
--     and views directly, under row-level security (security migration), and never writes those tables itself.
--   * The checks below are the last line: a function that forgot a rule still can't store a state that breaks it.

-- ---------------------------------------------------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------------------------------------------------
create type public.side as enum ('brand', 'creator');
create type public.brand_role as enum ('owner', 'admin', 'member');
-- sent = the brand's version is waiting on the creator; countered = the creator's version is waiting on the brand
create type public.offer_status as enum ('sent', 'countered', 'accepted', 'declined', 'withdrawn', 'expired');
create type public.offer_source as enum ('direct', 'package', 'campaign', 'pitch', 'book_again');
create type public.deal_type as enum ('one_time', 'milestone', 'monthly');
create type public.deal_status as enum ('awaiting_funding', 'in_progress', 'completed', 'cancelled');
create type public.milestone_status as enum ('pending', 'processing', 'awaiting_wire', 'in_escrow', 'released');
create type public.deliverable_status as enum ('upcoming', 'in_review', 'changes_requested', 'done');
create type public.payment_method as enum ('card', 'bank', 'wire');
create type public.payment_status as enum ('processing', 'awaiting_wire', 'succeeded', 'failed');
create type public.proof_status as enum ('in_review', 'releasing', 'released', 'changes_requested');
-- sent = the brand offered a renewal; requested = the creator asked for one
create type public.renewal_status as enum ('sent', 'requested', 'accepted', 'declined', 'withdrawn');
create type public.payout_status as enum ('pending', 'paid', 'failed');

-- deliverables as offers and packages carry them: [{"label": "Launch stream", "days": 5}, ...], 1 to 20 of them
create function public.items_valid(p jsonb) returns boolean
language sql immutable
as $$
  select coalesce(jsonb_typeof(p) = 'array', false)
     and jsonb_array_length(p) between 1 and 20
     and not exists (
       select 1 from jsonb_array_elements(p) e
       where jsonb_typeof(e) <> 'object'
          or coalesce(length(trim(e ->> 'label')), 0) not between 1 and 120
          or (e ? 'days' and (jsonb_typeof(e -> 'days') <> 'number' or (e ->> 'days')::numeric not between 1 and 365))
     )
$$;

-- money arithmetic, in whole cents
-- 5% rounded half up: the brand fee on funding and the creator fee on releases
create function public.five_percent(p_cents bigint) returns bigint
language sql immutable strict parallel safe
as $$ select (p_cents + 10) / 20 $$;

-- fees are 5% of a deal's running total, rounded once: the fee on a new amount is what it adds to the rounded total
create function public.fee_step(p_before bigint, p_amount bigint) returns bigint
language sql immutable strict parallel safe
as $$ select public.five_percent(p_before + p_amount) - public.five_percent(p_before) $$;

-- an amount split into equal parts rounded down to the cent; the last part takes what's left
create function public.split_cents(p_total bigint, p_parts integer) returns bigint[]
language sql immutable strict parallel safe
as $$
  select array_agg(case when i < p_parts then p_total / p_parts else p_total - (p_total / p_parts) * (p_parts - 1) end order by i)
  from generate_series(1, p_parts) as i
$$;

-- an instant payout costs 1.5%, rounded half up
create function public.instant_payout_fee(p_cents bigint) returns bigint
language sql immutable strict parallel safe
as $$ select (p_cents * 3 + 100) / 200 $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------------------------------------------------
-- one row per signed-up person (Supabase Auth's auth.users); made by a trigger at sign-up
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now()
);

-- a creator's public profile. One person owns it; creator teams can come later as creator_members
create table public.creators (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id),
  handle text not null check (handle ~ '^[A-Za-z0-9_.-]{2,32}$'),
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  bio text not null default '',
  avatar_url text,
  platforms jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create unique index creators_handle_key on public.creators (lower(handle));
-- one creator profile per account for now (teams of people behind one creator can come later)
create unique index creators_one_per_owner on public.creators (owner_id);

-- a brand is a team: several people can work for one brand, with a role each
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  logo_url text,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.brand_members (
  brand_id uuid not null references public.brands (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.brand_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (brand_id, user_id)
);
create index brand_members_user_idx on public.brand_members (user_id);

-- GameIn staff: can read the ledger and every deal, for support
create table public.platform_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade
);

-- ---------------------------------------------------------------------------------------------------------------------
-- Marketplace
-- ---------------------------------------------------------------------------------------------------------------------
-- what brands can book: a creator's packages, each with its deliverables
create table public.packages (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators (id) on delete cascade,
  code text,
  title text not null check (length(trim(title)) between 1 and 120),
  description text not null default '',
  price_cents bigint not null check (price_cents > 0),
  length_label text,
  items jsonb not null check (public.items_valid(items)),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index packages_creator_idx on public.packages (creator_id);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 120),
  brief text not null default '',
  budget_cents bigint not null check (budget_cents > 0),
  items jsonb not null check (public.items_valid(items)),
  status text not null default 'open' check (status in ('draft', 'open', 'closed')),
  created_at timestamptz not null default now()
);
create index campaigns_brand_idx on public.campaigns (brand_id);

create table public.campaign_shortlist (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  creator_id uuid not null references public.creators (id) on delete cascade,
  added_at timestamptz not null default now(),
  offer_id uuid,
  primary key (campaign_id, creator_id)
);

-- ---------------------------------------------------------------------------------------------------------------------
-- Offers: a negotiation between one brand and one creator, version by version
-- ---------------------------------------------------------------------------------------------------------------------
create table public.offers (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id),
  creator_id uuid not null references public.creators (id),
  title text not null check (length(trim(title)) between 1 and 120),
  source public.offer_source not null default 'direct',
  package_id uuid references public.packages (id) on delete set null,
  campaign_id uuid references public.campaigns (id) on delete set null,
  previous_deal_id uuid,                                   -- book again: the finished deal this pitch repeats
  status public.offer_status not null,
  versions integer not null default 1 check (versions between 1 and 9),   -- the first version and at most 8 changes
  reply_hours integer not null default 24 check (reply_hours between 1 and 720),
  expires_at timestamptz not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by_side public.side,
  close_reason text,
  accepted_at timestamptz,
  accepted_by_side public.side,
  deal_id uuid unique,
  constraint offers_open_has_no_close check ((status in ('sent', 'countered')) = (closed_at is null)),
  constraint offers_accepted_has_deal check ((status = 'accepted') = (deal_id is not null)),
  constraint offers_accepted_dated check ((status = 'accepted') = (accepted_at is not null))
);
create index offers_brand_idx on public.offers (brand_id, status);
create index offers_creator_idx on public.offers (creator_id, status);
create index offers_open_expiry_idx on public.offers (expires_at) where status in ('sent', 'countered');
-- book again: one open pitch per finished deal
create unique index offers_one_open_book_again on public.offers (previous_deal_id)
  where previous_deal_id is not null and status in ('sent', 'countered');

create table public.offer_versions (
  offer_id uuid not null references public.offers (id) on delete cascade,
  version integer not null check (version between 1 and 9),
  by_side public.side not null,
  amount_cents bigint not null check (amount_cents > 0),
  items jsonb not null check (public.items_valid(items)),
  note text not null default '',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (offer_id, version)
);

-- the sides take turns: a version follows the last one, by the other side
create function public.offer_versions_take_turns() returns trigger
language plpgsql
as $$
declare prev public.side;
begin
  if new.version = 1 then
    return new;
  end if;
  select v.by_side into prev from public.offer_versions v where v.offer_id = new.offer_id and v.version = new.version - 1;
  if not found then
    raise exception 'Offer % has no version %', new.offer_id, new.version - 1;
  end if;
  if prev = new.by_side then
    raise exception 'The same side can''t make two versions in a row';
  end if;
  return new;
end
$$;
create trigger offer_versions_take_turns before insert on public.offer_versions
  for each row execute function public.offer_versions_take_turns();

-- ---------------------------------------------------------------------------------------------------------------------
-- Deals: what an accepted offer becomes. Milestones are what the brand pays into escrow; deliverables are what the
-- creator delivers. Every deliverable belongs to one milestone and is paid its share of it when its proof is approved.
--   shared deal (from an offer): one milestone per deliverable
--   monthly deal: one milestone per month, shared by that month's deliverables
--   milestone deal: each milestone covers the deliverables named for it
-- ---------------------------------------------------------------------------------------------------------------------
create table public.deals (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid unique references public.offers (id),
  brand_id uuid not null references public.brands (id),
  creator_id uuid not null references public.creators (id),
  title text not null check (length(trim(title)) between 1 and 120),
  type public.deal_type not null default 'one_time',
  amount_cents bigint not null check (amount_cents > 0),
  status public.deal_status not null default 'awaiting_funding',
  starts_on date,
  ends_on date,
  contract_label text,
  demo_key text unique,                                    -- the prototype's ids for the demo deals: sp1, sp2, sp3
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint deals_completed_dated check ((status = 'completed') = (completed_at is not null))
);
create index deals_brand_idx on public.deals (brand_id);
create index deals_creator_idx on public.deals (creator_id);

alter table public.offers add constraint offers_deal_fk foreign key (deal_id) references public.deals (id);
alter table public.offers add constraint offers_previous_deal_fk foreign key (previous_deal_id) references public.deals (id);

-- a monthly deal's months (and a renewal's new ones)
create table public.deal_periods (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  seq integer not null check (seq >= 1),
  label text not null,
  starts_on date,
  ends_on date,
  renewal_id uuid,
  unique (deal_id, seq)
);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  seq integer not null check (seq >= 1),
  label text not null check (length(trim(label)) between 1 and 120),
  due_on date,
  amount_cents bigint not null check (amount_cents > 0),
  period_id uuid references public.deal_periods (id),
  renewal_id uuid,
  status public.milestone_status not null default 'pending',
  payment_id uuid,                                         -- the one payment that funds it
  released_cents bigint not null default 0,                -- paid out of it so far, deliverable by deliverable
  created_at timestamptz not null default now(),
  unique (deal_id, seq),
  constraint milestones_release_within check (released_cents between 0 and amount_cents),
  constraint milestones_release_from_escrow check (released_cents = 0 or status in ('in_escrow', 'released')),
  constraint milestones_released_means_all check ((status = 'released') = (released_cents = amount_cents)),
  constraint milestones_funded_has_payment check ((status = 'pending') = (payment_id is null))
);
create index milestones_payment_idx on public.milestones (payment_id);

create table public.deliverables (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  milestone_id uuid not null references public.milestones (id) on delete cascade,
  seq integer not null check (seq >= 1),
  label text not null check (length(trim(label)) between 1 and 120),
  due_on date,
  amount_cents bigint not null check (amount_cents > 0),  -- its share of the milestone
  status public.deliverable_status not null default 'upcoming',
  done_at timestamptz,
  unique (deal_id, seq),
  constraint deliverables_done_dated check ((status = 'done') = (done_at is not null))
);
create index deliverables_milestone_idx on public.deliverables (milestone_id);

-- a milestone's deliverables share exactly its amount, to the cent (checked when the transaction commits)
create function public.check_milestone_shares() returns trigger
language plpgsql
as $$
declare mid uuid; amt bigint; shares bigint;
begin
  if tg_table_name = 'milestones' then
    mid := new.id;
  else
    mid := coalesce(new.milestone_id, old.milestone_id);
  end if;
  select m.amount_cents into amt from public.milestones m where m.id = mid;
  if not found then
    return null;
  end if;
  select coalesce(sum(d.amount_cents), 0) into shares from public.deliverables d where d.milestone_id = mid;
  if shares <> amt then
    raise exception 'Milestone % is % cents but its deliverables share % cents', mid, amt, shares;
  end if;
  return null;
end
$$;
create constraint trigger milestones_shares_match after insert or update of amount_cents on public.milestones
  deferrable initially deferred for each row execute function public.check_milestone_shares();
create constraint trigger deliverables_shares_match after insert or update of amount_cents, milestone_id or delete on public.deliverables
  deferrable initially deferred for each row execute function public.check_milestone_shares();

-- ---------------------------------------------------------------------------------------------------------------------
-- Money
-- ---------------------------------------------------------------------------------------------------------------------
-- one payment by the brand for one or more of a deal's milestones: the milestones plus the 5% brand fee
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id),
  seq integer not null check (seq >= 1),                   -- the deal's payments in the order they were made
  brand_id uuid not null references public.brands (id),
  method public.payment_method not null,
  method_label text not null default '',
  status public.payment_status not null,
  base_cents bigint not null check (base_cents > 0),
  fee_cents bigint not null check (fee_cents >= 0),
  fee_basis_cents bigint not null default 0 check (fee_basis_cents >= 0),  -- what the deal had funded before this payment
  total_cents bigint not null,
  reference text not null,
  provider text not null default 'simulated',              -- 'simulated' until Stripe is connected
  provider_ref text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  succeeded_at timestamptz,
  failed_at timestamptz,
  constraint payments_total check (total_cents = base_cents + fee_cents),
  constraint payments_fee_on_running_total check (fee_cents = public.fee_step(fee_basis_cents, base_cents)),
  constraint payments_succeeded_dated check ((status = 'succeeded') = (succeeded_at is not null)),
  constraint payments_failed_dated check ((status = 'failed') = (failed_at is not null)),
  unique (deal_id, seq)
);

create table public.payment_milestones (
  payment_id uuid not null references public.payments (id) on delete cascade,
  milestone_id uuid not null references public.milestones (id),
  amount_cents bigint not null check (amount_cents > 0),
  primary key (payment_id, milestone_id)
);
create index payment_milestones_milestone_idx on public.payment_milestones (milestone_id);

alter table public.milestones add constraint milestones_payment_fk foreign key (payment_id) references public.payments (id);

-- proof that a deliverable was delivered: a link or a file in Storage
create table public.proofs (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id),
  deliverable_id uuid not null references public.deliverables (id),
  milestone_id uuid not null references public.milestones (id),
  status public.proof_status not null default 'in_review',
  value_cents bigint not null check (value_cents > 0),
  link_url text,
  file_path text,
  note text not null default '',
  submitted_by uuid not null references public.profiles (id),
  submitted_at timestamptz not null default now(),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  release_at timestamptz,                                  -- while releasing: when the undo window ends
  released_at timestamptz,
  changes_note text,
  changes_at timestamptz,
  constraint proofs_have_evidence check (link_url is not null or file_path is not null),
  constraint proofs_releasing_has_window check ((status = 'releasing') = (release_at is not null)),
  constraint proofs_released_dated check ((status = 'released') = (released_at is not null))
);
create index proofs_deal_idx on public.proofs (deal_id);
-- one live proof per deliverable: in review, releasing or released
create unique index proofs_one_live_per_deliverable on public.proofs (deliverable_id)
  where status in ('in_review', 'releasing', 'released');

-- a payout from escrow to the creator, once per proof: the share less the 5% creator fee
create table public.releases (
  id uuid primary key default gen_random_uuid(),
  proof_id uuid not null unique references public.proofs (id),
  deal_id uuid not null references public.deals (id),
  milestone_id uuid not null references public.milestones (id),
  creator_id uuid not null references public.creators (id),
  gross_cents bigint not null check (gross_cents > 0),
  fee_cents bigint not null check (fee_cents >= 0),
  net_cents bigint not null check (net_cents >= 0),
  released_at timestamptz not null,
  constraint releases_net check (net_cents = gross_cents - fee_cents)
);
create index releases_deal_idx on public.releases (deal_id);
create index releases_creator_idx on public.releases (creator_id);

-- the creator's available balance going out to their bank. Weekly payouts are free; an instant payout costs 1.5%
create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators (id),
  amount_cents bigint not null check (amount_cents > 0),     -- taken from the available balance
  instant boolean not null default false,
  fee_cents bigint not null default 0 check (fee_cents >= 0),
  net_cents bigint not null,                                  -- what reaches the bank
  status public.payout_status not null default 'pending',
  provider text not null default 'simulated',
  provider_ref text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  failed_at timestamptz,
  constraint payouts_net check (net_cents = amount_cents - fee_cents and net_cents > 0),
  constraint payouts_paid_dated check ((status = 'paid') = (paid_at is not null)),
  constraint payouts_failed_dated check ((status = 'failed') = (failed_at is not null))
);
create index payouts_creator_idx on public.payouts (creator_id);

-- the escrow ledger: every movement of money, double-entry. Accounts:
--   brand:<brand id>       money that came in from the brand (goes negative)
--   escrow:<deal id>       money held for a deal
--   fees                   GameIn's fees
--   creator:<creator id>   the creator's available balance
--   payouts:<creator id>   money paid out to the creator's bank
-- each transaction's entries sum to zero, and entries are never changed or deleted
create table public.ledger_entries (
  id bigint generated always as identity primary key,
  txn_id uuid not null,
  account text not null check (account ~ '^(brand|escrow|creator|payouts):[0-9a-f-]{36}$' or account = 'fees'),
  amount_cents bigint not null check (amount_cents <> 0),
  deal_id uuid references public.deals (id),
  payment_id uuid references public.payments (id),
  release_id uuid references public.releases (id),
  payout_id uuid references public.payouts (id),
  memo text not null default '',
  created_at timestamptz not null default now()
);
create index ledger_entries_account_idx on public.ledger_entries (account);
create index ledger_entries_txn_idx on public.ledger_entries (txn_id);

create function public.ledger_txn_balanced() returns trigger
language plpgsql
as $$
begin
  if (select coalesce(sum(e.amount_cents), 0) from public.ledger_entries e where e.txn_id = new.txn_id) <> 0 then
    raise exception 'Ledger transaction % does not balance', new.txn_id;
  end if;
  return null;
end
$$;
create constraint trigger ledger_txn_balanced after insert on public.ledger_entries
  deferrable initially deferred for each row execute function public.ledger_txn_balanced();

create function public.ledger_append_only() returns trigger
language plpgsql
as $$
begin
  raise exception 'Ledger entries are never changed or deleted; post a correcting transaction instead';
end
$$;
create trigger ledger_append_only before update or delete on public.ledger_entries
  for each row execute function public.ledger_append_only();

-- ---------------------------------------------------------------------------------------------------------------------
-- Renewals and ratings
-- ---------------------------------------------------------------------------------------------------------------------
create table public.renewals (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id),
  status public.renewal_status not null,
  by_side public.side not null,
  months integer not null check (months between 1 and 24),
  price_cents bigint not null check (price_cents > 0),
  auto_renew boolean not null default false,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  answered_by uuid references public.profiles (id),
  answered_at timestamptz,
  constraint renewals_opened_by check (
    (status = 'sent' and by_side = 'brand') or (status = 'requested' and by_side = 'creator')
    or status in ('accepted', 'declined', 'withdrawn'))
);
-- one open renewal per deal
create unique index renewals_one_open_per_deal on public.renewals (deal_id) where status in ('sent', 'requested');

alter table public.deal_periods add constraint deal_periods_renewal_fk foreign key (renewal_id) references public.renewals (id);
alter table public.milestones add constraint milestones_renewal_fk foreign key (renewal_id) references public.renewals (id);

create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id),
  by_side public.side not null,
  score integer not null check (score between 1 and 5),
  comment text not null default '',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (deal_id, by_side)
);

-- ---------------------------------------------------------------------------------------------------------------------
-- Conversations: one thread per brand and creator; event lines come from the event log
-- ---------------------------------------------------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id),
  creator_id uuid not null references public.creators (id),
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  unique (brand_id, creator_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_side public.side not null,
  sender_id uuid not null references public.profiles (id),
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default clock_timestamp()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

create table public.conversation_reads (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  side public.side not null,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, side)
);

-- every move, who made it and from which seat: the audit trail, the conversations' event lines and the notifications
create table public.events (
  id bigint generated always as identity primary key,
  at timestamptz not null default clock_timestamp(),        -- the moment of the move, so moves in one transaction keep their order
  kind text not null,
  actor_id uuid references public.profiles (id),
  actor_side public.side,
  brand_id uuid references public.brands (id),
  creator_id uuid references public.creators (id),
  offer_id uuid references public.offers (id),
  deal_id uuid references public.deals (id),
  payment_id uuid references public.payments (id),
  proof_id uuid references public.proofs (id),
  renewal_id uuid references public.renewals (id),
  amount_cents bigint,
  data jsonb not null default '{}'::jsonb
);
create index events_pair_idx on public.events (brand_id, creator_id, at);
create index events_deal_idx on public.events (deal_id, at);

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_id bigint references public.events (id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user_idx on public.notifications (user_id, read_at);

-- ---------------------------------------------------------------------------------------------------------------------
-- A profile for every new account
-- ---------------------------------------------------------------------------------------------------------------------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, ''), '@', 1), ''))
  on conflict (id) do nothing;
  return new;
end
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
