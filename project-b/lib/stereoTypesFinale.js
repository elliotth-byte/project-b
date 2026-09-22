import { supabase } from "./supabaseClient";

// ============================================================
// Stereo Types — end of game: total standings + the win-sticker claim
//
// Everything here reads from stereo_types_round_scores
// (sql/add-stereo-types-a-side.sql) — the durable, cross-round-summable
// ledger every round (A Side, The Remix, On Blast) already writes its
// own finalized points into as round = 1/2/3 rows, exactly as that
// migration's own comment describes ("a season total is then nothing
// more than select player_id, sum(points) ... group by player_id, with
// zero changes needed to this table itself"). Nothing here computes its
// own scores; it only sums what every round already finalized.
// ============================================================

// Reads every round's already-persisted points for this game and sums
// them per player, client-side (no new SQL view/function needed — a
// plain select + JS reduce over, at most, playerCount * 3 rows is not
// worth a dedicated aggregate query in a party game this size). Ties at
// the top are ALL winners — the spec's own "the player with the most
// points at the end wins" gives no tie-break rule, so this deliberately
// doesn't invent one; every player whose total equals the max is
// included in winnerIds.
export async function fetchStereoTypesFinalStandings(gameId) {
  const { data, error } = await supabase
    .from("stereo_types_round_scores")
    .select("player_id, points")
    .eq("game_id", gameId);
  if (error || !data) return { standings: [], winnerIds: [] };

  const totals = {};
  data.forEach((row) => {
    totals[row.player_id] = (totals[row.player_id] || 0) + row.points;
  });

  const standings = Object.entries(totals)
    .map(([playerId, totalPoints]) => ({ playerId, totalPoints }))
    .sort((a, b) => b.totalPoints - a.totalPoints);

  const topScore = standings[0]?.totalPoints;
  const winnerIds = topScore === undefined ? [] : standings.filter((s) => s.totalPoints === topScore).map((s) => s.playerId);

  return { standings, winnerIds };
}

// Calls the SECURITY DEFINER function (sql/add-stereo-types-on-blast.sql)
// that INDEPENDENTLY re-verifies the caller is genuinely among this
// game's top scorer(s) before granting anything — see that migration's
// own comment for the exact verification query. This client call
// supplies nothing the server actually trusts: p_game_id/p_sticker_id
// just say "which game, which sticker" — the "did I actually win" check
// happens entirely server-side against auth.uid(), never against
// anything passed in here. A `false` return (rather than a thrown error)
// means the RPC's own verification rejected the claim — e.g. this
// player wasn't actually a top scorer, or the game hasn't finished
// Round 3 yet.
export async function claimStereoTypesWinSticker(gameId, stickerId) {
  const { data, error } = await supabase.rpc("stereo_types_claim_win_sticker", { p_game_id: gameId, p_sticker_id: stickerId });
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "This game doesn't show you as a winner — the sticker wasn't granted." };
  return { ok: true };
}
