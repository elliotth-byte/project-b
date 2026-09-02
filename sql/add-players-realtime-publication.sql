-- ============================================================
-- Migration: add `players` to the supabase_realtime publication
-- Run this in Supabase SQL Editor (New query -> paste -> Run). Safe to
-- run on an existing project — idempotent, and touches no data.
--
-- Why this is needed: pages/play.jsx already subscribes to
-- postgres_changes UPDATE events on `players` (its "Live subscription
-- to this player's own row" effect, keyed off approved/color/
-- equipped_sticker/etc.) so a host approving a player, changing their
-- color, or granting a sticker is supposed to show up instantly. That
-- subscription code is correct and needs no changes. The bug is that
-- `players` was never actually added to the supabase_realtime
-- publication in any prior migration — every OTHER table that needs
-- realtime (game_state in sql/schema.sql, chat_threads in
-- sql/add-group-chat.sql, stereo_types_round_scores in
-- sql/add-stereo-types-a-side.sql, etc.) has its own
-- `alter publication supabase_realtime add table ...` line, but
-- `players` never got one. Without it, postgres_changes events for
-- `players` simply never fire, no matter how correct the client-side
-- subscription is — the only thing that ever actually refreshes a
-- player's own row is that same effect's 45-second poll fallback,
-- which is exactly why this reads as "the screen is stuck until I
-- manually refresh."
--
-- Guarded with an existence check because Postgres errors (rather than
-- no-oping) if you ALTER PUBLICATION ... ADD TABLE a table that's
-- already a member — this makes the migration safe to run more than
-- once, and safe even if `players` turns out to already be in the
-- publication for some reason.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'players'
  ) then
    alter publication supabase_realtime add table players;
  end if;
end $$;
