import { battleMasterKey, battleAdeptKey, godWinKey } from "./catalog";
import { GAME_REGISTRY } from "../challenges/registry";

// ─── Achievement rules — pure computation ───
// Deliberately separate from lib/achievements/evaluate.js's actual
// database I/O: everything here is a pure function of a `ctx` object
// already assembled from real season data, so it's fully testable with
// synthetic data (see the test harness this was verified against)
// without needing a live database at all. evaluate.js's only job is
// building `ctx` correctly and then writing whatever this returns.
//
// ctx shape:
//   game: { id, game_type, name, created_at }
//   players: [{ id, user_id, display_name, alias, alive,
//     elimination_round, elimination_order, elimination_type,
//     power_state }]
//   challengeHistory: [{ round, gameType, winnerId, placements, finalFour }]
//   exileHistory: [{ round, nominees, exiledIds, chaosHolderId,
//     voteRows: [{voterId, targetId, reason}] }]
//   finale: { winnerId, finalists: [{playerId, name}] } | null
//   roundRankings: { [round]: [playerId, ...] } — best-to-worst order
//     for that round, already fully resolved (see
//     lib/achievements/evaluate.js's own use of
//     lib/challenges/scores.js's scoresToPlacements — the app's own
//     canonical ranking function, reused here rather than
//     reimplemented, so forfeits/tie-breaks/rank-direction are handled
//     identically to everywhere else a placement gets computed).
//   artAuctionPieces: { [round]: { [playerId]: number } } — pieces won,
//     only for rounds where gameType === "artauction".
//
// Returns { [playerId]: Set(achievementKey) } — every key a player in
// THIS season's roster newly qualifies for. evaluate.js is what
// decides which of those are actually NEW (vs. already earned) before
// writing anything.

function reachedFinale(ctx, playerId) {
  return !!ctx.finale?.finalists?.some((f) => f.playerId === playerId);
}

function wonSeason(ctx, playerId) {
  return !!ctx.finale && ctx.finale.winnerId === playerId;
}

// Best-to-worst playerId order for one challengeHistory entry —
// ctx.roundRankings (see this file's own header comment) already has
// this fully resolved for anything digital; a manual/host-graded
// challenge's own `placements` array on the entry itself is the
// authoritative source for those instead, since that's literally what
// the host entered.
function rankingForRound(ctx, entry) {
  if (entry.placements && entry.placements.length > 0) {
    return [...entry.placements].sort((a, b) => a.place - b.place).map((p) => p.playerId);
  }
  return ctx.roundRankings?.[entry.round] || (entry.winnerId ? [entry.winnerId] : []);
}

function earliestRound(entries) {
  if (!entries || entries.length === 0) return null;
  return Math.min(...entries.map((e) => e.round));
}

export function computeSeasonKeys(ctx) {
  const earned = {};
  ctx.players.forEach((p) => { earned[p.id] = new Set(); });
  const add = (playerId, key) => { if (earned[playerId]) earned[playerId].add(key); };

  const firstExileRound = earliestRound((ctx.exileHistory || []).filter((e) => (e.exiledIds || []).length > 0));

  ctx.players.forEach((p) => {
    // ── Season Outcomes ──
    if (wonSeason(ctx, p.id)) add(p.id, "won_season");
    if (reachedFinale(ctx, p.id) && !wonSeason(ctx, p.id)) add(p.id, "runner_up");
    if (firstExileRound != null) {
      const firstEntry = ctx.exileHistory.find((e) => e.round === firstExileRound);
      if (firstEntry?.exiledIds?.includes(p.id)) add(p.id, "first_to_fall");
    }
    const everNominated = (ctx.exileHistory || []).some((e) => (e.nominees || []).some((n) => n.playerId === p.id));
    if (!everNominated) add(p.id, "untouchable");
    const nominationCount = (ctx.exileHistory || []).filter((e) => (e.nominees || []).some((n) => n.playerId === p.id)).length;
    if (nominationCount >= 3 && reachedFinale(ctx, p.id)) add(p.id, "phoenix");
    if (p.elimination_round != null && firstExileRound != null && p.elimination_round === firstExileRound) add(p.id, "blaze_of_glory");

    // ── Voting & Social ──
    const everVotedAgainst = (ctx.exileHistory || []).some((e) => (e.voteRows || []).some((v) => v.targetId === p.id));
    if (!everVotedAgainst) add(p.id, "beloved");
    const fatesCount = (ctx.exileHistory || []).filter((e) => e.chaosHolderId === p.id).length;
    if (fatesCount >= 3) add(p.id, "fates_favorite");
    const targetsNominated = new Set();
    (ctx.exileHistory || []).forEach((e) => (e.voteRows || []).forEach((v) => { if (v.voterId === p.id) targetsNominated.add(v.targetId); }));
    if (targetsNominated.size >= 5) add(p.id, "puppeteer");
    const wasAphroditesTarget = ctx.players.some((other) => other.power_state?.aphroditeTarget === p.id);
    if (wasAphroditesTarget) add(p.id, "aphrodites_chosen");

    // ── Powers ──
    const assignedPower = p.power_state?.assignedPower;
    if (assignedPower) {
      add(p.id, "divine_gift");
      if (p.alias && assignedPower !== p.alias) add(p.id, "borrowed_fire");
      if (wonSeason(ctx, p.id)) add(p.id, godWinKey(assignedPower));
    }

    // ── Battle Performance ──
    const wonEntries = (ctx.challengeHistory || []).filter((e) => e.winnerId === p.id);
    if (wonEntries.length >= 3) add(p.id, "zeus_champion_battles");
    const firstBattleRound = earliestRound(ctx.challengeHistory);
    if (firstBattleRound != null && wonEntries.some((e) => e.round === firstBattleRound)) add(p.id, "opening_strike");
    const wonCategories = new Set(wonEntries.map((e) => GAME_REGISTRY[e.gameType]?.category).filter(Boolean));
    if (wonCategories.size >= 4) add(p.id, "polymath");
    if ((ctx.challengeHistory || []).length > 0 && wonEntries.length === 0) add(p.id, "cold_streak");
    wonEntries.forEach((e) => {
      const nominatedRoundBefore = (ctx.exileHistory || []).some((ex) => ex.round === e.round - 1 && (ex.nominees || []).some((n) => n.playerId === p.id));
      if (nominatedRoundBefore) add(p.id, "underdog_triumph");
    });

    // ── Battle Mastery (per-battle Master/Adept) ──
    (ctx.challengeHistory || []).forEach((entry) => {
      if (entry.winnerId === p.id) add(p.id, battleMasterKey(entry.gameType));
      const ranking = rankingForRound(ctx, entry);
      if (ranking.slice(0, 3).includes(p.id)) add(p.id, battleAdeptKey(entry.gameType));
    });

    // ── Fun / Rare ──
    (ctx.challengeHistory || []).forEach((entry) => {
      if (entry.gameType !== "artauction" || entry.winnerId !== p.id) return;
      const pieces = ctx.artAuctionPieces?.[entry.round]?.[p.id] || 0;
      if (pieces >= 3) add(p.id, "patron_of_the_arts");
    });
    const maxRound = Math.max(0, ...(ctx.challengeHistory || []).map((e) => e.round), ...(ctx.exileHistory || []).map((e) => e.round));
    if (maxRound >= 15) add(p.id, "marathon");
  });

  return earned;
}
