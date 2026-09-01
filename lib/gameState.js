import { storageGet, storageSet, storageUpdate, subscribeGameState } from "./gameStorage";

// ============================================================
// Project B — shared game_state keys.
//
// Everything below lives in the same `game_state` table the original
// Traitors project used (see lib/gameStorage.js) — nothing here is secret,
// so there's no need for the host-only `host_state` table the original
// project used for traitor roles. All keys are namespaced "pb:" (Project B).
// ============================================================

export const KEY_SETTINGS = "pb:settings";
export const KEY_ROUND = "pb:round";
export const KEY_CHALLENGE = "pb:challenge";
export const KEY_FATES = "pb:fates";
export const KEY_EXILE = "pb:exile";
export const KEY_EXILE_VOTES = "pb:exile-votes"; // + ":" + round
export const KEY_EXILE_HISTORY = "pb:exile-history";
export const KEY_REENTRY = "pb:reentry";
export const KEY_FINALE = "pb:finale";
export const KEY_FINALE_QA = "pb:finale-qa"; // finalist statements + jury questions/responses — see lib/finaleQaData.js
export const KEY_CHALLENGE_HISTORY = "pb:challenge-history";
export const KEY_ANNOUNCEMENTS = "pb:announcements"; // rolling in-app feed of automated game announcements

export const PHASES = {
  LOBBY: "lobby",
  CHALLENGE: "challenge",
  FATES: "fates",
  EXILE: "exile",
  FINALE: "finale",
  ENDED: "ended",
};

// ─── Round-length settings (admin-configurable) ───
// challengeDurationSec / voteDurationSec are the DEFAULT lengths the host
// sets once in Admin; each individual challenge/exile-vote can still be
// started with a shorter/longer override for that round specifically.
export const DEFAULT_SETTINGS = {
  challengeDurationSec: 15 * 60, // 15 minutes
  fatesDurationSec: 5 * 60, // 5 minutes to make nominations
  voteDurationSec: 5 * 60, // 5 minutes discussion + voting, per the rules
  autoAdvance: true, // if false, host must manually click "advance" every phase
  infiniteTime: false, // if true, no phase ever gets an automatic timer — every advance is manual
  chatEnabled: false, // off by default — an existing season doesn't suddenly grow a Chat tab underneath it
  aliasEnabled: false, // off by default, and locked once Round 1 starts — see components/AdminHost.jsx
  avatarMode: "none", // "none" | "player_upload" | "host_upload" | "collection" — see lib/avatarIdentity.js
  avatarCollectionId: null, // only meaningful when avatarMode === "collection" — see lib/avatarCollections.js
  characterPowersMode: "off", // "off" | "by_character" | "random" — see lib/characterPowers.js
  challengeSelectionMode: "manual", // "manual" | "random" — see lib/challengeSelection.js
  disabledChallenges: [], // game type keys (lib/challengeGames.js) turned off for THIS season specifically — see lib/challengeSelection.js's eligibleGameTypes for how this combines with the separate, platform-wide disabled list
  inactivityEnabled: false, // Traitors-only toggle (see lib/traitorsInactivity.js) — Project B's own inactivity system (lib/roundEngine.js) is always on and never reads this key at all; off by default since Traitors never had this system before.
};

export async function getSettings(gameId) {
  const v = await storageGet(gameId, KEY_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(v || {}) };
}

export async function setSettings(gameId, patch) {
  return storageUpdate(gameId, KEY_SETTINGS, (fresh) => ({ ...DEFAULT_SETTINGS, ...(fresh || {}), ...patch }));
}

export function subscribeSettings(gameId, onChange) {
  return subscribeGameState(gameId, KEY_SETTINGS, (v) => onChange({ ...DEFAULT_SETTINGS, ...(v || {}) }));
}

// ─── Round info (current phase + timer) ───
export function subscribeRound(gameId, onChange) {
  return subscribeGameState(gameId, KEY_ROUND, onChange);
}

export async function getRound(gameId) {
  return storageGet(gameId, KEY_ROUND);
}

export async function initRound(gameId) {
  return storageSet(gameId, KEY_ROUND, {
    round: 1,
    phase: PHASES.LOBBY,
    phaseStartedAt: null,
    phaseEndsAt: null,
    finalFour: false,
    finale: false,
    doubleElimination: false,
    winnerId: null,
    winnerName: null,
    lastMessage: null,
  });
}

// The host's "Start Round 1" action — actually moves into the Challenge
// phase, unlike initRound() above (which just (re)creates the blank
// lobby state, used by Admin's season reset). ChallengeHost's own setup
// screen is what sets a real timer once the host picks a challenge and
// clicks Start there — this just opens the door into Round 1.
export async function startSeason(gameId) {
  return storageSet(gameId, KEY_ROUND, {
    round: 1,
    phase: PHASES.CHALLENGE,
    phaseStartedAt: null,
    phaseEndsAt: null,
    // See lib/roundEngine.js's own comment on this same field at the
    // round-to-round transition — the inactivity system's instant-
    // removal check needs the round's own fixed start time, distinct
    // from phaseStartedAt (which resets on every phase change WITHIN a
    // round), so it can tell whether a player did ANYTHING across the
    // whole round, not just during one specific phase of it.
    roundStartedAt: Date.now(),
    finalFour: false,
    finale: false,
    doubleElimination: false,
    winnerId: null,
    winnerName: null,
    lastMessage: null,
  });
}

export async function updateRound(gameId, updater) {
  return storageUpdate(gameId, KEY_ROUND, (fresh) => updater(fresh || {
    round: 1, phase: PHASES.LOBBY, phaseStartedAt: null, phaseEndsAt: null,
    finalFour: false, finale: false, doubleElimination: false, winnerId: null, winnerName: null, lastMessage: null,
  }));
}
