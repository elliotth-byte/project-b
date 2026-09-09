-- ============================================================
-- Migration: host read access to push_subscriptions
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- sql/add-push-subscriptions.sql deliberately granted only the owning
-- player read/write access, with server routes relying on the
-- service-role key (which bypasses RLS) for actually sending. That's
-- still true for writes — this adds ONLY a read policy, additively
-- alongside the existing one (Postgres RLS policies for the same
-- command are OR'd together, so this can't reduce what a player can
-- already do to their own rows). Needed so the host's own authenticated
-- client can query "which players have notifications on" for the
-- roster view, without a host being able to modify or delete a player's
-- own subscription — this is read-only, on purpose.
-- ============================================================

create policy "host reads push subscriptions"
on push_subscriptions for select
using (is_game_host(game_id));
