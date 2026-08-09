-- ============================================================
-- Migration: player DMs
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- Only DMs need new tables here — group chat reuses the existing
-- game_state table (see lib/chatData.js), since group chat's visibility
-- is already exactly what game_state's RLS gives everything in it:
-- readable/writable by anyone in that game. DMs are different — they
-- need REAL privacy, readable only by the two participants and the
-- host, the same bar sql/add-confessionals.sql set for confessionals.
-- That can't live in game_state, so it gets its own tables + RLS here,
-- reusing the owns_player()/is_game_host() helpers those earlier
-- migrations already defined.
--
-- Whether DMs (and chat generally) are even turned on for a given season
-- is a game_state setting (settings.chatEnabled — see
-- lib/gameState.js's DEFAULT_SETTINGS, off by default), not something
-- these tables/policies need to know about; the UI just doesn't offer
-- the feature when it's off, same as any other admin-configurable
-- feature in this app.
-- ============================================================

create table if not exists dm_threads (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id) on delete cascade not null,
  player_a_id uuid references players(id) on delete cascade not null,
  player_b_id uuid references players(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  unique (game_id, player_a_id, player_b_id)
);

create table if not exists dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references dm_threads(id) on delete cascade not null,
  sender_id uuid references players(id) on delete cascade not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists dm_messages_thread_idx on dm_messages(thread_id, created_at);
create index if not exists dm_threads_game_idx on dm_threads(game_id);

alter table dm_threads enable row level security;
alter table dm_messages enable row level security;

create policy "read own dm threads" on dm_threads
for select
using (owns_player(player_a_id) or owns_player(player_b_id) or is_game_host(game_id));

-- A thread is created by whichever of the two players opens the
-- conversation first — the check just confirms the caller is actually
-- one of the two people the thread is between, not an arbitrary pairing.
create policy "create own dm threads" on dm_threads
for insert
with check (owns_player(player_a_id) or owns_player(player_b_id));

create policy "read own dm messages" on dm_messages
for select
using (
  exists (
    select 1 from dm_threads t
    where t.id = dm_messages.thread_id
    and (owns_player(t.player_a_id) or owns_player(t.player_b_id) or is_game_host(t.game_id))
  )
);

-- The host can READ every DM (see the policy above) but never SEND as a
-- player — sender_id must be a player the caller actually owns, and that
-- player has to actually be one of the thread's two participants.
create policy "send own dm messages" on dm_messages
for insert
with check (
  owns_player(sender_id)
  and exists (
    select 1 from dm_threads t
    where t.id = dm_messages.thread_id
    and (t.player_a_id = sender_id or t.player_b_id = sender_id)
  )
);

alter publication supabase_realtime add table dm_threads;
alter publication supabase_realtime add table dm_messages;
