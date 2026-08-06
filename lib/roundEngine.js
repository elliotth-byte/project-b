import { KEY_SETTINGS, KEY_ROUND, KEY_CHALLENGE, KEY_FATES, KEY_EXILE, KEY_EXILE_HISTORY, KEY_REENTRY, KEY_FINALE, KEY_CHALLENGE_HISTORY, PHASES, DEFAULT_SETTINGS } from "./gameState";
import { computeChallengeOutcome, placementsComplete } from "./challengeLogic";
import { GAME_REGISTRY } from "./challengeGames";
import { scoresToPlacements } from "./challengeScores";
import { nominationsComplete, distinctNominees } from "./fatesLogic";
import { computeEliminateOutcome, computeSaveOutcome, computeFinaleOutcome } from "./exileLogic";
import { REENTRY_STATUS, resolveReentryAttempt } from "./reentryLogic";

// ============================================================
// advancePhase(gameId, ctx) — the single function that knows how to move
// a Project B game from whatever phase it's currently in to the next one,
// IF that phase's timer has elapsed, OR everyone's already finished their
// part (every competitor done with the challenge, all 3 Fates nominations
// in — see isPhaseFullyDone), OR `force` is passed (the host's manual
// "Finish Now" button). It's deliberately IO-agnostic: `ctx.db` is
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

  const settingsRaw = await db.get(gameId, KEY_SETTINGS);
  const settings = { ...DEFAULT_SETTINGS, ...(settingsRaw || {}) };

  const { data: playersRows } = await client.from("players").select("*").eq("game_id", gameId);
  const players = playersRows || [];
  const playersById = {};
  players.forEach((p) => (playersById[p.id] = p.display_name));
  const alivePlayers = players.filter((p) => p.alive);

  // Passive housekeeping, independent of whether this call ends up
  // advancing anything below: once every eligible voter's ballot is in,
  // close voting for them automatically — saves the host a click. This is
  // safe in a way advancing the ROUND isn't: it doesn't touch anything
  // the host's reveal ceremony depends on (that's all local UI state on
  // their own screen — see isPhaseFullyDone's comment below), it just
  // means "Close Voting" is often already done by the time they get to
  // it.
  if (settings.autoAdvance) {
    if (round.phase === PHASES.EXILE) {
      const exile = await db.get(gameId, KEY_EXILE);
      if (exile?.votingOpen) {
        const voters = players.filter((p) => p.approved && p.alive);
        const votes = (await db.get(gameId, `pb:exile-votes:${round.round}`)) || {};
        if (voters.length > 0 && voters.every((p) => !!votes[p.id])) {
          await db.update(gameId, KEY_EXILE, (fresh) => (fresh ? { ...fresh, votingOpen: false } : fresh));
        }
      }
    } else if (round.phase === PHASES.FINALE) {
      const finale = await db.get(gameId, KEY_FINALE);
      if (finale?.votingOpen) {
        const voters = players.filter((p) => p.approved && !p.alive);
        const votes = (await db.get(gameId, "pb:finale-votes")) || {};
        if (voters.length > 0 && voters.every((p) => !!votes[p.id])) {
          await db.update(gameId, KEY_FINALE, (fresh) => (fresh ? { ...fresh, votingOpen: false } : fresh));
        }
      }
    }
  }

  if (!force) {
    // settings.autoAdvance is the host's master off-switch for BOTH kinds
    // of automatic advancement below (see AdminHost.jsx) — a host running
    // a live Exile Vote / Finale reveal ceremony may want it off so the
    // round doesn't jump forward mid-ceremony; everything still works via
    // the "Finish Now" button either way.
    if (!settings.autoAdvance) return { advanced: false, reason: "auto-advance-disabled" };

    const timerUp = round.phaseEndsAt != null && now >= round.phaseEndsAt;
    if (!timerUp) {
      // Even if the timer's still running (or there IS no timer — infinite
      // time), don't make everyone wait once they've all actually finished
      // their part: every participant done with the challenge, all three
      // Fates nominations in, or every eligible voter's ballot cast. See
      // isPhaseFullyDone for what "done" means per phase.
      const everyoneDone = await isPhaseFullyDone(db, gameId, round, players);
      if (!everyoneDone) return { advanced: false, reason: "timer-not-up" };
    }
  }

  if (round.phase === PHASES.CHALLENGE) return advanceFromChallenge({ gameId, db, client, postMessage, now, round, settings, players, alivePlayers, playersById });
  if (round.phase === PHASES.FATES) return advanceFromFates({ gameId, db, client, postMessage, now, round, settings, players, alivePlayers, playersById });
  if (round.phase === PHASES.EXILE) return advanceFromExile({ gameId, db, client, postMessage, now, round, settings, players, alivePlayers, playersById });
  if (round.phase === PHASES.FINALE) return advanceFromFinale({ gameId, db, client, postMessage, now, round, settings, players, alivePlayers, playersById });

  return { advanced: false, reason: "unknown-phase" };
}

