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
-- Private bucket for progress photos. Objects live at `<user_id>/<photo_id>.jpg`
-- and are only ever shown through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 5242880, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do nothing;

create policy progress_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy progress_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy progress_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy progress_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Server-side enforcement of the freemium limits in src/lib/entitlements.ts.
-- The client checks first (for a friendly paywall); this is the backstop.
-- Existing rows are never blocked: updates and re-sent upserts pass through.

create or replace function public.is_premium(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = uid
      and s.tier = 'premium'
      and s.status in ('active', 'canceled')
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;

-- TG_ARGV[0] = owner column, TG_ARGV[1] = free-tier limit
create or replace function public.enforce_tier_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_col text := TG_ARGV[0];
  max_free int := TG_ARGV[1]::int;
  owner uuid;
  already boolean;
  cnt int;
begin
  execute format('select ($1).%I', owner_col) into owner using new;
  if owner is null then
    return new; -- built-in rows (seeded by migrations / service role)
  end if;

  -- BEFORE INSERT also fires for INSERT … ON CONFLICT DO UPDATE, so let
  -- re-sent rows through.
  execute format('select exists (select 1 from public.%I where id = $1)', TG_TABLE_NAME)
    into already using new.id;
  if already or public.is_premium(owner) then
    return new;
  end if;

  execute format('select count(*) from public.%I where %I = $1 and deleted_at is null', TG_TABLE_NAME, owner_col)
    into cnt using owner;
  if cnt >= max_free then
    raise exception 'free tier limit reached for %', TG_TABLE_NAME using errcode = 'P0001', hint = 'upgrade';
  end if;
  return new;
end;
$$;

create trigger enforce_limit before insert on public.templates
  for each row execute function public.enforce_tier_limit('user_id', '3');
create trigger enforce_limit before insert on public.exercises
  for each row execute function public.enforce_tier_limit('owner_id', '5');
create trigger enforce_limit before insert on public.progress_photos
  for each row execute function public.enforce_tier_limit('user_id', '6');

-- Free users may only run built-in programs.
create or replace function public.enforce_custom_program()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.builtin_key is null and not public.is_premium(new.user_id)
     and not exists (select 1 from public.programs where id = new.id) then
    raise exception 'custom programs require premium' using errcode = 'P0001', hint = 'upgrade';
  end if;
  return new;
end;
$$;

create trigger enforce_custom_program before insert on public.programs
  for each row execute function public.enforce_custom_program();
-- GENERATED by scripts/gen-builtin-sql.ts — do not edit by hand.
-- Built-in exercise library and templates (owner/user_id = null).

insert into public.exercises (id, owner_id, name_id, name_en, primary_muscle, secondary_muscles, equipment, type, default_rest_sec) values
  ('e0000000-0000-4000-8000-000000000001', null, 'Bench Press (Barbel)', 'Bench Press (Barbell)', 'chest', array['triceps', 'shoulders']::text[], 'barbell', 'weight_reps', 180),
  ('e0000000-0000-4000-8000-000000000002', null, 'Incline Bench Press (Barbel)', 'Incline Bench Press (Barbell)', 'chest', array['shoulders', 'triceps']::text[], 'barbell', 'weight_reps', 150),
  ('e0000000-0000-4000-8000-000000000003', null, 'Decline Bench Press (Barbel)', 'Decline Bench Press (Barbell)', 'chest', array['triceps']::text[], 'barbell', 'weight_reps', 150),
  ('e0000000-0000-4000-8000-000000000004', null, 'Bench Press (Dumbel)', 'Bench Press (Dumbbell)', 'chest', array['triceps', 'shoulders']::text[], 'dumbbell', 'weight_reps', 120),
  ('e0000000-0000-4000-8000-000000000005', null, 'Incline Press (Dumbel)', 'Incline Press (Dumbbell)', 'chest', array['shoulders', 'triceps']::text[], 'dumbbell', 'weight_reps', 120),
  ('e0000000-0000-4000-8000-000000000006', null, 'Fly (Dumbel)', 'Fly (Dumbbell)', 'chest', array['shoulders']::text[], 'dumbbell', 'weight_reps', 90),
  ('e0000000-0000-4000-8000-000000000007', null, 'Cable Crossover', 'Cable Crossover', 'chest', array['shoulders']::text[], 'cable', 'weight_reps', 90),
  ('e0000000-0000-4000-8000-000000000008', null, 'Chest Press (Mesin)', 'Chest Press (Machine)', 'chest', array['triceps', 'shoulders']::text[], 'machine', 'weight_reps', 90),
  ('e0000000-0000-4000-8000-000000000009', null, 'Pec Deck (Mesin)', 'Pec Deck (Machine)', 'chest', array[]::text[], 'machine', 'weight_reps', 90),
  ('e0000000-0000-4000-8000-00000000000a', null, 'Push Up', 'Push Up', 'chest', array['triceps', 'shoulders']::text[], 'bodyweight', 'bodyweight_reps', 60),
  ('e0000000-0000-4000-8000-00000000000b', null, 'Dips', 'Dips', 'chest', array['triceps', 'shoulders']::text[], 'bodyweight', 'bodyweight_reps', 120),
  ('e0000000-0000-4000-8000-00000000000c', null, 'Dips (Dibantu)', 'Assisted Dip', 'chest', array['triceps']::text[], 'machine', 'assisted', 90),
  ('e0000000-0000-4000-8000-00000000000d', null, 'Deadlift (Barbel)', 'Deadlift (Barbell)', 'back', array['hamstrings', 'glutes', 'lower_back', 'traps']::text[], 'barbell', 'weight_reps', 240),
  ('e0000000-0000-4000-8000-00000000000e', null, 'Barbell Row', 'Barbell Row', 'back', array['lats', 'biceps']::text[], 'barbell', 'weight_reps', 150),
  ('e0000000-0000-4000-8000-00000000000f', null, 'Pendlay Row', 'Pendlay Row', 'back', array['lats', 'biceps']::text[], 'barbell', 'weight_reps', 150),
  ('e0000000-0000-4000-8000-000000000010', null, 'One Arm Row (Dumbel)', 'One Arm Row (Dumbbell)', 'lats', array['back', 'biceps']::text[], 'dumbbell', 'weight_reps', 90),
  ('e0000000-0000-4000-8000-000000000011', null, 'Pull Up', 'Pull Up', 'lats', array['biceps', 'back']::text[], 'bodyweight', 'bodyweight_reps', 120),
  ('e0000000-0000-4000-8000-000000000012', null, 'Chin Up', 'Chin Up', 'lats', array['biceps']::text[], 'bodyweight', 'bodyweight_reps', 120),
  ('e0000000-0000-4000-8000-000000000013', null, 'Pull Up (Dibantu)', 'Assisted Pull Up', 'lats', array['biceps']::text[], 'machine', 'assisted', 90),
  ('e0000000-0000-4000-8000-000000000014', null, 'Lat Pulldown (Kabel)', 'Lat Pulldown (Cable)', 'lats', array['biceps']::text[], 'cable', 'weight_reps', 90),
  ('e0000000-0000-4000-8000-000000000015', null, 'Seated Cable Row', 'Seated Cable Row', 'back', array['lats', 'biceps']::text[], 'cable', 'weight_reps', 90),
  ('e0000000-0000-4000-8000-000000000016', null, 'T-Bar Row', 'T-Bar Row', 'back', array['lats', 'biceps']::text[], 'barbell', 'weight_reps', 120),
  ('e0000000-0000-4000-8000-000000000017', null, 'Chest Supported Row (Mesin)', 'Chest Supported Row (Machine)', 'back', array['lats', 'biceps']::text[], 'machine', 'weight_reps', 90),
  ('e0000000-0000-4000-8000-000000000018', null, 'Straight Arm Pulldown', 'Straight Arm Pulldown', 'lats', array[]::text[], 'cable', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000019', null, 'Shrug (Dumbel)', 'Shrug (Dumbbell)', 'traps', array[]::text[], 'dumbbell', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-00000000001a', null, 'Shrug (Barbel)', 'Shrug (Barbell)', 'traps', array[]::text[], 'barbell', 'weight_reps', 90),
  ('e0000000-0000-4000-8000-00000000001b', null, 'Back Extension', 'Back Extension', 'lower_back', array['glutes', 'hamstrings']::text[], 'bodyweight', 'bodyweight_reps', 60),
  ('e0000000-0000-4000-8000-00000000001c', null, 'Rack Pull', 'Rack Pull', 'back', array['traps', 'lower_back']::text[], 'barbell', 'weight_reps', 180),
  ('e0000000-0000-4000-8000-00000000001d', null, 'Overhead Press (Barbel)', 'Overhead Press (Barbell)', 'shoulders', array['triceps']::text[], 'barbell', 'weight_reps', 150),
  ('e0000000-0000-4000-8000-00000000001e', null, 'Shoulder Press (Dumbel)', 'Shoulder Press (Dumbbell)', 'shoulders', array['triceps']::text[], 'dumbbell', 'weight_reps', 120),
  ('e0000000-0000-4000-8000-00000000001f', null, 'Arnold Press', 'Arnold Press', 'shoulders', array['triceps']::text[], 'dumbbell', 'weight_reps', 90),
  ('e0000000-0000-4000-8000-000000000020', null, 'Shoulder Press (Mesin)', 'Shoulder Press (Machine)', 'shoulders', array['triceps']::text[], 'machine', 'weight_reps', 90),
  ('e0000000-0000-4000-8000-000000000021', null, 'Lateral Raise (Dumbel)', 'Lateral Raise (Dumbbell)', 'shoulders', array[]::text[], 'dumbbell', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000022', null, 'Lateral Raise (Kabel)', 'Lateral Raise (Cable)', 'shoulders', array[]::text[], 'cable', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000023', null, 'Front Raise (Dumbel)', 'Front Raise (Dumbbell)', 'shoulders', array[]::text[], 'dumbbell', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000024', null, 'Rear Delt Fly (Dumbel)', 'Rear Delt Fly (Dumbbell)', 'shoulders', array['back']::text[], 'dumbbell', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000025', null, 'Reverse Pec Deck', 'Reverse Pec Deck', 'shoulders', array['back']::text[], 'machine', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000026', null, 'Face Pull', 'Face Pull', 'shoulders', array['traps', 'back']::text[], 'cable', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000027', null, 'Upright Row', 'Upright Row', 'shoulders', array['traps']::text[], 'barbell', 'weight_reps', 90),
  ('e0000000-0000-4000-8000-000000000028', null, 'Bicep Curl (Barbel)', 'Bicep Curl (Barbell)', 'biceps', array['forearms']::text[], 'barbell', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000029', null, 'Bicep Curl (Dumbel)', 'Bicep Curl (Dumbbell)', 'biceps', array['forearms']::text[], 'dumbbell', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-00000000002a', null, 'Hammer Curl', 'Hammer Curl', 'biceps', array['forearms']::text[], 'dumbbell', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-00000000002b', null, 'Preacher Curl', 'Preacher Curl', 'biceps', array[]::text[], 'ez_bar', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-00000000002c', null, 'Incline Curl (Dumbel)', 'Incline Curl (Dumbbell)', 'biceps', array[]::text[], 'dumbbell', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-00000000002d', null, 'Cable Curl', 'Cable Curl', 'biceps', array['forearms']::text[], 'cable', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-00000000002e', null, 'EZ Bar Curl', 'EZ Bar Curl', 'biceps', array['forearms']::text[], 'ez_bar', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-00000000002f', null, 'Triceps Pushdown (Kabel)', 'Triceps Pushdown (Cable)', 'triceps', array[]::text[], 'cable', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000030', null, 'Overhead Triceps Extension (Kabel)', 'Overhead Triceps Extension (Cable)', 'triceps', array[]::text[], 'cable', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000031', null, 'Skull Crusher', 'Skull Crusher', 'triceps', array[]::text[], 'ez_bar', 'weight_reps', 90),
  ('e0000000-0000-4000-8000-000000000032', null, 'Close Grip Bench Press', 'Close Grip Bench Press', 'triceps', array['chest', 'shoulders']::text[], 'barbell', 'weight_reps', 120),
  ('e0000000-0000-4000-8000-000000000033', null, 'Overhead Triceps Extension (Dumbel)', 'Overhead Triceps Extension (Dumbbell)', 'triceps', array[]::text[], 'dumbbell', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000034', null, 'Wrist Curl', 'Wrist Curl', 'forearms', array[]::text[], 'dumbbell', 'weight_reps', 45),
  ('e0000000-0000-4000-8000-000000000035', null, 'Squat (Barbel)', 'Squat (Barbell)', 'quads', array['glutes', 'hamstrings', 'lower_back']::text[], 'barbell', 'weight_reps', 210),
  ('e0000000-0000-4000-8000-000000000036', null, 'Front Squat', 'Front Squat', 'quads', array['glutes', 'abs']::text[], 'barbell', 'weight_reps', 180),
  ('e0000000-0000-4000-8000-000000000037', null, 'Goblet Squat', 'Goblet Squat', 'quads', array['glutes']::text[], 'dumbbell', 'weight_reps', 90),
  ('e0000000-0000-4000-8000-000000000038', null, 'Leg Press', 'Leg Press', 'quads', array['glutes', 'hamstrings']::text[], 'machine', 'weight_reps', 120),
  ('e0000000-0000-4000-8000-000000000039', null, 'Hack Squat (Mesin)', 'Hack Squat (Machine)', 'quads', array['glutes']::text[], 'machine', 'weight_reps', 120),
  ('e0000000-0000-4000-8000-00000000003a', null, 'Leg Extension', 'Leg Extension', 'quads', array[]::text[], 'machine', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-00000000003b', null, 'Bulgarian Split Squat', 'Bulgarian Split Squat', 'quads', array['glutes', 'hamstrings']::text[], 'dumbbell', 'weight_reps', 90),
  ('e0000000-0000-4000-8000-00000000003c', null, 'Lunge (Dumbel)', 'Lunge (Dumbbell)', 'quads', array['glutes', 'hamstrings']::text[], 'dumbbell', 'weight_reps', 90),
  ('e0000000-0000-4000-8000-00000000003d', null, 'Romanian Deadlift (Barbel)', 'Romanian Deadlift (Barbell)', 'hamstrings', array['glutes', 'lower_back']::text[], 'barbell', 'weight_reps', 150),
  ('e0000000-0000-4000-8000-00000000003e', null, 'Romanian Deadlift (Dumbel)', 'Romanian Deadlift (Dumbbell)', 'hamstrings', array['glutes']::text[], 'dumbbell', 'weight_reps', 120),
  ('e0000000-0000-4000-8000-00000000003f', null, 'Lying Leg Curl', 'Lying Leg Curl', 'hamstrings', array[]::text[], 'machine', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000040', null, 'Seated Leg Curl', 'Seated Leg Curl', 'hamstrings', array[]::text[], 'machine', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000041', null, 'Hip Thrust (Barbel)', 'Hip Thrust (Barbell)', 'glutes', array['hamstrings']::text[], 'barbell', 'weight_reps', 120),
  ('e0000000-0000-4000-8000-000000000042', null, 'Glute Bridge', 'Glute Bridge', 'glutes', array['hamstrings']::text[], 'bodyweight', 'bodyweight_reps', 60),
  ('e0000000-0000-4000-8000-000000000043', null, 'Hip Adduction (Mesin)', 'Hip Adduction (Machine)', 'adductors', array[]::text[], 'machine', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000044', null, 'Hip Abduction (Mesin)', 'Hip Abduction (Machine)', 'glutes', array[]::text[], 'machine', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000045', null, 'Standing Calf Raise', 'Standing Calf Raise', 'calves', array[]::text[], 'machine', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000046', null, 'Seated Calf Raise', 'Seated Calf Raise', 'calves', array[]::text[], 'machine', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000047', null, 'Sumo Deadlift', 'Sumo Deadlift', 'glutes', array['quads', 'hamstrings', 'back']::text[], 'barbell', 'weight_reps', 210),
  ('e0000000-0000-4000-8000-000000000048', null, 'Step Up (Dumbel)', 'Step Up (Dumbbell)', 'quads', array['glutes']::text[], 'dumbbell', 'weight_reps', 90),
  ('e0000000-0000-4000-8000-000000000049', null, 'Plank', 'Plank', 'abs', array['obliques']::text[], 'bodyweight', 'time', 60),
  ('e0000000-0000-4000-8000-00000000004a', null, 'Crunch', 'Crunch', 'abs', array[]::text[], 'bodyweight', 'bodyweight_reps', 45),
  ('e0000000-0000-4000-8000-00000000004b', null, 'Hanging Leg Raise', 'Hanging Leg Raise', 'abs', array['obliques']::text[], 'bodyweight', 'bodyweight_reps', 60),
  ('e0000000-0000-4000-8000-00000000004c', null, 'Cable Crunch', 'Cable Crunch', 'abs', array[]::text[], 'cable', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-00000000004d', null, 'Russian Twist', 'Russian Twist', 'obliques', array['abs']::text[], 'bodyweight', 'bodyweight_reps', 45),
  ('e0000000-0000-4000-8000-00000000004e', null, 'Ab Wheel Rollout', 'Ab Wheel Rollout', 'abs', array['lower_back']::text[], 'other', 'bodyweight_reps', 60),
  ('e0000000-0000-4000-8000-00000000004f', null, 'Side Plank', 'Side Plank', 'obliques', array['abs']::text[], 'bodyweight', 'time', 45),
  ('e0000000-0000-4000-8000-000000000050', null, 'Kettlebell Swing', 'Kettlebell Swing', 'glutes', array['hamstrings', 'lower_back']::text[], 'kettlebell', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000051', null, 'Farmer''s Walk', 'Farmer''s Walk', 'forearms', array['traps', 'full_body']::text[], 'dumbbell', 'distance_time', 90),
  ('e0000000-0000-4000-8000-000000000052', null, 'Treadmill', 'Treadmill', 'cardio', array[]::text[], 'cardio_machine', 'distance_time', 0),
  ('e0000000-0000-4000-8000-000000000053', null, 'Sepeda Statis', 'Stationary Bike', 'cardio', array[]::text[], 'cardio_machine', 'distance_time', 0),
  ('e0000000-0000-4000-8000-000000000054', null, 'Rowing Machine', 'Rowing Machine', 'cardio', array['back']::text[], 'cardio_machine', 'distance_time', 0),
  ('e0000000-0000-4000-8000-000000000055', null, 'Lompat Tali', 'Jump Rope', 'cardio', array['calves']::text[], 'other', 'time', 60)
on conflict (id) do update set name_id = excluded.name_id, name_en = excluded.name_en, primary_muscle = excluded.primary_muscle,
  secondary_muscles = excluded.secondary_muscles, equipment = excluded.equipment, type = excluded.type, default_rest_sec = excluded.default_rest_sec;

insert into public.templates (id, user_id, name, name_en, notes) values
  ('f0000000-0000-4000-8000-000000000001', null, 'Full Body A', 'Full Body A', null),
  ('f0000000-0000-4000-8000-000000000002', null, 'Full Body B', 'Full Body B', null),
  ('f0000000-0000-4000-8000-000000000003', null, 'Upper A', 'Upper A', null),
  ('f0000000-0000-4000-8000-000000000004', null, 'Lower A', 'Lower A', null),
  ('f0000000-0000-4000-8000-000000000005', null, 'Upper B', 'Upper B', null),
  ('f0000000-0000-4000-8000-000000000006', null, 'Lower B', 'Lower B', null),
  ('f0000000-0000-4000-8000-000000000007', null, 'Push', 'Push', null),
  ('f0000000-0000-4000-8000-000000000008', null, 'Pull', 'Pull', null),
  ('f0000000-0000-4000-8000-000000000009', null, 'Legs', 'Legs', null)
on conflict (id) do update set name = excluded.name, name_en = excluded.name_en;

insert into public.template_exercises (id, user_id, template_id, exercise_id, position, target_sets, target_reps_min, target_reps_max, rest_sec, superset_group) values
  ('d0000000-0000-4000-8000-000000000064', null, 'f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000035', 0, 3, 5, 8, 180, null),
  ('d0000000-0000-4000-8000-000000000065', null, 'f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 1, 3, 5, 8, 180, null),
  ('d0000000-0000-4000-8000-000000000066', null, 'f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-00000000000e', 2, 3, 6, 10, 150, null),
  ('d0000000-0000-4000-8000-000000000067', null, 'f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000021', 3, 2, 10, 15, 60, null),
  ('d0000000-0000-4000-8000-000000000068', null, 'f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000049', 4, 2, 30, 60, 60, null),
  ('d0000000-0000-4000-8000-0000000000c8', null, 'f0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-00000000000d', 0, 3, 3, 6, 210, null),
  ('d0000000-0000-4000-8000-0000000000c9', null, 'f0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-00000000001d', 1, 3, 6, 10, 150, null),
  ('d0000000-0000-4000-8000-0000000000ca', null, 'f0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000014', 2, 3, 8, 12, 90, null),
  ('d0000000-0000-4000-8000-0000000000cb', null, 'f0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-00000000003b', 3, 2, 8, 12, 90, null),
  ('d0000000-0000-4000-8000-0000000000cc', null, 'f0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000029', 4, 2, 10, 15, 60, 'a'),
  ('d0000000-0000-4000-8000-0000000000cd', null, 'f0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-00000000002f', 5, 2, 10, 15, 60, 'a'),
  ('d0000000-0000-4000-8000-00000000012c', null, 'f0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001', 0, 4, 5, 8, 180, null),
  ('d0000000-0000-4000-8000-00000000012d', null, 'f0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-00000000000e', 1, 4, 6, 10, 150, null),
  ('d0000000-0000-4000-8000-00000000012e', null, 'f0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-00000000001e', 2, 3, 8, 12, 120, null),
  ('d0000000-0000-4000-8000-00000000012f', null, 'f0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000014', 3, 3, 8, 12, 90, null),
  ('d0000000-0000-4000-8000-000000000130', null, 'f0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000028', 4, 2, 10, 15, 60, 'a'),
  ('d0000000-0000-4000-8000-000000000131', null, 'f0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-00000000002f', 5, 2, 10, 15, 60, 'a'),
  ('d0000000-0000-4000-8000-000000000190', null, 'f0000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000035', 0, 4, 5, 8, 210, null),
  ('d0000000-0000-4000-8000-000000000191', null, 'f0000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-00000000003d', 1, 3, 8, 12, 150, null),
  ('d0000000-0000-4000-8000-000000000192', null, 'f0000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000038', 2, 3, 10, 15, 120, null),
  ('d0000000-0000-4000-8000-000000000193', null, 'f0000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-00000000003f', 3, 3, 10, 15, 60, null),
  ('d0000000-0000-4000-8000-000000000194', null, 'f0000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000045', 4, 3, 10, 15, 60, null),
  ('d0000000-0000-4000-8000-0000000001f4', null, 'f0000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-00000000001d', 0, 4, 5, 8, 180, null),
  ('d0000000-0000-4000-8000-0000000001f5', null, 'f0000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000011', 1, 4, 6, 10, 150, null),
  ('d0000000-0000-4000-8000-0000000001f6', null, 'f0000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000005', 2, 3, 8, 12, 120, null),
  ('d0000000-0000-4000-8000-0000000001f7', null, 'f0000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000015', 3, 3, 8, 12, 90, null),
  ('d0000000-0000-4000-8000-0000000001f8', null, 'f0000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000021', 4, 3, 12, 15, 60, null),
  ('d0000000-0000-4000-8000-0000000001f9', null, 'f0000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-00000000002a', 5, 2, 10, 15, 60, null),
  ('d0000000-0000-4000-8000-000000000258', null, 'f0000000-0000-4000-8000-000000000006', 'e0000000-0000-4000-8000-00000000000d', 0, 3, 3, 6, 240, null),
  ('d0000000-0000-4000-8000-000000000259', null, 'f0000000-0000-4000-8000-000000000006', 'e0000000-0000-4000-8000-000000000036', 1, 3, 6, 10, 180, null),
  ('d0000000-0000-4000-8000-00000000025a', null, 'f0000000-0000-4000-8000-000000000006', 'e0000000-0000-4000-8000-000000000041', 2, 3, 8, 12, 120, null),
  ('d0000000-0000-4000-8000-00000000025b', null, 'f0000000-0000-4000-8000-000000000006', 'e0000000-0000-4000-8000-000000000040', 3, 3, 10, 15, 60, null),
  ('d0000000-0000-4000-8000-00000000025c', null, 'f0000000-0000-4000-8000-000000000006', 'e0000000-0000-4000-8000-00000000004b', 4, 3, 10, 15, 60, null),
  ('d0000000-0000-4000-8000-0000000002bc', null, 'f0000000-0000-4000-8000-000000000007', 'e0000000-0000-4000-8000-000000000001', 0, 4, 5, 8, 180, null),
  ('d0000000-0000-4000-8000-0000000002bd', null, 'f0000000-0000-4000-8000-000000000007', 'e0000000-0000-4000-8000-00000000001e', 1, 3, 8, 12, 120, null),
  ('d0000000-0000-4000-8000-0000000002be', null, 'f0000000-0000-4000-8000-000000000007', 'e0000000-0000-4000-8000-000000000005', 2, 3, 8, 12, 90, null),
  ('d0000000-0000-4000-8000-0000000002bf', null, 'f0000000-0000-4000-8000-000000000007', 'e0000000-0000-4000-8000-000000000021', 3, 3, 12, 15, 60, null),
  ('d0000000-0000-4000-8000-0000000002c0', null, 'f0000000-0000-4000-8000-000000000007', 'e0000000-0000-4000-8000-00000000002f', 4, 3, 10, 15, 60, 'a'),
  ('d0000000-0000-4000-8000-0000000002c1', null, 'f0000000-0000-4000-8000-000000000007', 'e0000000-0000-4000-8000-000000000030', 5, 3, 10, 15, 60, 'a'),
  ('d0000000-0000-4000-8000-000000000320', null, 'f0000000-0000-4000-8000-000000000008', 'e0000000-0000-4000-8000-00000000000d', 0, 3, 3, 6, 210, null),
  ('d0000000-0000-4000-8000-000000000321', null, 'f0000000-0000-4000-8000-000000000008', 'e0000000-0000-4000-8000-000000000011', 1, 3, 6, 10, 150, null),
  ('d0000000-0000-4000-8000-000000000322', null, 'f0000000-0000-4000-8000-000000000008', 'e0000000-0000-4000-8000-000000000015', 2, 3, 8, 12, 90, null),
  ('d0000000-0000-4000-8000-000000000323', null, 'f0000000-0000-4000-8000-000000000008', 'e0000000-0000-4000-8000-000000000026', 3, 3, 12, 15, 60, null),
  ('d0000000-0000-4000-8000-000000000324', null, 'f0000000-0000-4000-8000-000000000008', 'e0000000-0000-4000-8000-00000000002a', 4, 3, 10, 12, 60, 'a'),
  ('d0000000-0000-4000-8000-000000000325', null, 'f0000000-0000-4000-8000-000000000008', 'e0000000-0000-4000-8000-000000000029', 5, 3, 10, 12, 60, 'a'),
  ('d0000000-0000-4000-8000-000000000384', null, 'f0000000-0000-4000-8000-000000000009', 'e0000000-0000-4000-8000-000000000035', 0, 4, 5, 8, 210, null),
  ('d0000000-0000-4000-8000-000000000385', null, 'f0000000-0000-4000-8000-000000000009', 'e0000000-0000-4000-8000-00000000003d', 1, 3, 8, 12, 150, null),
  ('d0000000-0000-4000-8000-000000000386', null, 'f0000000-0000-4000-8000-000000000009', 'e0000000-0000-4000-8000-000000000038', 2, 3, 10, 15, 120, null),
  ('d0000000-0000-4000-8000-000000000387', null, 'f0000000-0000-4000-8000-000000000009', 'e0000000-0000-4000-8000-00000000003a', 3, 3, 12, 15, 60, null),
  ('d0000000-0000-4000-8000-000000000388', null, 'f0000000-0000-4000-8000-000000000009', 'e0000000-0000-4000-8000-00000000003f', 4, 3, 10, 15, 60, null),
  ('d0000000-0000-4000-8000-000000000389', null, 'f0000000-0000-4000-8000-000000000009', 'e0000000-0000-4000-8000-000000000045', 5, 4, 10, 15, 60, null)
on conflict (id) do update set exercise_id = excluded.exercise_id, position = excluded.position, target_sets = excluded.target_sets,
  target_reps_min = excluded.target_reps_min, target_reps_max = excluded.target_reps_max, rest_sec = excluded.rest_sec, superset_group = excluded.superset_group;
