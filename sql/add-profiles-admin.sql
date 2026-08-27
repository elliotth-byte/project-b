-- ============================================================
-- Migration: platform admin profile moderation
-- Run this in Supabase SQL Editor, AFTER sql/add-profiles.sql.
--
-- A real gap found while building the actual admin moderation screen:
-- sql/add-profiles.sql's insert policy only let a person create their
-- OWN profile row. That's fine for someone editing their own profile
-- (an upsert with an existing row just goes through the update policy
-- instead), but it silently blocks a platform admin from overriding
-- someone who's NEVER set up a profile at all — the most likely case
-- an admin would actually need to act on. Fixed by widening that one
-- policy; everything else from that migration is untouched.
-- ============================================================

drop policy if exists "a person can create their own profile" on profiles;

create policy "a person can create their own profile, or a platform admin can create anyone's"
on profiles for insert
with check (user_id = auth.uid() or is_platform_admin());

-- Lets a platform admin find someone to moderate without needing to
-- already know their auth user id. Searches players.display_name
-- specifically (not profiles.display_name) because every real account
-- has at least one players row — this app's signup flow requires
-- joining a specific season to create an account in the first place —
-- while a profiles row is optional and may not exist yet for the
-- exact person an admin is trying to find. distinct on collapses
-- someone who's played multiple seasons (and so has multiple matching
-- players rows) down to one result each, preferring their most recent
-- season's spelling of their name as the match shown. Filtering with
-- `where is_platform_admin()` rather than raising an exception keeps
-- this a plain SQL function (matching every other function in this
-- schema) — a non-admin caller just gets zero rows back, not an error.
create or replace function public.admin_search_people(p_query text)
returns table (user_id uuid, matched_name text, profile_display_name text, photo_url text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct on (pl.user_id)
    pl.user_id,
    pl.display_name as matched_name,
    prof.display_name as profile_display_name,
    prof.photo_url
  from players pl
  left join profiles prof on prof.user_id = pl.user_id
  where is_platform_admin() and pl.display_name ilike '%' || p_query || '%'
  order by pl.user_id, pl.created_at desc
  limit 25;
$$;
