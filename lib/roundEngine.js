import { KEY_SETTINGS, KEY_ROUND, KEY_CHALLENGE, KEY_FATES, KEY_EXILE, KEY_EXILE_HISTORY, KEY_REENTRY, KEY_FINALE, KEY_CHALLENGE_HISTORY, PHASES, DEFAULT_SETTINGS } from "./gameState";
import { computeChallengeOutcome, placementsComplete, rankPlacements } from "./challengeLogic";
import { GAME_REGISTRY, gameConfigWithDefaults } from "./challengeGames";
import { scoresToPlacements } from "./challengeScores";
import { applyZeusPower, computeAresImmunityUpdates, overrideStatusForHades, filterCancelledVote, powerFor, aphroditeBlocksTargeting, findAresImmunePlayerId } from "./characterPowers";
import { pickRandomChallenge, pickHephaestusOptions, hephaestusDrawKey, randomPickKey } from "./challengeSelection";
import { fetchGloballyDisabledChallenges } from "./platformSettings";
import { nominationsComplete, distinctNominees, takenNomineeIds, autoPickNominee, formatDurationHours, isNominatorsTurn, resolveNominationFromPreferences } from "./fatesLogic";
import { computeEliminateOutcome, computeSaveOutcome, computeFinaleOutcome, buildRevealOrder } from "./exileLogic";
import { REENTRY_STATUS, resolveReentryAttempt } from "./reentryLogic";
import { sendPushToGame, sendPushToHosts } from "./sendPush";
import { initPlinkoBracket } from "./games/plinkoBracketData";
import { initPit } from "./games/pitData";
import { initMasquerade, advanceAfterReveal as advanceMasqueradeReveal, masqueradeKey, REVEAL_DISPLAY_MS as MASQUERADE_REVEAL_DISPLAY_MS, placementValue as masqueradePlacementValue } from "./games/masqueradeData";
import { initCloseToTwenty } from "./games/closeToTwentyData";
import { initTorched, startShootingPhase, placementValue as torchedPlacementValue, torchedKey } from "./games/torchedData";
import { isShielded, nextStrikeState, isStrikeDecayRound, decayedStrikeCount, meetsInstantRemovalCriteria } from "./inactivity";
import { isJuryEligible } from "./finaleQaData";
import { initChains, placementValue as chainsPlacementValue, chainsKey } from "./games/chainsData";
import {
  initScavengerHunt, advanceScavengerRound, everyoneReadyToAdvance,
  placementValue as scavengerPlacementValue, scavengerKey, computeRoundTimeoutMs as computeScavengerRoundTimeoutMs,
} from "./games/scavengerHuntData";

// Fire-and-forget push notification for a round/phase change — never
// allowed to throw and break the actual round advance, since a
// notification failing to send is a minor inconvenience, not something
// that should ever block the game itself from progressing. Also notifies
// hosts who've opted in (notify_round_changes) — the cron job can
// auto-advance a phase with no host action at all, so a host may
// genuinely want to know a round changed even though they didn't
// trigger it themselves.
async function notifyRoundChange(gameId, title, body) {
  try {
    await sendPushToGame(gameId, { title, body, url: `/play?game=${gameId}`, tag: "round-change", filterColumn: "notify_rounds" });
  } catch (e) {
    console.error("Round-change push notify failed:", e);
  }
  try {
    await sendPushToHosts(gameId, { title, body, url: `/host?game=${gameId}`, tag: "round-change", filterColumn: "notify_round_changes" });
  } catch (e) {
    console.error("Round-change host push notify failed:", e);
  }
}

// Applies to all three nominators (1st, 2nd, and 3rd place — see
// lib/challengeLogic.js's `nominators: ranked.slice(0, 3)`), not just
// the Battle winner: if any of them hasn't submitted their own Fates
// nomination within the Fates Ceremony's own configured time limit
// (settings.fatesDurationSec — the same duration the phase itself
// already uses, not a separate fixed window), the game picks a valid
// target on their behalf and bars THAT PERSON from the NEXT round's
// Battle as the stated consequence — the same rule and the same
// punishment regardless of which of the three missed their window. If
// the season has infiniteTime on, there's no configured duration to
// match, so this never triggers at all — that's a deliberate reading of
// "match the configurable duration," not an oversight: no configured
// limit means no timeout to miss.
//
// Processes all three in one pass rather than one at a time, so two
// people timing out in the same check doesn't let them collide on the
// same auto-picked nominee — each pick accounts for every nominee
// already taken, including ones just auto-picked earlier in this same
// pass. Sends a single combined announcement covering everyone who
// timed out together, rather than a separate message per person, and
// bars everyone who timed out from next round's Battle in one write. A
// no-op for anyone who's already nominated, whose window hasn't closed
// yet, or (defensively) for whom there's genuinely no eligible target
// left to auto-pick — that last case is left for a human to sort out
// rather than guessed at.
// Applies one inactivity strike to a single player. Fetches FRESH
// shield/strike data rather than trusting the `players` snapshot in env
// (read once at the start of this poll cycle, and this can be called
// after other writes have already happened later in the same pass) —
// then writes the new strike count and, if this crosses the removal
// threshold, the actual removal, in the SAME write. Never posts an
// announcement itself — every caller batches multiple strikes from the
// same trigger into one combined message rather than one per player,
// so that's left to them.
async function applyInactivityStrike(env, playerId, reason) {
  const { client, round } = env;
  const { data: playerRow } = await client
    .from("players")
    .select("inactivity_strikes, inactivity_shielded, alive")
    .eq("id", playerId)
    .maybeSingle();
  if (!playerRow) return { applied: false, reason: "not-found" };
  if (isShielded(playerRow)) return { applied: false, reason: "shielded" };

  const { newStrikes, removed } = nextStrikeState(playerRow.inactivity_strikes);
  const patch = { inactivity_strikes: newStrikes };
  // Only take the actual removal action for a player who's still alive
  // (confirmed with the season's host directly for this exact case) —
  // someone already exiled, e.g. a juror who's stopped voting in the
  // Finale, has nothing left to remove them FROM, and overwriting their
  // real elimination_type (e.g. "exiled") with "removed_inactivity"
  // would corrupt their actual elimination history. The strike still
  // counts and still shows on their Help tab regardless — this only
  // changes whether crossing 3 ALSO takes the destructive action.
  const actuallyRemoved = removed && playerRow.alive;
  if (actuallyRemoved) {
    patch.alive = false;
    patch.elimination_type = "removed_inactivity";
    patch.elimination_round = round.round;
  }
  const { error } = await client.from("players").update(patch).eq("id", playerId);
  if (error) { console.error("applyInactivityStrike failed:", error); return { applied: false, reason: "write-failed" }; }

  return { applied: true, newStrikes, removed: actuallyRemoved, atThreeStrikes: removed, triggerReason: reason };
}

