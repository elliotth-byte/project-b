import { useEffect, useState } from "react";
import { storageUpdate } from "./gameStorage";
import { STORAGE_KEY_ICEBREAKER } from "./icebreakerData";

// ─── Icebreaker: timed question reveals ───
// The schedule lives in the game state itself (`nextRevealAt` +
// `revealIntervalMs`), not in a timer inside the host's panel, so it
// doesn't depend on the host console being open or on a particular tab
// being mounted. Any open Icebreaker view (host OR player) checks it and,
// once a reveal is due, applies it through storageUpdate. That's a
// compare-and-set, so if several clients notice at the same moment only
// one actually reveals — the rest re-read fresh state, see the clock has
// already moved on, and do nothing.

export const REVEAL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const CHECK_EVERY_MS = 15000;

// Mutates `fresh` and returns true if a reveal was applied (or the
// schedule was closed out), false if nothing was due. If the app sat
// unopened past more than one interval, every missed reveal is applied so
// the schedule stays honest ("one per hour"), and the clock advances in
// whole intervals rather than drifting.
export function applyDueReveals(fresh, now = Date.now()) {
  if (!fresh || !fresh.active || fresh.paused || fresh.winner) return false;
  if (fresh.phase !== "guessing") return false;
  const interval = fresh.revealIntervalMs;
  if (!interval || !fresh.nextRevealAt || now < fresh.nextRevealAt) return false;

  if (!Array.isArray(fresh.revealedQuestions)) fresh.revealedQuestions = [];
  const pool = Object.keys(fresh.questions || {}).filter((q) => !fresh.revealedQuestions.includes(q));
  if (!pool.length) {
    fresh.nextRevealAt = null;
    return true;
  }

  const dueCount = Math.floor((now - fresh.nextRevealAt) / interval) + 1;
  const n = Math.min(dueCount, pool.length);
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    fresh.revealedQuestions.push(pool.splice(idx, 1)[0]);
  }
  fresh.lastRevealedAt = now;
  fresh.nextRevealAt = pool.length ? fresh.nextRevealAt + n * interval : null;
  return true;
}

// Call once near the top of any component that has the Icebreaker state.
// Makes no network calls until a reveal is actually due.
export function useIcebreakerAutoReveal(gameId, st) {
  const scheduled = !!st && !!st.active && st.phase === "guessing" && !st.paused && !st.winner && !!st.nextRevealAt;
  const nextRevealAt = st?.nextRevealAt;

  useEffect(() => {
    if (!scheduled) return undefined;
    let cancelled = false;
    const tick = () => {
      if (cancelled || Date.now() < nextRevealAt) return;
      storageUpdate(gameId, STORAGE_KEY_ICEBREAKER, (fresh) => (applyDueReveals(fresh) ? fresh : null));
    };
    tick();
    const id = setInterval(tick, CHECK_EVERY_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [gameId, scheduled, nextRevealAt]);
}

// Ticks once a second, but only while there's a target time to count down to.
export function useNowWhile(target) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  return now;
}

export function formatCountdown(ms) {
  if (ms <= 0) return "any moment now";
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
