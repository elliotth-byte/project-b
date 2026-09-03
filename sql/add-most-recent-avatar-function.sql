-- ============================================================
-- Migration: "most recent season's avatar" lookup (security definer)
-- Run this in Supabase SQL Editor, AFTER sql/add-avatars.sql and
-- sql/add-season-placement.sql. Safe (and necessary) to re-run if
-- you already ran an earlier version of this file — the function's
-- return columns changed, which requires a drop, not just a replace
-- (see the drop statement below).
--
-- Fallback portrait source for pages/profile.jsx and
-- components/RelationshipWeb.jsx: when someone has no profiles.photo_url
-- set, fall back to a portrait from their own single most recent
-- season — literally just that one season, never a deeper cascade
-- through older ones if it also turns out to have none.
--
-- Two Project B avatar modes can supply that fallback (see
-- lib/avatarIdentity.js's resolveAvatars): player_upload/host_upload,
-- where players.avatar_url is already the answer, and collection mode,
-- where there's no avatar_url on the player row at all — the image is
-- derived purely from that player's alias + that season's chosen
-- collection (lib/avatarCollections.js's collectionImageUrl). This
-- function only returns the RAW FACTS needed for either case (alias,
-- avatar_url, and that season's avatarMode/avatarCollectionId, pulled
-- from its 'pb:settings' game_state row — same key lib/gameState.js's
-- KEY_SETTINGS already uses); actually building a collection image
-- URL stays entirely client-side, in lib/profiles.js's
-- fetchMostRecentAvatars, which already has collectionImageUrl
-- available and is the one place that filename rule should live.
--
-- players.avatar_url lives behind the normal players-table RLS (scoped
-- to games YOU'RE actually part of — sql/schema.sql) — same reason
-- sql/add-relationship-adversaries-function.sql had to move server-side.
-- Profiles (and relationship webs) are viewable by anyone now, so
-- resolving an arbitrary OTHER user's most recent season's avatar can't
-- rely on the viewer's own RLS access at all.
--
-- Recency + identity-unification (played vs. hosted) both reuse
-- public_season_history's own logic exactly (see
-- sql/add-season-placement.sql) rather than reinventing it: order by
-- games.created_at desc, and a season counts as "involved in" whether
-- this person was an approved player in it OR its host (a host with no
-- players row of their own in their most recent season simply has
-- nothing to return for it — nulls, not a fall-through to an older
-- season).
-- ============================================================

drop function if exists public.public_most_recent_avatars(uuid[]);

create or replace function public.public_most_recent_avatars(p_user_ids uuid[])
returns table (user_id uuid, avatar_url text, alias text, avatar_mode text, avatar_collection_id text)
language sql
security definer
set search_path = public
stable
as $$
  with combined as (
    select p.user_id, p.game_id, g.created_at as season_date
    from players p
    join games g on g.id = p.game_id
    where p.user_id = any(p_user_ids) and p.approved = true

    union all

    select g.host_id as user_id, g.id as game_id, g.created_at as season_date
    from games g
    where g.host_id = any(p_user_ids)
  ),
  most_recent as (
    select distinct on (user_id) user_id, game_id
    from combined
    order by user_id, season_date desc
  )
  select
    mr.user_id,
    p.avatar_url,
    p.alias,
    coalesce(gs.value ->> 'avatarMode', 'none') as avatar_mode,
    gs.value ->> 'avatarCollectionId' as avatar_collection_id
  from most_recent mr
  left join players p on p.game_id = mr.game_id and p.user_id = mr.user_id
  left join game_state gs on gs.game_id = mr.game_id and gs.key = 'pb:settings';
$$;