// Instant removal (see lib/inactivity.js's meetsInstantRemovalCriteria)
// — called once, right when a round actually ends, using the ENDING
// round's own number/roundStartedAt/participant list (the caller passes
// these explicitly rather than this function reading `round` itself,
// since by the time either caller reaches this point `round` still
// refers to the round that's finishing, not the one about to begin —
// but that's exactly the kind of thing worth being explicit about
// rather than relying on the caller's own variable-naming discipline
// six months from now).
async function checkInstantInactivityRemoval(env, endedRound, endedRoundStartedAt, playersAliveAfterOutcome) {
  const { gameId, db, client, postMessage, settings, playersById } = env;
  if (endedRound < 2) return; // round 1 is exempt entirely — confirmed with the season's host
  if (!endedRoundStartedAt) return; // shouldn't happen now that roundStartedAt is always set at every round transition, but a safe no-op rather than a crash if it's ever somehow missing

  const eligible = (playersAliveAfterOutcome || []).filter((p) => p.approved);
  if (eligible.length === 0) return;
  const eligibleIds = eligible.map((p) => p.id);

  const votes = (await db.get(gameId, `pb:exile-votes:${endedRound}`)) || {};
  const scores = (await db.get(gameId, `pb:challenge-scores:${endedRound}`)) || {};
  // Must be read BEFORE any next-round setup touches KEY_CHALLENGE —
  // both call sites below are placed specifically to guarantee this
  // still points at the round that's ending, not whatever comes next.
  const challenge = await db.get(gameId, KEY_CHALLENGE);
  const participantIds = new Set(challenge?.round === endedRound ? (challenge.participantIds || []) : []);

  const groupChat = (await db.get(gameId, "pb:group-chat")) || [];
  const groupSenders = new Set(groupChat.filter((m) => m.createdAt >= endedRoundStartedAt).map((m) => m.senderId));

  const isoRoundStart = new Date(endedRoundStartedAt).toISOString();
  const { data: dmRows, error: dmError } = await client
    .from("dm_messages")
    .select("sender_id")
    .in("sender_id", eligibleIds)
    .gte("created_at", isoRoundStart);
  if (dmError) console.error("Instant-removal DM check failed (treating as no DMs sent, not blocking the round over it):", dmError);
  const dmSenders = new Set((dmRows || []).map((r) => r.sender_id));

  const removedNames = [];
  for (const p of eligible) {
    const voted = !!votes[p.id];
    const playedChallenge = !!scores[p.id];
    const sentMessage = groupSenders.has(p.id) || dmSenders.has(p.id);
    const voteExempt = powerFor(p, settings) === "Dionysus";
    // Battle-ban exemption: not being in the challenge's own
    // participant list at all means they were never expected to play
    // in the first place (that list already excludes battle-banned
    // players and re-entry decliners by construction — same reasoning
    // as the challenge-miss strike check above).
    const challengeExempt = !participantIds.has(p.id);

    if (!meetsInstantRemovalCriteria({ voted, playedChallenge, sentMessage, voteExempt, challengeExempt })) continue;

    const { data: playerRow } = await client.from("players").select("inactivity_shielded").eq("id", p.id).maybeSingle();
    if (isShielded(playerRow)) continue;

    const { error } = await client.from("players").update({ alive: false, elimination_type: "removed_inactivity", elimination_round: endedRound }).eq("id", p.id);
    if (error) { console.error("Instant inactivity removal failed:", error); continue; }
    removedNames.push(p.display_name || playersById[p.id] || "someone");
  }

  if (removedNames.length > 0) {
    await postMessage(`🚫 ${removedNames.join(", ")} didn't vote, play in the Battle, or send any message this round — removed for inactivity.`);
  }
}

// Strike decay (see lib/inactivity.js's isStrikeDecayRound/
// decayedStrikeCount) — round 3, 6, 9, ..., season-wide, every player
// who has any strikes at once, not counted per-player from their own
// most recent strike. Only ever called from the genuine round-to-round
// transition below (nextRound = round.round + 1) — the Finale
// transition deliberately does NOT call this, since it keeps the same
// round number rather than incrementing it (confirmed by checking its
// own roundRes write directly rather than assuming), so there's no
// "new round number" for a decay check to even apply to there.
async function applyStrikeDecayIfDue(env, newRoundNumber) {
  const { gameId, client, postMessage } = env;
  if (!isStrikeDecayRound(newRoundNumber)) return;

  const { data: strikedPlayers, error } = await client
    .from("players")
    .select("id, inactivity_strikes")
    .eq("game_id", gameId)
    .gt("inactivity_strikes", 0);
  if (error) { console.error("Strike decay fetch failed:", error); return; }
  if (!strikedPlayers || strikedPlayers.length === 0) return; // nobody has any strikes — nothing to decay, nothing to announce

  for (const p of strikedPlayers) {
    const { error: updateError } = await client
      .from("players")
      .update({ inactivity_strikes: decayedStrikeCount(p.inactivity_strikes) })
      .eq("id", p.id);
    if (updateError) console.error("Strike decay write failed for player", p.id, updateError);
  }

  await postMessage(`🕊 Round ${newRoundNumber}: everyone's inactivity strikes have gone down by 1.`);
}

// Resolves as many nominators' preference lists as it can in one pass,
// in turn order — the moment it becomes a nominator's turn (everyone
// ranked before them has already submitted), if they pre-submitted a
// ranked preference list (see lib/fatesLogic.js's preferenceSlotsFor —
// only 2nd/3rd place ever get one), this tries their top choice first,
// then the next, down the list, and writes the first one that's still
// valid. A resolution can immediately unlock the NEXT nominator's turn
// too, so this keeps going down nominatorOrder in the same pass rather
// than waiting for a separate poll cycle per nominator — minimizing
// wait time end-to-end, not just at each individual step.
//
// Deliberately stops (doesn't skip ahead) the moment it hits a
// nominator whose turn hasn't arrived yet, OR whose turn HAS arrived
// but who has no preference list (or has exhausted every ranked
// choice) — nominations are still strictly sequential, so nobody
// later in the order can ever go before that person does, whether via
// preference or a live manual pick.
async function resolveFatesPreferences(env, fates) {
  const { gameId, db, players, settings, round } = env;
  const winnerId = fates.nominatorOrder?.[0]?.playerId;
  if (!winnerId) return fates;

  let working = fates;
  for (const nominator of working.nominatorOrder) {
    const nominatorId = nominator.playerId;
    if (working.nominations?.[nominatorId]) continue; // already nominated (manually, or resolved earlier this same pass) — move on to check the next
    if (!isNominatorsTurn(working.nominatorOrder, working.nominations, nominatorId)) break; // not their turn yet — and since order is strictly sequential, nobody after them could be either
    const prefs = working.preferences?.[nominatorId];
    if (!prefs || prefs.length === 0) break; // it's their turn, but no preference list to resolve from — needs a live manual pick, which blocks everyone after them too

    const taken = takenNomineeIds(working.nominations, nominatorId);
    const aphroditeBlockedId = aphroditeBlocksTargeting(players, settings, nominatorId);
    const aresImmuneId = findAresImmunePlayerId(players, settings, round);
    const resolved = resolveNominationFromPreferences(prefs, nominatorId, winnerId, taken, aphroditeBlockedId, aresImmuneId);
    if (!resolved) break; // every ranked preference has since become invalid — needs a live manual pick, same as an empty list

    const fatesRes = await db.update(gameId, KEY_FATES, (fresh) => {
      if (!fresh) return fresh;
      if (fresh.nominations?.[nominatorId]) return fresh; // the player (or a concurrent pass) beat this write to it
      return {
        ...fresh,
        nominations: { ...fresh.nominations, [nominatorId]: resolved.nomineeId },
        nominationReasons: { ...(fresh.nominationReasons || {}), [nominatorId]: resolved.reason },
      };
    });
    if (!fatesRes.ok || !fatesRes.value) break;
    working = fatesRes.value;
  }
  return working;
}

