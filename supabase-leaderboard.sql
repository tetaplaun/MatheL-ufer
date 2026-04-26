create extension if not exists pgcrypto;

create table if not exists public.leaderboard_entries (
  id uuid primary key default gen_random_uuid(),
  player_name text not null check (char_length(player_name) between 1 and 18),
  settings_key text not null check (char_length(settings_key) between 1 and 120),
  difficulty_label text not null,
  factor_range_label text not null,
  route_label text not null,
  route_meters integer not null check (route_meters > 0),
  stops integer not null check (stops > 0),
  answer_count integer not null check (answer_count in (4, 6, 8)),
  total_seconds double precision not null check (total_seconds > 0 and total_seconds < 3600),
  mistakes integer not null check (mistakes >= 0),
  average_answer_seconds double precision not null check (average_answer_seconds >= 0),
  fastest_answer_seconds double precision not null check (fastest_answer_seconds >= 0),
  top_speed double precision not null check (top_speed > 0),
  created_at timestamptz not null default now()
);

alter table public.leaderboard_entries enable row level security;

drop policy if exists "leaderboard_entries_select_public" on public.leaderboard_entries;
create policy "leaderboard_entries_select_public"
on public.leaderboard_entries
for select
using (true);

drop policy if exists "leaderboard_entries_insert_public" on public.leaderboard_entries;
create policy "leaderboard_entries_insert_public"
on public.leaderboard_entries
for insert
with check (
  char_length(player_name) between 1 and 18
  and char_length(settings_key) between 1 and 120
  and route_meters > 0
  and stops > 0
  and answer_count in (4, 6, 8)
  and total_seconds > 0
  and total_seconds < 3600
  and mistakes >= 0
  and average_answer_seconds >= 0
  and fastest_answer_seconds >= 0
  and top_speed > 0
);

create index if not exists leaderboard_entries_settings_rank_idx
on public.leaderboard_entries (settings_key, total_seconds, mistakes, average_answer_seconds);
