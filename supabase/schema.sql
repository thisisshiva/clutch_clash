-- Clutch Clash - Supabase schema
-- Isse Supabase dashboard ke SQL Editor me paste karke run karo.

-- Player profiles (auth.users se linked)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (char_length(username) between 3 and 20),
  created_at timestamptz default now()
);

-- Friendships (requests + accepted dono isi table me)
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

-- Profiles: sab logged-in users padh sakte hain (username search ke liye),
-- par sirf apna profile bana/badal sakte hain.
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);

create policy "profiles_insert" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

create policy "profiles_update" on public.profiles
  for update to authenticated using (auth.uid() = id);

-- Friendships: sirf apni rows dikhengi/banegi.
create policy "friendships_select" on public.friendships
  for select to authenticated
  using (auth.uid() = requester or auth.uid() = addressee);

create policy "friendships_insert" on public.friendships
  for insert to authenticated with check (auth.uid() = requester);

-- Sirf addressee request accept kar sakta hai.
create policy "friendships_update" on public.friendships
  for update to authenticated using (auth.uid() = addressee);

-- Dono me se koi bhi friendship delete (reject/unfriend) kar sakta hai.
create policy "friendships_delete" on public.friendships
  for delete to authenticated
  using (auth.uid() = requester or auth.uid() = addressee);
