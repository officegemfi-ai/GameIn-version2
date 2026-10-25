-- Who can see and do what.
--
--   * Row-level security is on for every table. People read the rows of their own brands, their own creator profile
--     and the deals between them; the marketplace (creators, brands, active packages, open campaigns) is public.
--   * The app writes only a few things directly: its own profile, its creator profile, its packages and campaigns, a
--     brand's details and campaign shortlists. Everything about offers, deals and money is changed only by the action
--     functions, which run with their owner's rights and check every rule themselves.
--   * Signed-in users can call the action functions; the backend-only ones (payment and payout webhooks, the
--     scheduler) only with the service key. Nothing else in the database is callable over the API.

-- ---------------------------------------------------------------------------------------------------------------------
-- Start from nothing
-- ---------------------------------------------------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
-- the service key reads what it needs and changes things only through the backend functions, like everyone else
revoke insert, update, delete, truncate on all tables in schema public from service_role;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;

-- the service key keeps its access (Supabase's service_role bypasses row-level security), but even it can only call
-- the read-only helpers the views use
grant usage on schema private to authenticated, service_role;
revoke execute on all functions in schema private from service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- Row-level security on every table
-- ---------------------------------------------------------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('alter table public.%I enable row level security', t.relname);
  end loop;
end
$$;

-- the helpers the policies call (they only read)
grant execute on function private.my_brand_ids(), private.my_creator_ids(), private.my_deal_ids(), private.is_admin(),
  private.is_brand_member(uuid), private.is_creator_owner(uuid), private.can_upload_proof(text), private.can_read_proof(text),
  private.my_contact_ids(),
  private.deal_of_path(text), private.waiting_on(public.offer_status)
  to authenticated, service_role;
grant execute on function public.items_valid(jsonb), public.five_percent(bigint), public.fee_step(bigint, bigint),
  public.split_cents(bigint, integer), public.instant_payout_fee(bigint)
  to anon, authenticated;

-- accounts
create policy "profiles: the people you deal with" on public.profiles for select to authenticated
  using (id in (select private.my_contact_ids()) or (select private.is_admin()));
create policy "profiles: edit your own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "creators: public profiles" on public.creators for select to anon, authenticated using (true);
create policy "creators: edit your own" on public.creators for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "brands: public profiles" on public.brands for select to anon, authenticated using (true);
create policy "brands: owners and admins edit" on public.brands for update to authenticated
  using (exists (select 1 from public.brand_members m where m.brand_id = brands.id and m.user_id = (select auth.uid())
                 and m.role in ('owner', 'admin')))
  with check (true);

create policy "brand members: your teams" on public.brand_members for select to authenticated
  using (brand_id in (select private.my_brand_ids()) or (select private.is_admin()));

create policy "platform admins: yourself" on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()));

-- marketplace
create policy "packages: active ones" on public.packages for select to anon using (active);
create policy "packages: active ones, and your own" on public.packages for select to authenticated
  using (active or creator_id in (select private.my_creator_ids()));
create policy "packages: add your own" on public.packages for insert to authenticated
  with check (creator_id in (select private.my_creator_ids()));
create policy "packages: edit your own" on public.packages for update to authenticated
  using (creator_id in (select private.my_creator_ids())) with check (creator_id in (select private.my_creator_ids()));

create policy "campaigns: open ones" on public.campaigns for select to anon using (status = 'open');
create policy "campaigns: open ones, and your brands'" on public.campaigns for select to authenticated
  using (status = 'open' or brand_id in (select private.my_brand_ids()));
create policy "campaigns: your brands add" on public.campaigns for insert to authenticated
  with check (brand_id in (select private.my_brand_ids()));
create policy "campaigns: your brands edit" on public.campaigns for update to authenticated
  using (brand_id in (select private.my_brand_ids())) with check (brand_id in (select private.my_brand_ids()));

create policy "shortlists: your brands'" on public.campaign_shortlist for select to authenticated
  using (campaign_id in (select c.id from public.campaigns c where c.brand_id in (select private.my_brand_ids())));
