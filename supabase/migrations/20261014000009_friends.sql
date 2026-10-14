-- Friends: add by friend code, accept/decline, view each other's progress summary.
-- Privacy is reciprocal: you see a friend's progress only if BOTH share it.

alter table public.profiles add column if not exists share_progress boolean not null default true;
alter table public.profiles add column if not exists friend_code text unique;

create or replace function public.new_friend_code()
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
begin
  loop
    c := 'GT-';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where friend_code = c);
  end loop;
  return c;
end;
$$;

-- Codes are assigned by the server and can't be changed by clients.
create or replace function public.keep_friend_code()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'UPDATE' then
    new.friend_code := coalesce(old.friend_code, public.new_friend_code());
  else
    new.friend_code := public.new_friend_code();
  end if;
  return new;
end;
$$;
create trigger keep_friend_code before insert or update on public.profiles
  for each row execute function public.keep_friend_code();

update public.profiles set friend_code = public.new_friend_code() where friend_code is null;

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references auth.users (id) on delete cascade,
  addressee uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  check (requester <> addressee)
);
-- One relationship per pair, whichever direction it started from.
create unique index friendships_pair on public.friendships (least(requester, addressee), greatest(requester, addressee));
alter table public.friendships enable row level security;
create policy friendships_select on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester, addressee));
create policy friendships_delete on public.friendships for delete to authenticated
  using ((select auth.uid()) in (requester, addressee));
-- Inserts/accepts go through the functions below.

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
  select * into existing from public.friendships
    where least(requester, addressee) = least(me, them) and greatest(requester, addressee) = greatest(me, them);
  if found then
    if existing.status = 'accepted' then return 'already_friends'; end if;
    -- They already asked me: accept instead of creating a second request.
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

create or replace function public.respond_friend_request(p_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_accept then
    update public.friendships set status = 'accepted', accepted_at = now()
      where id = p_id and addressee = auth.uid() and status = 'pending';
  else
    delete from public.friendships where id = p_id and addressee = auth.uid() and status = 'pending';
  end if;
end;
$$;

-- Friends + pending requests with the other person's public card.
create or replace function public.list_friends()
returns table (
  id uuid,
  friend_id uuid,
  display_name text,
  avatar_url text,
  status text,
  incoming boolean,
  can_view boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select f.id,
         p.id,
         nullif(p.display_name, ''),
         p.avatar_url,
         f.status,
         f.addressee = auth.uid(),
         f.status = 'accepted' and p.share_progress and me.share_progress,
         f.created_at
  from public.friendships f
  join public.profiles p on p.id = case when f.requester = auth.uid() then f.addressee else f.requester end
  join public.profiles me on me.id = auth.uid()
  where auth.uid() in (f.requester, f.addressee)
  order by f.status desc, f.created_at desc;
$$;

-- Progress summary of a friend. Null unless friends AND both share progress.
create or replace function public.friend_progress(p_friend uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  result jsonb;
begin
  if not exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and least(f.requester, f.addressee) = least(me, p_friend)
      and greatest(f.requester, f.addressee) = greatest(me, p_friend)
  ) then
    return null;
  end if;
  if not (select share_progress from public.profiles where id = me)
     or not (select share_progress from public.profiles where id = p_friend) then
    return jsonb_build_object('hidden', true);
  end if;

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
           count(*) filter (where s.set_type <> 'warmup')::int as sets
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
    'weekly_target', (select weekly_target from public.profiles where id = p_friend),
    'workout_dates', (select coalesce(jsonb_agg(started_at order by started_at), '[]'::jsonb) from w
                      where started_at > now() - interval '120 days'),
    'total_workouts', (select count(*) from w),
    'recent', (select coalesce(jsonb_agg(to_jsonb(recent) order by started_at desc), '[]'::jsonb) from recent),
    'best', (select coalesce(jsonb_agg(jsonb_build_object('exercise_id', exercise_id, 'e1rm', round(e1rm::numeric, 1))), '[]'::jsonb) from best)
  ) into result;
  return result;
end;
$$;
