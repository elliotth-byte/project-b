-- ============================================================
-- Migration: player profiles (external, cross-season)
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- Everything in this app up to now is scoped to a single season
-- (a single game_id) — a player's identity, avatar, and stats all
-- live inside that one season's own data. This is the first thing
-- that persists ACROSS seasons, anchored to auth.users.id (which every
-- players row already references via user_id) rather than to any
-- specific game. "Season history" itself needs no new table at all —
-- it's just a query across the players/games tables that already
-- exist, filtered to one user_id. What's actually new here is: (1) a
-- persistent display name + photo that isn't tied to any one season's
-- alias/avatar, and (2) platform_admins, a genuinely new privilege
-- tier — every existing role in this app (is_game_host,
-- is_game_player) is scoped to one game; this one deliberately isn't,
-- because "who moderates a cross-season profile, or later a
-- cross-season DM" doesn't have a natural single-game answer the way
-- "who hosts this season" does.
-- ============================================================

create table if not exists platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table platform_admins enable row level security;

-- Deliberately no public read policy at all — whether someone is a
-- platform admin isn't information any client needs directly; every
-- check goes through is_platform_admin() below (security definer, so
-- it can read this table regardless of the caller's own access to it).
-- Writing to this table isn't exposed through the app's own UI in this
-- migration — an admin is added by running an insert directly in the
-- SQL Editor, the same way the very first host of this whole app was
-- presumably set up. Deliberately no self-service way to grant this.
create policy "platform admins table has no client access"
on platform_admins for all
using (false)
with check (false);

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Public read, matching the same openness already decided for
-- cross-season DMs (anyone can DM anyone) — a profile someone can't be
-- found under isn't very useful for that. A player who's never set one
-- up simply has no row here; the app falls back to whatever their most
-- recent season's own display name was (see lib/profiles.js) rather
-- than showing nothing.
create policy "anyone can read profiles"
on profiles for select
using (true);

create policy "a person can create their own profile"
on profiles for insert
with check (user_id = auth.uid());

create policy "a person can update their own profile, or a platform admin can update anyone's"
on profiles for update
using (user_id = auth.uid() or is_platform_admin())
with check (user_id = auth.uid() or is_platform_admin());

-- Deliberately NOT a broadened players-table read policy. The existing
-- "read players" policy on the players table (see sql/schema.sql) is
-- scoped to games you're actually host or player in, for good reason —
-- it also exposes alive/elimination_type/color/alias/power_state/etc.,
-- none of which any stranger viewing someone's public season history
-- should see wholesale. This function returns ONLY what a profile page
-- actually needs (season name, character, a plain-language placement),
-- computed server-side, callable by anyone regardless of whether they
-- share a game with p_user_id — matching the same "anyone can find
-- anyone" openness already decided for cross-season DMs, without
-- widening what the players table itself exposes to do it.
create or replace function public.public_season_history(p_user_id uuid)
returns table (
  game_id uuid,
  season_name text,
  season_date timestamptz,
  character_name text,
  real_name text,
  won boolean,
  reached_finale boolean,
  alive boolean,
  elimination_type text,
  elimination_round integer
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.game_id,
    g.name as season_name,
    g.created_at as season_date,
    p.alias as character_name,
    p.display_name as real_name,
    coalesce((gs.value ->> 'winnerId') = p.id::text, false) as won,
    (gs.value is not null) as reached_finale,
    p.alive,
    p.elimination_type,
    p.elimination_round
  from players p
  join games g on g.id = p.game_id
  left join game_state gs on gs.game_id = p.game_id and gs.key = 'pb:finale'
  where p.user_id = p_user_id and p.approved = true
  order by g.created_at desc;
$$;

insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', true)
on conflict (id) do nothing;

-- Path convention: every profile photo is stored as `{user_id}.jpg` —
-- same fixed-extension trick as sql/add-avatars.sql, for the same
-- reason (one predictable extension, one object per person, a
-- re-upload just overwrites the same path). Ownership here is a
-- direct auth.uid() comparison rather than a join through players,
-- since this is genuinely per-person, not per-season.

create policy "public read profile photos"
on storage.objects for select
using (bucket_id = 'profile-photos');

create policy "a person manages their own profile photo"
on storage.objects for all
using (
  bucket_id = 'profile-photos'
  and (regexp_replace(name, '\.[^.]+$', ''))::uuid = auth.uid()
)
with check (
  bucket_id = 'profile-photos'
  and (regexp_replace(name, '\.[^.]+$', ''))::uuid = auth.uid()
);

create policy "a platform admin manages any profile photo"
on storage.objects for all
using (bucket_id = 'profile-photos' and is_platform_admin())
with check (bucket_id = 'profile-photos' and is_platform_admin());
