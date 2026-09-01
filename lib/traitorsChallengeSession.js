import { storageGet, storageUpdate } from "./gameStorage";

// ─── Traitors' own durable per-player clock ───
// Counterpart to lib/challenges/scores.js's getOrStartSession/peekSession
// — same "first call wins, survives remounts" durable start timestamp,
// just keyed to Traitors' own shape instead of Project B's round-scoped
// challenge engine's. Traitors has no round concept for its 11 mini-games
// (see TraitorsHostPanels.jsx's own comment: these are host-toggled
// panels, not GAME_REGISTRY entries) — a mini-game's own STORAGE_KEY_*
// plus its shared state's `createdAt` (set fresh by that game's Host
// component every time it (re)starts) together play the same role
// round+challengeStartedAt play there: they uniquely identify ONE
// specific run of ONE specific mini-game, so a brand new start always
// gets a fresh session, but a remount of the same run — a tab switch, the
// browser backgrounding, a flaky connection — reads the exact same
// timestamp back instead of quietly restarting the player's clock.
const sessionKey = (storageKey, createdAt) => `tr:challenge-session:${storageKey}:${createdAt}`;

export async function getOrStartSession(gameId, storageKey, createdAt, playerId) {
  const res = await storageUpdate(gameId, sessionKey(storageKey, createdAt), (fresh) => {
    const existing = fresh || {};
    if (existing[playerId]) return existing; // already started — keep it, don't reset the clock
    existing[playerId] = Date.now();
    return existing;
  });
  return res?.value?.[playerId] || Date.now();
}

// Read-only check — for mini-games like 3D Maze, where the clock only
// starts on the player's first real move, not the instant the game goes
// active. Lets a remounting player resume an already-running clock
// without this check itself accidentally starting one.
export async function peekSession(gameId, storageKey, createdAt, playerId) {
  const value = await storageGet(gameId, sessionKey(storageKey, createdAt));
  return value?.[playerId] || null;
}