// "Has everyone actually finished their part of this phase" — checked on
// every background poll (see lib/useRoundWatcher.js) so a challenge or a
// Fates nomination can move the game on the instant the LAST person
// finishes, without waiting on the phase timer (which might be long, or
// off entirely) or the host clicking "Finish Now".
//
// Deliberately NOT extended to the Exile Vote or the Finale: closing
// voting is the first step of the host's reveal (Fan of Cards, the
// step-through reveal, the GroupMe post — see ExileVoteHost/FinaleHost),
// and none of that pacing is stored anywhere this function could check —
// it's local UI state on the host's own screen. Auto-advancing the
// instant the last vote comes in would risk yanking the round forward
// mid-ceremony the moment the host closes voting. Those two phases still
// move on via the timer or an explicit "Finish Now" click, same as
// always.
async function isPhaseFullyDone(db, gameId, round, players) {
  if (round.phase === PHASES.CHALLENGE) {
    const challenge = await db.get(gameId, KEY_CHALLENGE);
    if (!challenge || !challenge.active) return false;
    const participantIds = challenge.participantIds || [];
    if (participantIds.length === 0) return false;
    if (challenge.gameType && challenge.gameType !== "manual") {
      const scores = (await db.get(gameId, `pb:challenge-scores:${round.round}`)) || {};
      return participantIds.every((id) => scores[id]?.locked);
    }
    return placementsComplete(challenge.placements, participantIds.length);
  }

  if (round.phase === PHASES.FATES) {
    const fates = await db.get(gameId, KEY_FATES);
    if (!fates) return false;
    return nominationsComplete(fates.nominatorOrder, fates.nominations);
  }

  return false;
}

async function setPlayerAlive(client, playerId, alive, eliminationType) {
  await client.from("players").update({ alive, elimination_type: eliminationType }).eq("id", playerId);
}

