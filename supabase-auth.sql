-- User management for Mathe Läufer logins.
--
-- Players sign in with a username + password. Supabase Auth needs an email, so
-- the app maps each username to a stable synthetic email (e.g.
-- "mia@users.mathelaeufer.app") and stores the display username in the auth
-- user's metadata. This table is the public registry of display usernames and
-- enforces uniqueness; it is also the foundation for tying scores to accounts
-- later. Run this in the Supabase SQL editor (it is idempotent).
--
-- IMPORTANT: also turn OFF email confirmation for this to work, since the
-- synthetic emails can never be confirmed:
--   Dashboard -> Authentication -> Sign In / Providers -> Email ->
--   disable "Confirm email".

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (char_length(username) between 2 and 18),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Usernames are public (they are shown on the leaderboard).
drop policy if exists "profiles_select_public" on public.profiles;
create policy "profiles_select_public"
on public.profiles
for select
using (true);

-- A signed-in user may create only their own profile row.
drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
on public.profiles
for insert
with check (auth.uid() = id);

-- A signed-in user may update only their own profile row.
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

-- Automatically create a profile row when a new auth user signs up, taking the
-- username from the sign-up metadata (falling back to the email local part).
-- security definer lets the trigger insert past RLS during sign-up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username', ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
