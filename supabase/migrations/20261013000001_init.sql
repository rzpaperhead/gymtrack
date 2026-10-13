-- GymTrack initial schema.
-- Conventions:
--   * Every user-owned table carries user_id (or owner_id) so RLS is a single
--     equality check, including child tables (no joins in policies).
--   * Rows are created with client-generated UUIDs (offline-first) and pushed
--     with upsert, so writes are idempotent.
--   * updated_at is always set by the server (trigger) and is the pull cursor.
--   * Deletes are soft (deleted_at) so other devices learn about them on pull.
--   * Weights are stored in kg.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles & subscriptions
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 60),
  locale text not null default 'id' check (locale in ('id', 'en')),
  unit text not null default 'kg' check (unit in ('kg', 'lb')),
  goal text not null default 'general' check (goal in ('strength', 'hypertrophy', 'general')),
  weekly_target smallint not null default 3 check (weekly_target between 1 and 7),
  default_rest_sec integer not null default 120 check (default_rest_sec between 0 and 900),
  theme text not null default 'dark' check (theme in ('dark', 'light', 'system')),
  bodyweight_start_kg numeric(5, 2) check (bodyweight_start_kg is null or bodyweight_start_kg between 20 and 400),
  calorie_target integer check (calorie_target is null or calorie_target between 500 and 10000),
  protein_target integer check (protein_target is null or protein_target between 0 and 1000),
  carbs_target integer check (carbs_target is null or carbs_target between 0 and 2000),
  fat_target integer check (fat_target is null or fat_target between 0 and 1000),
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'premium')),
  status text not null default 'active' check (status in ('active', 'canceled', 'expired', 'pending')),
  provider text,
  provider_ref text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