// The Power of Chaos "draw" — secretly picks which of the N mystery
// buttons players will see (N = however many players are actually in
// the draw) is the real one. Stored in chaos_secrets (see
// sql/add-chaos-draw-index.sql) under a "draw:" context prefix — only
// ever read by pages/api/chaos-draw.js using the service-role key; its
// own RLS (host or the CURRENT chaosHolderId only) would otherwise block
// every player from reading it anyway, since chaosHolderId isn't set yet
// at this point. Nobody's browser ever sees this value directly.
async function secretlyPickChaosButton(client, gameId, context, buttonCount) {
  const n = Math.max(1, buttonCount || 1);
  const winningIndex = Math.floor(Math.random() * n);
  await client.from("chaos_secrets").upsert(
    { game_id: gameId, context: `draw:${context}`, draw_index: winningIndex, updated_at: new Date().toISOString() },
    { onConflict: "game_id,context" }
  );
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

  // Everything below here writes to the database. None of those writes
  // are wrapped in one all-or-nothing transaction, so if one of them
  // fails partway through, the game can end up in a state that LOOKS
  // finished (challenge marked finalized, history recorded) but never
  // actually moved to the next phase — stuck exactly between the two.
  // Two things guard against that:
  //   1. `challenge.finalized` gates the "mark it done" writes so a retry
  //      (the host clicking "Finish Challenge Now" again) doesn't record
  //      a duplicate history entry or re-resolve re-entry attempts a
  //      second time.
  //   2. Every write below has its result checked — a silent failure
  //      here used to mean the host saw nothing happen with no
  //      explanation. Now it throws, which pages/api/advance-phase.js
  //      turns into a real error message instead of a false "success."
  let doubleElimination = round.doubleElimination || false;

  if (!challenge.finalized) {
    // Resolve every re-entry attempt running this round. Any number of
    // exiled players can try at once, but there's only ever one 1st
    // place — whichever attempter (if any) actually finishes 1st overall
    // returns; everyone else who tried uses up their one shot regardless
    // of how they did against the OTHER attempters.
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
      if (!(await db.set(gameId, KEY_REENTRY, list))) throw new Error("Couldn't save re-entry results — try again.");
    }

    const finalizeRes = await db.update(gameId, KEY_CHALLENGE, (fresh) => ({ ...(fresh || challenge), finalized: true }));
    if (!finalizeRes.ok) throw new Error("Couldn't finalize the challenge — try again.");

    const historyRes = await db.update(gameId, KEY_CHALLENGE_HISTORY, (fresh) => {
      const list = fresh || [];
      if (list.some((c) => c.round === round.round)) return list; // already recorded (a retry) — don't duplicate
      return [...list, { round: round.round, placements: challenge.placements, winnerId: outcome.winner?.playerId || null, finalFour: isFinalFour, gameType: challenge.gameType || "manual" }];
    });
    if (!historyRes.ok) throw new Error("Couldn't record the challenge result — try again.");
  }

  if (isFinalFour) {
    const existingExile = await db.get(gameId, KEY_EXILE);
    if (!existingExile || existingExile.round !== round.round) {
      await secretlyPickChaosButton(client, gameId, `exile:${round.round}`, alivePlayers.length);
      if (!(await db.set(gameId, KEY_EXILE, {
        round: round.round,
        nominees: outcome.autoNominees.map((n) => ({ playerId: n.playerId, name: n.name })),
        mode: doubleElimination ? "save" : "eliminate",
        // Nobody's won the draw yet — see secretlyPickChaosButton above
        // and pages/api/chaos-draw.js for how this gets claimed.
        chaosHolderId: null,
        chaosNullifiedNomineeId: null,
        votingOpen: true,
        tieBreakChoiceId: null,
        resultExiledIds: [],
        revealed: false,
      }))) throw new Error("Couldn't set up the Exile Vote — try again.");
    }
    const roundRes = await db.update(gameId, KEY_ROUND, (fresh) => ({
      ...fresh, phase: PHASES.EXILE, phaseStartedAt: now, phaseEndsAt: settings.infiniteTime ? null : now + settings.voteDurationSec * 1000,
      finalFour: true, doubleElimination,
    }));
    if (!roundRes.ok) throw new Error("Couldn't move the round to the Exile Vote — try again.");
    await postMessage(
      `⚔️ Final Four Challenge complete!\n\n🏆 ${outcome.winner?.name} finishes 1st and is safe.\n\nAt the Final Four, everyone else is automatically nominated: ${outcome.autoNominees.map((n) => n.name).join(", ")}.\n\n➡️ Moving straight to the Exile Vote.`
    );
    return { advanced: true, to: PHASES.EXILE };
  }

  const existingFates = await db.get(gameId, KEY_FATES);
  if (!existingFates || existingFates.round !== round.round) {
    if (!(await db.set(gameId, KEY_FATES, {
      round: round.round,
      nominatorOrder: outcome.nominators.map((n) => ({ playerId: n.playerId, name: n.name, place: n.place })),
      nominations: {},
      locked: false,
    }))) throw new Error("Couldn't set up the Fates Ceremony — try again.");
  }
  const roundRes = await db.update(gameId, KEY_ROUND, (fresh) => ({
    ...fresh, phase: PHASES.FATES, phaseStartedAt: now, phaseEndsAt: settings.infiniteTime ? null : now + settings.fatesDurationSec * 1000,
    finalFour: false, doubleElimination,
  }));
  if (!roundRes.ok) throw new Error("Couldn't move the round to the Fates Ceremony — try again.");
  await postMessage(
    `⚔️ Challenge complete!\n\n🏆 ${outcome.winner?.name} finishes 1st and wins immunity.\n\nNominating this Fates Ceremony (in finishing order): ${outcome.nominators.map((n) => n.name).join(", ")}.\n\n➡️ Moving to the Fates Ceremony.`
  );
  return { advanced: true, to: PHASES.FATES };
}

