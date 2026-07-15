-- Kahani: game persistence (profiles, games, scenes, storage)

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  is_unlimited boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- Backfill profiles for users who signed up before this migration.
insert into public.profiles (id)
select id
from auth.users
on conflict (id) do nothing;

alter table public.profiles enable row level security;

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- games
-- ---------------------------------------------------------------------------

create table public.games (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade,
  title text not null,
  idea text not null,
  bible jsonb not null,
  premise jsonb not null,
  sprite_url text,
  finale jsonb not null default '{}'::jsonb,
  thumbnail_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index games_owner_idx on public.games (owner);
create index games_created_at_idx on public.games (created_at desc);

alter table public.games enable row level security;

create policy "games_select_authenticated"
on public.games
for select
to authenticated
using (true);

create policy "games_insert_owner"
on public.games
for insert
to authenticated
with check (auth.uid() = owner);

create policy "games_update_owner"
on public.games
for update
to authenticated
using (auth.uid() = owner);

create policy "games_delete_owner"
on public.games
for delete
to authenticated
using (auth.uid() = owner);

-- ---------------------------------------------------------------------------
-- game_scenes
-- ---------------------------------------------------------------------------

create table public.game_scenes (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  scene_id text not null,
  kind text not null check (kind in ('street', 'interior')),
  x integer,
  y integer,
  data jsonb not null,
  image_url text not null,
  annotated_url text,
  created_at timestamptz not null default now(),
  unique (game_id, scene_id)
);

create index game_scenes_game_id_idx on public.game_scenes (game_id);

alter table public.game_scenes enable row level security;

create policy "game_scenes_select_authenticated"
on public.game_scenes
for select
to authenticated
using (
  exists (
    select 1
    from public.games g
    where g.id = game_id
  )
);

create policy "game_scenes_insert_owner"
on public.game_scenes
for insert
to authenticated
with check (
  exists (
    select 1
    from public.games g
    where g.id = game_id
      and g.owner = auth.uid()
  )
);

create policy "game_scenes_update_owner"
on public.game_scenes
for update
to authenticated
using (
  exists (
    select 1
    from public.games g
    where g.id = game_id
      and g.owner = auth.uid()
  )
);

create policy "game_scenes_delete_owner"
on public.game_scenes
for delete
to authenticated
using (
  exists (
    select 1
    from public.games g
    where g.id = game_id
      and g.owner = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- storage: public bucket, per-user write folder
-- ---------------------------------------------------------------------------
-- Public buckets serve files by URL without a SELECT policy. A broad SELECT
-- on storage.objects would let anyone list every object via the Storage API.

insert into storage.buckets (id, name, public)
values ('game-assets', 'game-assets', true)
on conflict (id) do nothing;

-- Owners can list/read objects in their own folder (needed for delete cleanup).
create policy "game_assets_owner_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'game-assets'
  and (storage.foldername (name))[1] = auth.uid()::text
);

create policy "game_assets_owner_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'game-assets'
  and (storage.foldername (name))[1] = auth.uid()::text
);

create policy "game_assets_owner_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'game-assets'
  and (storage.foldername (name))[1] = auth.uid()::text
);

create policy "game_assets_owner_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'game-assets'
  and (storage.foldername (name))[1] = auth.uid()::text
);

-- Seed unlimited accounts (replace with your user UUIDs after first sign-in):
-- update public.profiles set is_unlimited = true where id in ('...');
