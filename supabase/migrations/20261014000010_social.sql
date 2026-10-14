-- Social v2: granular privacy, blocking, kudos, leaderboard, challenges, and a
-- notification queue that the push dispatcher drains.

-- ---------------------------------------------------------------------------
-- Granular privacy (master switch share_progress stays reciprocal)
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists share_streak boolean not null default true;
alter table public.profiles add column if not exists share_workouts boolean not null default true;
alter table public.profiles add column if not exists share_lifts boolean not null default true;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and least(f.requester, f.addressee) = least(a, b)
      and greatest(f.requester, f.addressee) = greatest(a, b)
  );
$$;

-- Can `viewer` see `owner`'s progress at all? (friends + both share)
create or replace function public.can_view_progress(viewer uuid, owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select viewer = owner or (
    public.are_friends(viewer, owner)
    and coalesce((select share_progress from public.profiles where id = viewer), false)
    and coalesce((select share_progress from public.profiles where id = owner), false)
  );
$$;

create or replace function public.display_name_of(uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(display_name, ''), 'GymTrack') from public.profiles where id = uid;
$$;

-- ---------------------------------------------------------------------------
-- Notification queue (drained by /api/push/dispatch)
-- ---------------------------------------------------------------------------
create table public.notifications_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('friend_request', 'friend_accepted', 'friend_pr', 'kudos', 'challenge_invite')),
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (user_id, dedupe_key)
);
alter table public.notifications_outbox enable row level security; -- service role only
create index notifications_outbox_unsent on public.notifications_outbox (created_at) where sent_at is null;

