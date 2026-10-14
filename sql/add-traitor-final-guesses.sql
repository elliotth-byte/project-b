-- ============================================================
-- Migration: Traitors' final guess ("who were the Traitors?")
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
-- Safe to run once — additive only. Requires sql/schema.sql
-- (is_game_host()) and sql/add-confessionals.sql (owns_player()) to
-- already exist.
-- ============================================================
--
-- Once eliminated, a player can submit one guess at who among the
-- players still in the game are Traitors (components/TraitorsFinalGuess.jsx).
-- This needs the same third RLS shape sql/add-confessionals.sql
-- introduced for confessionals (host reads everyone's, a player reads
-- only their own), plus one more condition specific to this feature:
-- once the finale is declared (game_state's "traitors:finale" key — see
-- lib/traitorsFinale.js), EVERYONE can read EVERYONE's guess, since the
-- whole point is a public reveal once the mystery's over. Before that
-- moment, a player's own RLS literally cannot see anyone else's row —
-- this isn't just a UI choice to hide it.
create table if not exists traitor_final_guesses (
  game_id uuid references games(id) on delete cascade not null,
  player_id uuid references players(id) on delete cascade not null,
  player_name text not null,
  guessed_player_ids jsonb not null default '[]'::jsonb,
  guessed_names jsonb not null default '[]'::jsonb,
  submitted_at timestamptz not null default now(),
  primary key (game_id, player_id)
);

alter table traitor_final_guesses enable row level security;
alter publication supabase_realtime add table traitor_final_guesses;

create policy "host reads all final guesses"
on traitor_final_guesses for select
using (is_game_host(game_id));

create policy "player reads own final guess"
on traitor_final_guesses for select
using (owns_player(player_id));

create policy "everyone reads final guesses once the finale is declared"
on traitor_final_guesses for select
using (
  exists (
    select 1 from game_state gs
    where gs.game_id = traitor_final_guesses.game_id
      and gs.key = 'traitors:finale'
  )
);

-- Insert-only — a guess is locked in once submitted, same as Masquerade's
-- own shield/killer guesses (no update policy for players at all). A
-- player can only ever write their OWN row; the primary key also makes a
-- second insert attempt fail outright, belt and suspenders.
create policy "player inserts own final guess"
on traitor_final_guesses for insert
with check (owns_player(player_id));

-- Lets the host clear a mistaken submission if a player asks — same
-- "host can always reset" convention used everywhere else in this app.
create policy "host deletes final guesses"
on traitor_final_guesses for delete
using (is_game_host(game_id));
