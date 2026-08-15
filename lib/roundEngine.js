import { KEY_SETTINGS, KEY_ROUND, KEY_CHALLENGE, KEY_FATES, KEY_EXILE, KEY_EXILE_HISTORY, KEY_REENTRY, KEY_FINALE, KEY_CHALLENGE_HISTORY, PHASES, DEFAULT_SETTINGS } from "./gameState";
import { computeChallengeOutcome, placementsComplete, rankPlacements } from "./challengeLogic";
import { GAME_REGISTRY } from "./challengeGames";
import { scoresToPlacements } from "./challengeScores";
import { nominationsComplete, distinctNominees } from "./fatesLogic";
import { computeEliminateOutcome, computeSaveOutcome, computeFinaleOutcome, buildRevealOrder } from "./exileLogic";
import { REENTRY_STATUS, resolveReentryAttempt } from "./reentryLogic";
import { sendPushToGame } from "./sendPush";

// Fire-and-forget push notification for a round/phase change — never
// allowed to throw and break the actual round advance, since a
// notification failing to send is a minor inconvenience, not something
// that should ever block the game itself from progressing.
async function notifyRoundChange(gameId, title, body) {
  try {
    await sendPushToGame(gameId, { title, body, url: `/play?game=${gameId}`, tag: "round-change", filterColumn: "notify_rounds" });
  } catch (e) {
    console.error("Round-change push notify failed:", e);
  }
}

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
// nominations, or a tie needing the Power of Khaos holder's call), this
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
  // Alias-aware: round.phase can't be ENDED here (checked above), so
  // settings.aliasEnabled alone decides whether announcement text (and
  // everything else built from this map below — nominee/nominator names
  // baked into stored history, etc.) uses the alias or the real name.
  // Once the game actually ends, this same building block naturally
  // switches back to real names for anything generated from then on.
  players.forEach((p) => (playersById[p.id] = (settings.aliasEnabled && p.alias) || p.display_name));
  const alivePlayers = players.filter((p) => p.alive);

  // Safety net for a real, now-fixed bug: advanceFromExile used to set
  // exile.revealed = true in one write, then record KEY_EXILE_HISTORY in
  // a SEPARATE, later write — if anything interrupted execution between
  // those two (a network blip, any transient failure, even the old
  // exile-room chat bug from a few versions back), `revealed` stayed
  // true forever while history never got written, and since the retry
  // guard was "skip all of this if already revealed," it could never
  // self-heal through the normal path — the round would keep moving
  // forward (the actual elimination already happened), just with no
  // ceremony/voting-history record of it. recordExileHistoryIfMissing is
  // now the single source of truth for "has this round's exile actually
  // been recorded," decoupled from the revealed flag.
  //
  // This has to run BEFORE the `!force` gate below, not after it — that
  // gate can (and very often does) return early for perfectly ordinary
  // reasons, like the CURRENT round's challenge still being in progress.
  // Placed after the gate, this backfill would only ever run at the
  // exact moments the CURRENT round also happens to be ready to advance
  // — which, for a stale exile left over from an EARLIER round, could be
  // never. It needs to run on every single poll, independent of whatever
  // the current round is up to.
  const staleExile = await db.get(gameId, KEY_EXILE);
  // Debug breadcrumb — writes every time this check runs, what it saw,
  // and what it did about it, so this is inspectable directly via SQL
  // (select value from game_state where key = 'pb:debug-exile-backfill')
  // instead of needing Vercel's function logs. Temporary — safe to strip
  // once this is confirmed working.
  await db.update(gameId, "pb:debug-exile-backfill", (fresh) => {
    const list = fresh || [];
    const entry = {
      at: new Date().toISOString(),
      currentRound: round.round,
      currentPhase: round.phase,
      staleExileExists: !!staleExile,
      staleExileRound: staleExile?.round ?? null,
      staleExileRevealed: staleExile?.revealed ?? null,
      conditionMet: !!(staleExile?.revealed && staleExile.round < round.round),
    };
    return [...list, entry].slice(-20);
  });
  if (staleExile?.revealed && staleExile.round < round.round) {
    try {
      const ok = await recordExileHistoryIfMissing({ gameId, db, client }, staleExile);
      await db.update(gameId, "pb:debug-exile-backfill", (fresh) => {
        const list = fresh || [];
        list[list.length - 1] = { ...list[list.length - 1], recordResult: ok };
        return list;
      });
    } catch (backfillErr) {
      console.error("recordExileHistoryIfMissing threw", backfillErr);
      await db.update(gameId, "pb:debug-exile-backfill", (fresh) => {
        const list = fresh || [];
        list[list.length - 1] = { ...list[list.length - 1], recordError: String(backfillErr?.message || backfillErr) };
        return list;
      });
    }
  }

  // Passive housekeeping, independent of whether this call ends up
  // advancing anything below. None of this is gated by settings.autoAdvance
  // — that toggle protects against a TIMER prematurely forcing things
  // along while some players are still mid-decision (see the `!force`
  // block below); it was never meant to stop the game from moving on once
  // there's genuinely nothing left to wait for. The whole point of async
  // play is that nobody should need to be watching for this to happen.
  //
  // Re-entry: an exiled player's opt-in/opt-out window for THIS challenge
  // stays open until every alive competitor has actually finished —
  // that's the deadline, not the challenge's timer. Once that happens,
  // anyone still undecided defaults to "out" (costs them nothing — see
  // lib/reentryLogic.js). Digital challenges only: manual ones never add
  // an undecided reentrant to participantIds in the first place (the
  // host just enters results for whoever actually opted in), so there's
  // nothing to default.
  if (round.phase === PHASES.CHALLENGE) {
    const challenge = await db.get(gameId, KEY_CHALLENGE);
    if (challenge?.active && !challenge.finalized && challenge.gameType && challenge.gameType !== "manual") {
      // Computed live (who's currently PENDING), not from a snapshot
      // taken when the challenge started — a frozen snapshot could miss
      // someone (a race right after their exile, a host resetting the
      // round, anything), and this same list also needs to correctly
      // exclude reentrants from "alive participants" below regardless of
      // whether they were captured in any earlier snapshot.
      const reentryList = (await db.get(gameId, KEY_REENTRY)) || [];
      const eligibleIds = reentryList.filter((r) => r.status === REENTRY_STATUS.PENDING).map((r) => r.playerId);
      const undecided = eligibleIds.filter((id) => !challenge.reentryDecisions?.[id]);
      if (undecided.length > 0) {
        const eligibleSet = new Set(eligibleIds);
        const aliveParticipantIds = (challenge.participantIds || []).filter((id) => !eligibleSet.has(id));
        if (aliveParticipantIds.length > 0) {
          const scores = (await db.get(gameId, `pb:challenge-scores:${round.round}`)) || {};
          const aliveDone = aliveParticipantIds.every((id) => scores[id]?.locked);
          if (aliveDone) {
            await db.update(gameId, KEY_CHALLENGE, (fresh) => {
              if (!fresh) return fresh;
              const decisions = { ...(fresh.reentryDecisions || {}) };
              undecided.forEach((id) => { decisions[id] = "out"; });
              return { ...fresh, reentryDecisions: decisions };
            });
          }
        }
      }
    }
  } else if (round.phase === PHASES.EXILE) {
    // Once every eligible voter's ballot is in, close voting for them
    // automatically — saves the host a click, and is what lets
    // advancement below actually happen without anyone needing to be
    // present. This doesn't touch anything a live reveal ceremony
    // depends on (that's all local UI state on the host's own screen —
    // see ExileVoteHost.jsx / RoundRevealGate.jsx), it just means voting
    // itself is done the moment it's genuinely done.
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
    // Only auto-close voting once it's actually STARTED (phase ===
    // "voting") — finale.votingOpen starts false during the Q&A period
    // too (see the finale setup below), which otherwise looks
    // identical to "voting closed" to this same check.
    if (finale?.phase === "voting" && finale.votingOpen) {
      const voters = players.filter((p) => p.approved && !p.alive);
      const votes = (await db.get(gameId, "pb:finale-votes")) || {};
      if (voters.length > 0 && voters.every((p) => !!votes[p.id])) {
        await db.update(gameId, KEY_FINALE, (fresh) => (fresh ? { ...fresh, votingOpen: false } : fresh));
      }
    }
  }

  if (!force) {
    if (round.phase === PHASES.EXILE || round.phase === PHASES.FINALE) {
      // settings.autoAdvance is the host's off-switch for the round
      // actually finalizing/advancing on its own here — a host who wants
      // to run a live, unhurried reveal ceremony (drawing it out with
      // ExileVoteHost.jsx's own step-through, in their own time) can turn
      // this off and it'll always wait for their explicit "Finalize Exile
      // & Continue" click instead, however long that takes. Voting itself
      // still closes automatically the moment everyone's voted regardless
      // of this setting (see the housekeeping above) — that part doesn't
      // reveal or lock in anything, so there's no ceremony to protect by
      // leaving it open. With the default (on), once voting's closed —
      // whether that just happened above because everyone voted, or the
      // host closed it themselves — the round finishes on its own within
      // one poll tick, which is what makes "nobody needs to be watching"
      // actually true for async play.
      if (!settings.autoAdvance) return { advanced: false, reason: "auto-advance-disabled" };
      const stateKey = round.phase === PHASES.EXILE ? KEY_EXILE : KEY_FINALE;
      const liveState = await db.get(gameId, stateKey);
      if (liveState?.votingOpen) return { advanced: false, reason: "voting-still-open" };
      // Finale-only: votingOpen alone can't distinguish "still in the
      // Q&A period, voting hasn't started yet" from "voting genuinely
      // finished" — both look like votingOpen === false. phase ===
      // "voting" is what actually means voting has started; anything
      // else (still "qa") must never be treated as ready to finalize,
      // or the Finale would resolve itself the instant it's created,
      // with zero votes cast, before anyone's even seen the Q&A.
      if (round.phase === PHASES.FINALE && liveState?.phase !== "voting") {
        return { advanced: false, reason: "finale-qa-not-opened" };
      }
    } else {
      // Challenge / Fates: neither has any reveal ceremony to protect, so
      // "everyone's actually finished their part" always moves things
      // along — this is NOT gated by settings.autoAdvance, unlike
      // Exile/Finale above. See isPhaseFullyDone for what "done" means.
      const everyoneDone = await isPhaseFullyDone(db, gameId, round, players);
      if (!everyoneDone) {
        if (!settings.autoAdvance) return { advanced: false, reason: "auto-advance-disabled" };
        const timerUp = round.phaseEndsAt != null && now >= round.phaseEndsAt;
        if (!timerUp) return { advanced: false, reason: "timer-not-up" };
      }
    }
  }

  // Safety net for a real, now-fixed bug: advanceFromExile used to set
  // exile.revealed = true in one write, then record KEY_EXILE_HISTORY in
  // a SEPARATE, later write — if anything interrupted execution between
  // those two (a network blip, any transient failure, even the old
  // exile-room chat bug from a few versions back), `revealed` stayed
  // true forever while history never got written, and since the retry
  // guard was "skip all of this if already revealed," it could never
  // self-heal through the normal path — the round would keep moving
  // forward (the actual elimination already happened), just with no
  // ceremony/voting-history record of it. recordExileHistoryIfMissing is
  // now the single source of truth for "has this round's exile actually
  // been recorded," decoupled from the revealed flag, called both from
  // advanceFromExile's normal flow AND — much earlier in this function,
  // before the `!force` gate above, see the comment there for why —
  // unconditionally on every poll, so a stale, revealed-but-unrecorded
  // exile left over from an earlier round gets backfilled regardless of
  // what the CURRENT round is up to.

  if (round.phase === PHASES.CHALLENGE) return advanceFromChallenge({ gameId, db, client, postMessage, now, round, settings, players, alivePlayers, playersById });
  if (round.phase === PHASES.FATES) return advanceFromFates({ gameId, db, client, postMessage, now, round, settings, players, alivePlayers, playersById });
  if (round.phase === PHASES.EXILE) return advanceFromExile({ gameId, db, client, postMessage, now, round, settings, players, alivePlayers, playersById });
  if (round.phase === PHASES.FINALE) return advanceFromFinale({ gameId, db, client, postMessage, now, round, settings, players, alivePlayers, playersById });

  return { advanced: false, reason: "unknown-phase" };
}