async function autoNominateTimedOutNominators(env, fates) {
  const { gameId, db, client, round, settings, alivePlayers, playersById, now } = env;
  const winnerId = fates.nominatorOrder?.[0]?.playerId;
  if (!winnerId) return fates; // no nominators at all — nothing to check
  if (settings.infiniteTime) return fates; // no configured duration to match — see comment above
  const timeoutMs = settings.fatesDurationSec * 1000;
  if (!round.phaseStartedAt || now - round.phaseStartedAt < timeoutMs) return fates; // window hasn't closed yet

  const aliveIds = alivePlayers.map((p) => p.id);
  const autoPicks = {}; // nominatorId -> auto-picked nomineeId
  const nominationsSoFar = { ...fates.nominations };

  for (const nominator of fates.nominatorOrder) {
    const nominatorId = nominator.playerId;
    if (nominationsSoFar[nominatorId]) continue; // already nominated — nothing to do for them
    const taken = takenNomineeIds(nominationsSoFar, nominatorId);
    const autoPick = autoPickNominee(nominatorId, winnerId, aliveIds, taken);
    if (!autoPick) continue; // no eligible target somehow — leave it for a human to sort out
    autoPicks[nominatorId] = autoPick;
    nominationsSoFar[nominatorId] = autoPick; // so the next nominator in this same pass can't collide with this pick
  }

  const timedOutIds = Object.keys(autoPicks);
  if (timedOutIds.length === 0) return fates;

  const durationLabel = formatDurationHours(settings.fatesDurationSec);

  const fatesRes = await db.update(gameId, KEY_FATES, (fresh) => {
    if (!fresh) return fresh;
    // Only apply picks for nominators who STILL haven't nominated by the
    // time this write actually lands — a concurrent call (or the
    // nominator themselves, cutting it close) may have already handled
    // some of them since this pass started reading.
    const stillNeeded = timedOutIds.filter((id) => !fresh.nominations?.[id]);
    if (stillNeeded.length === 0) return fresh;
    const nextNominations = { ...fresh.nominations };
    const nextReasons = { ...(fresh.nominationReasons || {}) };
    stillNeeded.forEach((id) => {
      nextNominations[id] = autoPicks[id];
      nextReasons[id] = `(Auto-selected — no nomination made within ${durationLabel}.)`;
    });
    return { ...fresh, nominations: nextNominations, nominationReasons: nextReasons };
  });
  if (!fatesRes.ok) return fates;

  // Bars everyone who timed out from next round's Battle, in one write.
  // round.round + 1 is safe to use as "the next round's number"
  // regardless of how many non-Battle phases (Exile, etc.) happen before
  // that Battle actually starts — the round counter only increments at a
  // brand new round beginning, never at an intermediate phase change.
  const { error: banError } = await client.from("players").update({ battle_ban_round: round.round + 1 }).in("id", timedOutIds);
  if (banError) console.error("Failed to set battle_ban_round:", banError);

  // Inactivity strike (see lib/inactivity.js) — applied per player since
  // each one needs its own fresh shield check and its own removal
  // threshold check; a shielded player is silently skipped here (no
  // strike, no error), the battle-ban above still applies to them
  // regardless since that's the game-integrity consequence, not the
  // punitive one the shield exists to prevent.
  const strikedNames = [];
  const removedNames = [];
  for (const id of timedOutIds) {
    const result = await applyInactivityStrike(env, id, "missed-fates-nomination");
    if (!result.applied) continue; // shielded, or something went wrong — either way, nothing to announce for them
    (result.removed ? removedNames : strikedNames).push(playersById[id] || "someone");
  }

  const names = timedOutIds.map((id) => playersById[id] || "someone").join(", ");
  let announcement = `⏳ ${names} didn't submit a Fates nomination within ${durationLabel} — the game has chosen on their behalf.\n\nAs a consequence, they'll be barred from competing in next round's Battle.`;
  if (strikedNames.length > 0) announcement += ` ${strikedNames.join(", ")} also received an inactivity strike.`;
  if (removedNames.length > 0) announcement += `\n\n🚫 ${removedNames.join(", ")} reached 3 inactivity strikes and been removed from the game.`;
  await env.postMessage(announcement);

  return fatesRes.value;
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
      // The actual bug this whole backfill exists for is now confirmed
      // fixed (recordExileHistoryIfMissing's own guard against
      // double-recording means `ok` stays true on every later poll too,
      // once it's succeeded once) — but leaving the stale KEY_EXILE
      // value sitting there afterward means AdminHost.jsx's Reset Round
      // safety check (see its own comment on exactly this scenario)
      // keeps seeing "unresolved data from an earlier round" and
      // refusing to reset FOREVER, even though the data it's protecting
      // has already been safely copied into permanent history. Clear it
      // now that the backup is confirmed — guarded so a genuinely NEW
      // exile that started in the meantime (a real race, unlikely but
      // not impossible across two back-to-back polls) never gets wiped
      // by this.
      if (ok) {
        await db.update(gameId, KEY_EXILE, (fresh) => (fresh && fresh.round === staleExile.round ? null : fresh));
      }
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
  // Random challenge selection's fully-unattended auto-start (see
  // autoStartRandomChallenge's own comment above, right before
  // advanceFromChallenge) — same "passive housekeeping, runs on every
  // poll regardless of what else advances" placement as the re-entry
  // defaulting immediately below, and for the same reason: this is
  // exactly the point of the feature, nobody should need to be
  // watching for it to happen. No-ops instantly (a single db.get) for
  // every game not using random mode, and for random-mode games once
  // the challenge is already active.
  if (round.phase === PHASES.CHALLENGE) {
    await autoStartRandomChallenge({ gameId, db, round, settings, players, alivePlayers });
  }

  // Unlike the block above, this applies regardless of
  // challengeSelectionMode — Torched's placement-to-shooting stall risk
  // (see autoTransitionTorchedPlacement's own comment) exists whether
  // Torched got picked randomly or the host chose it manually.
  if (round.phase === PHASES.CHALLENGE) {
    await autoTransitionTorchedPlacement({ gameId, db, round, settings, playersById });
    // Same reasoning as Torched immediately above, but Chains needs no
    // timeout at all — see autoLockResolvedScores's own comment.
    await autoLockResolvedScores({ gameId, db, round, playersById }, "chains", chainsKey, (s) => s.revealed, chainsPlacementValue);
    // Masquerade's per-turn timeout (see autoTimeoutMasquerade's own
    // comment) plus the actual reveal-to-next-turn advance, which
    // otherwise only ever happened when a client clicked through it —
    // needed regardless of whether the reveal came from normal play or
    // from a fresh timeout-elimination this same poll just applied.
    await autoTimeoutMasquerade({ gameId, db, round, settings });
    await advanceMasqueradeReveal(gameId, round.round, db);
    // Same reasoning as Chains above — Masquerade's `finalized` is its
    // own equivalent of Chains' `revealed`, hence the predicate rather
    // than a hardcoded field name in autoLockResolvedScores itself.
    await autoLockResolvedScores({ gameId, db, round, playersById }, "masquerade", masqueradeKey, (s) => s.finalized, masqueradePlacementValue);

    // Scavenger Hunt (see autoAdvanceScavengerRound's own comment above,
    // and lib/games/scavengerHuntData.js's header comment for the full
    // rules) — the per-round timer advance, the normal "3 finishers"
    // resolution fallback (matching Chains/Masquerade's own pattern
    // exactly, since gameOver here is this game's own equivalent of
    // revealed/finalized), and the SEPARATE challenge-timeout fallback
    // for when the hunt never resolves on its own at all.
    await autoAdvanceScavengerRound({ gameId, db, round, settings });
    await autoLockResolvedScores({ gameId, db, round, playersById }, "scavengerhunt", scavengerKey, (s) => s.gameOver, scavengerPlacementValue);
    await forceLockScavengerScoresOnTimeout({ gameId, db, round, playersById });
  }

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
    // phase is always "voting" from the moment the Finale is created now
    // (see the finale setup below) — this check is effectively just
    // finale.votingOpen at this point, but left as-is (rather than
    // simplified) since finale.phase still exists and still means the
    // same thing, and touching this working logic isn't worth the risk
    // for a redundant-but-harmless condition.
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
      // Finale-only: phase is always "voting" from the moment the Finale
      // is created now (see the finale setup below — there's no longer a
      // separate qa-only period, since statements/Q&A run concurrently
      // with voting instead of before it). This check is effectively
      // always true in practice at this point, kept as a defensive
      // guard rather than removed, in case phase is ever null/missing
      // for a brand-new finale row that hasn't finished writing yet.
      if (round.phase === PHASES.FINALE && liveState?.phase !== "voting") {
        return { advanced: false, reason: "finale-not-set-up-yet" };
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
  const voteRows = filterCancelledVote(
    Object.entries(votes).map(([voterId, v]) => ({ voterId, targetId: v.targetId, reason: v.reason || null })),
    exile.artemisCancelledVoterId
  );

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

async function setPlayerAlive(client, playerId, alive, eliminationType, eliminationRound) {
  await client.from("players").update({ alive, elimination_type: eliminationType, elimination_round: eliminationRound ?? null }).eq("id", playerId);
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

// ─── Random challenge selection: fully unattended auto-start ───
// Only engages when settings.challengeSelectionMode is "random" (see
// lib/challengeSelection.js) — manual mode is untouched, the host still
// picks and starts challenges exactly as before. This lives in the same
// "passive housekeeping" section of advancePhase that already runs
// regardless of whether anything else advances this poll, for the same
// reason re-entry defaults are handled there: nobody should need to be
// watching for this to happen.
//
// Three things happen here, in order, across however many polls it
// actually takes (Hephaestus's own choice is a genuine async wait on a
// real player — everything else resolves on the very next poll, not a
// meaningful delay):
//   1. Resolve the game type — either the straight random pick, or (if
//      someone currently holds Hephaestus's power) drawing his two
//      options automatically and then waiting for HIM to choose one
//      (see components/HephaestusChoice.jsx — that choice itself was
//      never something to automate away, only the draw that presents it).
//   2. Once resolved, start the challenge — participants are simply
//      every alive, approved player, minus anyone battle-banned for
//      THIS specific round (missed their Fates nomination window last
//      round — see components/ChallengeHost.jsx's own eligibleForBattle
//      for the exact same rule, replicated here rather than reused
//      since that one lives client-side) — DEFAULT_PARTICIPATION's own
//      "all"
//      mode, see lib/challengeParticipants.js — there's no host present
//      to customize this), duration comes from settings.challengeDurationSec
//      (no more per-battle override — see AdminHost.jsx/ChallengeHost.jsx),
//      maze size and every other per-game config falls back to the
//      registry's own default (gameConfigWithDefaults with no override).
//   3. Whichever game-specific init a game needs (Plinko's bracket,
//      Torched's grid, ...) runs with `db` explicitly passed through —
//      these functions default to the browser-bound storageSet/
//      storageUpdate otherwise, which would silently fail with no
//      session in this server context (see each initX function's own
//      comment on this in lib/games/*.js).
//
// Concurrency: db.update (lib/dbAdapter.js) already does real optimistic-
// concurrency control (version-checked, retrying) — an idempotent-check
// callback here ("if already active/already drawn, no-op") is enough to
// make this safe under concurrent polls without inventing anything new.
// The startedAt === now comparison after the KEY_CHALLENGE write is what
// tells THIS specific call whether it actually won and should proceed
// to the init calls, vs. a concurrent call that lost the race and got
// back someone else's already-written value instead.
async function autoStartRandomChallenge(env) {
  const { gameId, db, round, settings, players, alivePlayers } = env;
  if (settings.challengeSelectionMode !== "random") return;

  const challenge = await db.get(gameId, KEY_CHALLENGE);
  if (challenge?.active) return; // already started — nothing to do

  const challengeHistory = (await db.get(gameId, KEY_CHALLENGE_HISTORY)) || [];
  const hephaestusPlayer = players.find((p) => p.alive && p.approved && powerFor(p, settings) === "Hephaestus");
  // Combines the season's own disabledChallenges (settings, already
  // loaded above) with the separate platform-wide list (see
  // lib/platformSettings.js) — a game can be turned off at either
  // level, and both apply together.
  const disabledTypes = [...(settings.disabledChallenges || []), ...(await fetchGloballyDisabledChallenges())];

  let gameType;
  if (hephaestusPlayer) {
    const drawKey = hephaestusDrawKey(round.round);
    const drawRes = await db.update(gameId, drawKey, (fresh) => (fresh ? fresh : { options: pickHephaestusOptions(challengeHistory, disabledTypes), chosen: null }));
    if (!drawRes.ok || !drawRes.value?.chosen) return; // drew (or already had) the two options, but still waiting on Hephaestus's own pick
    gameType = drawRes.value.chosen;
  } else {
    const pickKey = randomPickKey(round.round);
    const pickRes = await db.update(gameId, pickKey, (fresh) => (fresh ? fresh : { gameType: pickRandomChallenge(challengeHistory, disabledTypes) }));
    if (!pickRes.ok || !pickRes.value?.gameType) return;
    gameType = pickRes.value.gameType;
  }

  const participants = alivePlayers.filter((p) => p.approved && p.battle_ban_round !== round.round);
  const participantIds = participants.map((p) => p.id);
  const reentryList = (await db.get(gameId, KEY_REENTRY)) || [];
  const reentryEligibleIds = reentryList.filter((r) => r.status === REENTRY_STATUS.PENDING).map((r) => r.playerId);
  const now = Date.now();
  const endsAt = (settings.infiniteTime || gameType === "masquerade" || gameType === "torched" || gameType === "chains") ? null : now + (settings.challengeDurationSec || 900) * 1000;

  const startToken = `${now}:${Math.random().toString(36).slice(2)}`; // NOT just `now` — two truly-concurrent calls can land on the exact same millisecond, which a bare timestamp can't tell apart; confirmed this collision directly with a concurrency simulation before switching to this
  const startRes = await db.update(gameId, KEY_CHALLENGE, (fresh) => (fresh?.active ? fresh : {
    round: round.round, active: true, startedAt: now, endsAt, startToken,
    participantIds, reentryEligibleIds, reentryDecisions: {}, reentryAttemptIds: [], placements: [], finalized: false,
    gameType, gameConfig: gameConfigWithDefaults(gameType),
  }));
  if (!startRes.ok || startRes.value?.startToken !== startToken) return; // either the write failed, or a concurrent call already won this race — either way, don't double-init

  if (gameType === "plinko") await initPlinkoBracket(gameId, round.round, participants, now, db);
  if (gameType === "pit") await initPit(gameId, round.round, participants, now, db);
  if (gameType === "masquerade") await initMasquerade(gameId, round.round, participants, now, db);
  if (gameType === "closeto20") await initCloseToTwenty(gameId, round.round, participants, now, db);
  if (gameType === "torched") {
    const presetsByPlayerId = {};
    players.forEach((p) => { if (p.torched_preset) presetsByPlayerId[p.id] = p.torched_preset; });
    await initTorched(gameId, round.round, participants, now, presetsByPlayerId, db);
  }
  if (gameType === "chains") await initChains(gameId, round.round, participants, db);
  if (gameType === "scavengerhunt") await initScavengerHunt(gameId, round.round, participants, now, db);

  await db.update(gameId, KEY_ROUND, (fresh) => ({ ...(fresh || {}), phaseStartedAt: now, phaseEndsAt: endsAt }));
}

// ─── Torched: the placement phase can't rely on a timer at all ───
// Torched has no timer — round.phaseEndsAt is deliberately null for it
// (see the endsAt computation above and in autoStartRandomChallenge),
// which means it CANNOT advance via the normal timerUp fallback that
// every timed challenge gets — advancement is entirely gated on every
// participant having a locked score (see isPhaseFullyDone). Normally
// that's fine; Torched resolves that itself once shooting produces a
// winner, and each player's own client reports their own result the
// same way every other game does.
//
// The actual gap: getting FROM placement TO shooting has always
// required some player to manually click "Everyone's placed — start
// shooting" (see components/games/TorchedPlayer.jsx) — there was no
// server-side fallback at all. If Torched got picked while nobody was
// around to click it, the battle — and the whole round behind it —
// would simply sit there forever. This closes that gap, using the same
// settings.challengeDurationSec window every other challenge already
// uses as "how long is reasonable to wait," even though Torched itself
// has no timer of its own.
//
// The one case this can't paper over: if fewer than 2 players ever
// placed within that window, there's no valid battle to run at all —
// shooting never starts, and no player's client would ever report a
// score either, since the win/elimination events that trigger
// TorchedPlayer.jsx's own reportScore calls never happen. So this
// writes each participant's score directly, using placementValue — the
// EXACT SAME scoring function TorchedPlayer.jsx itself uses — so a
// player who placed but got stranded by too few others still ranks
// above someone who never placed at all, exactly as if a client had
// reported it normally.
async function autoTransitionTorchedPlacement(env) {
  const { gameId, db, round, settings, playersById } = env;
  const challenge = await db.get(gameId, KEY_CHALLENGE);
  if (!challenge?.active || challenge.gameType !== "torched") return;

  const torched = await db.get(gameId, torchedKey(round.round));
  if (!torched || torched.turnOrder) return; // no state yet, or already transitioned — nothing to do either way

  const windowMs = (settings.challengeDurationSec || 900) * 1000;
  if (!challenge.startedAt || Date.now() - challenge.startedAt < windowMs) return; // give it the same window every other challenge gets before intervening

  if (torched.placedIds.length >= 2) {
    await startShootingPhase(gameId, round.round, Date.now(), db);
    return;
  }

  for (const playerId of challenge.participantIds || []) {
    const value = torchedPlacementValue(torched, playerId);
    await db.update(gameId, `pb:challenge-scores:${round.round}`, (fresh) => {
      const existing = fresh || {};
      if (existing[playerId]?.locked) return existing; // already resolved (e.g. a client got there first) — leave it alone
      existing[playerId] = { ...existing[playerId], playerName: playersById[playerId] || "?", value, finishedAt: Date.now(), locked: true };
      return existing;
    });
  }
}

// ─── Chains (and any future deterministic, timer-free game) ───
// Unlike Torched's placement phase, Chains needs no timeout at all —
// the moment the LAST player submits their chain, results are computed
// and `revealed` flips to true in that SAME write (see
// lib/games/chainsData.js's submitChain), entirely independent of any
// client. The only actual gap is that nothing writes the RESULTING
// scores to the standard pb:challenge-scores table except each
// player's own client, the same way every other game works — so if a
// player closes their tab the instant their result's known and never
// opens it again, their score never gets locked, and the whole
// challenge sits waiting on isPhaseFullyDone forever (Chains has no
// timer either, so there's no timerUp fallback to rescue it).
//
// Generic on purpose (gameType/stateKey/isResolved/computeValue as
// parameters) — this exact shape (resolves once some server-side state
// satisfies its own definition of "done", scores derivable via a pure
// function from that state) fits any timer-free game that behaves this
// way, not just Chains — Masquerade is the second real use, below,
// which is exactly why isResolved is a predicate rather than a
// hardcoded field name: Chains calls itself done via `revealed`,
// Masquerade via `finalized`. Idempotent — a participant who already
// has a locked score (their own client got there first, the normal
// case) is left completely untouched, never overwritten.
async function autoLockResolvedScores(env, gameType, stateKey, isResolved, computeValue) {
  const { gameId, db, round, playersById } = env;
  const challenge = await db.get(gameId, KEY_CHALLENGE);
  if (!challenge?.active || challenge.gameType !== gameType) return;

  const state = await db.get(gameId, stateKey(round.round));
  if (!state || !isResolved(state)) return; // not resolved yet — nothing to do

  for (const playerId of challenge.participantIds || []) {
    const value = computeValue(state, playerId);
    await db.update(gameId, `pb:challenge-scores:${round.round}`, (fresh) => {
      const existing = fresh || {};
      if (existing[playerId]?.locked) return existing;
      existing[playerId] = { ...existing[playerId], playerName: playersById[playerId] || "?", value, finishedAt: Date.now(), locked: true };
      return existing;
    });
  }
}

// ─── Masquerade: per-turn timeout ───
// Masquerade has NO timer by design (see the file's own header comment
// in lib/games/masqueradeData.js) — targeting and responding both wait
// indefinitely for the actual player to act, deliberately, so nothing
// gets auto-decided on their behalf. Confirmed with the season's host
// exactly how to bound this without breaking that principle: T, the
// per-turn timeout, is the challenge's own normal duration divided by
// the mathematically-verified WORST-CASE number of turns this specific
// battle could ever need (2 * participantCount - 1 — brute-force
// simulated against the actual elimination rule before trusting the
// formula, not just derived by hand). That guarantees the whole battle
// can never exceed a standard battle's length, even in the single
// worst possible sequence of outcomes.
//
// Critical detail: T is ONE shared clock for the whole turn (targeting
// AND responding together), not two separate T-second windows — see
// turnStartedAt in lib/games/masqueradeData.js, which is set once when
// a turn begins and deliberately never reset when submitTargetChoice
// moves from targeting into responding. Giving each sub-phase its own
// full T would let a single turn take up to 2T, breaking the exact
// guarantee this exists to provide. The real consequence of doing it
// correctly: if the active player uses nearly all of T deciding, the
// person responding can be left with very little time before they're
// also at risk of timing out — confirmed as an accepted tradeoff, not
// something to silently paper over.
//
// Consequence on timeout — confirmed directly, not assumed: whoever's
// actually on the clock (the active player during targeting, the
// target during responding) is auto-eliminated outright (both strikes
// at once), never just skipped or defaulted to a random choice.
// ─── Scavenger Hunt: per-round timer, plus a challenge-timeout fallback ───
// Two SEPARATE mechanisms, not one — they cover genuinely different
// failure modes:
//   1. Each round has its own short timer (computeRoundTimeoutMs,
//      scaled to the challenge's own configured duration — see that
//      function's own comment in lib/games/scavengerHuntData.js for
//      exactly how, and why this changed from a flat constant) — once
//      it elapses, or once every still-active player has chosen a next
//      location (whichever comes first), the round advances. This is
//      the normal, expected path.
//   2. Separately, the CHALLENGE's own overall duration (the same
//      settings.challengeDurationSec every other timed game respects)
//      is the outer bound. If it expires before 3 players ever finish,
//      the hunt never reaches gameOver on its own — which means no
//      client's reportScore ever fires (see
//      lib/games/scavengerHuntData.js's own reportScore call, gated on
//      state.gameOver specifically), and scoresToPlacements would rank
//      every still-active player as a flat "did not play" no-show
//      rather than by their actual progress. This directly writes each
//      participant's score from their CURRENT collected-types count the
//      moment the challenge's own timer passes, so a player with 7 of 8
//      items correctly outranks one with 1 of 8 even though neither
//      ever finished.
async function autoAdvanceScavengerRound(env) {
  const { gameId, db, round, settings } = env;
  const challenge = await db.get(gameId, KEY_CHALLENGE);
  if (!challenge?.active || challenge.gameType !== "scavengerhunt") return;

  const state = await db.get(gameId, scavengerKey(round.round));
  if (!state || state.gameOver) return;

  const roundElapsed = Date.now() - (state.roundStartedAt || 0);
  const roundTimeoutMs = computeScavengerRoundTimeoutMs(settings?.challengeDurationSec);
  if (!everyoneReadyToAdvance(state) && roundElapsed < roundTimeoutMs) return;

  await advanceScavengerRound(gameId, round.round, db);
}

async function forceLockScavengerScoresOnTimeout(env) {
  const { gameId, db, round, playersById } = env;
  const challenge = await db.get(gameId, KEY_CHALLENGE);
  if (!challenge?.active || challenge.gameType !== "scavengerhunt") return;
  if (!challenge.endsAt || Date.now() < challenge.endsAt) return; // the challenge's own timer hasn't actually run out yet

  const state = await db.get(gameId, scavengerKey(round.round));
  if (!state || state.gameOver) return; // resolved on its own already — the normal path (autoLockResolvedScores below) covers this case

  for (const playerId of challenge.participantIds || []) {
    const value = scavengerPlacementValue(state, playerId);
    await db.update(gameId, `pb:challenge-scores:${round.round}`, (fresh) => {
      const existing = fresh || {};
      if (existing[playerId]?.locked) return existing;
      existing[playerId] = { ...existing[playerId], playerName: playersById[playerId] || "?", value, finishedAt: Date.now(), locked: true };
      return existing;
    });
  }
}

async function autoTimeoutMasquerade(env) {
  const { gameId, db, round, settings } = env;
  const challenge = await db.get(gameId, KEY_CHALLENGE);
  if (!challenge?.active || challenge.gameType !== "masquerade") return;

  const state = await db.get(gameId, masqueradeKey(round.round));
  if (!state || state.finalized) return;

  const turn = state.turn;
  if (!turn || (turn.phase !== "targeting" && turn.phase !== "responding")) return; // nothing actually on the clock right now (e.g. mid-reveal-pause)

  const participantCount = state.order.length;
  const maxTurns = 2 * participantCount - 1;
  const perTurnMs = ((settings.challengeDurationSec || 900) / maxTurns) * 1000;

  if (!turn.turnStartedAt || Date.now() - turn.turnStartedAt < perTurnMs) return; // still within the window

  const stalledPlayerId = turn.phase === "targeting" ? turn.activePlayerId : turn.targetId;

  await db.update(gameId, masqueradeKey(round.round), (fresh) => {
    if (!fresh || fresh.finalized) return fresh;
    const freshTurn = fresh.turn;
    if (!freshTurn || freshTurn.phase !== turn.phase) return fresh; // moved on already (e.g. a player actually acted in between) — no-op
    if (!freshTurn.turnStartedAt || Date.now() - freshTurn.turnStartedAt < perTurnMs) return fresh; // re-verify against FRESH data, not the outer closure's possibly-stale read

    const strikes = { ...fresh.strikes, [stalledPlayerId]: 2 };
    const eliminated = fresh.eliminated.includes(stalledPlayerId) ? fresh.eliminated : [...fresh.eliminated, stalledPlayerId];
    const stillIn = fresh.order.filter((id) => !eliminated.includes(id)).length;

    return {
      ...fresh, strikes, eliminated,
      turn: {
        ...freshTurn, phase: "revealed",
        timedOut: true, timedOutPlayerId: stalledPlayerId,
        targetDrankPoison: null, activeDrankPoison: null, // nothing was actually drunk — this resolved via timeout, not a real choice
        revealUntil: Date.now() + MASQUERADE_REVEAL_DISPLAY_MS,
      },
      finalized: stillIn <= 1,
    };
  });
}

// ─── CHALLENGE -> FATES (or straight to EXILE at Final Four) ───
async function advanceFromChallenge(env) {
  const { gameId, db, client, postMessage, now, round, settings, players, alivePlayers, playersById } = env;
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
    // Zeus's character power (see lib/characterPowers.js): a 2nd/3rd
    // finish gets bumped to 1st, if that power is active this season and
    // held by someone in this particular challenge.
    challenge.placements = applyZeusPower(challenge.placements, players, settings);
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
        let updatedEntry = resolveReentryAttempt(list[idx], challenge.placements);
        // Hades's character power (see lib/characterPowers.js): unlimited
        // re-entry attempts. resolveReentryAttempt itself has no idea
        // character powers exist at all — this is the one place that
        // overrides its result back to "pending" for Hades specifically,
        // right before it's used for anything (the RETURNED branch below,
        // the announcement text, and the saved list itself).
        const attemptingPlayer = (players || []).find((p) => p.id === attemptId);
        updatedEntry = { ...updatedEntry, status: overrideStatusForHades(updatedEntry.status, attemptingPlayer, settings) };
        list[idx] = updatedEntry;
        if (updatedEntry.status === REENTRY_STATUS.RETURNED) {
          await setPlayerAlive(client, updatedEntry.playerId, true, null, null);
          doubleElimination = true;
          await postMessage(`🔥 ${updatedEntry.name} won their way back into the game! This round is now a DOUBLE ELIMINATION.`);
        } else if (updatedEntry.status === REENTRY_STATUS.PENDING) {
          await postMessage(`${updatedEntry.name} opted into this challenge and did not finish 1st — but Hades's power means they can try again next time.`);
        } else {
          await postMessage(`${updatedEntry.name} opted into this challenge and did not finish 1st — they are eliminated forever.`);
        }
      }
      if (!(await db.set(gameId, KEY_REENTRY, list))) throw new Error("Couldn't save re-entry results — try again.");
    }

    const finalizeRes = await db.update(gameId, KEY_CHALLENGE, (fresh) => ({ ...(fresh || challenge), finalized: true }));
    if (!finalizeRes.ok) throw new Error("Couldn't finalize the challenge — try again.");

    // Inactivity strike (see lib/inactivity.js) for anyone expected to
    // compete in this challenge who never engaged AT ALL — no score
    // entry whatsoever, not even a forfeit. A forfeit IS active
    // engagement (choosing not to play, deliberately), not inactivity —
    // confirmed with the season's host. Scoped to
    // challenge.participantIds specifically, which already excludes
    // anyone who wasn't actually expected to play (battle-banned
    // players, re-entry decliners) by construction — nobody outside
    // that list needs a SEPARATE "did they legitimately sit out" check,
    // since anyone truly exempt was never added to it in the first
    // place. Digital games only, same scoping as the placement
    // computation above — manual (host-entered) challenges have no
    // equivalent signal to check this against.
    if (challenge.gameType && challenge.gameType !== "manual") {
      const scores = (await db.get(gameId, `pb:challenge-scores:${round.round}`)) || {};
      const missedNames = [];
      const removedNames = [];
      for (const id of challenge.participantIds || []) {
        if (scores[id]) continue; // any entry at all — played, or actively forfeited — counts as engagement
        const result = await applyInactivityStrike(env, id, "missed-challenge");
        if (!result.applied) continue; // shielded, or something went wrong
        (result.removed ? removedNames : missedNames).push(playersById[id] || "someone");
      }
      if (missedNames.length > 0 || removedNames.length > 0) {
        let msg = "";
        if (missedNames.length > 0) msg += `⏳ ${missedNames.join(", ")} didn't compete in this Battle and received an inactivity strike.`;
        if (removedNames.length > 0) msg += `${msg ? "\n\n" : ""}🚫 ${removedNames.join(", ")} reached 3 inactivity strikes and have been removed from the game.`;
        await postMessage(msg);
      }
    }

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
      preferences: {}, // { [nominatorId]: [{nomineeId, reason}, ...] } — 2nd/3rd place's pre-ranked picks, see lib/fatesLogic.js's preferenceSlotsFor/resolveNominationFromPreferences
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
  const { gameId, db, client, postMessage, now, round, settings, players, alivePlayers, playersById } = env;
  let fates = await db.get(gameId, KEY_FATES);
  if (!fates) return { advanced: false, reason: "no-fates-state" };

  // Preference resolution first (immediate, the moment it's someone's
  // turn) — the timeout-based auto-pick right after it is the slower
  // fallback for whoever's turn arrives with no preference list left to
  // try, not a replacement for this.
  fates = await resolveFatesPreferences(env, fates);
  fates = await autoNominateTimedOutNominators(env, fates);

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
  const { gameId, db, client, postMessage, now, round, settings, players, alivePlayers, playersById } = env;
  const exile = await db.get(gameId, KEY_EXILE);
  if (!exile) return { advanced: false, reason: "no-exile-state" };

  const votes = (await db.get(gameId, `pb:exile-votes:${round.round}`)) || {};
  const voteRows = filterCancelledVote(
    Object.entries(votes).map(([voterId, v]) => ({ voterId, targetId: v.targetId, reason: v.reason || null })),
    exile.artemisCancelledVoterId
  );
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
  let nullifiedId = secretRow?.nullified_player_id || null;
  let nullifiedReason = secretRow?.reason || null;

  // The holder's nullify decision is separate from casting an ordinary
  // vote — even a holder who's already voted might still be deciding
  // whether/who to nullify. Voting itself closing (see the housekeeping
  // in advancePhase, above, which flips votingOpen to false the moment
  // every voter's ballot is in) shouldn't rush that decision — the
  // holder gets the full voting window to make it, same as everyone
  // gets the full window to vote. This is exactly the gap that let a
  // round finalize the instant the last ordinary vote came in, treating
  // a holder who simply hadn't acted YET as though they'd declined to
  // use the power at all. If the season has infiniteTime on, there's no
  // configured window to wait out at all, so the decision is awaited
  // indefinitely — same as every other phase respects infiniteTime by
  // never auto-timing-out.
  //
  // Once the window DOES elapse, though — this is the inactivity
  // system's one change to existing behavior, not just an addition (see
  // lib/inactivity.js): "declined" is no longer a real outcome at all.
  // The Power of Khaos gets exercised no matter what, picked at random
  // from the nominees on the holder's behalf, exactly like a Fates
  // nomination the nominator never made — plus the same inactivity
  // strike and next-battle ban a missed nomination already carries.
  if (exile.chaosHolderId && !nullifiedId) {
    const voteTimeoutMs = settings.voteDurationSec * 1000;
    const timedOut = !settings.infiniteTime && round.phaseStartedAt && (now - round.phaseStartedAt >= voteTimeoutMs);
    if (!timedOut) {
      // Same "only post once, not every poll cycle" guard the tie-break
      // waiting message already uses below.
      if (!exile.holderWaitAnnounced) {
        await postMessage(`🃏 Waiting on the Power of Khaos holder's decision before the vote can be finalized.`);
        await db.update(gameId, KEY_EXILE, (fresh) => (fresh ? { ...fresh, holderWaitAnnounced: true } : fresh));
      }
      return { advanced: false, reason: "waiting-on-holder-decision" };
    }

    const forcedPick = exile.nominees[Math.floor(Math.random() * exile.nominees.length)];
    const forcedReason = "(Auto-selected — the Power of Khaos holder made no decision in time.)";
    const { error: forceError } = await client
      .from("chaos_secrets")
      .upsert(
        { game_id: gameId, context: `exile:${round.round}`, nullified_player_id: forcedPick.playerId, reason: forcedReason, set_by: null, updated_at: new Date().toISOString() },
        { onConflict: "game_id,context" }
      );
    if (forceError) { console.error("Failed to force-exercise the Power of Khaos:", forceError); return { advanced: false, reason: "waiting-on-holder-decision" }; }
    nullifiedId = forcedPick.playerId;
    nullifiedReason = forcedReason;

    const { error: banError } = await client.from("players").update({ battle_ban_round: round.round + 1 }).eq("id", exile.chaosHolderId);
    if (banError) console.error("Failed to set battle_ban_round for Khaos holder:", banError);
    const strikeResult = await applyInactivityStrike(env, exile.chaosHolderId, "missed-khaos-decision");

    const holderName = playersById[exile.chaosHolderId] || "The Power of Khaos holder";
    let khaosAnnouncement = `🃏 ${holderName} made no Power of Khaos decision within ${formatDurationHours(settings.voteDurationSec)} — the game has exercised it on their behalf.\n\nAs a consequence, they'll be barred from competing in next round's Battle.`;
    if (strikeResult.applied) khaosAnnouncement += ` They also received an inactivity strike.`;
    if (strikeResult.removed) khaosAnnouncement += `\n\n🚫 They reached 3 inactivity strikes and have been removed from the game.`;
    await postMessage(khaosAnnouncement);
  }

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
    // Inactivity strike (see lib/inactivity.js) for anyone who was
    // actually eligible to vote this round and didn't — checked against
    // the RAW votes object, not voteRows, since a vote Artemis cancels
    // still means the player DID vote (Artemis nullifies its effect on
    // the tally, not the fact it happened — see
    // lib/characterPowers.js's filterCancelledVote). Dionysus can't
    // vote at all this round (see components/ExileVotePlayer.jsx's own
    // "Does not have the ability to cast a vote" branch), so whoever
    // currently holds that power is exempt by construction, not a
    // separate carve-out. Nominees themselves DO vote in this app
    // (just not for themselves) and are checked the same as everyone
    // else — confirmed against the actual voting UI before assuming.
    const missedVoteNames = [];
    const removedForVoteNames = [];
    for (const p of alivePlayers) {
      if (!p.approved) continue;
      if (powerFor(p, settings) === "Dionysus") continue;
      if (votes[p.id]) continue;
      const result = await applyInactivityStrike(env, p.id, "missed-exile-vote");
      if (!result.applied) continue;
      (result.removed ? removedForVoteNames : missedVoteNames).push(playersById[p.id] || "someone");
    }
    if (missedVoteNames.length > 0 || removedForVoteNames.length > 0) {
      let msg = "";
      if (missedVoteNames.length > 0) msg += `⏳ ${missedVoteNames.join(", ")} didn't vote this round and received an inactivity strike.`;
      if (removedForVoteNames.length > 0) msg += `${msg ? "\n\n" : ""}🚫 ${removedForVoteNames.join(", ")} reached 3 inactivity strikes and have been removed from the game.`;
      await postMessage(msg);
    }

    for (const id of exiledIds) {
      await setPlayerAlive(client, id, false, "exiled", round.round);
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

    // Ares's character power (see lib/characterPowers.js) — computed once
    // for the whole batch of eliminations rather than inside the loop
    // above, since it needs the full exiledIds list to check against (a
    // double elimination could exile Ares's target alongside someone
    // else in the same round).
    for (const update of computeAresImmunityUpdates(exiledIds, players, settings, round.round)) {
      await client.from("players").update({ power_state: update.power_state }).eq("id", update.playerId);
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

  // Instant inactivity removal (see checkInstantInactivityRemoval's own
  // comment above, and lib/inactivity.js's meetsInstantRemovalCriteria)
  // — deliberately placed here, after the "game already ended outright"
  // shortcut above (removing someone for inactivity once a winner's
  // already been declared makes no sense), but BEFORE anything below
  // touches KEY_CHALLENGE, since this reads it for the battle-ban
  // exemption and needs it to still reflect the round that's ending.
  await checkInstantInactivityRemoval(env, round.round, round.roundStartedAt, remainingAlive);

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
        // Voting opens immediately, concurrent with the Q&A period
        // (statements + jury questions/responses — see
        // lib/finaleQaData.js) rather than gated behind a separate host
        // step — phase is kept at "voting" from the very start (not a
        // "qa" value transitioning later) specifically because the
        // advance-gate above and the auto-close-voting check both key
        // off phase === "voting" to mean "voting has genuinely started";
        // this way that logic doesn't need to change even though there's
        // no longer a separate qa-only period before it.
        phase: "voting",
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
      `🔥 We've reached the Finale! Finalists: ${remainingAlive.map((p) => p.display_name).join(", ")}.\n\nVoting is open now — every exiled player who didn't quit or wasn't removed votes for a winner, and the Power of Khaos is up for grabs among them too. Finalists can write their statement and answer jury questions the whole time voting is open.`
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
    // Distinct from phaseStartedAt, which resets on every phase change
    // WITHIN a round (Challenge -> Fates -> Exile) — this is the one
    // timestamp that stays fixed for the round's entire duration,
    // needed for the inactivity system's instant-removal check (did
    // this player vote, chat, DM, or play at ANY point in the round,
    // not just during one specific phase of it — see
    // lib/inactivity.js).
    roundStartedAt: now,
    finalFour: remainingAlive.length === 4, doubleElimination: false,
  }));
  if (!roundRes.ok) throw new Error("Couldn't move to the next round — try again.");
  // Once roundRes.ok is true, round.phase has already moved away from
  // "exile" — the outer dispatch (top of advancePhase) would never
  // route back into THIS function for this same transition again even
  // on a retry, which is what makes this call itself safe to only ever
  // run once per actual round transition.
  await applyStrikeDecayIfDue(env, nextRound);
  await postMessage(`➡️ Round ${nextRound} begins. ${remainingAlive.length} players remain${remainingAlive.length === 4 ? " — this is the FINAL FOUR." : ""}. The host will start the next Battle shortly.\n\nFrom Achilles to Odysseus, legends are forged on the battlefield. Today, you go to battle. Will you become a legend in your own right?`);
  await notifyRoundChange(gameId, `⚔️ Round ${nextRound} Begins`, `${remainingAlive.length} players remain. A new Battle is coming up.`);
  return { advanced: true, to: PHASES.CHALLENGE };
}

