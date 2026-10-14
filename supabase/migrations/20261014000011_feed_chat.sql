-- Activity feed + chat (direct & group) with realtime and push.

alter table public.notifications_outbox drop constraint if exists notifications_outbox_kind_check;
alter table public.notifications_outbox add constraint notifications_outbox_kind_check
  check (kind in ('friend_request', 'friend_accepted', 'friend_pr', 'kudos', 'challenge_invite', 'message'));

-- ---------------------------------------------------------------------------
-- Activity feed: friends' recent finished workouts (respecting privacy)
-- ---------------------------------------------------------------------------
create or replace function public.friends_feed(p_days int default 14)
returns table (
  workout_id uuid,
  user_id uuid,
  display_name text,
  avatar_url text,
  name text,
  started_at timestamptz,
  duration_sec int,
  sets int,
  volume_kg int,
  kudos int,
  my_kudos text
)
language sql
stable
security definer
set search_path = public
as $$
  with friends as (
    select case when f.requester = auth.uid() then f.addressee else f.requester end as uid
    from public.friendships f
    where f.status = 'accepted' and auth.uid() in (f.requester, f.addressee)
  ),
  visible as (
    select fr.uid from friends fr join public.profiles p on p.id = fr.uid
    where public.can_view_progress(auth.uid(), fr.uid) and p.share_workouts
  )
  select w.id, w.user_id, public.display_name_of(w.user_id),
         (select avatar_url from public.profiles where id = w.user_id),
         w.name, w.started_at,
         extract(epoch from (w.ended_at - w.started_at))::int,
         (select count(*) from public.sets s where s.workout_id = w.id and s.deleted_at is null
            and s.completed_at is not null and s.set_type <> 'warmup')::int,
         coalesce((select sum(s.weight_kg * s.reps) from public.sets s where s.workout_id = w.id and s.deleted_at is null
            and s.completed_at is not null and s.set_type <> 'warmup'), 0)::int,
         (select count(*) from public.workout_kudos k where k.workout_id = w.id)::int,
         (select k.emoji from public.workout_kudos k where k.workout_id = w.id and k.from_user = auth.uid())
  from public.workouts w
  join visible v on v.uid = w.user_id
  where w.status = 'completed' and w.deleted_at is null
    and w.started_at > now() - make_interval(days => least(greatest(p_days, 1), 60))
  order by w.started_at desc
  limit 60;
$$;

-- ---------------------------------------------------------------------------
-- Chat
-- ---------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct', 'group')),
  title text check (char_length(title) <= 60),
  created_by uuid references auth.users (id) on delete set null,
  direct_key text unique, -- "<smaller uuid>:<larger uuid>" for direct chats
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
alter table public.conversations enable row level security;

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
alter table public.conversation_members enable row level security;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index messages_conversation_time on public.messages (conversation_id, created_at desc);
alter table public.messages enable row level security;

create or replace function public.is_conversation_member(p_conv uuid, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.conversation_members where conversation_id = p_conv and user_id = uid);
$$;

create policy conversations_select on public.conversations for select to authenticated
  using (public.is_conversation_member(id));
create policy conversation_members_select on public.conversation_members for select to authenticated
  using (public.is_conversation_member(conversation_id));
-- No direct updates (would allow moving a row to another conversation); use mark_conversation_read().
create policy conversation_members_leave on public.conversation_members for delete to authenticated
  using (user_id = (select auth.uid()));
create policy messages_select on public.messages for select to authenticated
  using (public.is_conversation_member(conversation_id));

-- Direct chats need an active friendship and no block in either direction.
create or replace function public.can_send_message(p_conv uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.conversations;
  other uuid;
begin
  if not public.is_conversation_member(p_conv) then return false; end if;
  select * into c from public.conversations where id = p_conv;
  if c.kind = 'direct' then
    select user_id into other from public.conversation_members where conversation_id = p_conv and user_id <> auth.uid() limit 1;
    if other is null or not public.are_friends(auth.uid(), other) then return false; end if;
    if exists (select 1 from public.blocks where (blocker = auth.uid() and blocked = other) or (blocker = other and blocked = auth.uid())) then
      return false;
    end if;
  end if;
  return true;
end;
$$;

create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.can_send_message(conversation_id));

-- Bump the conversation, mark the sender as read, and push to other members
-- (at most one push per member per conversation per minute).
create or replace function public.on_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
  conv public.conversations;
