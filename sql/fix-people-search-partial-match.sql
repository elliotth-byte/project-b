-- ============================================================
-- Fix: profile people-search only matched a season join-name
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- search_people_to_dm (Profile page's own "Find People" search) and
-- admin_search_people (the platform-admin equivalent) both already did
-- a real substring, case-insensitive match (`ilike '%query%'`) — that
-- part was never the problem. The actual gap: they only matched against
-- `players.display_name`, the name someone typed in for one SPECIFIC
-- season. A person's own profiles.display_name (see sql/add-profiles.sql
-- — "how you want to be known across seasons," settable on /profile and
-- often different from any one season's join-name) was never checked at
-- all. Searching for someone by the name on their actual profile could
-- come back empty if it happened not to match how they'd signed up for
-- any given season.
--
-- Both functions already LEFT JOIN profiles in, so this is just widening
-- the match to either name, not a structural change — same "safe to
-- re-run on any project" additive shape as every other file here.
-- ============================================================

create or replace function public.search_people_to_dm(p_query text)
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
  where pl.user_id != auth.uid()
    and (pl.display_name ilike '%' || p_query || '%' or prof.display_name ilike '%' || p_query || '%')
  order by pl.user_id, pl.created_at desc
  limit 25;
$$;

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
  where is_platform_admin()
    and (pl.display_name ilike '%' || p_query || '%' or prof.display_name ilike '%' || p_query || '%')
  order by pl.user_id, pl.created_at desc
  limit 25;
$$;