-- Every new auth user gets a profile and a free subscription row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(left(new.raw_user_meta_data ->> 'full_name', 60), ''))
  on conflict (id) do nothing;
  insert into public.subscriptions (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Exercise library
-- ---------------------------------------------------------------------------
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade, -- null = built-in
  name_id text not null check (char_length(name_id) between 1 and 80),
  name_en text not null check (char_length(name_en) between 1 and 80),
  primary_muscle text not null,
  secondary_muscles text[] not null default '{}',
  equipment text not null,
  type text not null check (type in ('weight_reps', 'bodyweight_reps', 'assisted', 'time', 'distance_time')),
  default_rest_sec integer not null default 90 check (default_rest_sec between 0 and 900),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index exercises_owner_updated on public.exercises (owner_id, updated_at);

-- ---------------------------------------------------------------------------
-- Templates & programs
-- ---------------------------------------------------------------------------
create table public.templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade, -- null = built-in
  name text not null check (char_length(name) between 1 and 80),
  name_en text,
  notes text check (char_length(notes) <= 2000),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index templates_user_updated on public.templates (user_id, updated_at);

create table public.template_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  template_id uuid not null references public.templates (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  position integer not null default 0,
  target_sets smallint not null default 3 check (target_sets between 1 and 20),
  target_reps_min smallint check (target_reps_min is null or target_reps_min between 0 and 1000),
  target_reps_max smallint check (target_reps_max is null or target_reps_max between 0 and 1000),
  rest_sec integer check (rest_sec is null or rest_sec between 0 and 900),
  superset_group text check (char_length(superset_group) <= 8),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index template_exercises_user_updated on public.template_exercises (user_id, updated_at);
create index template_exercises_template on public.template_exercises (template_id);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  is_active boolean not null default false,
  builtin_key text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index programs_user_updated on public.programs (user_id, updated_at);

create table public.program_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  template_id uuid not null references public.templates (id) on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index program_days_user_updated on public.program_days (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- Workouts
-- ---------------------------------------------------------------------------
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  template_id uuid references public.templates (id) on delete set null,
  name text check (char_length(name) <= 80),
  started_at timestamptz not null,
  ended_at timestamptz,
  notes text check (char_length(notes) <= 2000),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index workouts_user_updated on public.workouts (user_id, updated_at);
create index workouts_user_started on public.workouts (user_id, started_at desc);

create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_id uuid not null references public.workouts (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  position integer not null default 0,
  notes text check (char_length(notes) <= 1000),
  superset_group text check (char_length(superset_group) <= 8),
  rest_sec integer check (rest_sec is null or rest_sec between 0 and 900),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index workout_exercises_user_updated on public.workout_exercises (user_id, updated_at);
create index workout_exercises_workout on public.workout_exercises (workout_id);

create table public.sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_id uuid not null references public.workouts (id) on delete cascade,
  workout_exercise_id uuid not null references public.workout_exercises (id) on delete cascade,
  position integer not null default 0,
  set_type text not null default 'working' check (set_type in ('warmup', 'working', 'drop', 'failure')),
  weight_kg numeric(7, 3) check (weight_kg is null or weight_kg between 0 and 2000),
  reps smallint check (reps is null or reps between 0 and 1000),
  rpe numeric(3, 1) check (rpe is null or rpe between 1 and 10),
  duration_sec integer check (duration_sec is null or duration_sec between 0 and 86400),
  distance_m numeric(9, 2) check (distance_m is null or distance_m between 0 and 1000000),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index sets_user_updated on public.sets (user_id, updated_at);
create index sets_workout_exercise on public.sets (workout_exercise_id);

-- ---------------------------------------------------------------------------
-- Body & nutrition
-- ---------------------------------------------------------------------------
create table public.body_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  weight_kg numeric(5, 2) check (weight_kg is null or weight_kg between 20 and 400),
  body_fat_pct numeric(4, 1) check (body_fat_pct is null or body_fat_pct between 2 and 75),
  measurements jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index body_metrics_user_updated on public.body_metrics (user_id, updated_at);

create table public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  pose text not null check (pose in ('front', 'side', 'back')),
  storage_path text not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- Photos live under the owner's folder; RLS on storage relies on this.
  constraint progress_photos_path_owner check (storage_path like user_id::text || '/%')
);
create index progress_photos_user_updated on public.progress_photos (user_id, updated_at);

create table public.nutrition_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  calories integer check (calories is null or calories between 0 and 20000),
  protein_g integer check (protein_g is null or protein_g between 0 and 2000),
  carbs_g integer check (carbs_g is null or carbs_g between 0 and 3000),
  fat_g integer check (fat_g is null or fat_g between 0 and 1000),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index nutrition_logs_user_updated on public.nutrition_logs (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'subscriptions', 'exercises', 'templates', 'template_exercises', 'programs',
    'program_days', 'workouts', 'workout_exercises', 'sets', 'body_metrics', 'progress_photos',
    'nutrition_logs'
  ] loop
    execute format(
      'create trigger set_updated_at before insert or update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.exercises enable row level security;
alter table public.templates enable row level security;
alter table public.template_exercises enable row level security;
alter table public.programs enable row level security;
alter table public.program_days enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.sets enable row level security;
alter table public.body_metrics enable row level security;
alter table public.progress_photos enable row level security;
alter table public.nutrition_logs enable row level security;

-- Profiles: own row only. Rows are created by handle_new_user, never deleted by users.
create policy profiles_select on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- Upsert from the client needs an insert policy even when the row exists.
create policy profiles_insert on public.profiles for insert to authenticated with check (id = (select auth.uid()));

-- Subscriptions: read-only for users; written by the payment webhook (service role).
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

-- Library-style tables: built-ins (null owner) are readable by everyone signed in.
create policy exercises_select on public.exercises for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
create policy exercises_write on public.exercises for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy exercises_update on public.exercises for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy exercises_delete on public.exercises for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy templates_select on public.templates for select to authenticated
  using (user_id is null or user_id = (select auth.uid()));
create policy templates_insert on public.templates for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy templates_update on public.templates for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy templates_delete on public.templates for delete to authenticated
  using (user_id = (select auth.uid()));

create policy template_exercises_select on public.template_exercises for select to authenticated
  using (user_id is null or user_id = (select auth.uid()));
create policy template_exercises_insert on public.template_exercises for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.templates t where t.id = template_id and t.user_id = (select auth.uid()))
  );
create policy template_exercises_update on public.template_exercises for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy template_exercises_delete on public.template_exercises for delete to authenticated
  using (user_id = (select auth.uid()));

-- Strictly private tables: one policy for everything.
do $$
declare
  t text;
begin
  foreach t in array array[
    'programs', 'program_days', 'workouts', 'workout_exercises', 'sets',
    'body_metrics', 'progress_photos', 'nutrition_logs'
  ] loop
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_own', t);
  end loop;
end;
$$;

-- Children must point at parents owned by the same user (prevents attaching
-- rows to someone else's workout by guessing an id).
create or replace function public.assert_parent_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_owner uuid;
begin
  if TG_TABLE_NAME = 'workout_exercises' then
    select user_id into parent_owner from public.workouts where id = new.workout_id;
  elsif TG_TABLE_NAME = 'sets' then
    select we.user_id into parent_owner
      from public.workout_exercises we
      where we.id = new.workout_exercise_id and we.workout_id = new.workout_id;
  elsif TG_TABLE_NAME = 'program_days' then
    select user_id into parent_owner from public.programs where id = new.program_id;
  end if;
  if parent_owner is distinct from new.user_id then
    raise exception 'parent row not owned by user' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger assert_parent_owner before insert or update on public.workout_exercises
  for each row execute function public.assert_parent_owner();
create trigger assert_parent_owner before insert or update on public.sets
  for each row execute function public.assert_parent_owner();
create trigger assert_parent_owner before insert or update on public.program_days
  for each row execute function public.assert_parent_owner();
