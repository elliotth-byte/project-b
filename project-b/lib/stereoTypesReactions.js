import { storageUpdate, subscribeGameState } from "./gameStorage";

// ─── Stereo Types — reactions on revealed content ───
// The shared group chat (lib/chatData.js's toggleGroupReaction) already
// has emoji reactions, and that's still what a player uses to react to
// what someone SAYS. This is a separate, narrower thing: reacting to a
// specific revealed entry on a results screen — someone's ranking, pick,
// or bid, once it's actually revealed — without needing to hop over to
// chat and describe which one you mean. Deliberately built on the exact
// same game_state CAS pattern every other piece of Stereo Types state
// already uses (lib/stereoTypesASide.js etc.), rather than reusing the
// chat tables/functions, since this isn't a message and has no sender,
// thread, or timestamp of its own — just "which emojis, from which
// player ids, are attached to this one entry."
//
// `scope` namespaces reactions per round/screen (e.g. "a-side:1",
// "remix:2", "on-blast:3", "final-standings") so every results screen
// gets its own independent reaction store under one shared key shape,
// the same way aSideKey/remixKey/onBlastKey each namespace by round
// number today.
export function reactionsKey(scope) {
  return `stereo_types:reactions:${scope}`;
}

// onChange always receives a plain object (never null) — every caller
// gets to treat "no reactions yet" and "the key doesn't exist in
// game_state at all" identically, with no special-casing.
export function subscribeStereoTypesReactions(gameId, scope, onChange) {
  return subscribeGameState(gameId, reactionsKey(scope), (value) => onChange(value || {}));
}

// Shape: { [entryKey]: { [emoji]: [playerId, ...] } }. entryKey is
// whatever the caller uses to identify one revealed thing on its own
// screen — StereoTypesASideResults.jsx uses its own anon label ("Ranking
// A") since that's already the stable, unique-per-round identifier
// everything else on that screen keys off of.
//
// A toggle, not a one-way add: reacting again with the SAME emoji you
// already picked removes it, matching how every reaction picker
// elsewhere in this app (see components/ChatPanel.jsx's own
// toggleGroupReaction) already behaves — consistent muscle memory
// rather than this one spot needing an explicit "remove" affordance of
// its own. No cap on how many different emoji one player can attach to
// the same entry — same "let people react however they want" looseness
// chat reactions already have.
export async function toggleStereoTypesReaction(gameId, scope, entryKey, playerId, emoji) {
  const res = await storageUpdate(gameId, reactionsKey(scope), (fresh) => {
    const current = fresh || {};
    const forEntry = { ...(current[entryKey] || {}) };
    const existing = forEntry[emoji] || [];
    const already = existing.includes(playerId);
    const nextList = already ? existing.filter((id) => id !== playerId) : [...existing, playerId];
    const nextForEntry = { ...forEntry };
    if (nextList.length === 0) delete nextForEntry[emoji]; else nextForEntry[emoji] = nextList;
    return { ...current, [entryKey]: nextForEntry };
  });
  return { ok: res.ok };
}
