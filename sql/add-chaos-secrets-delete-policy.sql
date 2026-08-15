-- ============================================================
-- Migration: allow the host to delete chaos_secrets rows
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- sql/add-chaos-secrets.sql defined SELECT/INSERT/UPDATE policies but no
-- DELETE policy — with RLS enabled, that means deletes were silently
-- blocked for everyone (RLS denies by default when no policy grants an
-- operation), which is exactly why a round/season reset could never
-- actually clear a Power of Khaos holder's already-locked-in nullify
-- pick: the delete calls in AdminHost.jsx's resetCurrentRound/
-- resetSeason would run without error but affect zero rows. Only the
-- host needs this — the same person who can already reset a round or
-- season in the first place.
-- ============================================================

create policy "host deletes chaos secrets"
on chaos_secrets for delete
using (is_game_host(game_id));
