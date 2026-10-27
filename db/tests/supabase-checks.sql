-- Run after `supabase db reset` on Supabase's own Postgres (the CI job "On Supabase"): the migrations and the seed
-- loaded into the real auth, storage, Realtime and pg_cron, the books balance, and a move works through
-- row-level security. Any failed check stops psql with an error.
\set ON_ERROR_STOP on

do $$
declare
  n integer;
begin
  -- the books balance after the seed
  if exists (select 1 from private.audit_money()) then
    raise exception 'money audit: %', (select string_agg(v, '; ') from private.audit_money() v);
  end if;
  -- the seed: seven accounts with profiles, five deals, six offers
  select count(*) into n from auth.users where email like '%.test';
  if n <> 7 then raise exception 'expected 7 demo accounts, found %', n; end if;
  select count(*) into n from public.profiles;
  if n <> 7 then raise exception 'expected 7 profiles (the sign-up trigger on auth.users), found %', n; end if;
  select count(*) into n from public.deals;
  if n <> 5 then raise exception 'expected 5 seeded deals, found %', n; end if;
  select count(*) into n from public.offers;
  if n <> 6 then raise exception 'expected 6 seeded offers, found %', n; end if;
  -- row-level security on every table
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if n <> 0 then raise exception '% public tables without row-level security', n; end if;
  -- Realtime publishes the tables the seats watch
  select count(*) into n from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public';
  if n < 15 then raise exception 'Realtime publishes % GameIn tables, expected 15', n; end if;
  -- the proofs bucket and its policies
  if not exists (select 1 from storage.buckets where id = 'proofs' and not public) then
    raise exception 'the private proofs bucket is missing';
  end if;
  select count(*) into n from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'proofs:%';
  if n <> 2 then raise exception 'expected 2 storage policies for proofs, found %', n; end if;
  -- the scheduler
  select count(*) into n from cron.job where jobname in ('gamein-release-due', 'gamein-expire-offers');
  if n <> 2 then raise exception 'expected 2 scheduled jobs, found %', n; end if;
end
$$;

-- a move through row-level security, as the demo account: approve the proof waiting on ULTIMATE PACKAGE Q3, check the
-- money, then put everything back
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select public.approve_proof((select id from public.proofs where status = 'in_review' limit 1), 0);
do $$
begin
  if (select released_cents from public.deal_money where deal_id = '00000000-0000-4000-8000-00000000d001') <> 225000 then
    raise exception 'the release did not show on the deal';
  end if;
  if (select count(*) from public.deals) <> 5 then
    raise exception 'the demo account should see all five seeded deals';
  end if;
end
$$;
reset role;
do $$
begin
  if exists (select 1 from private.audit_money()) then
    raise exception 'money audit after a release: %', (select string_agg(v, '; ') from private.audit_money() v);
  end if;
end
$$;
rollback;

select 'GameIn checks passed on Supabase Postgres ' || current_setting('server_version') as result;
