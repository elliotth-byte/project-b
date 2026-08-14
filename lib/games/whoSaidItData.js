// ─── Who Said It? ───
// Pulls real quotes from the Panopticon (group chat) history and asks
// players to guess who said each one. Fair and standardized the same
// way Whack-a-Mole's mole sequence is — every player's client fetches
// the SAME chat history and applies the SAME seeded selection, so
// everyone in the round gets an identical quiz without needing the host
// to precompute and store anything.
//
// Sender identity is always resolved through the CURRENT players roster
// (already alias-resolved by the time it reaches this game — see
// resolveIdentities/resolveAvatars in pages/play.jsx), matching against
// each message's senderId rather than trusting the name string that was
// stored at send time. That matters specifically for alias mode: a
// message sent before someone's alias was revealed, or before a host
// rename, should still show their CURRENT display name, not a stale one
// — and never their real name if the game is running under aliases.

const MIN_CHARS = 40;
const MIN_WORDS = 7;

function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

function isMemorable(body) {
  const text = (body || "").trim();
  if (text.length < MIN_CHARS) return false;
  return text.split(/\s+/).filter(Boolean).length >= MIN_WORDS;
}

// messages: the raw pb:group-chat array (see lib/chatData.js — each
// {senderId, body, ...}). players: current roster, [{id, display_name}].
// Returns as many questions as it reasonably can, up to `count` — never
// throws or requires a minimum, since a young season just won't have
// much chat history yet; the player component is what decides how to
// handle getting back fewer than expected.
export function pickWhoSaidItQuestions(messages, players, seed, count) {
  const rand = seededRandom(seed || 1);
  const rosterIds = new Set(players.map((p) => p.id));

  const pool = (messages || []).filter((m) => m.senderId !== "host" && rosterIds.has(m.senderId) && isMemorable(m.body));

  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const nameFor = (id) => players.find((p) => p.id === id)?.display_name || "?";

  return shuffled.slice(0, count).map((msg) => {
    const others = players.filter((p) => p.id !== msg.senderId);
    const shuffledOthers = [...others];
    for (let i = shuffledOthers.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffledOthers[i], shuffledOthers[j]] = [shuffledOthers[j], shuffledOthers[i]];
    }
    const distractors = shuffledOthers.slice(0, Math.min(3, others.length)).map((p) => p.id);

    const optionIds = [msg.senderId, ...distractors];
    for (let i = optionIds.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [optionIds[i], optionIds[j]] = [optionIds[j], optionIds[i]];
    }

    return {
      quote: msg.body,
      options: optionIds.map((id) => ({ id, name: nameFor(id) })),
      answerId: msg.senderId,
    };
  });
}
