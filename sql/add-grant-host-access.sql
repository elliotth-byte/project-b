-- ============================================================
-- Migration: self-serve "grant host access" for co-hosting
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
-- Safe to run once on your existing project — additive only.
--
-- Context: invite_co_host (sql/add-game-hosts.sql) already lets a
-- primary host add a co-host, but only if that person's account
-- ALREADY has role: "host" — until now, the only way to get there for
-- a Traitors or Panopticon season was a Supabase-dashboard trip to
-- hand-edit that account's user_metadata (self-serve "Become a host"
-- only ever grants Stereo-Types-scoped access, see
-- sql/add-host-scope.sql). This closes that gap: a primary host can
-- now turn any existing account (the target just needs to have
-- signed up/logged in at least once, as a player or otherwise) into a
-- host for THIS game's specific game_type, in one click, no dashboard
-- needed.
--
-- Deliberately scoped, not unrestricted: hostScope is set to this
-- game's own game_type (read server-side from the games row, never
-- taken from client input), the same scoping sql/add-host-scope.sql
-- already enforces for self-serve signups — granting access to run a
-- Traitors season should never incidentally also hand someone the
-- ability to create a Panopticon or Stereo Types one. A primary host
-- who genuinely wants to grant someone fully unrestricted access
-- across every game type still does that by hand in the dashboard
-- (leaving hostScope out entirely) — this function never does that.
--
-- Only the PRIMARY host of the game actually being granted into can
-- call this — same authorization shape as invite_co_host itself
-- (checks games.host_id = auth.uid(), not just "any host anywhere").
-- Returns a short status code the UI can show a message for:
-- 'ok' | 'not_found' | 'not_authorized' | 'already_host'.
create or replace function public.grant_host_access(p_game_id uuid, p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  this_game_type text;
  target_id uuid;
  target_role text;
  target_scope text;
begin
  select game_type into this_game_type from games where id = p_game_id and host_id = auth.uid();
  if this_game_type is null then
    return 'not_authorized';
  end if;

  select id, raw_user_meta_data->>'role', raw_user_meta_data->>'hostScope'
    into target_id, target_role, target_scope
  from auth.users where lower(email) = lower(trim(p_email));

  if target_id is null then
    return 'not_found';
  end if;
  if target_id = auth.uid() then
    return 'already_host';
  end if;
  -- Already a host who can cover this game type (unrestricted, or
  -- already scoped to exactly this one) — nothing to change.
  if target_role = 'host' and (target_scope is null or target_scope = this_game_type) then
    return 'already_host';
  end if;

  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', 'host', 'hostScope', this_game_type)
  where id = target_id;

  return 'ok';
end;
$$;
