-- Workout reminders (daily push at a chosen local time on chosen weekdays).
create table public.workout_reminders (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  enabled boolean not null default true,
  time_local text not null default '18:00' check (time_local ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  timezone text not null default 'Asia/Jakarta' check (char_length(timezone) <= 64),
  weekdays smallint[] not null default '{1,2,3,4,5}' check (weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
  last_sent_date date,
  updated_at timestamptz not null default now()
);
alter table public.workout_reminders enable row level security;
create policy workout_reminders_own on public.workout_reminders for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create trigger set_updated_at before insert or update on public.workout_reminders
  for each row execute function public.set_updated_at();
