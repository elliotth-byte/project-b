import { generateRound } from "./games/eyesInTheSystemData";

// ─── Eyes of the Villa ───
// Traitors' own reskin of Panopticon's "Eyes in the System": same core
// engine (three galleries scattered with colored masks, spot the one
// with the most of the called color — see components/games/
// TraitorsMaskIcons.jsx for the mask/gallery visuals), but wired up the
// way every other Traitors mini-game is, not through Panopticon's
// GAME_REGISTRY/ChallengeHost/ChallengePlayer machinery. Concretely:
//
//   - generateRound(rng) is reused UNCHANGED from lib/games/
//     eyesInTheSystemData.js — it's pure (no storage, no Panopticon-
//     specific state), so there's nothing Panopticon-specific to
//     disentangle from it.
//   - Panopticon generates its 8 rounds from a SEED so the Big Screen
//     bracket mode can regenerate them deterministically; Traitors mini-
//     games don't have an equivalent need (the host generates once and
//     the full result is just stored directly in shared game_state, the
//     same way MasqueradeHost.jsx stores its houses), so this just calls
//     generateRound(Math.random) directly — no seed/PRNG plumbing needed.
//   - Scoring (most correct, fastest breaks a tie) is tracked per
//     PLAYER NAME directly on the shared state blob, the same
//     results-map-on-one-row shape components/MasqueradePlayer.jsx's
//     guesses and components/PiggyPlayer.jsx's allocations already use —
//     not Panopticon's lib/challengeScores.js reportScore system, which
//     is bound to a round/challenge object Traitors mini-games don't have.
export const STORAGE_KEY_EYES_VILLA = "traitors:eyes-villa";
export const EYES_VILLA_ROUNDS = 8;

export function buildEyesVillaRounds() {
  return Array.from({ length: EYES_VILLA_ROUNDS }, () => generateRound(Math.random));
}

// Sort comparator: most correct first, total time ascending breaks a tie
// — same priority order as the original's placementValue, just kept as
// an explicit comparator here instead of a single packed number, since
// nothing in the Traitors side ever needs to serialize this into one
// sortable score the way Panopticon's score-desc rank system does.
export function compareEyesVillaResults(a, b) {
  if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
  return a.totalTimeMs - b.totalTimeMs;
}
