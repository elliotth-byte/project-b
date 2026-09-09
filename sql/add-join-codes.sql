-- ============================================================
-- Migration: short join codes for games
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
-- Safe to run once on your existing project — it only adds things,
-- it doesn't touch or remove anything from the earlier schema.sql.
-- ============================================================

alter table games add column if not exists join_code text unique;

-- Looks up a game's id from its short code WITHOUT requiring the caller to
-- already be a host or player of that game (which the normal RLS-protected
-- `games` table read would require). SECURITY DEFINER lets this run with
-- elevated privilege just to answer "which game does this code point to?" —
-- it deliberately returns nothing else about the game.
create or replace function public.find_game_by_code(p_code text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from games where join_code = upper(trim(p_code));
$$;

-- Generates a short, human-friendly code: 2 letters + 4 digits (e.g. "FX8213"),
-- avoiding visually-ambiguous characters (0/O, 1/I/L are excluded).
create or replace function public.generate_join_code()
returns text
language plpgsql
as $$
declare
  letters text := 'ABCDEFGHJKMNPQRSTUVWXYZ';
  digits text := '23456789';
  code text;
  tries int := 0;
begin
  loop
    code := ''
      || substr(letters, (floor(random() * length(letters)) + 1)::int, 1)
      || substr(letters, (floor(random() * length(letters)) + 1)::int, 1)
      || substr(digits, (floor(random() * length(digits)) + 1)::int, 1)
      || substr(digits, (floor(random() * length(digits)) + 1)::int, 1)
      || substr(digits, (floor(random() * length(digits)) + 1)::int, 1)
      || substr(digits, (floor(random() * length(digits)) + 1)::int, 1);
    exit when not exists (select 1 from games where join_code = code);
    tries := tries + 1;
    exit when tries > 20; -- practically unreachable, just a safety valve
  end loop;
  return code;
end;
$$;

-- schema.sql never included an UPDATE policy for `games` (only select/insert),
-- so add one now — needed for the join-code backfill above and generally
-- useful for any future host-editable game settings.
drop policy if exists "host updates their own game" on games;
create policy "host updates their own game"
on games for update
using (host_id = auth.uid());

-- Backfill: give any existing games (created before this migration) a code too.
update games set join_code = generate_join_code() where join_code is null;
