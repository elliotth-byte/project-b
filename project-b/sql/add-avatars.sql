-- ============================================================
-- Migration: player avatars
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- Two of the four avatar modes (player-upload, host-upload — see
-- lib/avatarIdentity.js) need real file storage; the other two don't:
-- "collection" is fully static, built-in theme art shipped in the app's
-- own /public folder (see lib/avatarCollections.js), and "none" is just
-- today's color swatch. So this migration is entirely about the upload
-- path — one new column, one Storage bucket, and RLS on that bucket
-- reusing the existing owns_player()/is_game_host() helpers.
-- ============================================================

alter table players add column if not exists avatar_url text;

-- No new RLS needed on the players table itself for writing avatar_url:
-- the existing "players set their own color" policy
-- (sql/add-player-color-policy.sql) only pins display_name/approved/
-- alive/elimination_type to their previous values, leaving every other
-- column — color, alias, and now avatar_url — open for a player to set
-- on their own row. And "host manages players" (sql/schema.sql) already
-- lets the host update any player row in their own game, which is what
-- host-upload mode needs. Both were already broad enough for this.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Path convention: every avatar is stored as `{player_id}.jpg` — the
-- client always re-encodes to JPEG before upload (see
-- lib/avatarUpload.js), so there's exactly one predictable extension to
-- deal with here, and exactly one object per player (a new upload just
-- overwrites the old one at the same path).
--
-- storage.objects doesn't have a player_id column to check directly, so
-- every policy below derives it by stripping the extension off the
-- object's own path (`name`) and joins against players to answer "does
-- the caller own this player, or host their game."

create policy "public read avatars"
on storage.objects for select
using (bucket_id = 'avatars');

create policy "players manage their own avatar"
on storage.objects for all
using (
  bucket_id = 'avatars'
  and owns_player((regexp_replace(name, '\.[^.]+$', ''))::uuid)
)
with check (
  bucket_id = 'avatars'
  and owns_player((regexp_replace(name, '\.[^.]+$', ''))::uuid)
);

create policy "host manages avatars in their games"
on storage.objects for all
using (
  bucket_id = 'avatars'
  and exists (
    select 1 from players p
    where p.id = (regexp_replace(name, '\.[^.]+$', ''))::uuid
    and is_game_host(p.game_id)
  )
)
with check (
  bucket_id = 'avatars'
  and exists (
    select 1 from players p
    where p.id = (regexp_replace(name, '\.[^.]+$', ''))::uuid
    and is_game_host(p.game_id)
  )
);
