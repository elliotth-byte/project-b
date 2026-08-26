import { supabase } from "./supabaseClient";

// ============================================================
// Two different operations, both requiring sql/add-player-removal.sql's
// DELETE policy to actually work (see that file for why the delete was
// silently failing before it existed):
//
// removePendingPlayer — a genuine hard delete. Safe because a pending
// (not-yet-approved) player has never touched any game data: no votes,
// no nominations, no challenge scores reference them anywhere. Used both
// for the host rejecting a join request and a player canceling their own
// pending request.
//
// quitOrRemoveApprovedPlayer — NOT a delete. An approved player who
// quits (or is force-removed by the host) is treated exactly like being
// exiled: alive flips to false with elimination_type = "quit". This
// keeps every existing alive-only filter (challenge participants,
// Fates/Exile nominee pools, remaining-alive win checks) correctly
// excluding them, and keeps every past reference to their name (old
// challenge placements, vote rows, nominations) resolving normally,
// which a hard delete would break. Unlike an actual exile, they do NOT
// get a re-entry attempt — lib/gameState.js's pb:reentry list is only
// ever populated by lib/roundEngine.js's exile flow, so this is final.
// ============================================================

export async function removePendingPlayer(playerId) {
  return supabase.from("players").delete().eq("id", playerId);
}

export async function quitOrRemoveApprovedPlayer(playerId, eliminationRound) {
  return supabase.from("players").update({ alive: false, elimination_type: "quit", elimination_round: eliminationRound ?? null }).eq("id", playerId);
}
