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
