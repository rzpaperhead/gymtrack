-- Run ONCE in the Supabase SQL Editor after deploying.
-- Every 10 seconds, if a rest alert is due, ask the app to send it.
-- Replace <CRON_SECRET> with the same value as CRON_SECRET in Vercel.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('gymtrack-push') where exists (select 1 from cron.job where jobname = 'gymtrack-push');

select cron.schedule(
  'gymtrack-push',
  '10 seconds',
  $$
  select net.http_post(
    url := 'https://gymtrack-seven-theta.vercel.app/api/push/dispatch',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  )
  where exists (select 1 from public.scheduled_pushes where send_at <= now() + interval '3 seconds');
  $$
);
