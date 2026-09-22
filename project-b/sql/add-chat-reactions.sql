-- ============================================================
-- Migration: emoji reactions on chat messages
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
-- Requires sql/add-group-chat.sql to have already been run.
--
-- Covers thread messages (DMs, the Exile Room, any multi-person thread)
-- ONLY — chat_messages has a real row per message to attach a reaction
-- to. Panopticon (group chat) is stored differently (a JSON array inside
-- one game_state value, not real rows — see lib/chatData.js's
-- GROUP_CHAT_KEY), so group reactions are handled separately, stored
-- directly on each message object within that same JSON blob rather
-- than in this table — see toggleGroupReaction in lib/chatData.js.
--
-- thread_id is denormalized here (derivable from message_id via a join,
-- but stored directly anyway) specifically so Realtime can filter
-- subscriptions by thread_id the same simple way chat_messages itself
-- already does — Realtime filters only work against columns on the
-- table being watched, not a joined table.
-- ============================================================

create table if not exists chat_reactions (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references chat_threads(id) on delete cascade not null,
  message_id uuid references chat_messages(id) on delete cascade not null,
  player_id uuid references players(id) on delete cascade not null,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, player_id, emoji) -- one of each emoji per person per message; a person CAN react with several different emojis on the same message
);

create index if not exists chat_reactions_message_idx on chat_reactions(message_id);
create index if not exists chat_reactions_thread_idx on chat_reactions(thread_id, created_at);

alter table chat_reactions enable row level security;

-- Same visibility as the messages themselves — a thread member, or the
-- host moderating any thread.
create policy "read chat reactions" on chat_reactions
for select
using (is_thread_member(thread_id) or is_game_host(thread_game_id(thread_id)));

create policy "add own chat reactions" on chat_reactions
for insert
with check (
  is_thread_member(thread_id)
  and exists (select 1 from players where players.id = chat_reactions.player_id and players.user_id = auth.uid())
);

create policy "remove own chat reactions" on chat_reactions
for delete
using (exists (select 1 from players where players.id = chat_reactions.player_id and players.user_id = auth.uid()));
