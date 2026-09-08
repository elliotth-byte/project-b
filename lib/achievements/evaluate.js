import { KEY_CHALLENGE_HISTORY, KEY_EXILE_HISTORY, KEY_FINALE } from "../gameState";
import { KEY_TRAITORS_FINALE } from "../traitorsFinale";
import { scoresToPlacements } from "../challenges/scores";
import { GAME_REGISTRY } from "../challenges/registry";
import { fetchStereoTypesFinalStandings } from "../stereoTypesFinale";
import { aSideKey } from "../stereoTypesASide";
import { computeSeasonKeys } from "./rules";
import { fullCatalog } from "./catalog";

// ─── Achievement evaluation — the I/O layer ───
// Everything real-data-shaped happens here; lib/achievements/rules.js
// is the pure part this hands a fully-assembled `ctx` to. Safe to call
// more than once for the same game (idempotent) — player_achievements'
// own unique(user_id, achievement_key) constraint (see
// sql/add-achievements.sql) is what actually guarantees a second call
// never double-awards anything, not any check in here; this file just
// upserts with ignoreDuplicates and lets that constraint do the work.
//
// `client` must be a service-role Supabase client — regular
// authenticated clients can't insert into player_achievements at all
// (see sql/add-achievements.sql's own comment on why), and reading
// every player's power_state/vote history across a whole season isn't
// something an ordinary player-scoped RLS policy should allow either.
// `db` is this app's usual game_state wrapper (lib/dbAdapter.js) bound
// to that same client.

const scoresKey = (round) => `pb:challenge-scores:${round}`;
const artAuctionKey = (round) => `pb:artauction:${round}`;

export async function evaluateAndAwardAchievements(gameId, client, db) {
  const { data: game } = await client.from("games").select("id, game_type, host_id").eq("id", gameId).maybeSingle();
  if (!game || game.game_type === "stereo_types") return; // Stereo Types has its own separate evaluator — see evaluateStereoTypesAchievements below

  const { data: players } = await client
    .from("players")
    .select("id, user_id, display_name, alias, alive, elimination_round, elimination_order, elimination_type, power_state")
    .eq("game_id", gameId)
    .eq("approved", true);
  if (!players || players.length === 0) return;

  const challengeHistory = (await db.get(gameId, KEY_CHALLENGE_HISTORY)) || [];
  const exileHistory = (await db.get(gameId, KEY_EXILE_HISTORY)) || [];
  const finaleKey = game.game_type === "traitors" ? KEY_TRAITORS_FINALE : KEY_FINALE;
  const finale = await db.get(gameId, finaleKey);

  // Only fetched for rounds that actually need it — a manual/host-
  // graded challenge already carries its own `placements` on the
  // history entry itself (see rules.js's rankingForRound), so there's
  // nothing to read here for those.
  const roundRankings = {};
  const participantsForRanking = players.map((p) => ({ playerId: p.id, name: p.display_name }));
  for (const entry of challengeHistory) {
    if (entry.gameType === "manual" || (entry.placements && entry.placements.length > 0)) continue;
    const scores = await db.get(gameId, scoresKey(entry.round));
    if (!scores) continue;
    const rankDirection = GAME_REGISTRY[entry.gameType]?.rank === "time-asc" ? "time-asc" : "score-desc";
    const placements = scoresToPlacements(scores, participantsForRanking, rankDirection);
    roundRankings[entry.round] = placements.map((p) => p.playerId);
  }

  const artAuctionPieces = {};
  for (const entry of challengeHistory) {
    if (entry.gameType !== "artauction") continue;
    const state = await db.get(gameId, artAuctionKey(entry.round));
    if (!state?.placements) continue;
    artAuctionPieces[entry.round] = {};
    Object.entries(state.placements).forEach(([playerId, p]) => { artAuctionPieces[entry.round][playerId] = p.piecesWon || 0; });
  }

  const ctx = { game, players, challengeHistory, exileHistory, finale, roundRankings, artAuctionPieces };
  const earned = computeSeasonKeys(ctx);

  await awardLongevityAchievements(client, players, earned);
  await awardHostingAchievement(client, game.host_id);

  await writeEarnedAchievements(client, gameId, players, earned);
}

