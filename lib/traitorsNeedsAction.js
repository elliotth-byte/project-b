import { useState, useEffect } from "react";
import { subscribeGameState } from "./gameStorage";
import { subscribeTraitorState } from "./traitorStorage";
import { murderVoteKey } from "./murderVoteData";
import { STORAGE_KEY_ROUND_INFO, VOTES_KEY_PREFIX } from "./roundtableData";
import { EYES_VILLA_ROUNDS } from "./eyesVillaData";
import {
  STORAGE_KEY_WORDS, STORAGE_KEY_CASINO, STORAGE_KEY_HOT_POTATO, STORAGE_KEY_ZOMBIE,
  STORAGE_KEY_PIGGY, STORAGE_KEY_MASQUERADE, STORAGE_KEY_ATTACK_DEFEND, STORAGE_KEY_VOODOO,
  STORAGE_KEY_MAZE3D, STORAGE_KEY_COFFIN, STORAGE_KEY_ICEBREAKER,
  STORAGE_KEY_EYES_VILLA, STORAGE_KEY_PICKPOCKET,
} from "./traitorsMiniGames";

// ─── Traitors: "needs your action" red-dot tracking ───
// Every one of these 13 mini-games tracks its own "is this player done
// yet" state entirely differently (a times-map, a submitted-list, a
// per-player guess object, a currently-held-potato check...) — there's
// no shared "done" convention to hook into generically, so each gets its
// own small selector function here, confirmed against that game's own
// Host/Player component rather than guessed. Two games (Casino, Voodoo)
// have no sane "needs action" signal at all — they're ongoing/optional
// rather than something with a completable task — so they only ever
// contribute to "is something active" (for the empty-state message),
// never to the dot itself.
//
// All per-player state below is keyed by player NAME (a string), not id
// — matching every Traitors mini-game's own storage convention (see
// e.g. components/PiggyPlayer.jsx's submitted/allocations, all name-
// keyed) — so this hook takes `playerName`, not a player id.
function activeOnly(active) {
  return { active: !!active, needsAction: false };
}

const SELECTORS = {
  [STORAGE_KEY_WORDS]: (st, name) => !st?.active ? { active: false, needsAction: false } : { active: true, needsAction: st.times?.[name] == null },

  [STORAGE_KEY_CASINO]: (st) => activeOnly(st?.active),

  [STORAGE_KEY_HOT_POTATO]: (st, name) => {
    if (!st?.active || st.paused) return { active: false, needsAction: false };
    const eliminated = st.eliminated?.includes(name);
    const holding = !eliminated && (st.potatoes || []).some((p) => !p.exploded && p.holder === name);
    return { active: true, needsAction: !!holding };
  },

  [STORAGE_KEY_ZOMBIE]: (st, name) => {
    if (!st?.active || st.paused) return { active: false, needsAction: false };
    const isParticipant = !st.participants || st.participants.includes(name);
    const incoming = isParticipant && (st.pending || []).some((p) => p.to === name);
    return { active: true, needsAction: !!incoming };
  },

  [STORAGE_KEY_PIGGY]: (st, name) => {
    if (!st?.active) return { active: false, needsAction: false };
    const isParticipant = !st.participants || st.participants.includes(name);
    return { active: true, needsAction: isParticipant && !st.submitted?.includes(name) };
  },

  [STORAGE_KEY_MASQUERADE]: (st, name) => {
    if (!st?.active) return { active: false, needsAction: false };
    const myHouse = (st.houses || []).find((h) => h.members.includes(name));
    if (!myHouse) return { active: true, needsAction: false };
    const eliminatedCount = (st.houses || []).filter((h) => h.status === "eliminated").length;
    const missionDone = eliminatedCount >= st.loseTarget;
    const guess = st.guesses?.[name] || {};
    return { active: true, needsAction: !missionDone && (!guess.shieldGuess || !guess.killerGuess) };
  },

  [STORAGE_KEY_ATTACK_DEFEND]: (st, name) => {
    if (!st?.active || st.paused) return { active: false, needsAction: false };
    const myTeam = st.teams?.red?.includes(name) ? "red" : st.teams?.blue?.includes(name) ? "blue" : null;
    const needsAction = !!myTeam && !!st.activeAttack && st.activeAttack.team !== myTeam && !st.usedDefend?.[name];
    return { active: true, needsAction };
  },

  [STORAGE_KEY_VOODOO]: (st) => activeOnly(st?.active && !st?.paused),

  [STORAGE_KEY_MAZE3D]: (st, name) => !st?.active ? { active: false, needsAction: false } : { active: true, needsAction: st.times?.[name] == null },

  [STORAGE_KEY_COFFIN]: (st, name) => !st?.active ? { active: false, needsAction: false } : { active: true, needsAction: st.times?.[name] == null },

  [STORAGE_KEY_ICEBREAKER]: (st, name) => {
    if (!st?.active || st.paused) return { active: false, needsAction: false };
    const isParticipant = !st.participants || st.participants.includes(name);
    if (!isParticipant) return { active: true, needsAction: false };
    let needsAction = false;
    if (st.phase === "questions") needsAction = !st.questions?.[name];
    else if (st.phase === "answers") needsAction = Object.keys(st.questions || {}).length > 0 && !st.answers?.[name];
    else if (st.phase === "guessing") needsAction = !st.winner && !st.eliminated?.includes(name) && !st.guesses?.[name];
    return { active: true, needsAction };
  },

  [STORAGE_KEY_EYES_VILLA]: (st, name) => {
    if (!st?.active) return { active: false, needsAction: false };
    const isParticipant = !st.participants || st.participants.includes(name);
    if (!isParticipant) return { active: true, needsAction: false };
    const answered = st.results?.[name]?.answers?.length || 0;
    return { active: true, needsAction: answered < EYES_VILLA_ROUNDS };
  },

  [STORAGE_KEY_PICKPOCKET]: (st, name) => {
    if (!st?.active) return { active: false, needsAction: false };
    const isParticipant = !st.participants || st.participants.includes(name);
    if (!isParticipant) return { active: true, needsAction: false };
    return { active: true, needsAction: st.times?.[name] == null };
  },
};

