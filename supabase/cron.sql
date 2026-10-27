-- The scheduler, by hand: run this once in the SQL editor if pg_cron wasn't enabled when the migrations ran
-- (Database > Extensions > pg_cron). The migrations do the same automatically where pg_cron is available.
create extension if not exists pg_cron;
select cron.schedule('gamein-release-due', '10 seconds', 'select public.release_due()');
select cron.schedule('gamein-expire-offers', '* * * * *', 'select public.expire_offers()');
-- check: select jobname, schedule, active from cron.job;