// Independently retriable — the true test of "has this round's exile
// been recorded" is "does KEY_EXILE_HISTORY have an entry for it,"
// nothing else. Safe to call as many times as you want; only ever
// writes once. See the comment above advancePhase's call to this for the
// bug this specifically undoes.
async function recordExileHistoryIfMissing(env, exile) {
  const { gameId, db, client } = env;
  const historyList = (await db.get(gameId, KEY_EXILE_HISTORY)) || [];
  if (historyList.some((e) => e.round === exile.round)) return true;

  const votes = (await db.get(gameId, `pb:exile-votes:${exile.round}`)) || {};
  const voteRows = Object.entries(votes).map(([voterId, v]) => ({ voterId, targetId: v.targetId, reason: v.reason || null }));

  let nullifiedReason = null;
  if (exile.chaosNullifiedNomineeId) {
    const { data: secretRow } = await client
      .from("chaos_secrets")
      .select("reason")
      .eq("game_id", gameId)
      .eq("context", `exile:${exile.round}`)
      .maybeSingle();
    nullifiedReason = secretRow?.reason || null;
  }

  const historyRes = await db.update(gameId, KEY_EXILE_HISTORY, (fresh) => {
    const list = fresh || [];
    if (list.some((e) => e.round === exile.round)) return list; // recheck under the write — another poll may have just recorded it
    return [...list, {
      round: exile.round, nominees: exile.nominees, mode: exile.mode, exiledIds: exile.resultExiledIds || [],
      chaosHolderId: exile.chaosHolderId, nullifiedId: exile.chaosNullifiedNomineeId || null, nullifiedReason,
      tieBreakChoiceId: exile.tieBreakChoiceId || null,
      voteRows,
      revealOrder: buildRevealOrder(voteRows),
      fatesNominatorOrder: exile.fatesNominatorOrder || [],
      fatesNominations: exile.fatesNominations || {},
      fatesNominationReasons: exile.fatesNominationReasons || {},
    }];
  });
  return historyRes.ok;
}