// ─── FATES -> EXILE ───
async function advanceFromFates(env) {
  const { gameId, db, client, postMessage, now, round, settings, alivePlayers, playersById } = env;
  const fates = await db.get(gameId, KEY_FATES);
  if (!fates) return { advanced: false, reason: "no-fates-state" };
  if (!nominationsComplete(fates.nominatorOrder, fates.nominations)) {
    return { advanced: false, reason: "waiting-on-nominations" };
  }

  const nominees = distinctNominees(fates.nominatorOrder, fates.nominations, playersById);
  await secretlyPickChaosButton(client, gameId, `exile:${round.round}`, alivePlayers.length);

  await db.set(gameId, KEY_EXILE, {
    round: round.round,
    nominees,
    mode: round.doubleElimination ? "save" : "eliminate",
    // Nobody's won the draw yet — see secretlyPickChaosButton and
    // pages/api/chaos-draw.js for how this gets claimed.
    chaosHolderId: null,
    chaosNullifiedNomineeId: null,
    votingOpen: true,
    tieBreakChoiceId: null,
    resultExiledIds: [],
    revealed: false,
    // Carried along so the Fates Ceremony's who-nominated-whom detail
    // survives into KEY_EXILE_HISTORY below — otherwise it's lost the
    // moment the NEXT round's Fates ceremony overwrites KEY_FATES, and
    // players would have no way to review it after the fact.
    fatesNominatorOrder: fates.nominatorOrder,
    fatesNominations: fates.nominations,
  });
  const roundRes = await db.update(gameId, KEY_ROUND, (fresh) => ({
    ...fresh, phase: PHASES.EXILE, phaseStartedAt: now, phaseEndsAt: settings.infiniteTime ? null : now + settings.voteDurationSec * 1000,
  }));
  if (!roundRes.ok) throw new Error("Couldn't move the round to the Exile Vote — try again.");
  await postMessage(
    `⚖️ Fates Ceremony complete!\n\nNominees for exile: ${nominees.map((n) => n.name).join(", ")}.\n\n🃏 The Power of Chaos is up for grabs this round — everyone gets one shot to claim it.\n\n➡️ Moving to the Exile Vote${round.doubleElimination ? " — this is a DOUBLE ELIMINATION round, so votes are cast to SAVE, not eliminate." : ""}.`
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

  // Same idempotency reasoning as advanceFromChallenge: gate the
  // "actually apply this result" writes behind `exile.revealed` so a
  // retry (whether that's the host clicking again or a background
  // re-check) can't double-eliminate someone or double-append history,
  // while still letting the round-transition step below run/retry freely.
  if (!exile.revealed) {
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
    const revealRes = await db.update(gameId, KEY_EXILE, (fresh) => ({ ...(fresh || exile), chaosNullifiedNomineeId: nullifiedId, resultExiledIds: exiledIds, revealed: true }));
    if (!revealRes.ok) throw new Error("Couldn't reveal the vote — try again.");
    const historyRes = await db.update(gameId, KEY_EXILE_HISTORY, (fresh) => {
      const list = fresh || [];
      if (list.some((e) => e.round === round.round)) return list; // already recorded (a retry) — don't duplicate
      return [...list, {
        round: round.round, nominees: exile.nominees, mode: exile.mode, exiledIds,
        chaosHolderId: exile.chaosHolderId, nullifiedId, tieBreakChoiceId: exile.tieBreakChoiceId || null,
        voteRows,
        // Fates Ceremony detail for this same round, if there was one (the
        // Final Four skips straight to Exile with no nominations) — see
        // advanceFromFates for where these get attached to `exile`.
        fatesNominatorOrder: exile.fatesNominatorOrder || [],
        fatesNominations: exile.fatesNominations || {},
      }];
    });
    if (!historyRes.ok) throw new Error("Couldn't record the exile result — try again.");
    await postMessage(summary);
  }

  // `players` was fetched before this function ran, so on a retry (after
  // exile.revealed is already true) it wouldn't reflect eliminations just
  // applied above — recompute from exile.resultExiledIds instead of the
  // possibly-stale `exiledIds`/`players` closed over above.
  const appliedExiledIds = exile.revealed ? (exile.resultExiledIds || []) : exiledIds;
  const remainingAlive = players.filter((p) => p.alive && !appliedExiledIds.includes(p.id));

  if (remainingAlive.length <= 1) {
    const winner = remainingAlive[0];
    const roundRes = await db.update(gameId, KEY_ROUND, (fresh) => ({
      ...fresh, phase: PHASES.ENDED, phaseEndsAt: null, winnerId: winner?.id || null, winnerName: winner?.display_name || null,
    }));
    if (!roundRes.ok) throw new Error("Couldn't end the game — try again.");
    await postMessage(winner ? `🏆 ${winner.display_name} is the last one standing and WINS the game!` : `The game has ended with no winner.`);
    return { advanced: true, to: PHASES.ENDED };
  }

  if (remainingAlive.length <= 3) {
    const existingFinale = await db.get(gameId, KEY_FINALE);
    if (!existingFinale) {
      const exiledPool = players.filter((p) => !p.alive);
      await secretlyPickChaosButton(client, gameId, "finale", exiledPool.length);
      if (!(await db.set(gameId, KEY_FINALE, {
        finalists: remainingAlive.map((p) => ({ playerId: p.id, name: p.display_name })),
        // Nobody's won the draw yet — see secretlyPickChaosButton and
        // pages/api/chaos-draw.js for how this gets claimed.
        chaosHolderId: null,
        nullifiedFinalistId: null,
        votingOpen: true,
        tieBreakChoiceId: null,
        winnerId: null,
        revealed: false,
      }))) throw new Error("Couldn't set up the Finale — try again.");
    }
    const roundRes = await db.update(gameId, KEY_ROUND, (fresh) => ({
      ...fresh, phase: PHASES.FINALE, phaseStartedAt: now, phaseEndsAt: settings.infiniteTime ? null : now + settings.voteDurationSec * 1000,
      finale: true, doubleElimination: false,
    }));
    if (!roundRes.ok) throw new Error("Couldn't move the round to the Finale — try again.");
    await postMessage(
      `🔥 We've reached the Finale! Finalists: ${remainingAlive.map((p) => p.display_name).join(", ")}.\n\nEvery exiled player returns to vote for a winner. The Power of Chaos is up for grabs among the exiled — everyone gets one shot to claim it.`
    );
    return { advanced: true, to: PHASES.FINALE };
  }

  const nextRound = round.round + 1;
  const existingNextChallenge = await db.get(gameId, KEY_CHALLENGE);
  if (!existingNextChallenge || existingNextChallenge.round !== nextRound) {
    if (!(await db.set(gameId, KEY_CHALLENGE, { round: nextRound, active: false, startedAt: null, endsAt: null, participantIds: [], reentryAttemptIds: [], placements: [], finalized: false })))
      throw new Error("Couldn't set up the next round — try again.");
  }
  const roundRes = await db.update(gameId, KEY_ROUND, (fresh) => ({
    ...fresh, round: nextRound, phase: PHASES.CHALLENGE, phaseStartedAt: null, phaseEndsAt: null,
    finalFour: remainingAlive.length === 4, doubleElimination: false,
  }));
  if (!roundRes.ok) throw new Error("Couldn't move to the next round — try again.");
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

  const finaleRes = await db.update(gameId, KEY_FINALE, (fresh) => ({ ...(fresh || finale), nullifiedFinalistId: nullifiedId, voteRows, winnerId, revealed: true }));
  if (!finaleRes.ok) throw new Error("Couldn't reveal the finale vote — try again.");
  const roundRes = await db.update(gameId, KEY_ROUND, (fresh) => ({
    ...fresh, phase: PHASES.ENDED, phaseEndsAt: null, winnerId, winnerName: winner?.name || null,
  }));
  if (!roundRes.ok) throw new Error("Couldn't end the game — try again.");
  await postMessage(`🏆🔥 ${winner?.name || "No one"} wins Project B!`);
  return { advanced: true, to: PHASES.ENDED };
}
