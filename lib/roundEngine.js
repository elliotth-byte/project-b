import { KEY_SETTINGS, KEY_ROUND, KEY_CHALLENGE, KEY_FATES, KEY_EXILE, KEY_EXILE_HISTORY, KEY_REENTRY, KEY_FINALE, KEY_CHALLENGE_HISTORY, PHASES, DEFAULT_SETTINGS } from "./gameState";
import { computeChallengeOutcome, placementsComplete } from "./challengeLogic";
import { GAME_REGISTRY } from "./challengeGames";
import { scoresToPlacements } from "./challengeScores";
import { nominationsComplete, distinctNominees } from "./fatesLogic";
import { drawPowerOfChaos } from "./chaosLogic";
import { computeEliminateOutcome, computeSaveOutcome, computeFinaleOutcome } from "./exileLogic";
import { REENTRY_STATUS, resolveReentryAttempt } from "./reentryLogic";

// ============================================================
// advancePhase(gameId, ctx) — the single function that knows how to move
// a Project B game from whatever phase it's currently in to the next one,
// IF that phase's timer has elapsed (or `force` is passed, for the host's
// manual "Advance Now" button). It's deliberately IO-agnostic: `ctx.db` is
// anything shaped like lib/dbAdapter.js's makeDb() return value, and
// `ctx.client` is any supabase client with enough privilege to read/write
// `players`. That's what lets the exact same code run:
//   - from a browser tab (bound to the signed-in user's own session), or
//   - from a Vercel Cron / API route (bound to the service-role key).
//
// Design choice worth calling out: if a phase's timer runs out but the
// host hasn't finished entering what it needs (challenge placements,
// nominations, or a tie needing the Power of Chaos holder's call), this
// does NOT fabricate an outcome — it leaves the phase open and returns a
// "waitingOn" reason instead. A real in-person game can run long; forcing
// a fake result would be worse than asking the host to finish up.
// ============================================================

export async function advancePhase(gameId, ctx) {
  const { db, client, postMessage, force = false, now = Date.now() } = ctx;

  const round = await db.get(gameId, KEY_ROUND);
  if (!round || round.phase === PHASES.LOBBY || round.phase === PHASES.ENDED) {
    return { advanced: false, reason: "not-in-progress" };
  }

  if (!force && (!round.phaseEndsAt || now < round.phaseEndsAt)) {
    return { advanced: false, reason: "timer-not-up" };
  }

  const settingsRaw = await db.get(gameId, KEY_SETTINGS);
  const settings = { ...DEFAULT_SETTINGS, ...(settingsRaw || {}) };

  const { data: playersRows } = await client.from("players").select("*").eq("game_id", gameId);
  const players = playersRows || [];
  const playersById = {};
  players.forEach((p) => (playersById[p.id] = p.display_name));
  const alivePlayers = players.filter((p) => p.alive);

  if (round.phase === PHASES.CHALLENGE) return advanceFromChallenge({ gameId, db, client, postMessage, now, round, settings, players, alivePlayers, playersById });
  if (round.phase === PHASES.FATES) return advanceFromFates({ gameId, db, client, postMessage, now, round, settings, players, alivePlayers, playersById });
  if (round.phase === PHASES.EXILE) return advanceFromExile({ gameId, db, client, postMessage, now, round, settings, players, alivePlayers, playersById });
  if (round.phase === PHASES.FINALE) return advanceFromFinale({ gameId, db, client, postMessage, now, round, settings, players, alivePlayers, playersById });

  return { advanced: false, reason: "unknown-phase" };
}

async function setPlayerAlive(client, playerId, alive, eliminationType) {
  await client.from("players").update({ alive, elimination_type: eliminationType }).eq("id", playerId);
}