create or replace function public.queue_notification(p_user uuid, p_kind text, p_payload jsonb, p_key text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications_outbox (user_id, kind, payload, dedupe_key)
  values (p_user, p_kind, p_payload, p_key)
  on conflict (user_id, dedupe_key) do nothing;
$$;
revoke all on function public.queue_notification(uuid, text, jsonb, text) from public, anon, authenticated;

-- Friend request / accepted → notify the other side.
create or replace function public.notify_friendship()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' and new.status = 'pending' then
    perform public.queue_notification(new.addressee, 'friend_request',
      jsonb_build_object('from', public.display_name_of(new.requester)), 'freq:' || new.id);
  elsif TG_OP = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
    perform public.queue_notification(new.requester, 'friend_accepted',
      jsonb_build_object('from', public.display_name_of(new.addressee)), 'facc:' || new.id);
  end if;
  return new;
end;
$$;
create trigger notify_friendship after insert or update on public.friendships
  for each row execute function public.notify_friendship();

-- ---------------------------------------------------------------------------
-- Blocking
-- ---------------------------------------------------------------------------
create table public.blocks (
  blocker uuid not null references auth.users (id) on delete cascade,
  blocked uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
alter table public.blocks enable row level security;
create policy blocks_own_select on public.blocks for select to authenticated using (blocker = (select auth.uid()));
create policy blocks_own_delete on public.blocks for delete to authenticated using (blocker = (select auth.uid()));

create or replace function public.block_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or p_user = me then return; end if;
  insert into public.blocks (blocker, blocked) values (me, p_user) on conflict do nothing;
  delete from public.friendships
    where least(requester, addressee) = least(me, p_user) and greatest(requester, addressee) = greatest(me, p_user);
  delete from public.challenge_members m using public.challenges c
    where m.challenge_id = c.id and c.creator = me and m.user_id = p_user;
end;
$$;

create or replace function public.list_blocked()
returns table (user_id uuid, display_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select b.blocked, public.display_name_of(b.blocked), b.created_at
  from public.blocks b where b.blocker = auth.uid() order by b.created_at desc;
$$;

-- Requests are silently impossible in either block direction (no leak of who blocked whom).
create or replace function public.send_friend_request(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  them uuid;
  existing public.friendships;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select id into them from public.profiles where friend_code = upper(trim(p_code));
  if them is null then return 'not_found'; end if;
  if them = me then return 'self'; end if;
  if exists (select 1 from public.blocks where (blocker = me and blocked = them) or (blocker = them and blocked = me)) then
    return 'not_found';
  end if;
  select * into existing from public.friendships
    where least(requester, addressee) = least(me, them) and greatest(requester, addressee) = greatest(me, them);
  if found then
    if existing.status = 'accepted' then return 'already_friends'; end if;
    if existing.addressee = me then
      update public.friendships set status = 'accepted', accepted_at = now() where id = existing.id;
      return 'accepted';
    end if;
    return 'already_sent';
  end if;
  insert into public.friendships (requester, addressee) values (me, them);
  return 'sent';
end;
$$;

-- ---------------------------------------------------------------------------
-- Kudos on a friend's workout
-- ---------------------------------------------------------------------------
create table public.workout_kudos (
  workout_id uuid not null references public.workouts (id) on delete cascade,
  from_user uuid not null references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  emoji text not null default '💪' check (emoji in ('💪', '🔥', '👏', '🏆')),
  created_at timestamptz not null default now(),
  primary key (workout_id, from_user)
);
alter table public.workout_kudos enable row level security;
create policy kudos_select on public.workout_kudos for select to authenticated
  using ((select auth.uid()) in (from_user, to_user));
create policy kudos_delete on public.workout_kudos for delete to authenticated
  using (from_user = (select auth.uid()));

create or replace function public.give_kudos(p_workout uuid, p_emoji text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  owner uuid;
begin
  select user_id into owner from public.workouts where id = p_workout and status = 'completed' and deleted_at is null;
  if owner is null or owner = me then return false; end if;
  if not public.can_view_progress(me, owner) or not (select share_workouts from public.profiles where id = owner) then
    return false;
  end if;
  insert into public.workout_kudos (workout_id, from_user, to_user, emoji) values (p_workout, me, owner, p_emoji)
    on conflict (workout_id, from_user) do update set emoji = excluded.emoji;
  perform public.queue_notification(owner, 'kudos',
    jsonb_build_object('from', public.display_name_of(me), 'emoji', p_emoji), 'kudos:' || p_workout || ':' || me);
  return true;
end;
$$;

-- Kudos I received on one of my workouts (for my own history screen).
create or replace function public.kudos_for_workout(p_workout uuid)
returns table (from_name text, emoji text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select public.display_name_of(k.from_user), k.emoji, k.created_at
  from public.workout_kudos k
  where k.workout_id = p_workout and k.to_user = auth.uid()
  order by k.created_at;
$$;

-- ---------------------------------------------------------------------------
-- Friend PR announcements (client sends what it detected; server checks it's
-- the caller's finished workout and fans out to friends who can see lifts).
-- ---------------------------------------------------------------------------
create or replace function public.announce_prs(p_workout uuid, p_items jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  n int := 0;
  friend uuid;
  first_ex text;
  ex_name_id text;
  ex_name_en text;
begin
  if not exists (select 1 from public.workouts where id = p_workout and user_id = me and status = 'completed') then return 0; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then return 0; end if;
  if not coalesce((select share_lifts from public.profiles where id = me), false) then return 0; end if;
  first_ex := p_items -> 0 ->> 'exercise_id';
  select name_id, name_en into ex_name_id, ex_name_en from public.exercises
    where id::text = first_ex and owner_id is null;
  if ex_name_id is null then return 0; end if; -- custom moves stay private
  for friend in
    select case when f.requester = me then f.addressee else f.requester end
    from public.friendships f where f.status = 'accepted' and me in (f.requester, f.addressee)
  loop
    if public.can_view_progress(friend, me) then
      perform public.queue_notification(friend, 'friend_pr', jsonb_build_object(
        'from', public.display_name_of(me),
        'count', least(jsonb_array_length(p_items), 20),
        'exercise_id', ex_name_id,
        'exercise_en', ex_name_en,
        'value', (p_items -> 0 ->> 'value')
      ), 'pr:' || p_workout);
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Weekly leaderboard among friends (only people who share the metric)
-- ---------------------------------------------------------------------------
create or replace function public.friends_leaderboard(p_metric text)
returns table (user_id uuid, display_name text, avatar_url text, value numeric, is_me boolean)
language sql
stable
security definer
set search_path = public
as $$
  with people as (
    select auth.uid() as uid
    union
    select case when f.requester = auth.uid() then f.addressee else f.requester end
    from public.friendships f
    where f.status = 'accepted' and auth.uid() in (f.requester, f.addressee)
  ),
  allowed as (
    select p.uid from people p join public.profiles pr on pr.id = p.uid
    where public.can_view_progress(auth.uid(), p.uid)
      and (select share_progress from public.profiles where id = auth.uid())
      and case when p_metric = 'volume' then pr.share_workouts else pr.share_streak end
  ),
  week as (select date_trunc('week', now()) as start)
  select a.uid,
         public.display_name_of(a.uid),
         (select avatar_url from public.profiles where id = a.uid),
         case when p_metric = 'volume' then
           coalesce((select sum(s.weight_kg * s.reps) from public.sets s join public.workouts w on w.id = s.workout_id
                     where w.user_id = a.uid and w.status = 'completed' and w.deleted_at is null and s.deleted_at is null
                       and s.completed_at is not null and s.set_type <> 'warmup' and w.started_at >= (select start from week)), 0)
         else
           (select count(*) from public.workouts w where w.user_id = a.uid and w.status = 'completed'
              and w.deleted_at is null and w.started_at >= (select start from week))
         end::numeric,
         a.uid = auth.uid()
  from allowed a
  order by 4 desc, 2;
$$;

-- ---------------------------------------------------------------------------
-- Challenges among friends
-- ---------------------------------------------------------------------------
create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  creator uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  metric text not null check (metric in ('sessions', 'volume')),
  target numeric not null check (target > 0 and target <= 100000000),
  start_date date not null,
  end_date date not null check (end_date >= start_date and end_date <= start_date + 366),
  created_at timestamptz not null default now()
);
alter table public.challenges enable row level security;

create table public.challenge_members (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'joined')),
  joined_at timestamptz,
  primary key (challenge_id, user_id)
);
alter table public.challenge_members enable row level security;

create or replace function public.is_challenge_member(p_challenge uuid, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.challenge_members where challenge_id = p_challenge and user_id = uid);
$$;

create policy challenges_select on public.challenges for select to authenticated
  using (public.is_challenge_member(id));
create policy challenges_delete on public.challenges for delete to authenticated
  using (creator = (select auth.uid()));
create policy challenge_members_select on public.challenge_members for select to authenticated
  using (public.is_challenge_member(challenge_id));
-- Leaving a challenge
create policy challenge_members_leave on public.challenge_members for delete to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.create_challenge(p_title text, p_metric text, p_target numeric, p_days int, p_friends uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  cid uuid;
  f uuid;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_days < 1 or p_days > 366 then raise exception 'bad duration'; end if;
  insert into public.challenges (creator, title, metric, target, start_date, end_date)
    values (me, left(trim(p_title), 80), p_metric, p_target, current_date, current_date + p_days - 1)
    returning id into cid;
  insert into public.challenge_members (challenge_id, user_id, status, joined_at) values (cid, me, 'joined', now());
  foreach f in array coalesce(p_friends, '{}') loop
    if public.are_friends(me, f) and not exists (select 1 from public.blocks where (blocker = f and blocked = me) or (blocker = me and blocked = f)) then
      insert into public.challenge_members (challenge_id, user_id) values (cid, f) on conflict do nothing;
      perform public.queue_notification(f, 'challenge_invite',
        jsonb_build_object('from', public.display_name_of(me), 'title', left(trim(p_title), 80)), 'chal:' || cid);
    end if;
  end loop;
  return cid;
end;
$$;

create or replace function public.join_challenge(p_challenge uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.challenge_members set status = 'joined', joined_at = now()
  where challenge_id = p_challenge and user_id = auth.uid() and status = 'invited';
$$;

-- Joining a challenge means agreeing to share that challenge's metric with its members.
create or replace function public.challenge_progress(p_challenge uuid)
returns table (user_id uuid, display_name text, avatar_url text, status text, value numeric, is_me boolean)
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id,
         public.display_name_of(m.user_id),
         (select avatar_url from public.profiles where id = m.user_id),
         m.status,
         case when m.status <> 'joined' then 0
              when c.metric = 'volume' then
                coalesce((select sum(s.weight_kg * s.reps) from public.sets s join public.workouts w on w.id = s.workout_id
                          where w.user_id = m.user_id and w.status = 'completed' and w.deleted_at is null and s.deleted_at is null
                            and s.completed_at is not null and s.set_type <> 'warmup'
                            and w.started_at::date between c.start_date and c.end_date), 0)
              else (select count(*) from public.workouts w where w.user_id = m.user_id and w.status = 'completed'
                      and w.deleted_at is null and w.started_at::date between c.start_date and c.end_date)
         end::numeric,
         m.user_id = auth.uid()
  from public.challenge_members m
  join public.challenges c on c.id = m.challenge_id
  where m.challenge_id = p_challenge and public.is_challenge_member(p_challenge)
  order by 5 desc, 2;
$$;

-- ---------------------------------------------------------------------------
-- friend_progress v2: honours granular privacy + includes kudos on recent workouts
-- ---------------------------------------------------------------------------
create or replace function public.friend_progress(p_friend uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  pr public.profiles;
  result jsonb;
begin
  if not public.are_friends(me, p_friend) then return null; end if;
  if not public.can_view_progress(me, p_friend) then return jsonb_build_object('hidden', true); end if;
  select * into pr from public.profiles where id = p_friend;

  with w as (
    select id, name, started_at, ended_at from public.workouts
    where user_id = p_friend and status = 'completed' and deleted_at is null
  ),
  s as (
    select s.workout_id, we.exercise_id, s.weight_kg, s.reps, s.set_type
    from public.sets s
    join public.workout_exercises we on we.id = s.workout_exercise_id
    where s.user_id = p_friend and s.deleted_at is null and we.deleted_at is null and s.completed_at is not null
  ),
  recent as (
    select w.id, w.name, w.started_at,
           extract(epoch from (w.ended_at - w.started_at))::int as duration_sec,
           coalesce(sum(case when s.set_type <> 'warmup' then s.weight_kg * s.reps end), 0)::int as volume_kg,
           count(s.workout_id) filter (where s.set_type <> 'warmup')::int as sets,
           (select count(*) from public.workout_kudos k where k.workout_id = w.id)::int as kudos,
           (select k.emoji from public.workout_kudos k where k.workout_id = w.id and k.from_user = me) as my_kudos
    from w left join s on s.workout_id = w.id
    group by w.id, w.name, w.started_at, w.ended_at
    order by w.started_at desc
    limit 15
  ),
  best as (
    select s.exercise_id,
           max(case when s.reps = 1 then s.weight_kg else s.weight_kg * (1 + s.reps / 30.0) end) as e1rm
    from s
    join public.exercises e on e.id = s.exercise_id
    where s.set_type <> 'warmup' and s.weight_kg > 0 and s.reps between 1 and 12 and e.category = 'strength'
    group by s.exercise_id
    order by count(*) desc
    limit 6
  )
  select jsonb_build_object(
    'hidden', false,
    'share_streak', pr.share_streak,
    'share_workouts', pr.share_workouts,
    'share_lifts', pr.share_lifts,
    'weekly_target', pr.weekly_target,
    'workout_dates', case when pr.share_streak then
      (select coalesce(jsonb_agg(started_at order by started_at), '[]'::jsonb) from w where started_at > now() - interval '120 days')
      else '[]'::jsonb end,
    'total_workouts', (select count(*) from w),
    'recent', case when pr.share_workouts then
      (select coalesce(jsonb_agg(to_jsonb(recent) order by started_at desc), '[]'::jsonb) from recent)
      else '[]'::jsonb end,
    'best', case when pr.share_lifts then
      (select coalesce(jsonb_agg(jsonb_build_object('exercise_id', exercise_id, 'e1rm', round(e1rm::numeric, 1))), '[]'::jsonb) from best)
      else '[]'::jsonb end
  ) into result;
  return result;
end;
$$;
