-- =============================================================================
-- GymTrack — isi akun DEMO untuk promosi
-- =============================================================================
-- Sebelum menjalankan:
--   1. Daftarkan 4 akun lewat app (https://gymtrack-seven-theta.vercel.app/login):
--        demo utama + 3 teman. Email bawaan di bawah memakai alias Gmail "+",
--        jadi semua email masuk ke inbox rzpaperhead@gmail.com.
--      Cukup daftar; onboarding tidak perlu diselesaikan (script ini mengisinya).
--   2. Kalau memakai email lain, ganti 4 email di bagian "AKUN" di bawah.
--   3. Supabase → SQL Editor → New query → tempel seluruh file ini → Run.
--
-- Aman dijalankan berulang kali: data lama ke-4 akun ini dihapus dulu, lalu
-- dibuat ulang dengan tanggal relatif ke hari ini (grafik selalu "segar").
-- HANYA menyentuh 4 akun yang emailnya tertulis di bawah.
-- =============================================================================

drop table if exists pg_temp.demo_accounts;
create temp table demo_accounts (role text primary key, email text not null, name text not null, scale numeric not null);
insert into demo_accounts values
  -- ===== AKUN (ganti email di sini kalau perlu) =====
  ('demo', 'rzpaperhead+demo@gmail.com', 'Raka',  1.00),
  ('andi', 'rzpaperhead+andi@gmail.com', 'Andi',  1.20),
  ('sari', 'rzpaperhead+sari@gmail.com', 'Sari',  0.55),
  ('bima', 'rzpaperhead+bima@gmail.com', 'Bima',  0.90);

create or replace function pg_temp.ex(n int) returns uuid language sql immutable as
  $$ select ('e0000000-0000-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid $$;
create or replace function pg_temp.tpl(n int) returns uuid language sql immutable as
  $$ select ('f0000000-0000-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid $$;

-- One completed session. kind: push | pull | legs. progress 0..1 (older → newer).
create or replace function pg_temp.make_workout(uid uuid, kind text, ended timestamptz, progress numeric, scale numeric)
returns uuid language plpgsql as $$
declare
  wid uuid := gen_random_uuid();
  weid uuid;
  -- exercise, sets, base kg (null = bodyweight), base reps
  items int[][];
  i int; k int;
  w numeric; r int;
  t timestamptz := ended - interval '62 minutes';
begin
  items := case kind
    when 'push' then array[[1,4,60,8],[30,3,20,10],[5,3,22,10],[33,3,8,14],[47,3,25,12],[48,3,20,12]]
    when 'pull' then array[[13,3,100,5],[17,3,0,8],[21,3,50,10],[38,3,20,14],[42,3,14,10],[41,3,12,10]]
    else            array[[53,4,80,6],[61,3,70,10],[56,3,140,12],[58,3,40,14],[63,3,35,12],[69,4,60,12]]
  end;
  insert into public.workouts (id, user_id, template_id, name, started_at, ended_at, status)
  values (wid, uid, pg_temp.tpl(case kind when 'push' then 7 when 'pull' then 8 else 9 end),
          initcap(kind), ended - interval '65 minutes', ended, 'completed');
  for i in 1 .. array_length(items, 1) loop
    weid := gen_random_uuid();
    insert into public.workout_exercises (id, user_id, workout_id, exercise_id, position)
    values (weid, uid, wid, pg_temp.ex(items[i][1]), i - 1);
    -- warm-up set on the first (compound) lift
    if i = 1 then
      t := t + interval '2 minutes';
      insert into public.sets (user_id, workout_id, workout_exercise_id, position, set_type, weight_kg, reps, completed_at)
      values (uid, wid, weid, 0, 'warmup', round(items[i][3] * scale * 0.5 / 2.5) * 2.5, 10, t);
    end if;
    for k in 1 .. items[i][2] loop
      t := t + interval '2 minutes 30 seconds';
      if items[i][3] = 0 then
        w := null;
        r := items[i][4] + round(progress * 3 * scale)::int - (k / 3);
      else
        w := greatest(2.5, round(items[i][3] * scale * (0.85 + 0.17 * progress) / 2.5) * 2.5);
        r := items[i][4] + (case when k = 1 then 1 else 0 end) - (k / 3);
      end if;
      insert into public.sets (user_id, workout_id, workout_exercise_id, position, set_type, weight_kg, reps, rpe, completed_at)
      values (uid, wid, weid, k - (case when i = 1 then 0 else 1 end), 'working', w, greatest(r, 3),
              case when k = items[i][2] then 8.5 else null end, least(t, ended));
    end loop;
  end loop;
  return wid;
end;
$$;

do $$
declare
  demo uuid; andi uuid; sari uuid; bima uuid;
  ids uuid[];
  missing text;
  a record;
  d int; n int; kinds text[] := array['legs', 'pull', 'push'];
  day date; wid uuid;
  prog uuid; conv uuid; grp uuid; ch uuid;
  w numeric;
begin
  -- Needs update-7 (read receipts) and update-8 (weight goals) applied first.
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'conversation_members' and column_name = 'last_delivered_at') then
    raise exception 'Jalankan dulu supabase/setup/update-7-receipts.sql';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_goal_check' and pg_get_constraintdef(oid) like '%lose_weight%') then
    raise exception 'Jalankan dulu supabase/setup/update-8-weight-goals.sql';
  end if;
  select string_agg(da.email, ', ') into missing
    from demo_accounts da left join auth.users u on lower(u.email) = lower(da.email) where u.id is null;
  if missing is not null then
    raise exception 'Akun belum terdaftar: %. Daftarkan dulu lewat app, lalu jalankan lagi.', missing;
  end if;
  select u.id into demo from auth.users u join demo_accounts da on lower(u.email) = lower(da.email) where da.role = 'demo';
  select u.id into andi from auth.users u join demo_accounts da on lower(u.email) = lower(da.email) where da.role = 'andi';
  select u.id into sari from auth.users u join demo_accounts da on lower(u.email) = lower(da.email) where da.role = 'sari';
  select u.id into bima from auth.users u join demo_accounts da on lower(u.email) = lower(da.email) where da.role = 'bima';
  ids := array[demo, andi, sari, bima];
  if exists (select 1 from public.app_admins aa join auth.users u on lower(u.email) = lower(aa.email) where u.id = any(ids)) then
    raise exception 'Salah satu email adalah akun admin. Pakai email khusus demo.';
  end if;

  -- ---- reset previous demo data (only these 4 accounts) --------------------
  delete from public.conversations c where exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = any(ids));
  delete from public.challenges where creator = any(ids);
  delete from public.workout_kudos where from_user = any(ids) or to_user = any(ids);
  delete from public.friendships where requester = any(ids) or addressee = any(ids);
  delete from public.workouts where user_id = any(ids);
  delete from public.programs where user_id = any(ids);
  delete from public.body_metrics where user_id = any(ids);
  delete from public.nutrition_logs where user_id = any(ids);

  -- ---- profiles ------------------------------------------------------------
  for a in select da.*, u.id as uid from demo_accounts da join auth.users u on lower(u.email) = lower(da.email) loop
    update public.profiles set
      display_name = a.name, locale = 'id', unit = 'kg',
      goal = case a.role when 'demo' then 'hypertrophy' when 'sari' then 'lose_weight' when 'bima' then 'gain_weight' else 'strength' end,
      weekly_target = case a.role when 'demo' then 4 when 'andi' then 5 else 3 end,
      onboarded_at = coalesce(onboarded_at, now() - interval '45 days'),
      share_progress = true, share_streak = true, share_workouts = true, share_lifts = true
    where id = a.uid;
  end loop;
  update public.profiles set bodyweight_start_kg = 78.4, calorie_target = 2400, protein_target = 150, carbs_target = 270, fat_target = 70
    where id = demo;

  -- Demo account shows every chart → Premium (permanent).
  perform public.grant_premium(demo, null, 'demo', 'promo');

  -- ---- demo workouts: 6 weeks, Mon/Tue/Thu/Sat (4x/week), newest first ----
  n := 0;
  for d in 1 .. 42 loop
    day := current_date - d;
    if extract(isodow from day) in (1, 2, 4, 6) then
      perform pg_temp.make_workout(demo, kinds[(n % 3) + 1], (day + time '11:30') at time zone 'UTC', 1 - d / 42.0, 1.0);
      n := n + 1;
    end if;
  end loop;

  -- ---- friends' workouts (last 3 weeks) ------------------------------------
  for a in select da.*, u.id as uid from demo_accounts da join auth.users u on lower(u.email) = lower(da.email) where da.role <> 'demo' loop
    n := 0;
    for d in 0 .. 21 loop
      day := current_date - d;
      if (a.role = 'andi' and extract(isodow from day) in (1, 2, 3, 5, 6))
         or (a.role = 'sari' and extract(isodow from day) in (1, 3, 5))
         or (a.role = 'bima' and extract(isodow from day) in (2, 4, 7)) then
        perform pg_temp.make_workout(a.uid, kinds[(n % 3) + 1],
          (day + case a.role when 'sari' then time '00:15' else time '13:00' end) at time zone 'UTC', 1 - d / 21.0, a.scale);
        n := n + 1;
      end if;
    end loop;
  end loop;
  -- Today's sessions haven't happened yet in other time zones: drop future ones.
  delete from public.workouts where user_id = any(ids) and ended_at > now();

  -- ---- active program: Push/Pull/Legs ---------------------------------------
  insert into public.programs (user_id, name, is_active, builtin_key)
    values (demo, 'Push/Pull/Legs 6x', true, 'ppl_6') returning id into prog;
  insert into public.program_days (user_id, program_id, weekday, template_id) values
    (demo, prog, 1, pg_temp.tpl(7)), (demo, prog, 2, pg_temp.tpl(8)), (demo, prog, 3, pg_temp.tpl(9)),
    (demo, prog, 4, pg_temp.tpl(7)), (demo, prog, 5, pg_temp.tpl(8)), (demo, prog, 6, pg_temp.tpl(9));

  -- ---- body: weight (daily, trending down), measurements (weekly) ----------
  for d in 0 .. 42 loop
    day := current_date - d;
    w := round((75.6 + d * 0.065 + 0.35 * sin(d * 1.7))::numeric, 1);
    insert into public.body_metrics (user_id, date, weight_kg, body_fat_pct, measurements)
    values (demo, day, w,
      case when d % 7 = 0 then round((17.0 + d * 0.045)::numeric, 1) end,
      case when d % 7 = 0 then jsonb_build_object(
        'chest', round((101.5 - d * 0.01)::numeric, 1),
        'waist', round((82.0 + d * 0.07)::numeric, 1),
        'arm',   round((36.5 - d * 0.02)::numeric, 1),
        'thigh', round((58.0 - d * 0.01)::numeric, 1)) else '{}'::jsonb end);
  end loop;

  -- ---- nutrition: last 14 days ---------------------------------------------
  for d in 0 .. 13 loop
    insert into public.nutrition_logs (user_id, date, calories, protein_g, carbs_g, fat_g)
    values (demo, current_date - d,
      2250 + ((d * 137) % 300), 135 + ((d * 7) % 25), 240 + ((d * 11) % 50), 62 + ((d * 5) % 14));
  end loop;

  -- ---- friendships (accepted) ----------------------------------------------
  insert into public.friendships (requester, addressee, status, created_at, accepted_at) values
    (demo, andi, 'accepted', now() - interval '30 days', now() - interval '30 days'),
    (sari, demo, 'accepted', now() - interval '25 days', now() - interval '25 days'),
    (demo, bima, 'accepted', now() - interval '20 days', now() - interval '20 days'),
    (andi, sari, 'accepted', now() - interval '20 days', now() - interval '20 days'),
    (andi, bima, 'accepted', now() - interval '18 days', now() - interval '18 days'),
    (sari, bima, 'accepted', now() - interval '15 days', now() - interval '15 days');

  -- ---- kudos ---------------------------------------------------------------
  insert into public.workout_kudos (workout_id, from_user, to_user, emoji, created_at)
  select w.id, f.uid, demo, f.emoji, w.ended_at + interval '3 hours'
    from (select id, ended_at, row_number() over (order by started_at desc) rn from public.workouts where user_id = demo) w
    join (values (andi, '🔥', 1), (sari, '💪', 2), (bima, '👏', 3)) as f(uid, emoji, ord) on w.rn <= 8 and (w.rn + f.ord) % 2 = 0;
  insert into public.workout_kudos (workout_id, from_user, to_user, emoji, created_at)
  select w.id, demo, w.user_id, '💪', w.ended_at + interval '2 hours'
    from (select id, user_id, ended_at, row_number() over (partition by user_id order by started_at desc) rn
            from public.workouts where user_id in (andi, sari, bima)) w
   where w.rn <= 2;

  -- ---- challenge -----------------------------------------------------------
  insert into public.challenges (creator, title, metric, target, start_date, end_date)
    values (demo, '12 Sesi dalam 30 Hari', 'sessions', 12, current_date - 18, current_date + 12) returning id into ch;
  insert into public.challenge_members (challenge_id, user_id, status, joined_at)
  select ch, u, 'joined', now() - interval '18 days' from unnest(ids) u;

  -- ---- chat: direct with Andi + group "Gym Squad" --------------------------
  insert into public.conversations (kind, created_by, direct_key, created_at)
    values ('direct', demo, least(demo::text, andi::text) || ':' || greatest(demo::text, andi::text), now() - interval '3 days')
    returning id into conv;
  insert into public.conversation_members (conversation_id, user_id, joined_at) values (conv, demo, now() - interval '3 days'), (conv, andi, now() - interval '3 days');
  insert into public.messages (conversation_id, sender_id, body, created_at) values
    (conv, andi, 'Bro, besok leg day bareng jam 7?',                               now() - interval '26 hours'),
    (conv, demo, 'Gas! Squat gue udah naik terus nih 💪',                           now() - interval '25 hours 50 minutes'),
    (conv, andi, 'Mantap, PR lagi ya. Gue lihat di feed 🔥',                        now() - interval '25 hours 45 minutes'),
    (conv, demo, 'Hehe iya. Peta otot gue paha masih merah, Kamis aja gimana?',     now() - interval '3 hours'),
    (conv, andi, 'Siap, Kamis jam 7 👍',                                            now() - interval '2 hours 50 minutes');

  insert into public.conversations (kind, title, created_by, created_at)
    values ('group', 'Gym Squad 🏋️', demo, now() - interval '18 days') returning id into grp;
  insert into public.conversation_members (conversation_id, user_id, role, joined_at)
  select grp, u, case when u = demo then 'owner' else 'member' end, now() - interval '18 days' from unnest(ids) u;
  insert into public.messages (conversation_id, sender_id, body, created_at) values
    (grp, sari, 'Guys, tantangan 12 sesi tinggal 12 hari lagi!',     now() - interval '5 hours'),
    (grp, bima, 'Aku baru beberapa sesi nih 😅',                      now() - interval '4 hours 55 minutes'),
    (grp, demo, 'Ayo kejar, cek peringkat minggu ini 😎',             now() - interval '4 hours 50 minutes'),
    (grp, andi, 'Sabtu latihan bareng yuk, abis itu makan',           now() - interval '1 hour'),
    (grp, sari, 'Setuju! Jangan lupa pemanasan ya 😆',                now() - interval '40 minutes');

  -- Everyone has received & read everything → blue ticks for the demo account.
  update public.conversation_members set last_read_at = now(), last_delivered_at = now()
    where conversation_id in (conv, grp);
  -- Andi's last message stays unread for the demo account (shows an unread badge).
  update public.conversation_members set last_read_at = now() - interval '3 hours', last_delivered_at = now()
    where conversation_id = conv and user_id = demo;

  -- No push notifications for seeded activity.
  delete from public.notifications_outbox where user_id = any(ids);

  raise notice 'Selesai: % sesi demo, % sesi teman.',
    (select count(*) from public.workouts where user_id = demo),
    (select count(*) from public.workouts where user_id in (andi, sari, bima));
end;
$$;