// ─── CHALLENGE -> FATES (or straight to EXILE at Final Four) ───
async function advanceFromChallenge(env) {
  const { gameId, db, client, postMessage, now, round, settings, alivePlayers, playersById } = env;
  const challenge = await db.get(gameId, KEY_CHALLENGE);
  if (!challenge || !challenge.active) return { advanced: false, reason: "no-active-challenge" };

  // Digital mini-games score themselves — derive placements from
  // whatever's been reported so far (see lib/challengeScores.js) instead
  // of waiting on the host to type anything in. This always produces a
  // complete placement list (a no-show is simply ranked last), so a
  // mini-game challenge never stalls waiting on manual entry the way a
  // real-world ("manual") challenge intentionally can.
  if (challenge.gameType && challenge.gameType !== "manual" && !challenge.finalized) {
    const scores = (await db.get(gameId, `pb:challenge-scores:${round.round}`)) || {};
    const participants = (challenge.participantIds || []).map((id) => ({ playerId: id, name: playersById[id] || "?" }));
    const rankDirection = GAME_REGISTRY[challenge.gameType]?.rank === "time-asc" ? "time-asc" : "score-desc";
    challenge.placements = scoresToPlacements(scores, participants, rankDirection);
    await db.update(gameId, KEY_CHALLENGE, (fresh) => ({ ...(fresh || challenge), placements: challenge.placements }));
  }

  const participantCount = (challenge.participantIds || []).length;
  if (!placementsComplete(challenge.placements, participantCount)) {
    return { advanced: false, reason: "waiting-on-challenge-results" };
  }

  const reentryAttemptIds = challenge.reentryAttemptIds || [];
  const isFinalFour = alivePlayers.length === 4 && reentryAttemptIds.length === 0;
  const outcome = computeChallengeOutcome(challenge.placements, isFinalFour);

  // Resolve every re-entry attempt running this round. Any number of
  // exiled players can try at once, but there's only ever one 1st place —
  // whichever attempter (if any) actually finishes 1st overall returns;
  // everyone else who tried uses up their one shot regardless of how they
  // did against the OTHER attempters.
  let doubleElimination = false;
  if (reentryAttemptIds.length > 0) {
    const reentry = (await db.get(gameId, KEY_REENTRY)) || [];
    const list = [...reentry];
    for (const attemptId of reentryAttemptIds) {
      const idx = list.findIndex((r) => r.playerId === attemptId);
      if (idx < 0) continue;
      const updatedEntry = resolveReentryAttempt(list[idx], challenge.placements);
      list[idx] = updatedEntry;
      if (updatedEntry.status === REENTRY_STATUS.RETURNED) {
        await setPlayerAlive(client, updatedEntry.playerId, true, null);
        doubleElimination = true;
        await postMessage(`🔥 ${updatedEntry.name} won their way back into the game! This round is now a DOUBLE ELIMINATION.`);
      } else {
        await postMessage(`${updatedEntry.name} attempted to re-enter and did not finish 1st — they are eliminated forever.`);
      }
    }
    await db.set(gameId, KEY_REENTRY, list);
  }

  await db.update(gameId, KEY_CHALLENGE, (fresh) => ({ ...(fresh || challenge), finalized: true }));
  await db.update(gameId, KEY_CHALLENGE_HISTORY, (fresh) => {
    const list = fresh || [];
    return [...list, { round: round.round, placements: challenge.placements, winnerId: outcome.winner?.playerId || null, finalFour: isFinalFour, gameType: challenge.gameType || "manual" }];
  });

  if (isFinalFour) {
    await db.set(gameId, KEY_EXILE, {
      round: round.round,
      nominees: outcome.autoNominees.map((n) => ({ playerId: n.playerId, name: n.name })),
      mode: doubleElimination ? "save" : "eliminate",
      chaosHolderId: drawPowerOfChaos(alivePlayers.map((p) => ({ playerId: p.id, name: p.display_name })))?.playerId || null,
      chaosNullifiedNomineeId: null,
      cardsFanned: false,
      votingOpen: true,
      tieBreakChoiceId: null,
      resultExiledIds: [],
      revealed: false,
    });
    await db.update(gameId, KEY_ROUND, (fresh) => ({
      ...fresh, phase: PHASES.EXILE, phaseStartedAt: now, phaseEndsAt: settings.infiniteTime ? null : now + settings.voteDurationSec * 1000,
      finalFour: true, doubleElimination,
    }));
    await postMessage(
      `⚔️ Final Four Challenge complete!\n\n🏆 ${outcome.winner?.name} finishes 1st and is safe.\n\nAt the Final Four, everyone else is automatically nominated: ${outcome.autoNominees.map((n) => n.name).join(", ")}.\n\n➡️ Moving straight to the Exile Vote.`
    );
    return { advanced: true, to: PHASES.EXILE };
  }

  await db.set(gameId, KEY_FATES, {
    round: round.round,
    nominatorOrder: outcome.nominators.map((n) => ({ playerId: n.playerId, name: n.name, place: n.place })),
    nominations: {},
    locked: false,
  });
  await db.update(gameId, KEY_ROUND, (fresh) => ({
    ...fresh, phase: PHASES.FATES, phaseStartedAt: now, phaseEndsAt: settings.infiniteTime ? null : now + settings.fatesDurationSec * 1000,
    finalFour: false, doubleElimination,
  }));
  await postMessage(
    `⚔️ Challenge complete!\n\n🏆 ${outcome.winner?.name} finishes 1st and wins immunity.\n\nNominating this Fates Ceremony (in finishing order): ${outcome.nominators.map((n) => n.name).join(", ")}.\n\n➡️ Moving to the Fates Ceremony.`
  );
  return { advanced: true, to: PHASES.FATES };
}

