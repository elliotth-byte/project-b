// ─── Content Filter ───
// A deliberately narrow, last-resort backstop — not a general
// profanity filter. Report + Block (see lib/blockedUsers.js,
// lib/chatData.js's reportChatMessage) are what handle the actual
// gray area of "this is unkind/unwelcome/off-color for this group" —
// that's a judgment call between real people playing a social game
// together, not something a keyword list should be making for them.
// This only ever catches the small set of things that should never be
// sendable at all, on any platform, in any context: slurs, and
// explicit threats or encouragement of real-world harm. Apple's
// Guideline 1.2 specifically expects "a filter for objectionable
// material" as one of several required safeguards alongside
// reporting/blocking, not instead of them — this is that piece.
//
// normalize() strips the simplest evasion attempts (spacing, repeated
// characters, a few common leetspeak substitutions) before matching —
// enough to catch someone typing around a direct block on the first
// try, not an arms race against someone determined to evade it. A
// determined bad actor can always find a way around any keyword list;
// the backstop here is deliberately paired with Report for exactly
// that reason.
function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[0@]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[5$]/g, "s")
    .replace(/[4]/g, "a")
    .replace(/[^a-z\s]/g, "")
    .replace(/(.)\1{2,}/g, "$1$1") // collapse 3+ repeated chars ("kiiiiill" -> "kiill") without fully erasing doubled letters that are legitimately part of a word
    .replace(/\s+/g, " ");
}

// Slurs — the small set of terms essentially every mainstream platform
// treats as never acceptable regardless of context, not an attempt at
// an exhaustive list. Kept intentionally short: this exists to block a
// handful of unambiguous cases, not to second-guess every word choice.
const SLUR_PATTERNS = [
  /\bn[i1]gg[ea3]r/i,
  /\bf[a4]gg[o0]t/i,
  /\bretard(ed)?\b/i,
  /\bk[i1]ke\b/i,
  /\bsp[i1]c\b/i,
  /\bch[i1]nk\b/i,
  /\btr[a4]nny\b/i,
];

// Explicit threats and self-harm encouragement — real-world harm
// directed at a real person, not game-context "eliminate" or "exile"
// language this app already uses constantly for its own mechanics.
// Deliberately doesn't include anything as ambiguous as "I will find
// you" on its own — that phrase shows up completely innocently in
// normal game chat ("I'll find you a partner for the next round"), and
// a false block on ordinary conversation does more damage to trust in
// this feature than letting a genuinely ambiguous phrase through to
// the Report system, which is exactly what it's for.
const THREAT_PATTERNS = [
  /\bk[i1]ll\s*(your\s*self|ur\s*self|yourself)\b/i,
  /\bkys\b/i,
  /\bi\s*(will|m going to|am going to)\s*kill\s*you\b/i,
  /\bi\s*know\s*where\s*you\s*live\b/i,
];

export function findProhibitedMatch(text) {
  const normalized = normalize(text || "");
  const rawLower = (text || "").toLowerCase();
  for (const pattern of [...SLUR_PATTERNS, ...THREAT_PATTERNS]) {
    if (pattern.test(normalized) || pattern.test(rawLower)) return true;
  }
  return false;
}

export function checkMessage(text) {
  if (findProhibitedMatch(text)) {
    return { allowed: false, reason: "That message can't be sent — it matches content this app never allows, regardless of context." };
  }
  return { allowed: true };
}
