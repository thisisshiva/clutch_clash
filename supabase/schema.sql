-- Clutch Clash - Supabase schema
-- Paste this into the SQL Editor in your Supabase dashboard and run it.

-- Player profiles (linked to auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (char_length(username) between 3 and 20),
  created_at timestamptz default now()
);

-- Friendships (both pending requests and accepted friendships live here)
create table if not exists public.friendships (
  id bigint generated always as identity primary key,
  requester uuid not null references public.profiles(id) on delete cascade,
  addressee uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz default now(),
  unique (requester, addressee),
  check (requester <> addressee)
);

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.friendships enable row level security;

-- Profiles: all logged-in users can read (needed for username search),
-- but users can only create/update their own profile.
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);

create policy "profiles_insert" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

create policy "profiles_update" on public.profiles
  for update to authenticated using (auth.uid() = id);

-- Friendships: users only see/create rows they are part of.
create policy "friendships_select" on public.friendships
  for select to authenticated
  using (auth.uid() = requester or auth.uid() = addressee);

create policy "friendships_insert" on public.friendships
  for insert to authenticated with check (auth.uid() = requester);

-- Only the addressee can accept a request.
create policy "friendships_update" on public.friendships
  for update to authenticated using (auth.uid() = addressee);

-- Either side can delete a friendship (reject/unfriend).
create policy "friendships_delete" on public.friendships
  for delete to authenticated
  using (auth.uid() = requester or auth.uid() = addressee);