// ─── FATES -> EXILE ───
async function advanceFromFates(env) {
  const { gameId, db, postMessage, now, round, settings, alivePlayers, playersById } = env;
  const fates = await db.get(gameId, KEY_FATES);
  if (!fates) return { advanced: false, reason: "no-fates-state" };
  if (!nominationsComplete(fates.nominatorOrder, fates.nominations)) {
    return { advanced: false, reason: "waiting-on-nominations" };
  }

  const nominees = distinctNominees(fates.nominatorOrder, fates.nominations, playersById);
  const chaosHolder = drawPowerOfChaos(alivePlayers.map((p) => ({ playerId: p.id, name: p.display_name })));

  await db.set(gameId, KEY_EXILE, {
    round: round.round,
    nominees,
    mode: round.doubleElimination ? "save" : "eliminate",
    chaosHolderId: chaosHolder?.playerId || null,
    chaosNullifiedNomineeId: null,
    cardsFanned: false,
    votingOpen: true,
    tieBreakChoiceId: null,
    resultExiledIds: [],
    revealed: false,
  });
  await db.update(gameId, KEY_ROUND, (fresh) => ({
    ...fresh, phase: PHASES.EXILE, phaseStartedAt: now, phaseEndsAt: settings.infiniteTime ? null : now + settings.voteDurationSec * 1000,
  }));
  await postMessage(
    `⚖️ Fates Ceremony complete!\n\nNominees for exile: ${nominees.map((n) => n.name).join(", ")}.\n\n🃏 The Power of Chaos has been drawn by ${chaosHolder?.name || "no one"}.\n\n➡️ Moving to the Exile Vote${round.doubleElimination ? " — this is a DOUBLE ELIMINATION round, so votes are cast to SAVE, not eliminate." : ""}.`
  );
  return { advanced: true, to: PHASES.EXILE };
}