// Applies a preference list (see lib/juryPreferenceData.js) on behalf
// of any jury-eligible player who hasn't cast a real vote — called
// every time the Finale vote is checked for closing, so this can
// resolve the moment voting actually closes rather than needing its
// own separate timing logic. Matches a juror's ranked list against the
// list ranked here — that list was built well before the actual
// finalists were known, so most entries in it were never going to be
// finalists at all; this just walks it in rank order and takes the
// first one that IS. A juror with no preference list, or whose entire
// list misses every actual finalist, is left untouched — same as
// today, no vote gets counted for them, no strike-adjacent behavior
// invented here (the actual strike for a missed vote already happens
// separately, right after this in advanceFromFinale).
async function resolveAwolJuryVotes(env, finalistIds) {
  const { gameId, db, players, playersById, settings } = env;
  const preferences = (await db.get(gameId, "pb:jury-preferences")) || {};

  const res = await db.update(gameId, "pb:finale-votes", (fresh) => {
    const next = { ...(fresh || {}) };
    for (const p of players || []) {
      if (!isJuryEligible(p)) continue;
      if (next[p.id]) continue; // already has a real (or previously auto-resolved) vote
      const prefs = preferences[p.id];
      if (!prefs || prefs.length === 0) continue;
      const aphroditeBlockedId = aphroditeBlocksTargeting(players, settings, p.id);
      const match = prefs.find((pref) => finalistIds.includes(pref.targetId) && pref.targetId !== aphroditeBlockedId);
      if (!match) continue;
      next[p.id] = {
        targetId: match.targetId,
        targetName: playersById[match.targetId] || "?",
        voterName: playersById[p.id] || "?",
        reason: match.reason,
        time: new Date().toLocaleTimeString(),
        autoResolved: true, // lets the reveal UI show this was an applied preference, not a live vote — see components/FinalePlayer.jsx's reveal branch
      };
    }
    return next;
  });
  return res.ok && res.value ? res.value : (await db.get(gameId, "pb:finale-votes")) || {};
}