// Cross-season achievements (played N seasons, won N seasons) reuse
// public_season_history — the SAME security-definer function
// pages/profile.jsx's own Season History card is built on — rather
// than re-deriving "how many seasons has this user played/won" with a
// second, separately-maintained query. Called with the service-role
// client, which can call this RPC for any user, not just the caller.
async function awardLongevityAchievements(client, players, earned) {
  for (const p of players) {
    if (!p.user_id) continue;
    const { data: history } = await client.rpc("public_season_history", { p_user_id: p.user_id });
    const rows = history || [];
    const playedCount = rows.length;
    const wonCount = rows.filter((r) => r.placement === "won").length;
    if (playedCount >= 1) earned[p.id]?.add("initiation");
    if (playedCount >= 5) earned[p.id]?.add("regular");
    if (wonCount >= 3) earned[p.id]?.add("dynasty");
  }
}

// The host isn't necessarily in `players` at all (a host who never
// joins as a player themselves is common), so this is a separate,
// direct write rather than folding into the per-player earned map —
// same unique-constraint-does-the-real-work idempotency as everywhere
// else in this file.
async function awardHostingAchievement(client, hostId) {
  if (!hostId) return;
  const { count } = await client.from("games").select("id", { count: "exact", head: true }).eq("host_id", hostId);
  const hostRows = [];
  if ((count || 0) >= 1) hostRows.push({ user_id: hostId, achievement_key: "first_broadcast" });
  if ((count || 0) >= 5) hostRows.push({ user_id: hostId, achievement_key: "chronicler" });
  if (hostRows.length > 0) {
    await client.from("player_achievements").upsert(hostRows, { onConflict: "user_id,achievement_key", ignoreDuplicates: true });
  }
}

const ALL_KEYS = new Set(fullCatalog().map((a) => a.key));

async function writeEarnedAchievements(client, gameId, players, earned) {
  const rows = [];
  players.forEach((p) => {
    if (!p.user_id) return;
    (earned[p.id] || new Set()).forEach((key) => {
      if (ALL_KEYS.has(key)) rows.push({ user_id: p.user_id, achievement_key: key, game_id: gameId });
    });
  });
  if (rows.length === 0) return;
  await client.from("player_achievements").upsert(rows, { onConflict: "user_id,achievement_key", ignoreDuplicates: true });
}

// ─── Stereo Types — its own separate evaluator ───
// Stereo Types is deliberately excluded from public_season_history
// (see sql/exclude-stereo-types-from-history.sql) — it isn't a
// "season" in the placement/elimination sense the rest of this file's
// rules are built around, so it gets its own small, direct read
// instead of trying to force it through computeSeasonKeys' ctx shape.
// Called from wherever Stereo Types' own "this is done" signal fires
// — see this repo's wiring of it for the current best-effort trigger
// point, and its honest limits.
export async function evaluateStereoTypesAchievements(gameId, client, db) {
  const { data: game } = await client.from("games").select("id, game_type").eq("id", gameId).maybeSingle();
  if (!game || game.game_type !== "stereo_types") return;

  const { data: players } = await client.from("players").select("id, user_id").eq("game_id", gameId).eq("approved", true);
  if (!players || players.length === 0) return;

  const rows = [];

  const { winnerIds } = await fetchStereoTypesFinalStandings(gameId);
  players.forEach((p) => {
    if (p.user_id && winnerIds.includes(p.id)) rows.push({ user_id: p.user_id, achievement_key: "stereo_champion", game_id: gameId });
  });

  // Reads A Side's own already-scored, already-persisted result (see
  // lib/stereoTypesASide.js's maybeScoreASide) rather than recomputing
  // anything — that result (including the per-guess guessResults and
  // pumpedCorrect detail these two achievements need) is left in
  // game_state permanently once scored, same as every other historical
  // game_state row in this app. Only round 1 (A Side) exists as of
  // this writing — Remix/On Blast are rounds 2/3, still unbuilt (see
  // lib/stereoTypesASide.js's own comment on that extension point).
  const aSideState = await db.get(gameId, aSideKey(1));
  if (aSideState?.result?.perPlayer) {
    players.forEach((p) => {
      if (!p.user_id) return;
      const mine = aSideState.result.perPlayer[p.id];
      if (!mine) return;
      const otherIds = Object.keys(mine.guessResults || {});
      if (otherIds.length > 0 && otherIds.every((id) => mine.guessResults[id])) {
        rows.push({ user_id: p.user_id, achievement_key: "round_perfect", game_id: gameId });
      }
      if (mine.pumpedCorrect === true) {
        rows.push({ user_id: p.user_id, achievement_key: "pump_up_the_volume", game_id: gameId });
      }
    });
  }

  if (rows.length > 0) {
    await client.from("player_achievements").upsert(rows, { onConflict: "user_id,achievement_key", ignoreDuplicates: true });
  }
}