// ─── EXILE -> next Challenge round, or Finale, or Ended ───
async function advanceFromExile(env) {
  const { gameId, db, client, postMessage, now, round, settings, players, alivePlayers } = env;
  const exile = await db.get(gameId, KEY_EXILE);
  if (!exile) return { advanced: false, reason: "no-exile-state" };

  const votes = (await db.get(gameId, `pb:exile-votes:${round.round}`)) || {};
  const voteRows = Object.entries(votes).map(([voterId, v]) => ({ voterId, targetId: v.targetId, reason: v.reason || null }));
  const nomineeIds = exile.nominees.map((n) => n.playerId);

  // The actual nullification target lives in chaos_secrets, not in the
  // public pb:exile object — see sql/add-chaos-secrets.sql for why. The
  // service-role client here bypasses that table's RLS entirely, same as
  // it bypasses everything else, so this always reads the real value.
  const { data: secretRow } = await client
    .from("chaos_secrets")
    .select("nullified_player_id")
    .eq("game_id", gameId)
    .eq("context", `exile:${round.round}`)
    .maybeSingle();
  const nullifiedId = secretRow?.nullified_player_id || null;

  let exiledIds = [];
  let summary = "";

  if (exile.mode === "save") {
    const outcome = computeSaveOutcome(voteRows, nullifiedId, nomineeIds);
    if (outcome.needsTieBreak && !exile.tieBreakChoiceId) {
      await postMessage(`🃏 The vote to save is tied. Waiting on the Power of Chaos holder to break the tie.`);
      return { advanced: false, reason: "waiting-on-tiebreak" };
    }
    exiledIds = outcome.needsTieBreak
      ? [nullifiedId, exile.tieBreakChoiceId].filter(Boolean)
      : outcome.exiledIds;
    const byId = {};
    exile.nominees.forEach((n) => (byId[n.playerId] = n.name));
    summary = `💀 DOUBLE ELIMINATION: ${exiledIds.map((id) => byId[id] || "?").join(" and ")} have been exiled.`;
  } else {
    const outcome = computeEliminateOutcome(voteRows, nullifiedId, nomineeIds);
    if (outcome.needsTieBreak && !exile.tieBreakChoiceId) {
      await postMessage(`🃏 The vote is tied. Waiting on the Power of Chaos holder to break the tie.`);
      return { advanced: false, reason: "waiting-on-tiebreak" };
    }
    const exiledId = outcome.needsTieBreak ? exile.tieBreakChoiceId : outcome.exiledId;
    exiledIds = exiledId ? [exiledId] : [];
    const byId = {};
    exile.nominees.forEach((n) => (byId[n.playerId] = n.name));
    summary = exiledId ? `💀 ${byId[exiledId] || "?"} has been exiled.` : `No one received a countable vote — no one is exiled this round.`;
  }

  for (const id of exiledIds) {
    await setPlayerAlive(client, id, false, "exiled");
    const name = exile.nominees.find((n) => n.playerId === id)?.name || "?";
    await db.update(gameId, KEY_REENTRY, (fresh) => {
      const list = fresh || [];
      if (list.some((r) => r.playerId === id)) return list;
      return [...list, { playerId: id, name, status: REENTRY_STATUS.PENDING, exiledRound: round.round }];
    });
  }

  // Now that it's genuinely been revealed, mirror the secret into the
  // public record — this is what lets HistoryTab/the voting spreadsheet
  // show it after the fact without needing continued access to
  // chaos_secrets itself.
  await db.update(gameId, KEY_EXILE, (fresh) => ({ ...(fresh || exile), chaosNullifiedNomineeId: nullifiedId, resultExiledIds: exiledIds, revealed: true }));
  await db.update(gameId, KEY_EXILE_HISTORY, (fresh) => {
    const list = fresh || [];
    return [...list, {
      round: round.round, nominees: exile.nominees, mode: exile.mode, exiledIds,
      chaosHolderId: exile.chaosHolderId, nullifiedId, tieBreakChoiceId: exile.tieBreakChoiceId || null,
      voteRows,
    }];
  });

  const remainingAlive = players.filter((p) => p.alive && !exiledIds.includes(p.id));
  await postMessage(summary);

  if (remainingAlive.length <= 1) {
    const winner = remainingAlive[0];
    await db.update(gameId, KEY_ROUND, (fresh) => ({
      ...fresh, phase: PHASES.ENDED, phaseEndsAt: null, winnerId: winner?.id || null, winnerName: winner?.display_name || null,
    }));
    await postMessage(winner ? `🏆 ${winner.display_name} is the last one standing and WINS the game!` : `The game has ended with no winner.`);
    return { advanced: true, to: PHASES.ENDED };
  }

  if (remainingAlive.length <= 3) {
    const exiledPool = players.filter((p) => !p.alive);
    const chaosHolder = drawPowerOfChaos(exiledPool.map((p) => ({ playerId: p.id, name: p.display_name })));
    await db.set(gameId, KEY_FINALE, {
      finalists: remainingAlive.map((p) => ({ playerId: p.id, name: p.display_name })),
      chaosHolderId: chaosHolder?.playerId || null,
      nullifiedFinalistId: null,
      votingOpen: true,
      tieBreakChoiceId: null,
      winnerId: null,
      revealed: false,
    });
    await db.update(gameId, KEY_ROUND, (fresh) => ({
      ...fresh, phase: PHASES.FINALE, phaseStartedAt: now, phaseEndsAt: settings.infiniteTime ? null : now + settings.voteDurationSec * 1000,
      finale: true, doubleElimination: false,
    }));
    await postMessage(
      `🔥 We've reached the Finale! Finalists: ${remainingAlive.map((p) => p.display_name).join(", ")}.\n\nEvery exiled player returns to vote for a winner. The Power of Chaos has been drawn by ${chaosHolder?.name || "no one"} among the exiled.`
    );
    return { advanced: true, to: PHASES.FINALE };
  }

  const nextRound = round.round + 1;
  await db.set(gameId, KEY_CHALLENGE, { round: nextRound, active: false, startedAt: null, endsAt: null, participantIds: [], reentryAttemptIds: [], placements: [], finalized: false });
  await db.update(gameId, KEY_ROUND, (fresh) => ({
    ...fresh, round: nextRound, phase: PHASES.CHALLENGE, phaseStartedAt: null, phaseEndsAt: null,
    finalFour: remainingAlive.length === 4, doubleElimination: false,
  }));
  await postMessage(`➡️ Round ${nextRound} begins. ${remainingAlive.length} players remain${remainingAlive.length === 4 ? " — this is the FINAL FOUR." : ""}. The host will start the next Challenge shortly.`);
  return { advanced: true, to: PHASES.CHALLENGE };
}

