-- ============================================================
-- Migration: game_type — the "which rules does this season play by" switch
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
-- Safe to run once on your existing project — additive only.
--
-- WHY: this project started as a fork of a separate app, "Traitors" (a
-- social-deduction game with its own Roundtable/Murder Vote/Missions
-- engine — see sql/add-traitors-tables.sql). Rather than keep them as two
-- separate deployments, both now live in this one app, and a host picks
-- which rules a given season plays by at creation time. Every existing row
-- in `games` predates this column and is, definitionally, a Project B
-- season, hence the backfilled default below rather than leaving it null.
--
-- game_type is meant to be set once, at season creation (see
-- pages/host.jsx's createSeason), and left alone for the rest of that
-- season's life — nothing in this migration enforces that at the database
-- level (no trigger blocking updates), since the app layer is the more
-- practical place to lock it and a host manually fixing a mis-picked type
-- right after creating an empty season is a reasonable escape hatch to
-- leave open.
-- ============================================================

alter table games add column if not exists game_type text not null default 'project_b';

alter table games add constraint games_game_type_check
  check (game_type in ('project_b', 'traitors'));

-- Backfill: every row that existed before this migration was, by
-- definition, a Project B season (the column's own default already
-- covers this for any brand-new row, but existing rows were written
-- before the column existed and need it set explicitly).
update games set game_type = 'project_b' where game_type is null;
