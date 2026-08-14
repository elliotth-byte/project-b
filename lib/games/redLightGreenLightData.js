// ─── Red Light, Green Light ───
// Same shared-seed fairness as Whack-a-Mole's mole sequence and the
// Stroop wall — everyone faces the identical red/green timing sequence,
// generated once from the challenge's shared start time, not their own
// independently-random cycle. Tap during green to score; tap during red
// and you lose a life. Ends on hitting 100, losing all 3 lives, or the
// challenge's own timer running out — whichever comes first.

const GREEN_MIN_MS = 1400, GREEN_MAX_MS = 3200;
const RED_MIN_MS = 900, RED_MAX_MS = 2400;
export const TARGET_SCORE = 100;
export const STARTING_LIVES = 3;

function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

// Pre-generates enough alternating green/red segments to cover the whole
// challenge duration — [{ type: "green"|"red", startMs, endMs }, ...].
// Always starts with green (a fair beat to get going before any risk).
export function generateLightSchedule(seed, totalMs) {
  const rand = seededRandom(seed || 1);
  const schedule = [];
  let t = 0;
  let type = "green";
  while (t < totalMs) {
    const durationMs = type === "green"
      ? GREEN_MIN_MS + rand() * (GREEN_MAX_MS - GREEN_MIN_MS)
      : RED_MIN_MS + rand() * (RED_MAX_MS - RED_MIN_MS);
    schedule.push({ type, startMs: t, endMs: t + durationMs });
    t += durationMs;
    type = type === "green" ? "red" : "green";
  }
  return schedule;
}

export function lightAt(schedule, elapsedMs) {
  return schedule.find((seg) => elapsedMs >= seg.startMs && elapsedMs < seg.endMs) || schedule[schedule.length - 1];
}
