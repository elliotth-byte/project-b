import { useState, useEffect } from "react";
import { subscribeGameState } from "./gameStorage";
import { subscribeScores } from "./challengeScores";
import { PHASES, KEY_FATES, KEY_CHALLENGE } from "./gameState";
import { isJuryEligible } from "./finaleQaData";
import { powerFor } from "./characterPowers";

// Powers the badge dot on the outer "🎲 Game" tab in pages/play.jsx —
// every action-requiring phase (Battle, Fates, Exile Vote, Finale) is
// ALREADY rendered under that one tab, phase-conditionally (see
// pages/play.jsx itself), so a single boolean here covers "needs to
// compete in a Battle" and "needs to vote" both at once, rather than
// needing separate signals per phase. Reuses each phase's own existing
// "have I already acted" check (ChallengePlayer.jsx's myScore?.locked,
// FatesPlayer.jsx's fates.nominations, ExileVotePlayer.jsx/
// FinalePlayer.jsx's votes[player.id]) instead of inventing a second,
// possibly-inconsistent copy of that logic here.
//
// Takes `myPlayer` specifically, not the derived `player` object
// pages/play.jsx builds for the game components — myPlayer is the one
// that actually carries alive/approved/eliminationType, which
// isJuryEligible needs and the derived object never had. Note the
// shape adapter right before that call below: isJuryEligible's own
// contract expects the raw snake_case elimination_type (it's built
// against real Supabase rows elsewhere in this app), while myPlayer's
// own field is the camelCase eliminationType — passing myPlayer
// straight through would have silently broken the "not quit" check
// (undefined !== "quit" is always true), so the object gets reshaped
// at the call site instead of duplicating isJuryEligible's own rule
// here with the right field names baked in by hand.
export function useNeedsAction(gameId, round, myPlayer, settings) {
  const phase = round?.phase;
  const [challenge, setChallenge] = useState(null);
  const [scores, setScores] = useState(null);
  const [fates, setFates] = useState(null);
  const [exileVotes, setExileVotes] = useState(null);
  const [finaleVotes, setFinaleVotes] = useState(null);

  useEffect(() => {
    if (!gameId || phase !== PHASES.CHALLENGE) return;
    const unsubChallenge = subscribeGameState(gameId, KEY_CHALLENGE, setChallenge);
    const unsubScores = round?.round ? subscribeScores(gameId, round.round, setScores) : () => {};
    return () => { unsubChallenge(); unsubScores(); };
  }, [gameId, phase, round?.round]);

  useEffect(() => {
    if (!gameId || phase !== PHASES.FATES) return;
    const unsubscribe = subscribeGameState(gameId, KEY_FATES, setFates);
    return unsubscribe;
  }, [gameId, phase]);

  useEffect(() => {
    if (!gameId || phase !== PHASES.EXILE || !round?.round) return;
    const unsubscribe = subscribeGameState(gameId, `pb:exile-votes:${round.round}`, setExileVotes);
    return unsubscribe;
  }, [gameId, phase, round?.round]);

  useEffect(() => {
    if (!gameId || phase !== PHASES.FINALE) return;
    const unsubscribe = subscribeGameState(gameId, "pb:finale-votes", setFinaleVotes);
    return unsubscribe;
  }, [gameId, phase]);

  if (!myPlayer?.id || !phase) return false;

  // Dionysus can't vote at all this round, in either Exile or the
  // Finale (see components/ExileVotePlayer.jsx and
  // components/FinalePlayer.jsx's own Dionysus branches) — highlighting
  // "you need to vote" for someone who structurally can't would be
  // actively misleading, not just unhelpful. powerFor itself already
  // handles either field-name shape (power_state or powerState), so
  // myPlayer can be passed directly here without adapting it.
  const isDionysus = powerFor(myPlayer, settings) === "Dionysus";

  if (phase === PHASES.CHALLENGE) {
    if (!challenge?.active || challenge.gameType === "manual") return false; // manual challenges are host-scored — there's nothing for a player to submit in the app
    if (!(challenge.participantIds || []).includes(myPlayer.id)) return false;
    return !scores?.[myPlayer.id]?.locked;
  }

  if (phase === PHASES.FATES) {
    if (!fates) return false;
    const isNominator = (fates.nominatorOrder || []).some((n) => n.playerId === myPlayer.id);
    if (!isNominator) return false;
    return !fates.nominations?.[myPlayer.id];
  }

  if (phase === PHASES.EXILE) {
    if (isDionysus || !exileVotes) return false;
    return !exileVotes[myPlayer.id];
  }

  if (phase === PHASES.FINALE) {
    const juryEligible = isJuryEligible({ approved: myPlayer.approved, alive: myPlayer.alive, elimination_type: myPlayer.eliminationType });
    if (isDionysus || !juryEligible || !finaleVotes) return false;
    return !finaleVotes[myPlayer.id];
  }

  return false;
}