// ─── FINALE -> ENDED ───
async function advanceFromFinale(env) {
  const { gameId, db, client, postMessage, round } = env;
  const finale = await db.get(gameId, KEY_FINALE);
  if (!finale) return { advanced: false, reason: "no-finale-state" };

  const votes = (await db.get(gameId, `pb:finale-votes`)) || {};
  const voteRows = Object.entries(votes).map(([voterId, v]) => ({ voterId, targetId: v.targetId, reason: v.reason || null }));
  const finalistIds = finale.finalists.map((f) => f.playerId);

  const { data: secretRow } = await client
    .from("chaos_secrets")
    .select("nullified_player_id")
    .eq("game_id", gameId)
    .eq("context", "finale")
    .maybeSingle();
  const nullifiedId = secretRow?.nullified_player_id || null;

  const outcome = computeFinaleOutcome(voteRows, nullifiedId, finalistIds);

  if (outcome.needsTieBreak && !finale.tieBreakChoiceId) {
    await postMessage(`🃏 The finale vote is tied. Waiting on the exiled Power of Chaos holder to break the tie.`);
    return { advanced: false, reason: "waiting-on-tiebreak" };
  }

  const winnerId = outcome.needsTieBreak ? finale.tieBreakChoiceId : outcome.winnerId;
  const winner = finale.finalists.find((f) => f.playerId === winnerId);

  await db.update(gameId, KEY_FINALE, (fresh) => ({ ...(fresh || finale), nullifiedFinalistId: nullifiedId, voteRows, winnerId, revealed: true }));
  await db.update(gameId, KEY_ROUND, (fresh) => ({
    ...fresh, phase: PHASES.ENDED, phaseEndsAt: null, winnerId, winnerName: winner?.name || null,
  }));
  await postMessage(`🏆🔥 ${winner?.name || "No one"} wins Project B!`);
  return { advanced: true, to: PHASES.ENDED };
}
