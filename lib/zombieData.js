export const ANTIDOTE_WINDOW = 10 * 60 * 1000; // 10 minutes
export const STORAGE_KEY_ZOMBIE = "traitors:zombie";

// Counts current humans/zombies from statuses — used only for the host's
// aggregate round-end reveal (count only, never identities), matching the
// real format: "the number of zombies and humans will be revealed... but
// not the identities."
export function zombieCounts(st) {
  const vals = Object.values(st.statuses || {});
  return {
    humans: vals.filter((v) => v === "human").length,
    zombies: vals.filter((v) => v === "zombie").length,
  };
}

// Have these two ever touched, in any round? Touches are unique for the
// whole game, not just the current round.
export function haveTouched(fresh, a, b) {
  return (fresh.touches || []).some((t) => (t.a === a && t.b === b) || (t.a === b && t.b === a));
}

// Resolves an accepted mutual touch. Mutates `fresh` in place. This is the
// only place status ever changes as a result of a touch, and it never
// returns anything that would let a caller infer who's a zombie — callers
// only ever learn "the touch happened," never the outcome.
export function resolveTouch(fresh, round, a, b) {
  const sa = fresh.statuses[a], sb = fresh.statuses[b];
  let result = "none";
  if (sa === "human" && sb === "human") {
    fresh.scores[a] = (fresh.scores[a] || 0) + 1;
    fresh.scores[b] = (fresh.scores[b] || 0) + 1;
    result = "score";
  } else if (sa === "zombie" && sb === "human") {
    fresh.statuses[b] = "zombie";
    fresh.infectionTimes[b] = Date.now();
    result = "infect";
  } else if (sa === "human" && sb === "zombie") {
    fresh.statuses[a] = "zombie";
    fresh.infectionTimes[a] = Date.now();
    result = "infected";
  }
  fresh.touches = [...(fresh.touches || []), { a, b, round, time: Date.now(), result }];
}

