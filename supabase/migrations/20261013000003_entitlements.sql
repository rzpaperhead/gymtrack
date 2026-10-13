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
