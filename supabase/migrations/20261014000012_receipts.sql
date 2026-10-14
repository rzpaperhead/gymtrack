-- Message receipts: delivered (✓✓) and read (blue ✓✓) per conversation member.

alter table public.conversation_members add column if not exists last_delivered_at timestamptz not null default now();

-- Called whenever the user's app is open/online: everything up to now has reached their device.
-- Only touches conversations that actually have newer messages from others (fewer realtime events).
create or replace function public.mark_all_delivered()
returns void
language sql
security definer
set search_path = public
as $$
  update public.conversation_members m set last_delivered_at = now()
  where m.user_id = auth.uid()
    and exists (
      select 1 from public.messages x
      where x.conversation_id = m.conversation_id and x.sender_id <> auth.uid() and x.created_at > m.last_delivered_at
    );
$$;

-- Reading implies delivery.
create or replace function public.mark_conversation_read(p_conv uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.conversation_members set last_read_at = now(), last_delivered_at = greatest(last_delivered_at, now())
  where conversation_id = p_conv and user_id = auth.uid();
$$;

-- Receipt watermarks of the OTHER members (sender side renders ✓/✓✓/blue from these).
create or replace function public.conversation_receipts(p_conv uuid)
returns table (user_id uuid, last_delivered_at timestamptz, last_read_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id, m.last_delivered_at, m.last_read_at
  from public.conversation_members m
  where m.conversation_id = p_conv and m.user_id <> auth.uid() and public.is_conversation_member(p_conv);
$$;

-- Keep the sender's own watermarks current when they post.
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
  update public.conversation_members set last_read_at = new.created_at, last_delivered_at = greatest(last_delivered_at, new.created_at)
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

-- New members shouldn't look like they've received older history.
alter table public.conversation_members alter column last_delivered_at set default now();

-- Realtime: senders listen for receipt changes in their open conversation.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'conversation_members') then
    alter publication supabase_realtime add table public.conversation_members;
  end if;
end;
$$;