function useMiniGameStatus(gameId, storageKey, playerName) {
  const [status, setStatus] = useState({ active: false, needsAction: false });
  useEffect(() => {
    if (!gameId) return;
    const selector = SELECTORS[storageKey];
    const unsubscribe = subscribeGameState(gameId, storageKey, (st) => {
      setStatus(selector(st, playerName) || { active: false, needsAction: false });
    });
    return unsubscribe;
  }, [gameId, storageKey, playerName]);
  return status;
}

// ─── Mission tab ───
export function useMissionTabStatus(gameId, playerName, globallyDisabled) {
  const statuses = {
    [STORAGE_KEY_WORDS]: useMiniGameStatus(gameId, STORAGE_KEY_WORDS, playerName),
    [STORAGE_KEY_CASINO]: useMiniGameStatus(gameId, STORAGE_KEY_CASINO, playerName),
    [STORAGE_KEY_HOT_POTATO]: useMiniGameStatus(gameId, STORAGE_KEY_HOT_POTATO, playerName),
    [STORAGE_KEY_ZOMBIE]: useMiniGameStatus(gameId, STORAGE_KEY_ZOMBIE, playerName),
    [STORAGE_KEY_PIGGY]: useMiniGameStatus(gameId, STORAGE_KEY_PIGGY, playerName),
    [STORAGE_KEY_MASQUERADE]: useMiniGameStatus(gameId, STORAGE_KEY_MASQUERADE, playerName),
    [STORAGE_KEY_ATTACK_DEFEND]: useMiniGameStatus(gameId, STORAGE_KEY_ATTACK_DEFEND, playerName),
    [STORAGE_KEY_VOODOO]: useMiniGameStatus(gameId, STORAGE_KEY_VOODOO, playerName),
    [STORAGE_KEY_MAZE3D]: useMiniGameStatus(gameId, STORAGE_KEY_MAZE3D, playerName),
    [STORAGE_KEY_COFFIN]: useMiniGameStatus(gameId, STORAGE_KEY_COFFIN, playerName),
    [STORAGE_KEY_ICEBREAKER]: useMiniGameStatus(gameId, STORAGE_KEY_ICEBREAKER, playerName),
    [STORAGE_KEY_EYES_VILLA]: useMiniGameStatus(gameId, STORAGE_KEY_EYES_VILLA, playerName),
    [STORAGE_KEY_PICKPOCKET]: useMiniGameStatus(gameId, STORAGE_KEY_PICKPOCKET, playerName),
  };
  const relevant = Object.entries(statuses).filter(([key]) => !globallyDisabled?.includes(key)).map(([, v]) => v);
  return {
    active: relevant.some((g) => g.active),
    needsAction: relevant.some((g) => g.needsAction),
  };
}

// ─── Roundtable tab ───
// Two completely separate vote mechanisms can both live under this one
// tab (see components/TraitorsPlayerPanels.jsx): the public Roundtable
// exile vote (gameStorage-backed, round-numbered key) and the secret
// Murder Vote (traitorStorage-backed, faction-keyed, traitor-only). Both
// are checked; either one being open-and-unvoted lights the dot.
export function useRoundtableTabStatus(gameId, playerName, myRole) {
  const [roundInfo, setRoundInfo] = useState(null);
  useEffect(() => {
    if (!gameId) return;
    return subscribeGameState(gameId, STORAGE_KEY_ROUND_INFO, setRoundInfo);
  }, [gameId]);

  const [roundVotes, setRoundVotes] = useState(null);
  useEffect(() => {
    if (!gameId || !roundInfo?.round) { setRoundVotes(null); return; }
    return subscribeGameState(gameId, VOTES_KEY_PREFIX + roundInfo.round, setRoundVotes);
  }, [gameId, roundInfo?.round]);

  const isTraitorRole = myRole === "traitor-red" || myRole === "traitor-black";
  const [murderVote, setMurderVote] = useState(null);
  useEffect(() => {
    if (!gameId || !isTraitorRole) { setMurderVote(null); return; }
    return subscribeTraitorState(gameId, murderVoteKey(myRole), setMurderVote);
  }, [gameId, isTraitorRole, myRole]);

  const roundtableOpen = !!roundInfo?.votingOpen;
  const roundtableNeedsAction = roundtableOpen && !roundVotes?.[playerName];

  const murderOpen = isTraitorRole && murderVote?.status === "open";
  const murderNeedsAction = murderOpen && murderVote?.eligibleVoters?.includes(playerName) && !murderVote?.votes?.[playerName];

  return {
    active: roundtableOpen || murderOpen,
    needsAction: roundtableNeedsAction || murderNeedsAction,
  };
}
