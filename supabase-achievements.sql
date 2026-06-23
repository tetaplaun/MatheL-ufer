-- Per-user achievement progress for Mathe Läufer.
--
-- One row per logged-in user holds two JSON documents:
--   * stats        — cumulative counters the achievement engine folds game
--                    results into (games played, correct answers, row mastery,
--                    per-game bests, day streak, ...).
--   * achievements — a map of { achievement_id: earned_at_iso } that is the
--                    SOURCE OF TRUTH for what has been unlocked (never recomputed
--                    from stats, so a wiped cache can't manufacture fake unlocks).
--
-- Private to each user (RLS: owner-only), unlike the public leaderboard table.
-- The app reads/writes this through the authenticated Supabase client so the
-- user's JWT satisfies auth.uid(). Run this in the Supabase SQL editor — it is
-- idempotent.

create table if not exists public.user_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stats jsonb not null default '{}'::jsonb,
  achievements jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_progress enable row level security;

-- A signed-in user may read only their own progress.
drop policy if exists "user_progress_select_self" on public.user_progress;
create policy "user_progress_select_self"
on public.user_progress
for select
using (auth.uid() = user_id);

-- A signed-in user may create only their own progress row.
drop policy if exists "user_progress_insert_self" on public.user_progress;
create policy "user_progress_insert_self"
on public.user_progress
for insert
with check (auth.uid() = user_id);

-- A signed-in user may update only their own progress row.
drop policy if exists "user_progress_update_self" on public.user_progress;
create policy "user_progress_update_self"
on public.user_progress
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Keep updated_at fresh on every write.
create or replace function public.touch_user_progress()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_user_progress_update on public.user_progress;
create trigger on_user_progress_update
  before update on public.user_progress
  for each row execute function public.touch_user_progress();
