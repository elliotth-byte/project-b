-- ============================================================
-- Migration: shorten join codes to 4 letters (was 2 letters + 4 digits,
-- e.g. "FX8213" -> now e.g. "FXQR").
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
-- Run AFTER sql/add-join-codes.sql.
--
-- Quick enough to type/say out loud, and to enter directly (see
-- pages/play.jsx's "or enter your four-letter code" fallback and the
-- new /play/[code] route, sql/add-join-codes.sql's own find_game_by_code
-- needs no changes at all — it already matches whatever string is
-- stored, regardless of length or shape) rather than only ever
-- reachable by clicking a shared link.
--
-- Regenerates EVERY existing game's code, not just new ones going
-- forward — any link/code a host already shared under the old 6-
-- character format stops working the moment this runs. Acceptable
-- here since codes are meant to be shared fresh per season anyway,
-- but worth knowing before running this against a season with an
-- invite already circulating.
-- ============================================================

create or replace function public.generate_join_code()
returns text
language plpgsql
as $$
declare
  letters text := 'ABCDEFGHJKMNPQRSTUVWXYZ'; -- same ambiguous-character exclusions as before (0/O, 1/I/L)
  code text;
  tries int := 0;
begin
  loop
    code := ''
      || substr(letters, (floor(random() * length(letters)) + 1)::int, 1)
      || substr(letters, (floor(random() * length(letters)) + 1)::int, 1)
      || substr(letters, (floor(random() * length(letters)) + 1)::int, 1)
      || substr(letters, (floor(random() * length(letters)) + 1)::int, 1);
    exit when not exists (select 1 from games where join_code = code);
    tries := tries + 1;
    exit when tries > 20; -- practically unreachable, just a safety valve
  end loop;
  return code;
end;
$$;

-- Regenerate every existing game's code to the new format. Each call
-- only checks for collisions against what's already committed, not
-- against other rows this SAME statement is about to write — with
-- 23^4 (~280,000) possible codes this is exceedingly unlikely to
-- matter, but if this errors on a unique-constraint violation, it's
-- safe to just run it again.
update games set join_code = generate_join_code();
