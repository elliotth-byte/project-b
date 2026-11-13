import { supabase } from "./supabaseClient";
import { storageSet, storageDelete, subscribeGameState } from "./gameStorage";

// ─── End Game vs Banish Again: client helpers ───
// See sql/add-endgame-vote.sql for the schema and why individual votes
// live in their own RLS-protected table. Two pieces of state:
//
//   * game_state key KEY_ENDGAME_VOTE — { roundKey, open, result?, counts? }.
//     Readable by everyone (no individual votes in it): whether a vote is
//     open, and, once the host closes it, the published result.
//   * endgame_votes table — one row per player, only readable by the host
//     and that player's own account.
//
// `roundKey` is the Roundtable's roundInfo.startedAt, which changes every
// time a round opens or advances. State/rows with a stale roundKey are
// ignored everywhere, so nothing needs clearing between rounds or on a
// season reset.
//
// Every read here fails SAFE: if the table doesn't exist yet (migration
// not run) or a query errors, the result is "no votes" — the Roundtable
// keeps working exactly as it did before.

export const KEY_ENDGAME_VOTE = "traitors:endgame-vote";
const TABLE = "endgame_votes";

// ── Host: open / close / cancel ──

export async function openEndGameVote(gameId, roundKey) {
  return storageSet(gameId, KEY_ENDGAME_VOTE, { roundKey, open: true, openedAt: Date.now() });
}

// Publishes the result (and counts only — never who voted what) to players.
export async function closeEndGameVote(gameId, roundKey, result, counts) {
  return storageSet(gameId, KEY_ENDGAME_VOTE, { roundKey, open: false, result, counts, closedAt: Date.now() });
}

export async function cancelEndGameVote(gameId) {
  return storageDelete(gameId, KEY_ENDGAME_VOTE);
}

export function subscribeEndGameState(gameId, onChange) {
  return subscribeGameState(gameId, KEY_ENDGAME_VOTE, onChange);
}

// ── Pure: tally ──
// "End Game" only wins if EVERY living player voted End Game — one
// "Banish Again" or one missing vote means another banish, as on the show.
// `finalists` = [{ id, display_name }], `rows` = endgame_votes rows already
// filtered to the current roundKey.
export function computeEndGameResult(finalists, rows) {
  const byId = {};
  rows.forEach((r) => { byId[r.player_id] = r.choice; });
  const end = finalists.filter((p) => byId[p.id] === "end");
  const banish = finalists.filter((p) => byId[p.id] === "banish");
  const missing = finalists.filter((p) => !byId[p.id]);
  const result = finalists.length > 0 && banish.length === 0 && missing.length === 0 ? "end" : "banish";
  return { end, banish, missing, byId, result };
}

// ── Player: cast ──
// Enforced server-side by cast_endgame_vote: caller must own a living,
// approved player, and a vote for this roundKey must be open.
export async function castEndGameVote(gameId, roundKey, choice) {
  const { data, error } = await supabase.rpc("cast_endgame_vote", {
    p_game_id: gameId, p_round_key: roundKey, p_choice: choice,
  });
  return { ok: !error && data === true, error };
}

// ── Reads ──
// Host: every row (RLS). Anyone else: only their own.
export async function fetchEndGameVotes(gameId) {
  const { data, error } = await supabase.from(TABLE).select("*").eq("game_id", gameId);
  if (error) {
    console.warn("End Game votes fetch failed (has sql/add-endgame-vote.sql been run?):", error.message);
    return [];
  }
  return data || [];
}

export async function fetchMyEndGameVote(gameId, playerId) {
  const { data, error } = await supabase
    .from(TABLE).select("*").eq("game_id", gameId).eq("player_id", playerId).maybeSingle();
  if (error) {
    console.warn("End Game own-vote fetch failed (has sql/add-endgame-vote.sql been run?):", error.message);
    return null;
  }
  return data || null;
}

// Shared subscription plumbing — same shape as lib/goldenDagger.js's
// subscribeGoldenDagger: any realtime event just triggers a re-fetch, plus
// the same visibility/periodic resync as lib/gameStorage.js guards against
// a silently dead realtime channel. Returns an unsubscribe function.
function subscribeRefetch(gameId, fetcher, onChange) {
  let active = true;
  let lastJson;

  const refetch = () => fetcher().then((value) => {
    if (!active) return;
    const json = JSON.stringify(value);
    if (json === lastJson) return;
    lastJson = json;
    onChange(value);
  });

  refetch();

  const channel = supabase
    .channel(`endgame_votes:${gameId}:${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: TABLE, filter: `game_id=eq.${gameId}` }, refetch)
    .subscribe();

  const intervalId = setInterval(refetch, 45000);
  const onVisible = () => { if (document.visibilityState === "visible") refetch(); };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);

  return () => {
    active = false;
    clearInterval(intervalId);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
    supabase.removeChannel(channel);
  };
}

// Host: calls onChange(rows[]) with every vote row, then whenever they change.
export function subscribeEndGameVotes(gameId, onChange) {
  return subscribeRefetch(gameId, () => fetchEndGameVotes(gameId), onChange);
}

// Player: calls onChange(row | null) with their own vote row.
export function subscribeMyEndGameVote(gameId, playerId, onChange) {
  return subscribeRefetch(gameId, () => fetchMyEndGameVote(gameId, playerId), onChange);
}
