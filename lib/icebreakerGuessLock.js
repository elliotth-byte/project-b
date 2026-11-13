import { REVEAL_INTERVAL_MS } from "./icebreakerAutoReveal";

// ─── Icebreaker: wrong-guess lockout ───
// A wrong guess locks that player out only until the next question is
// revealed. The lock is tied to how many questions were revealed when they
// guessed (`revealCount` on their guess), so it clears by itself the moment
// anything new is revealed — hourly auto-reveal or a manual reveal alike.
// A correct guess never locks anyone out.
//
// If every question is already revealed there's no "next reveal" to wait
// for, so the lock falls back to one reveal-interval from the guess time
// instead of lasting forever.
//
// Guesses saved before this existed have no revealCount; those are treated
// as unlocked.
export function guessLockInfo(st, playerName, now = Date.now()) {
  const last = st?.guesses?.[playerName];
  if (!last || last.correct || last.revealCount == null) return { locked: false, until: null };

  const revealed = (st.revealedQuestions || []).length;
  if (revealed !== last.revealCount) return { locked: false, until: null };

  const total = Object.keys(st.questions || {}).length;
  if (total > revealed) return { locked: true, until: st.nextRevealAt || null };

  const until = (last.time || 0) + (st.revealIntervalMs || REVEAL_INTERVAL_MS);
  return now < until ? { locked: true, until } : { locked: false, until: null };
}