create policy "shortlists: your brands add" on public.campaign_shortlist for insert to authenticated
  with check (campaign_id in (select c.id from public.campaigns c where c.brand_id in (select private.my_brand_ids()))
              and offer_id is null);
create policy "shortlists: your brands remove" on public.campaign_shortlist for delete to authenticated
  using (campaign_id in (select c.id from public.campaigns c where c.brand_id in (select private.my_brand_ids())));

-- offers and deals: the two parties (and GameIn staff)
create policy "offers: the two parties" on public.offers for select to authenticated
  using (brand_id in (select private.my_brand_ids()) or creator_id in (select private.my_creator_ids())
         or (select private.is_admin()));
create policy "offer versions: the two parties" on public.offer_versions for select to authenticated
  using (offer_id in (select o.id from public.offers o
                      where o.brand_id in (select private.my_brand_ids()) or o.creator_id in (select private.my_creator_ids())
                         or (select private.is_admin())));

create policy "deals: the two parties" on public.deals for select to authenticated
  using (id in (select private.my_deal_ids()));
create policy "deal periods: the two parties" on public.deal_periods for select to authenticated
  using (deal_id in (select private.my_deal_ids()));
create policy "milestones: the two parties" on public.milestones for select to authenticated
  using (deal_id in (select private.my_deal_ids()));
create policy "deliverables: the two parties" on public.deliverables for select to authenticated
  using (deal_id in (select private.my_deal_ids()));
create policy "proofs: the two parties" on public.proofs for select to authenticated
  using (deal_id in (select private.my_deal_ids()));
create policy "releases: the two parties" on public.releases for select to authenticated
  using (deal_id in (select private.my_deal_ids()));
create policy "renewals: the two parties" on public.renewals for select to authenticated
  using (deal_id in (select private.my_deal_ids()));
create policy "ratings: the two parties" on public.ratings for select to authenticated
  using (deal_id in (select private.my_deal_ids()));

-- payments are the brand's: its card or bank, its fees. The creator sees each milestone's state instead
create policy "payments: the brand" on public.payments for select to authenticated
  using (brand_id in (select private.my_brand_ids()) or (select private.is_admin()));
create policy "payment milestones: the brand" on public.payment_milestones for select to authenticated
  using (payment_id in (select p.id from public.payments p
                        where p.brand_id in (select private.my_brand_ids()) or (select private.is_admin())));

-- payouts are the creator's; the ledger is GameIn staff only
create policy "payouts: the creator" on public.payouts for select to authenticated
  using (creator_id in (select private.my_creator_ids()) or (select private.is_admin()));
create policy "ledger: GameIn staff" on public.ledger_entries for select to authenticated
  using ((select private.is_admin()));

-- conversations, events and notifications
create policy "conversations: the two parties" on public.conversations for select to authenticated
  using (brand_id in (select private.my_brand_ids()) or creator_id in (select private.my_creator_ids())
         or (select private.is_admin()));
create policy "messages: the two parties" on public.messages for select to authenticated
  using (conversation_id in (select c.id from public.conversations c
                             where c.brand_id in (select private.my_brand_ids()) or c.creator_id in (select private.my_creator_ids())
                                or (select private.is_admin())));
create policy "reads: the two parties" on public.conversation_reads for select to authenticated
  using (conversation_id in (select c.id from public.conversations c
                             where c.brand_id in (select private.my_brand_ids()) or c.creator_id in (select private.my_creator_ids())
                                or (select private.is_admin())));
create policy "events: the parties" on public.events for select to authenticated
  using (brand_id in (select private.my_brand_ids()) or creator_id in (select private.my_creator_ids())
         or (select private.is_admin()));
create policy "notifications: your own" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------------------------------
-- Table access (row-level security then picks the rows)
-- ---------------------------------------------------------------------------------------------------------------------
grant select on public.brands, public.packages, public.campaigns to anon;
grant select (id, handle, display_name, bio, avatar_url, platforms, created_at) on public.creators to anon;
grant select on all tables in schema public to authenticated;  -- the ledger too, but its policy shows it to staff only

