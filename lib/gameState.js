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
export const KEY_CHALLENGE_HISTORY = "pb:challenge-history";

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

export async function updateRound(gameId, updater) {
  return storageUpdate(gameId, KEY_ROUND, (fresh) => updater(fresh || {
    round: 1, phase: PHASES.LOBBY, phaseStartedAt: null, phaseEndsAt: null,
    finalFour: false, finale: false, doubleElimination: false, winnerId: null, winnerName: null, lastMessage: null,
  }));
}