// ─── FINALE -> ENDED ───
async function advanceFromFinale(env) {
  const { gameId, db, client, postMessage, now, round, settings, players, playersById } = env;
  const finale = await db.get(gameId, KEY_FINALE);
  if (!finale) return { advanced: false, reason: "no-finale-state" };

  const finalistIdsForJury = finale.finalists.map((f) => f.playerId);
  const votes = await resolveAwolJuryVotes(env, finalistIdsForJury);
  // Defense in depth alongside the UI-level gate in FinalePlayer.jsx —
  // that fix stops a quit/removed player from casting a NEW vote going
  // forward, but can't retroactively un-record a vote that was already
  // cast before this shipped. Filtering here, at the actual tally, is
  // what guarantees an ineligible vote never counts toward deciding a
  // winner, regardless of how it got recorded.
  const eligibleVoterIds = new Set((players || []).filter(isJuryEligible).map((p) => p.id));
  const voteRows = filterCancelledVote(
    Object.entries(votes)
      .filter(([voterId]) => eligibleVoterIds.has(voterId))
      .map(([voterId, v]) => ({ voterId, targetId: v.targetId, reason: v.reason || null })),
    finale.artemisCancelledVoterId
  );
  const finalistIds = finalistIdsForJury;

  const { data: secretRow } = await client
    .from("chaos_secrets")
    .select("nullified_player_id, reason")
    .eq("game_id", gameId)
    .eq("context", "finale")
    .maybeSingle();
  let nullifiedId = secretRow?.nullified_player_id || null;
  let nullifiedReason = secretRow?.reason || null;

  // Same gap as advanceFromExile above, same fix, now with the same
  // timeout too — confirmed directly with the season's host rather than
  // silently changed: this phase originally waited indefinitely for the
  // holder BY DESIGN (no configured window at all, unlike Exile), since
  // it's the game's one-time climactic vote. "Khaos should always be
  // exercised" can't mean anything without SOME bound on how long to
  // wait, so this now reuses the same voteDurationSec window Exile
  // already uses, rather than leaving Finale's Khaos decision genuinely
  // unbounded while every other trigger in this system has one.
  if (finale.chaosHolderId && !nullifiedId) {
    const voteTimeoutMs = settings.voteDurationSec * 1000;
    const timedOut = !settings.infiniteTime && round.phaseStartedAt && (now - round.phaseStartedAt >= voteTimeoutMs);
    if (!timedOut) {
      if (!finale.holderWaitAnnounced) {
        await postMessage(`🃏 Waiting on the Power of Khaos holder's decision before the finale vote can be finalized.`);
        await db.update(gameId, KEY_FINALE, (fresh) => (fresh ? { ...fresh, holderWaitAnnounced: true } : fresh));
      }
      return { advanced: false, reason: "waiting-on-holder-decision" };
    }

    const forcedPick = finale.finalists[Math.floor(Math.random() * finale.finalists.length)];
    const forcedReason = "(Auto-selected — the Power of Khaos holder made no decision in time.)";
    const { error: forceError } = await client
      .from("chaos_secrets")
      .upsert(
        { game_id: gameId, context: "finale", nullified_player_id: forcedPick.playerId, reason: forcedReason, set_by: null, updated_at: new Date().toISOString() },
        { onConflict: "game_id,context" }
      );
    if (forceError) { console.error("Failed to force-exercise the Power of Khaos:", forceError); return { advanced: false, reason: "waiting-on-holder-decision" }; }
    nullifiedId = forcedPick.playerId;
    nullifiedReason = forcedReason;

    // No next-round battle-ban here — this is the finale, there is no
    // next round for one to apply to. The strike still applies, same as
    // every other missed-decision trigger in this system.
    const strikeResult = await applyInactivityStrike(env, finale.chaosHolderId, "missed-khaos-decision");

    const holderName = playersById[finale.chaosHolderId] || "The Power of Khaos holder";
    let khaosAnnouncement = `🃏 ${holderName} made no Power of Khaos decision within ${formatDurationHours(settings.voteDurationSec)} — the game has exercised it on their behalf.`;
    if (strikeResult.applied) khaosAnnouncement += ` They received an inactivity strike.`;
    if (strikeResult.removed) khaosAnnouncement += `\n\n🚫 They reached 3 inactivity strikes and have been removed from the game.`;
    await postMessage(khaosAnnouncement);
  }

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

  // Inactivity strike (see lib/inactivity.js) for anyone jury-eligible
  // who didn't vote — this function only ever reaches this far ONCE
  // (round.phase moves to ENDED right below, so a later poll never
  // re-enters this code path), so there's no separate "only once" gate
  // needed the way advanceFromExile's !exile.revealed provides. Uses
  // the SAME isJuryEligible check the actual jury voting UI is built
  // on (lib/finaleQaData.js) — jurors are exiled players who didn't
  // quit, not the alive finalists themselves. A juror who already
  // hit 3 strikes and gets flagged again here won't actually be
  // re-eliminated a second time — see applyInactivityStrike's own
  // comment on why that's deliberate, confirmed directly rather than
  // assumed. Dionysus can't vote in the finale either (see
  // components/FinalePlayer.jsx's own Dionysus branch) — same
  // exemption-by-construction as the Exile Vote check above.
  const missedFinaleVoteNames = [];
  const removedForFinaleVoteNames = [];
  for (const p of players || []) {
    if (!isJuryEligible(p)) continue;
    if (powerFor(p, settings) === "Dionysus") continue;
    if (votes[p.id]) continue;
    const result = await applyInactivityStrike(env, p.id, "missed-finale-vote");
    if (!result.applied) continue;
    (result.removed ? removedForFinaleVoteNames : missedFinaleVoteNames).push(playersById[p.id] || "someone");
  }
  if (missedFinaleVoteNames.length > 0 || removedForFinaleVoteNames.length > 0) {
    let inactivityMsg = "";
    if (missedFinaleVoteNames.length > 0) inactivityMsg += `⏳ ${missedFinaleVoteNames.join(", ")} didn't cast a jury vote and received an inactivity strike.`;
    if (removedForFinaleVoteNames.length > 0) inactivityMsg += `${inactivityMsg ? "\n\n" : ""}🚫 ${removedForFinaleVoteNames.join(", ")} reached 3 inactivity strikes.`;
    await postMessage(inactivityMsg);
  }

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
