-- ============================================================
-- Migration: in-app account deletion (App Store guideline 5.1.1(v))
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
-- Safe to re-run.
--
-- pages/api/delete-account.js deletes the caller's player rows, photos
-- and finally their auth.users row. Most tables already reference
-- auth.users with "on delete cascade", but a handful were created with
-- the default (NO ACTION), which makes Postgres refuse to delete the
-- user at all. This migration fixes those so deleting a user works:
--
--   players.user_id                    -> CASCADE  (their seat in each season goes with them)
--   games.host_id                      -> SET NULL (the season itself survives for its players;
--                                                   co-hosts in game_hosts keep host access)
--   scheduled_slack_posts.created_by   -> SET NULL
--   any other nullable column that
--   references auth.users (chaos_secrets.set_by,
--   stereo_types_superlative_submissions.reviewed_by, ...)
--                                      -> SET NULL
--
-- Before deleting, the API route also hands each season the user is
-- primary host of to a co-host when there is one, and refuses (with a
-- clear message) if they're the only host of a season that isn't
-- archived yet — so an active game is never left with nobody running it.
-- ============================================================

-- Columns that are NOT NULL today but should become nullable so the
-- reference can be cleared instead of blocking the delete.
alter table if exists games alter column host_id drop not null;
alter table if exists scheduled_slack_posts alter column created_by drop not null;

do $$
declare
  fk record;
  new_action text;
begin
  for fk in
    select
      c.conname,
      c.conrelid::regclass as tbl,
      a.attname as col,
      a.attnotnull as notnull
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and c.connamespace = 'public'::regnamespace
      and c.confdeltype = 'a'              -- NO ACTION (the default)
      and array_length(c.conkey, 1) = 1
  loop
    if fk.tbl = 'players'::regclass and fk.col = 'user_id' then
      new_action := 'cascade';
    elsif not fk.notnull then
      new_action := 'set null';
    else
      raise notice 'Skipping %.% (NOT NULL, no rule for it) — deleting a user who has rows here will fail', fk.tbl, fk.col;
      continue;
    end if;

    execute format('alter table %s drop constraint %I', fk.tbl, fk.conname);
    execute format(
      'alter table %s add constraint %I foreign key (%I) references auth.users(id) on delete %s',
      fk.tbl, fk.conname, fk.col, new_action
    );
    raise notice 'Updated %.% -> on delete %', fk.tbl, fk.col, new_action;
  end loop;
end $$;