grant update (display_name, avatar_url) on public.profiles to authenticated;
grant update (handle, display_name, bio, avatar_url, platforms) on public.creators to authenticated;
grant update (name, logo_url) on public.brands to authenticated;
grant insert (creator_id, code, title, description, price_cents, length_label, items, active),
      update (code, title, description, price_cents, length_label, items, active) on public.packages to authenticated;
grant insert (brand_id, title, brief, budget_cents, items, status),
      update (title, brief, budget_cents, items, status) on public.campaigns to authenticated;
grant insert (campaign_id, creator_id), delete on public.campaign_shortlist to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- The actions signed-in people can call, and the backend-only ones
-- ---------------------------------------------------------------------------------------------------------------------
grant execute on function
  public.send_offer(uuid, uuid, text, bigint, jsonb, text, uuid),
  public.book_package(uuid, uuid, text, bigint),
  public.pitch_offer(uuid, uuid, uuid, text, bigint, jsonb, text),
  public.book_again(uuid, text),
  public.counter_offer(uuid, public.side, bigint, text, jsonb),
  public.accept_offer(uuid, public.side),
  public.decline_offer(uuid, public.side, text),
  public.withdraw_offer(uuid, public.side),
  public.fund_milestones(uuid, public.payment_method, text, uuid[], text),
  public.simulate_payment(uuid, text),
  public.submit_proof(uuid, text, text, text),
  public.approve_proof(uuid, integer),
  public.undo_approval(uuid),
  public.request_changes(uuid, text),
  public.finalize_release(uuid),
  public.offer_renewal(uuid, integer, bigint, boolean),
  public.request_renewal(uuid, integer, bigint),
  public.answer_renewal(uuid, public.side, boolean),
  public.withdraw_renewal(uuid, public.side),
  public.rate_deal(uuid, public.side, integer, text),
  public.send_message(uuid, uuid, public.side, text),
  public.mark_read(uuid, public.side, bigint),
  public.mark_notifications_read(bigint[]),
  public.request_payout(uuid, bigint, boolean),
  public.create_brand(text, text),
  public.create_creator_profile(text, text)
  to authenticated;

revoke execute on function public.confirm_payment(uuid, text), public.fail_payment(uuid, text),
  public.complete_payout(uuid, boolean, text), public.expire_offers(), public.release_due()
  from public, anon, authenticated;
grant execute on function public.confirm_payment(uuid, text), public.fail_payment(uuid, text),
  public.complete_payout(uuid, boolean, text), public.expire_offers(), public.release_due()
  to service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- Storage: proof files, private, in the proofs bucket under <deal id>/... Creators upload to their own deals; both
-- parties can read. Nobody overwrites or deletes evidence
-- ---------------------------------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('proofs', 'proofs', false) on conflict (id) do nothing;

create policy "proofs: creators upload to their deals" on storage.objects for insert to authenticated
  with check (bucket_id = 'proofs' and private.can_upload_proof(name));
create policy "proofs: both parties read" on storage.objects for select to authenticated
  using (bucket_id = 'proofs' and private.can_read_proof(name));

-- ---------------------------------------------------------------------------------------------------------------------
-- Realtime: both seats hear about changes the moment they're saved (row-level security still decides who hears what)
-- ---------------------------------------------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.offers, public.offer_versions, public.deals, public.milestones, public.deliverables, public.proofs,
      public.releases, public.renewals, public.ratings, public.messages, public.conversation_reads, public.events,
      public.notifications, public.payouts, public.payments;
  end if;
end
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- The scheduler (pg_cron, where the database has it): releases after the undo window, expired offers
-- ---------------------------------------------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      begin
        perform cron.schedule('gamein-release-due', '10 seconds', 'select public.release_due()');
      exception when others then
        perform cron.schedule('gamein-release-due', '* * * * *', 'select public.release_due()');
      end;
      perform cron.schedule('gamein-expire-offers', '* * * * *', 'select public.expire_offers()');
    exception when others then
      raise notice 'The scheduler is not set up (%). Enable pg_cron, then run supabase/cron.sql', sqlerrm;
    end;
  end if;
end
$$;
