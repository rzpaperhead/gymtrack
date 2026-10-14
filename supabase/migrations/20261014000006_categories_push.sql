-- Exercise categories (warm-up / cool-down) and background push for the rest timer.

alter table public.exercises add column if not exists category text not null default 'strength'
  check (category in ('strength', 'warmup', 'cooldown'));

-- ---------------------------------------------------------------------------
-- Web Push subscriptions (one per browser/device)
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  endpoint text primary key check (char_length(endpoint) <= 1000),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_own on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- One pending rest alert per user; the dispatcher sends it when it's due.
create table public.scheduled_pushes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  send_at timestamptz not null,
  title text not null check (char_length(title) <= 120),
  body text not null check (char_length(body) <= 300),
  created_at timestamptz not null default now()
);
alter table public.scheduled_pushes enable row level security;
create index scheduled_pushes_due on public.scheduled_pushes (send_at);

create or replace function public.schedule_rest_push(p_send_at timestamptz, p_title text, p_body text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.scheduled_pushes (user_id, send_at, title, body)
  values (auth.uid(), p_send_at, left(p_title, 120), left(p_body, 300))
  on conflict (user_id) do update set send_at = excluded.send_at, title = excluded.title, body = excluded.body, created_at = now();
$$;

create or replace function public.cancel_rest_push()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.scheduled_pushes where user_id = auth.uid();
$$;
