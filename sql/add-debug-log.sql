-- ============================================================
-- Migration: a real, queryable event log for round/phase mechanics
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- Built directly out of a real debugging session: tracking down why an
-- Exile Vote configured for 16 hours concluded within minutes took
-- extensive static code reading with no way to actually confirm what
-- happened at runtime — no timestamps, no record of which trigger
-- fired, nothing. This table is what that investigation was missing:
-- an append-only record of the decisions lib/roundEngine.js actually
-- makes, when, and why, so a future issue like that one comes with
-- real evidence instead of needing to be re-derived from source code
-- after the fact.
--
-- Deliberately a real table, not another game_state key — this is
-- fundamentally a log (append-only, queried by time range, meant to be
-- exported), not current game state (read/replaced in place). Mixing
-- the two would mean every log write competes with actual gameplay
-- state in the same JSONB blob's storageUpdate cycle, for zero
-- benefit.
create table if not exists game_debug_log (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  round integer,
  phase text,
  event text not null,
  source text not null,
  detail jsonb not null default '{}'::jsonb
);

create index if not exists game_debug_log_game_id_created_at_idx on game_debug_log(game_id, created_at desc);

alter table game_debug_log enable row level security;

-- Host-only read — this is internal mechanics (why a strike fired, which
-- trigger advanced a phase), not something players need or should see,
-- but not secret the way chaos_secrets is either. No insert/update/
-- delete policy for anyone — every write goes through lib/debugLog.js
-- running server-side with the service-role client, same "not directly
-- writable by anyone else" shape as player_achievements.
drop policy if exists "host can read own game's debug log" on game_debug_log;
create policy "host can read own game's debug log"
on game_debug_log for select
using (is_game_host(game_id));