begin
  select * into conv from public.conversations where id = new.conversation_id;
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  update public.conversation_members set last_read_at = new.created_at
    where conversation_id = new.conversation_id and user_id = new.sender_id;
  for m in select user_id from public.conversation_members where conversation_id = new.conversation_id and user_id <> new.sender_id loop
    if exists (select 1 from public.blocks where blocker = m.user_id and blocked = new.sender_id) then continue; end if;
    perform public.queue_notification(m.user_id, 'message', jsonb_build_object(
      'from', public.display_name_of(new.sender_id),
      'group', case when conv.kind = 'group' then conv.title end,
      'body', left(new.body, 120),
      'conversation_id', new.conversation_id
    ), 'msg:' || new.conversation_id || ':' || to_char(date_trunc('minute', new.created_at), 'YYYYMMDDHH24MI'));
  end loop;
  return new;
end;
$$;
create trigger on_new_message after insert on public.messages
  for each row execute function public.on_new_message();

create or replace function public.get_or_create_direct(p_friend uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  k text;
  cid uuid;
begin
  if me is null or not public.are_friends(me, p_friend) then raise exception 'not friends' using errcode = '42501'; end if;
  k := least(me::text, p_friend::text) || ':' || greatest(me::text, p_friend::text);
  select id into cid from public.conversations where direct_key = k;
  if cid is null then
    insert into public.conversations (kind, created_by, direct_key) values ('direct', me, k) returning id into cid;
    insert into public.conversation_members (conversation_id, user_id) values (cid, me), (cid, p_friend);
  end if;
  return cid;
end;
$$;

create or replace function public.create_group_chat(p_title text, p_members uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  cid uuid;
  u uuid;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  insert into public.conversations (kind, title, created_by)
    values ('group', left(coalesce(nullif(trim(p_title), ''), 'Grup'), 60), me) returning id into cid;
  insert into public.conversation_members (conversation_id, user_id, role) values (cid, me, 'owner');
  foreach u in array coalesce(p_members, '{}') loop
    if public.are_friends(me, u) then
      insert into public.conversation_members (conversation_id, user_id) values (cid, u) on conflict do nothing;
    end if;
  end loop;
  return cid;
end;
$$;

-- Any member may add their own friends to a group.
create or replace function public.add_group_members(p_conv uuid, p_members uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  u uuid;
begin
  if not exists (select 1 from public.conversations where id = p_conv and kind = 'group') or not public.is_conversation_member(p_conv) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  foreach u in array coalesce(p_members, '{}') loop
    if public.are_friends(auth.uid(), u) then
      insert into public.conversation_members (conversation_id, user_id) values (p_conv, u) on conflict do nothing;
    end if;
  end loop;
end;
$$;

create or replace function public.rename_group(p_conv uuid, p_title text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.conversations set title = left(trim(p_title), 60)
  where id = p_conv and kind = 'group' and public.is_conversation_member(p_conv) and char_length(trim(p_title)) > 0;
$$;

-- Inbox: one row per conversation with display info, last message and unread count.
create or replace function public.list_conversations()
returns table (
  id uuid,
  kind text,
  title text,
  avatar_url text,
  other_user uuid,
  member_count int,
  last_body text,
  last_sender text,
  last_message_at timestamptz,
  unread int
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.kind,
         case when c.kind = 'group' then c.title else public.display_name_of(o.user_id) end,
         case when c.kind = 'direct' then (select avatar_url from public.profiles where id = o.user_id) end,
         o.user_id,
         (select count(*) from public.conversation_members x where x.conversation_id = c.id)::int,
         lm.body,
         case when lm.sender_id = auth.uid() then null else public.display_name_of(lm.sender_id) end,
         c.last_message_at,
         (select count(*) from public.messages x where x.conversation_id = c.id and x.created_at > me.last_read_at and x.sender_id <> auth.uid())::int
  from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id
  left join lateral (
    select user_id from public.conversation_members x where x.conversation_id = c.id and x.user_id <> auth.uid() limit 1
  ) o on c.kind = 'direct'
  left join lateral (
    select body, sender_id from public.messages x where x.conversation_id = c.id order by created_at desc limit 1
  ) lm on true
  where me.user_id = auth.uid()
  order by c.last_message_at desc;
$$;

create or replace function public.mark_conversation_read(p_conv uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.conversation_members set last_read_at = now() where conversation_id = p_conv and user_id = auth.uid();
$$;

create or replace function public.conversation_members_info(p_conv uuid)
returns table (user_id uuid, display_name text, avatar_url text, role text)
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id, public.display_name_of(m.user_id), (select avatar_url from public.profiles where id = m.user_id), m.role
  from public.conversation_members m
  where m.conversation_id = p_conv and public.is_conversation_member(p_conv)
  order by m.joined_at;
$$;

-- Realtime for new messages (Supabase only; skipped where the publication doesn't exist).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
    alter publication supabase_realtime add table public.conversations;
  end if;
end;
$$;
