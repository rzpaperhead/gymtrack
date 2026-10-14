-- Admin, promo codes, manual bank-transfer payments, profile photos.

-- ---------------------------------------------------------------------------
-- Admins (by email). Admins get every premium feature.
-- ---------------------------------------------------------------------------
create table public.app_admins (
  email text primary key
);
alter table public.app_admins enable row level security;
insert into public.app_admins (email) values ('rzpaperhead@gmail.com') on conflict do nothing;

create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from auth.users u join public.app_admins a on lower(a.email) = lower(u.email)
    where u.id = uid
  );
$$;

-- Admins count as premium for the server-side limits too.
create or replace function public.is_premium(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin(uid) or exists (
    select 1 from public.subscriptions s
    where s.user_id = uid
      and s.tier = 'premium'
      and s.status in ('active', 'canceled')
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;

-- Grant premium to a user: permanent (days null) or extend by `days`.
create or replace function public.grant_premium(uid uuid, days int, source text, ref text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cur public.subscriptions;
  new_end timestamptz;
begin
  select * into cur from public.subscriptions where user_id = uid;
  if days is null then
    new_end := null;
  elsif cur.tier = 'premium' and cur.current_period_end is null and cur.status = 'active' then
    return; -- already permanent, keep it
  else
    new_end := greatest(coalesce(cur.current_period_end, now()), now()) + make_interval(days => days);
  end if;
  insert into public.subscriptions (user_id, tier, status, provider, provider_ref, current_period_end)
  values (uid, 'premium', 'active', source, ref, new_end)
  on conflict (user_id) do update
    set tier = 'premium', status = 'active', provider = excluded.provider,
        provider_ref = excluded.provider_ref, current_period_end = excluded.current_period_end;
end;
$$;
revoke all on function public.grant_premium(uuid, int, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Promo codes
-- ---------------------------------------------------------------------------
create table public.promo_codes (
  code text primary key check (code ~ '^[A-Z0-9-]{4,32}$'),
  kind text not null check (kind in ('temporary', 'permanent')),
  duration_days int check ((kind = 'permanent' and duration_days is null) or (kind = 'temporary' and duration_days between 1 and 3650)),
  max_uses int not null default 1 check (max_uses between 1 and 100000),
  used_count int not null default 0,
  note text check (char_length(note) <= 200),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.promo_codes enable row level security;
create policy promo_codes_admin on public.promo_codes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create table public.promo_redemptions (
  code text not null references public.promo_codes (code) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  user_email text,
  redeemed_at timestamptz not null default now(),
  primary key (code, user_id)
);
alter table public.promo_redemptions enable row level security;
create policy promo_redemptions_admin on public.promo_redemptions for select to authenticated using (public.is_admin());

create or replace function public.redeem_promo_code(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  pc public.promo_codes;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into pc from public.promo_codes where code = upper(trim(p_code)) for update;
  if not found or not pc.active then return 'invalid'; end if;
  if exists (select 1 from public.promo_redemptions where code = pc.code and user_id = uid) then return 'already'; end if;
  if pc.used_count >= pc.max_uses then return 'used_up'; end if;
  insert into public.promo_redemptions (code, user_id, user_email) values (pc.code, uid, auth.jwt() ->> 'email');
  update public.promo_codes set used_count = used_count + 1 where code = pc.code;
  perform public.grant_premium(uid, pc.duration_days, 'promo', pc.code);
  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- Manual payment confirmations (bank transfer + screenshot)
-- ---------------------------------------------------------------------------
create table public.payment_confirmations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  user_email text default (auth.jwt() ->> 'email'),
  amount_idr integer not null check (amount_idr between 0 and 100000000),
  proof_path text not null,
  note text check (char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint payment_proof_owner check (proof_path like user_id::text || '/%')
);
alter table public.payment_confirmations enable row level security;
create policy payment_own_select on public.payment_confirmations for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy payment_own_insert on public.payment_confirmations for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending' and reviewed_at is null);

create or replace function public.review_payment(p_id uuid, p_approve boolean, p_days int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pc public.payment_confirmations;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  select * into pc from public.payment_confirmations where id = p_id for update;
  if not found or pc.status <> 'pending' then return; end if;
  update public.payment_confirmations
    set status = case when p_approve then 'approved' else 'rejected' end, reviewed_at = now()
    where id = p_id;
  if p_approve then
    perform public.grant_premium(pc.user_id, p_days, 'bank_transfer', pc.id::text);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage: payment proofs (private, admin can read) and avatars (public read)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('payment-proofs', 'payment-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('avatars', 'avatars', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy payment_proofs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy payment_proofs_read on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));

create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

alter table public.profiles add column if not exists avatar_url text check (char_length(avatar_url) <= 100000);
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
-- GENERATED by scripts/gen-builtin-sql.ts — do not edit by hand.
-- Built-in exercise library and templates (owner/user_id = null).

insert into public.exercises (id, owner_id, category, name_id, name_en, primary_muscle, secondary_muscles, equipment, type, default_rest_sec) values
  ('e0000000-0000-4000-8000-000000000001', null, 'strength', 'Bench Press (Barbel)', 'Bench Press (Barbell)', 'chest', array['triceps', 'shoulders']::text[], 'barbell', 'weight_reps', 180),
  ('e0000000-0000-4000-8000-000000000002', null, 'strength', 'Incline Bench Press (Barbel)', 'Incline Bench Press (Barbell)', 'chest', array['shoulders', 'triceps']::text[], 'barbell', 'weight_reps', 150),
  ('e0000000-0000-4000-8000-000000000003', null, 'strength', 'Decline Bench Press (Barbel)', 'Decline Bench Press (Barbell)', 'chest', array['triceps']::text[], 'barbell', 'weight_reps', 150),
  ('e0000000-0000-4000-8000-000000000004', null, 'strength', 'Bench Press (Dumbel)', 'Bench Press (Dumbbell)', 'chest', array['triceps', 'shoulders']::text[], 'dumbbell', 'weight_reps', 120),
  ('e0000000-0000-4000-8000-000000000005', null, 'strength', 'Incline Press (Dumbel)', 'Incline Press (Dumbbell)', 'chest', array['shoulders', 'triceps']::text[], 'dumbbell', 'weight_reps', 120),
  ('e0000000-0000-4000-8000-000000000006', null, 'strength', 'Fly (Dumbel)', 'Fly (Dumbbell)', 'chest', array['shoulders']::text[], 'dumbbell', 'weight_reps', 90),
  ('e0000000-0000-4000-8000-000000000007', null, 'strength', 'Cable Crossover', 'Cable Crossover', 'chest', array['shoulders']::text[], 'cable', 'weight_reps', 90),
  ('e0000000-0000-4000-8000-000000000008', null, 'strength', 'Chest Press (Mesin)', 'Chest Press (Machine)', 'chest', array['triceps', 'shoulders']::text[], 'machine', 'weight_reps', 90),
  ('e0000000-0000-4000-8000-000000000009', null, 'strength', 'Pec Deck (Mesin)', 'Pec Deck (Machine)', 'chest', array[]::text[], 'machine', 'weight_reps', 90),
  ('e0000000-0000-4000-8000-00000000000a', null, 'strength', 'Push Up', 'Push Up', 'chest', array['triceps', 'shoulders']::text[], 'bodyweight', 'bodyweight_reps', 60),
  ('e0000000-0000-4000-8000-00000000000b', null, 'strength', 'Dips', 'Dips', 'chest', array['triceps', 'shoulders']::text[], 'bodyweight', 'bodyweight_reps', 120),
  ('e0000000-0000-4000-8000-00000000000c', null, 'strength', 'Dips (Dibantu)', 'Assisted Dip', 'chest', array['triceps']::text[], 'machine', 'assisted', 90),
  ('e0000000-0000-4000-8000-00000000000d', null, 'strength', 'Deadlift (Barbel)', 'Deadlift (Barbell)', 'back', array['hamstrings', 'glutes', 'lower_back', 'traps']::text[], 'barbell', 'weight_reps', 240),
  ('e0000000-0000-4000-8000-00000000000e', null, 'strength', 'Barbell Row', 'Barbell Row', 'back', array['lats', 'biceps']::text[], 'barbell', 'weight_reps', 150),
  ('e0000000-0000-4000-8000-00000000000f', null, 'strength', 'Pendlay Row', 'Pendlay Row', 'back', array['lats', 'biceps']::text[], 'barbell', 'weight_reps', 150),
  ('e0000000-0000-4000-8000-000000000010', null, 'strength', 'One Arm Row (Dumbel)', 'One Arm Row (Dumbbell)', 'lats', array['back', 'biceps']::text[], 'dumbbell', 'weight_reps', 90),
  ('e0000000-0000-4000-8000-000000000011', null, 'strength', 'Pull Up', 'Pull Up', 'lats', array['biceps', 'back']::text[], 'bodyweight', 'bodyweight_reps', 120),
  ('e0000000-0000-4000-8000-000000000012', null, 'strength', 'Chin Up', 'Chin Up', 'lats', array['biceps']::text[], 'bodyweight', 'bodyweight_reps', 120),
  ('e0000000-0000-4000-8000-000000000013', null, 'strength', 'Pull Up (Dibantu)', 'Assisted Pull Up', 'lats', array['biceps']::text[], 'machine', 'assisted', 90),
  ('e0000000-0000-4000-8000-000000000014', null, 'strength', 'Lat Pulldown (Kabel)', 'Lat Pulldown (Cable)', 'lats', array['biceps']::text[], 'cable', 'weight_reps', 90),
  ('e0000000-0000-4000-8000-000000000015', null, 'strength', 'Seated Cable Row', 'Seated Cable Row', 'back', array['lats', 'biceps']::text[], 'cable', 'weight_reps', 90),
  ('e0000000-0000-4000-8000-000000000016', null, 'strength', 'T-Bar Row', 'T-Bar Row', 'back', array['lats', 'biceps']::text[], 'barbell', 'weight_reps', 120),
  ('e0000000-0000-4000-8000-000000000017', null, 'strength', 'Chest Supported Row (Mesin)', 'Chest Supported Row (Machine)', 'back', array['lats', 'biceps']::text[], 'machine', 'weight_reps', 90),
  ('e0000000-0000-4000-8000-000000000018', null, 'strength', 'Straight Arm Pulldown', 'Straight Arm Pulldown', 'lats', array[]::text[], 'cable', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000019', null, 'strength', 'Shrug (Dumbel)', 'Shrug (Dumbbell)', 'traps', array[]::text[], 'dumbbell', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-00000000001a', null, 'strength', 'Shrug (Barbel)', 'Shrug (Barbell)', 'traps', array[]::text[], 'barbell', 'weight_reps', 90),
  ('e0000000-0000-4000-8000-00000000001b', null, 'strength', 'Back Extension', 'Back Extension', 'lower_back', array['glutes', 'hamstrings']::text[], 'bodyweight', 'bodyweight_reps', 60),
  ('e0000000-0000-4000-8000-00000000001c', null, 'strength', 'Rack Pull', 'Rack Pull', 'back', array['traps', 'lower_back']::text[], 'barbell', 'weight_reps', 180),
  ('e0000000-0000-4000-8000-00000000001d', null, 'strength', 'Overhead Press (Barbel)', 'Overhead Press (Barbell)', 'shoulders', array['triceps']::text[], 'barbell', 'weight_reps', 150),
  ('e0000000-0000-4000-8000-00000000001e', null, 'strength', 'Shoulder Press (Dumbel)', 'Shoulder Press (Dumbbell)', 'shoulders', array['triceps']::text[], 'dumbbell', 'weight_reps', 120),
  ('e0000000-0000-4000-8000-00000000001f', null, 'strength', 'Arnold Press', 'Arnold Press', 'shoulders', array['triceps']::text[], 'dumbbell', 'weight_reps', 90),
  ('e0000000-0000-4000-8000-000000000020', null, 'strength', 'Shoulder Press (Mesin)', 'Shoulder Press (Machine)', 'shoulders', array['triceps']::text[], 'machine', 'weight_reps', 90),
  ('e0000000-0000-4000-8000-000000000021', null, 'strength', 'Lateral Raise (Dumbel)', 'Lateral Raise (Dumbbell)', 'shoulders', array[]::text[], 'dumbbell', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000022', null, 'strength', 'Lateral Raise (Kabel)', 'Lateral Raise (Cable)', 'shoulders', array[]::text[], 'cable', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000023', null, 'strength', 'Front Raise (Dumbel)', 'Front Raise (Dumbbell)', 'shoulders', array[]::text[], 'dumbbell', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000024', null, 'strength', 'Rear Delt Fly (Dumbel)', 'Rear Delt Fly (Dumbbell)', 'shoulders', array['back']::text[], 'dumbbell', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000025', null, 'strength', 'Reverse Pec Deck', 'Reverse Pec Deck', 'shoulders', array['back']::text[], 'machine', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000026', null, 'strength', 'Face Pull', 'Face Pull', 'shoulders', array['traps', 'back']::text[], 'cable', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000027', null, 'strength', 'Upright Row', 'Upright Row', 'shoulders', array['traps']::text[], 'barbell', 'weight_reps', 90),
  ('e0000000-0000-4000-8000-000000000028', null, 'strength', 'Bicep Curl (Barbel)', 'Bicep Curl (Barbell)', 'biceps', array['forearms']::text[], 'barbell', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000029', null, 'strength', 'Bicep Curl (Dumbel)', 'Bicep Curl (Dumbbell)', 'biceps', array['forearms']::text[], 'dumbbell', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-00000000002a', null, 'strength', 'Hammer Curl', 'Hammer Curl', 'biceps', array['forearms']::text[], 'dumbbell', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-00000000002b', null, 'strength', 'Preacher Curl', 'Preacher Curl', 'biceps', array[]::text[], 'ez_bar', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-00000000002c', null, 'strength', 'Incline Curl (Dumbel)', 'Incline Curl (Dumbbell)', 'biceps', array[]::text[], 'dumbbell', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-00000000002d', null, 'strength', 'Cable Curl', 'Cable Curl', 'biceps', array['forearms']::text[], 'cable', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-00000000002e', null, 'strength', 'EZ Bar Curl', 'EZ Bar Curl', 'biceps', array['forearms']::text[], 'ez_bar', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-00000000002f', null, 'strength', 'Triceps Pushdown (Kabel)', 'Triceps Pushdown (Cable)', 'triceps', array[]::text[], 'cable', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000030', null, 'strength', 'Overhead Triceps Extension (Kabel)', 'Overhead Triceps Extension (Cable)', 'triceps', array[]::text[], 'cable', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000031', null, 'strength', 'Skull Crusher', 'Skull Crusher', 'triceps', array[]::text[], 'ez_bar', 'weight_reps', 90),
  ('e0000000-0000-4000-8000-000000000032', null, 'strength', 'Close Grip Bench Press', 'Close Grip Bench Press', 'triceps', array['chest', 'shoulders']::text[], 'barbell', 'weight_reps', 120),
  ('e0000000-0000-4000-8000-000000000033', null, 'strength', 'Overhead Triceps Extension (Dumbel)', 'Overhead Triceps Extension (Dumbbell)', 'triceps', array[]::text[], 'dumbbell', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000034', null, 'strength', 'Wrist Curl', 'Wrist Curl', 'forearms', array[]::text[], 'dumbbell', 'weight_reps', 45),
  ('e0000000-0000-4000-8000-000000000035', null, 'strength', 'Squat (Barbel)', 'Squat (Barbell)', 'quads', array['glutes', 'hamstrings', 'lower_back']::text[], 'barbell', 'weight_reps', 210),
  ('e0000000-0000-4000-8000-000000000036', null, 'strength', 'Front Squat', 'Front Squat', 'quads', array['glutes', 'abs']::text[], 'barbell', 'weight_reps', 180),
  ('e0000000-0000-4000-8000-000000000037', null, 'strength', 'Goblet Squat', 'Goblet Squat', 'quads', array['glutes']::text[], 'dumbbell', 'weight_reps', 90),
  ('e0000000-0000-4000-8000-000000000038', null, 'strength', 'Leg Press', 'Leg Press', 'quads', array['glutes', 'hamstrings']::text[], 'machine', 'weight_reps', 120),
  ('e0000000-0000-4000-8000-000000000039', null, 'strength', 'Hack Squat (Mesin)', 'Hack Squat (Machine)', 'quads', array['glutes']::text[], 'machine', 'weight_reps', 120),
  ('e0000000-0000-4000-8000-00000000003a', null, 'strength', 'Leg Extension', 'Leg Extension', 'quads', array[]::text[], 'machine', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-00000000003b', null, 'strength', 'Bulgarian Split Squat', 'Bulgarian Split Squat', 'quads', array['glutes', 'hamstrings']::text[], 'dumbbell', 'weight_reps', 90),
  ('e0000000-0000-4000-8000-00000000003c', null, 'strength', 'Lunge (Dumbel)', 'Lunge (Dumbbell)', 'quads', array['glutes', 'hamstrings']::text[], 'dumbbell', 'weight_reps', 90),
  ('e0000000-0000-4000-8000-00000000003d', null, 'strength', 'Romanian Deadlift (Barbel)', 'Romanian Deadlift (Barbell)', 'hamstrings', array['glutes', 'lower_back']::text[], 'barbell', 'weight_reps', 150),
  ('e0000000-0000-4000-8000-00000000003e', null, 'strength', 'Romanian Deadlift (Dumbel)', 'Romanian Deadlift (Dumbbell)', 'hamstrings', array['glutes']::text[], 'dumbbell', 'weight_reps', 120),
  ('e0000000-0000-4000-8000-00000000003f', null, 'strength', 'Lying Leg Curl', 'Lying Leg Curl', 'hamstrings', array[]::text[], 'machine', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000040', null, 'strength', 'Seated Leg Curl', 'Seated Leg Curl', 'hamstrings', array[]::text[], 'machine', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000041', null, 'strength', 'Hip Thrust (Barbel)', 'Hip Thrust (Barbell)', 'glutes', array['hamstrings']::text[], 'barbell', 'weight_reps', 120),
  ('e0000000-0000-4000-8000-000000000042', null, 'strength', 'Glute Bridge', 'Glute Bridge', 'glutes', array['hamstrings']::text[], 'bodyweight', 'bodyweight_reps', 60),
  ('e0000000-0000-4000-8000-000000000043', null, 'strength', 'Hip Adduction (Mesin)', 'Hip Adduction (Machine)', 'adductors', array[]::text[], 'machine', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000044', null, 'strength', 'Hip Abduction (Mesin)', 'Hip Abduction (Machine)', 'glutes', array[]::text[], 'machine', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000045', null, 'strength', 'Standing Calf Raise', 'Standing Calf Raise', 'calves', array[]::text[], 'machine', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000046', null, 'strength', 'Seated Calf Raise', 'Seated Calf Raise', 'calves', array[]::text[], 'machine', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000047', null, 'strength', 'Sumo Deadlift', 'Sumo Deadlift', 'glutes', array['quads', 'hamstrings', 'back']::text[], 'barbell', 'weight_reps', 210),
  ('e0000000-0000-4000-8000-000000000048', null, 'strength', 'Step Up (Dumbel)', 'Step Up (Dumbbell)', 'quads', array['glutes']::text[], 'dumbbell', 'weight_reps', 90),
  ('e0000000-0000-4000-8000-000000000049', null, 'strength', 'Plank', 'Plank', 'abs', array['obliques']::text[], 'bodyweight', 'time', 60),
  ('e0000000-0000-4000-8000-00000000004a', null, 'strength', 'Crunch', 'Crunch', 'abs', array[]::text[], 'bodyweight', 'bodyweight_reps', 45),
  ('e0000000-0000-4000-8000-00000000004b', null, 'strength', 'Hanging Leg Raise', 'Hanging Leg Raise', 'abs', array['obliques']::text[], 'bodyweight', 'bodyweight_reps', 60),
  ('e0000000-0000-4000-8000-00000000004c', null, 'strength', 'Cable Crunch', 'Cable Crunch', 'abs', array[]::text[], 'cable', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-00000000004d', null, 'strength', 'Russian Twist', 'Russian Twist', 'obliques', array['abs']::text[], 'bodyweight', 'bodyweight_reps', 45),
  ('e0000000-0000-4000-8000-00000000004e', null, 'strength', 'Ab Wheel Rollout', 'Ab Wheel Rollout', 'abs', array['lower_back']::text[], 'other', 'bodyweight_reps', 60),
  ('e0000000-0000-4000-8000-00000000004f', null, 'strength', 'Side Plank', 'Side Plank', 'obliques', array['abs']::text[], 'bodyweight', 'time', 45),
  ('e0000000-0000-4000-8000-000000000050', null, 'strength', 'Kettlebell Swing', 'Kettlebell Swing', 'glutes', array['hamstrings', 'lower_back']::text[], 'kettlebell', 'weight_reps', 60),
  ('e0000000-0000-4000-8000-000000000051', null, 'strength', 'Farmer''s Walk', 'Farmer''s Walk', 'forearms', array['traps', 'full_body']::text[], 'dumbbell', 'distance_time', 90),
  ('e0000000-0000-4000-8000-000000000052', null, 'strength', 'Treadmill', 'Treadmill', 'cardio', array[]::text[], 'cardio_machine', 'distance_time', 0),
  ('e0000000-0000-4000-8000-000000000053', null, 'strength', 'Sepeda Statis', 'Stationary Bike', 'cardio', array[]::text[], 'cardio_machine', 'distance_time', 0),
  ('e0000000-0000-4000-8000-000000000054', null, 'strength', 'Rowing Machine', 'Rowing Machine', 'cardio', array['back']::text[], 'cardio_machine', 'distance_time', 0),
  ('e0000000-0000-4000-8000-000000000055', null, 'strength', 'Lompat Tali', 'Jump Rope', 'cardio', array['calves']::text[], 'other', 'time', 60),
  ('e0000000-0000-4000-8000-000000000056', null, 'warmup', 'Jumping Jack', 'Jumping Jack', 'full_body', array['calves', 'shoulders']::text[], 'bodyweight', 'time', 0),
  ('e0000000-0000-4000-8000-000000000057', null, 'warmup', 'Putaran Lengan', 'Arm Circles', 'shoulders', array[]::text[], 'bodyweight', 'time', 0),
  ('e0000000-0000-4000-8000-000000000058', null, 'warmup', 'Ayunan Kaki Depan-Belakang', 'Leg Swing (Front-Back)', 'hamstrings', array['glutes']::text[], 'bodyweight', 'bodyweight_reps', 0),
  ('e0000000-0000-4000-8000-000000000059', null, 'warmup', 'Ayunan Kaki Samping', 'Leg Swing (Side)', 'adductors', array['glutes']::text[], 'bodyweight', 'bodyweight_reps', 0),
  ('e0000000-0000-4000-8000-00000000005a', null, 'warmup', 'Putaran Pinggul', 'Hip Circles', 'glutes', array['lower_back']::text[], 'bodyweight', 'bodyweight_reps', 0),
  ('e0000000-0000-4000-8000-00000000005b', null, 'warmup', 'Squat Tanpa Beban', 'Bodyweight Squat', 'quads', array['glutes']::text[], 'bodyweight', 'bodyweight_reps', 0),
  ('e0000000-0000-4000-8000-00000000005c', null, 'warmup', 'Lunge dengan Putar Badan', 'Lunge with Twist', 'quads', array['obliques', 'glutes']::text[], 'bodyweight', 'bodyweight_reps', 0),
  ('e0000000-0000-4000-8000-00000000005d', null, 'warmup', 'Inchworm', 'Inchworm', 'full_body', array['hamstrings', 'shoulders']::text[], 'bodyweight', 'bodyweight_reps', 0),
  ('e0000000-0000-4000-8000-00000000005e', null, 'warmup', 'World''s Greatest Stretch', 'World''s Greatest Stretch', 'glutes', array['hamstrings', 'back']::text[], 'bodyweight', 'bodyweight_reps', 0),
  ('e0000000-0000-4000-8000-00000000005f', null, 'warmup', 'Band Pull-Apart', 'Band Pull-Apart', 'back', array['shoulders']::text[], 'band', 'bodyweight_reps', 0),
  ('e0000000-0000-4000-8000-000000000060', null, 'warmup', 'Cat-Cow', 'Cat-Cow', 'lower_back', array['abs']::text[], 'bodyweight', 'bodyweight_reps', 0),
  ('e0000000-0000-4000-8000-000000000061', null, 'warmup', 'High Knees', 'High Knees', 'cardio', array['quads']::text[], 'bodyweight', 'time', 0),
  ('e0000000-0000-4000-8000-000000000062', null, 'warmup', 'Putar Badan', 'Torso Twist', 'obliques', array['abs']::text[], 'bodyweight', 'bodyweight_reps', 0),
  ('e0000000-0000-4000-8000-000000000063', null, 'warmup', 'Scapular Push Up', 'Scapular Push Up', 'chest', array['shoulders']::text[], 'bodyweight', 'bodyweight_reps', 0),
  ('e0000000-0000-4000-8000-000000000064', null, 'cooldown', 'Peregangan Dada di Pintu', 'Doorway Chest Stretch', 'chest', array['shoulders']::text[], 'bodyweight', 'time', 0),
  ('e0000000-0000-4000-8000-000000000065', null, 'cooldown', 'Child''s Pose', 'Child''s Pose', 'lats', array['lower_back']::text[], 'bodyweight', 'time', 0),
  ('e0000000-0000-4000-8000-000000000066', null, 'cooldown', 'Peregangan Hamstring Duduk', 'Seated Hamstring Stretch', 'hamstrings', array['lower_back']::text[], 'bodyweight', 'time', 0),
  ('e0000000-0000-4000-8000-000000000067', null, 'cooldown', 'Peregangan Paha Depan Berdiri', 'Standing Quad Stretch', 'quads', array[]::text[], 'bodyweight', 'time', 0),
  ('e0000000-0000-4000-8000-000000000068', null, 'cooldown', 'Pigeon Stretch', 'Pigeon Stretch', 'glutes', array[]::text[], 'bodyweight', 'time', 0),
  ('e0000000-0000-4000-8000-000000000069', null, 'cooldown', 'Peregangan Bahu Silang', 'Cross-Body Shoulder Stretch', 'shoulders', array[]::text[], 'bodyweight', 'time', 0),
  ('e0000000-0000-4000-8000-00000000006a', null, 'cooldown', 'Peregangan Trisep di Atas Kepala', 'Overhead Triceps Stretch', 'triceps', array['lats']::text[], 'bodyweight', 'time', 0),
  ('e0000000-0000-4000-8000-00000000006b', null, 'cooldown', 'Peregangan Betis di Dinding', 'Wall Calf Stretch', 'calves', array[]::text[], 'bodyweight', 'time', 0),
  ('e0000000-0000-4000-8000-00000000006c', null, 'cooldown', 'Butterfly Stretch', 'Butterfly Stretch', 'adductors', array[]::text[], 'bodyweight', 'time', 0),
  ('e0000000-0000-4000-8000-00000000006d', null, 'cooldown', 'Cobra Stretch', 'Cobra Stretch', 'abs', array['lower_back']::text[], 'bodyweight', 'time', 0),
  ('e0000000-0000-4000-8000-00000000006e', null, 'cooldown', 'Peregangan Fleksor Pinggul', 'Kneeling Hip Flexor Stretch', 'quads', array['glutes']::text[], 'bodyweight', 'time', 0),
  ('e0000000-0000-4000-8000-00000000006f', null, 'cooldown', 'Peregangan Bisep di Dinding', 'Wall Biceps Stretch', 'biceps', array['chest']::text[], 'bodyweight', 'time', 0),
  ('e0000000-0000-4000-8000-000000000070', null, 'cooldown', 'Tarik Lutut ke Dada', 'Knees-to-Chest Stretch', 'lower_back', array['glutes']::text[], 'bodyweight', 'time', 0),
  ('e0000000-0000-4000-8000-000000000071', null, 'cooldown', 'Peregangan Trapezius Leher', 'Upper Trap Neck Stretch', 'traps', array[]::text[], 'bodyweight', 'time', 0)
on conflict (id) do update set category = excluded.category, name_id = excluded.name_id, name_en = excluded.name_en, primary_muscle = excluded.primary_muscle,
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
