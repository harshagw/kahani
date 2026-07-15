-- Fix: remove broad public SELECT on storage.objects (Supabase security advisory).
-- Public bucket URLs still work in the browser; this only blocks Storage API listing.
-- Run in SQL Editor if you already applied 0001_games.sql with game_assets_public_read.

drop policy if exists "game_assets_public_read" on storage.objects;

create policy "game_assets_owner_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'game-assets'
  and (storage.foldername (name))[1] = auth.uid()::text
);
