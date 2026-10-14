-- Goals: add weight loss / weight gain.
alter table public.profiles drop constraint if exists profiles_goal_check;
alter table public.profiles
  add constraint profiles_goal_check
  check (goal in ('strength', 'hypertrophy', 'general', 'lose_weight', 'gain_weight'));