// "Has everyone actually finished their part of this phase" — checked on
// every background poll (see lib/useRoundWatcher.js) so a challenge or a
// Fates nomination can move the game on the instant the LAST person
// finishes, without waiting on the phase timer (which might be long, or
// off entirely) or the host clicking "Finish Now".
//
// Deliberately NOT extended to the Exile Vote or the Finale: closing
// voting is the first step of the host's reveal (Fan of Cards, the
// step-through reveal, the in-app announcement post — see ExileVoteHost/FinaleHost),
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

// The Power of Khaos "draw" — secretly picks which of the N mystery
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
  // Final Four is about how many people are ALIVE once this challenge's
  // outcome is applied, not just "were there 4 alive going in" — a re-
  // entry attempt only changes that if the attempter actually WINS the
  // challenge (the only way they return; see the re-entry resolution
  // below). If they enter and don't place 1st, they're still eliminated
  // and the alive count stays at 4 — this is exactly the bug that let a
  // failed re-entrant who placed 2nd get treated as a normal top-3
  // finisher and given a nomination, instead of everyone-but-the-winner
  // being auto-nominated the way Final Four is supposed to work.
  const winnerId = rankPlacements(challenge.placements)[0]?.playerId || null;
  const winnerIsReturningReentrant = reentryAttemptIds.includes(winnerId);
  const isFinalFour = alivePlayers.length === 4 && !winnerIsReturningReentrant;
  const outcome = computeChallengeOutcome(challenge.placements, isFinalFour);

  // Everything below here writes to the database. None of those writes
  // are wrapped in one all-or-nothing transaction, so if one of them
  // fails partway through, the game can end up in a state that LOOKS
  // finished (challenge marked finalized, history recorded) but never
  // actually moved to the next phase — stuck exactly between the two.
  // Two things guard against that:
  //   1. `challenge.finalized` gates the "mark it done" writes so a retry
  //      (the host clicking "Finish Battle Now" again) doesn't record
  //      a duplicate history entry or re-resolve re-entry attempts a
  //      second time.
  //   2. Every write below has its result checked — a silent failure
  //      here used to mean the host saw nothing happen with no
  //      explanation. Now it throws, which pages/api/advance-phase.js
  //      turns into a real error message instead of a false "success."
  let doubleElimination = round.doubleElimination || false;

  if (!challenge.finalized) {
    // Resolve this round's re-entry attempts. Each exiled player decided,
    // deliberately, whether to opt into THIS challenge (see
    // lib/reentryData.js's setReentryDecision) — reentryAttemptIds only
    // ever contains players who actually opted in. Any number of them
    // can be attempting at once, but there's only ever one 1st place.
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
          await postMessage(`${updatedEntry.name} opted into this challenge and did not finish 1st — they are eliminated forever.`);
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
    // outcome.autoNominees is "every participant except the winner" —
    // which, whenever a re-entry attempt happened this round, would
    // otherwise include the just-failed re-entrant. They lost their one
    // shot and are eliminated forever (see the resolution above); they
    // aren't part of the alive roster anymore and can't be a nominee in
    // an Exile Vote they're no longer eligible for.
    const finalFourNominees = outcome.autoNominees.filter((n) => !reentryAttemptIds.includes(n.playerId));
    const existingExile = await db.get(gameId, KEY_EXILE);
    if (!existingExile || existingExile.round !== round.round) {
      await secretlyPickChaosButton(client, gameId, `exile:${round.round}`, alivePlayers.length);
      if (!(await db.set(gameId, KEY_EXILE, {
        round: round.round,
        nominees: finalFourNominees.map((n) => ({ playerId: n.playerId, name: n.name })),
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
      `In Olympus, all crave power. Power, however, comes at a cost. Whom are you willing to betray, to manipulate, to exile?\n\n⚔️ Final Four Battle complete!\n\n🏆 ${outcome.winner?.name} finishes 1st and is safe.\n\nAt the Final Four, everyone else is automatically nominated: ${finalFourNominees.map((n) => n.name).join(", ")}.\n\n➡️ Moving straight to the Exile Vote.`
    );
    await notifyRoundChange(gameId, "🗳️ Exile Vote — Final Four", `${outcome.winner?.name} is safe. Time to vote.`);
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
    `The fates come for us all. In Greek legend, three decide your fate — one weaves, one measures, one cuts. Today, your fate lies in the hands of three of your fellow players. Whose thread will be permanently cut short?\n\n⚔️ Battle complete!\n\n🏆 ${outcome.winner?.name} finishes 1st and wins immunity.\n\nNominating this Fates Ceremony (in finishing order): ${outcome.nominators.map((n) => n.name).join(", ")}.\n\n➡️ Moving to the Fates Ceremony.`
  );
  await notifyRoundChange(gameId, "⚖️ Fates Ceremony", `${outcome.winner?.name} won immunity. Nominations are open.`);
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
    fatesNominationReasons: fates.nominationReasons || {},
  });
  const roundRes = await db.update(gameId, KEY_ROUND, (fresh) => ({
    ...fresh, phase: PHASES.EXILE, phaseStartedAt: now, phaseEndsAt: settings.infiniteTime ? null : now + settings.voteDurationSec * 1000,
  }));
  if (!roundRes.ok) throw new Error("Couldn't move the round to the Exile Vote — try again.");
  await postMessage(
    `In Olympus, all crave power. Power, however, comes at a cost. Whom are you willing to betray, to manipulate, to exile?\n\n⚖️ Fates Ceremony complete!\n\nNominees for exile: ${nominees.map((n) => n.name).join(", ")}.\n\n🃏 The Power of Khaos is up for grabs this round — everyone gets one shot to claim it.\n\n➡️ Moving to the Exile Vote${round.doubleElimination ? " — this is a DOUBLE ELIMINATION round, so votes are cast to SAVE, not eliminate." : ""}.`
  );
  await notifyRoundChange(gameId, "🗳️ Exile Vote", `Nominees: ${nominees.map((n) => n.name).join(", ")}. Time to vote.`);
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
    .select("nullified_player_id, reason")
    .eq("game_id", gameId)
    .eq("context", `exile:${round.round}`)
    .maybeSingle();
  const nullifiedId = secretRow?.nullified_player_id || null;
  const nullifiedReason = secretRow?.reason || null;

  let exiledIds = [];
  let summary = "";

  if (exile.mode === "save") {
    const outcome = computeSaveOutcome(voteRows, nullifiedId, nomineeIds);
    if (outcome.needsTieBreak && !exile.tieBreakChoiceId) {
      // Guarded so this only ever posts ONCE per tie, not on every poll
      // while the tie sits unresolved (advanceFromExile gets called
      // roughly every 4 seconds by useRoundWatcher — with no guard here,
      // it reposted the same "waiting on the tiebreak" message every
      // single cycle for as long as the tie lasted).
      if (!exile.tieBreakAnnounced) {
        await postMessage(`🃏 The vote to save is tied. Waiting on the Power of Khaos holder to break the tie.`);
        await db.update(gameId, KEY_EXILE, (fresh) => (fresh ? { ...fresh, tieBreakAnnounced: true } : fresh));
      }
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
      // Same guard as above, same reasoning.
      if (!exile.tieBreakAnnounced) {
        await postMessage(`🃏 The vote is tied. Waiting on the Power of Khaos holder to break the tie.`);
        await db.update(gameId, KEY_EXILE, (fresh) => (fresh ? { ...fresh, tieBreakAnnounced: true } : fresh));
      }
      return { advanced: false, reason: "waiting-on-tiebreak" };
    }
    const exiledId = outcome.needsTieBreak ? exile.tieBreakChoiceId : outcome.exiledId;
    exiledIds = exiledId ? [exiledId] : [];
    const byId = {};
    exile.nominees.forEach((n) => (byId[n.playerId] = n.name));
    summary = exiledId ? `💀 ${byId[exiledId] || "?"} has been exiled.` : `No one received a countable vote — no one is exiled this round.`;
  }

  // The exile-marking loop below IS gated by `exile.revealed` — mostly to
  // avoid redundant work on a retry, not to prevent corruption; every
  // write inside it is independently idempotent (setPlayerAlive just
  // re-sets the same value, the KEY_REENTRY update and the exile-room add
  // both have their own dedup guards). The history write, on the other
  // hand, used to be INSIDE this same gated block, tied to the same
  // `revealed` flag — which was the actual bug: `revealed` got set to
  // true in its own write, separate from and before the history write,
  // so anything interrupting execution between those two (a network
  // blip, any transient failure) left revealed=true forever with no
  // history ever recorded, and no way for a retry to fix it, since
  // "already revealed" skipped the whole block including history from
  // then on. recordExileHistoryIfMissing (see above) is now called
  // unconditionally below, decoupled from `revealed` — its own real
  // source of truth is "does KEY_EXILE_HISTORY actually have this round
  // yet," so it keeps retrying on its own until it actually succeeds,
  // regardless of what revealed says.
  if (!exile.revealed) {
    for (const id of exiledIds) {
      await setPlayerAlive(client, id, false, "exiled");
      const name = exile.nominees.find((n) => n.playerId === id)?.name || "?";
      await db.update(gameId, KEY_REENTRY, (fresh) => {
        const list = fresh || [];
        if (list.some((r) => r.playerId === id)) return list;
        return [...list, { playerId: id, name, status: REENTRY_STATUS.PENDING, exiledRound: round.round }];
      });
      // Chat's Exile Room (see sql/add-group-chat.sql) — creates the room
      // on the first exile of the season if it doesn't exist yet, then
      // adds this player. Best-effort, genuinely: chat being off, or the
      // migration not being run/succeeded yet, must NEVER be able to
      // block an actual exile from finalizing.
      try {
        const { error: chatErr } = await client.rpc("add_to_exile_room", { p_game_id: gameId, p_player_id: id });
        if (chatErr) console.error("add_to_exile_room failed (non-fatal)", chatErr);
      } catch (chatErr) {
        console.error("add_to_exile_room threw (non-fatal)", chatErr);
      }
    }

    // Now that it's genuinely been revealed, mirror the secret into the
    // public record — this is what lets HistoryTab/the voting spreadsheet
    // show it after the fact without needing continued access to
    // chaos_secrets itself.
    const revealRes = await db.update(gameId, KEY_EXILE, (fresh) => ({ ...(fresh || exile), chaosNullifiedNomineeId: nullifiedId, resultExiledIds: exiledIds, revealed: true }));
    if (!revealRes.ok) throw new Error("Couldn't reveal the vote — try again.");
    await postMessage(summary);
  }

  const historyOk = await recordExileHistoryIfMissing(
    { gameId, db, client },
    { ...exile, chaosNullifiedNomineeId: nullifiedId, resultExiledIds: exiledIds }
  );
  if (!historyOk) throw new Error("Couldn't record the exile result — try again.");

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
        // Starts in the Q&A period (statements + jury questions/
        // responses — see lib/finaleQaData.js), not straight into
        // voting — the host opens voting explicitly once that's done
        // (FinaleHost.jsx). phase is what actually distinguishes "still
        // in Q&A" from "voting genuinely closed" — votingOpen is false
        // in both, see the comment on the advance-gate above.
        phase: "qa",
        votingOpen: false,
        tieBreakChoiceId: null,
        winnerId: null,
        revealed: false,
      }))) throw new Error("Couldn't set up the Finale — try again.");
    }
    // No phase timer yet — the Q&A period is host-paced (however long
    // they want), and the real voting countdown only starts once the
    // host actually opens voting (FinaleHost.jsx sets a fresh
    // phaseEndsAt at that point).
    const roundRes = await db.update(gameId, KEY_ROUND, (fresh) => ({
      ...fresh, phase: PHASES.FINALE, phaseStartedAt: now, phaseEndsAt: null,
      finale: true, doubleElimination: false,
    }));
    if (!roundRes.ok) throw new Error("Couldn't move the round to the Finale — try again.");
    await postMessage(
      `🔥 We've reached the Finale! Finalists: ${remainingAlive.map((p) => p.display_name).join(", ")}.\n\nFinalists can write their statement, and the jury can ask questions — every finalist can respond. Once that's done, the host opens voting: every exiled player who didn't quit or wasn't removed votes for a winner, and the Power of Khaos is up for grabs among them too.`
    );
    await notifyRoundChange(gameId, "🔥 The Finale", `Finalists: ${remainingAlive.map((p) => p.display_name).join(", ")}.`);
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
  await postMessage(`➡️ Round ${nextRound} begins. ${remainingAlive.length} players remain${remainingAlive.length === 4 ? " — this is the FINAL FOUR." : ""}. The host will start the next Battle shortly.\n\nFrom Achilles to Odysseus, legends are forged on the battlefield. Today, you go to battle. Will you become a legend in your own right?`);
  await notifyRoundChange(gameId, `⚔️ Round ${nextRound} Begins`, `${remainingAlive.length} players remain. A new Battle is coming up.`);
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
    .select("nullified_player_id, reason")
    .eq("game_id", gameId)
    .eq("context", "finale")
    .maybeSingle();
  const nullifiedId = secretRow?.nullified_player_id || null;
  const nullifiedReason = secretRow?.reason || null;

  const outcome = computeFinaleOutcome(voteRows, nullifiedId, finalistIds, finale.tieBreakChoiceId);

  if (outcome.needsTieBreak && !finale.tieBreakChoiceId) {
    // Same guard/reasoning as advanceFromExile above — only post once per
    // tie, not on every ~4-second poll while it's unresolved.
    if (!finale.tieBreakAnnounced) {
      await postMessage(`🃏 The finale vote is tied. Waiting on the exiled Power of Khaos holder to break the tie.`);
      await db.update(gameId, KEY_FINALE, (fresh) => (fresh ? { ...fresh, tieBreakAnnounced: true } : fresh));
    }
    return { advanced: false, reason: "waiting-on-tiebreak" };
  }

  const winnerId = outcome.winnerId;
  const winner = finale.finalists.find((f) => f.playerId === winnerId);
  const placements = outcome.placements || [];

  const finaleRes = await db.update(gameId, KEY_FINALE, (fresh) => ({
    ...(fresh || finale), nullifiedFinalistId: nullifiedId, nullifiedReason, voteRows, winnerId, placements, revealed: true,
  }));
  if (!finaleRes.ok) throw new Error("Couldn't reveal the finale vote — try again.");
  const roundRes = await db.update(gameId, KEY_ROUND, (fresh) => ({
    ...fresh, phase: PHASES.ENDED, phaseEndsAt: null, winnerId, winnerName: winner?.name || null,
  }));
  if (!roundRes.ok) throw new Error("Couldn't end the game — try again.");
  const runnerUp = placements.find((p) => p.place === 2);
  const third = placements.find((p) => p.place === 3);
  const runnerUpName = runnerUp ? finale.finalists.find((f) => f.playerId === runnerUp.playerId)?.name : null;
  const thirdName = third ? finale.finalists.find((f) => f.playerId === third.playerId)?.name : null;
  await postMessage(
    `🏆🔥 ${winner?.name || "No one"} wins Project B!` +
    (runnerUpName ? `\n🥈 ${runnerUpName} finishes 2nd.` : "") +
    (thirdName ? `\n🥉 ${thirdName} finishes 3rd${nullifiedId === third?.playerId ? " — nullified by the Power of Khaos" : ""}.` : "")
  );
  return { advanced: true, to: PHASES.ENDED };
}
