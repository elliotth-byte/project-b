import { storageUpdate, subscribeGameState } from "./gameStorage";
import { KEY_UNLOCKED_GAMES } from "./gameState";

// ─── Season-wide "unlocked" battle types ───
// The Help tab's rules list used to spoil every mini-game in the whole
// registry up front — including ones this season's random pool (or its
// Hephaestus, see lib/characterPowers.js) hasn't actually surfaced yet.
// This is a small, ever-growing record of exactly which gameTypes have
// actually shown up this season so far, so the Help tab can only list
// rules for those. A type counts as "unlocked" the moment it's
// genuinely been shown to someone — a challenge actually starting
// (host-picked or auto-picked), or a type being offered as one of
// Hephaestus's two options (whether or not it's the one chosen) —
// never just because it exists in the registry. Same optional `db`
// override every other shared game-state helper in this app takes, so
// it works identically from the browser (ChallengeHost.jsx) and from
// server-side round advancement (lib/roundEngine.js).
export async function markGameTypesUnlocked(gameId, gameTypes, db) {
  const update = db?.update || storageUpdate;
  const types = (Array.isArray(gameTypes) ? gameTypes : [gameTypes]).filter((t) => t && t !== "manual");
  if (types.length === 0) return;
  return update(gameId, KEY_UNLOCKED_GAMES, (fresh) => {
    const existing = new Set(fresh || []);
    let changed = false;
    types.forEach((t) => { if (!existing.has(t)) { existing.add(t); changed = true; } });
    return changed ? [...existing] : (fresh || []);
  });
}

export function subscribeUnlockedGames(gameId, onChange) {
  return subscribeGameState(gameId, KEY_UNLOCKED_GAMES, (v) => onChange(v || []));
}
