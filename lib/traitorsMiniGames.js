import { STORAGE_KEY_WORDS } from "./wordGameData";
import { STORAGE_KEY_CASINO } from "./casinoData";
import { STORAGE_KEY_HOT_POTATO } from "./hotPotatoData";
import { STORAGE_KEY_ZOMBIE } from "./zombieData";
import { STORAGE_KEY_PIGGY } from "./piggyData";
import { STORAGE_KEY_MASQUERADE } from "./masqueradeData";
import { STORAGE_KEY_ATTACK_DEFEND } from "./attackDefendData";
import { STORAGE_KEY_VOODOO } from "./voodooData";
import { STORAGE_KEY_MAZE3D } from "./mazeData";
import { STORAGE_KEY_COFFIN } from "./coffinData";
import { STORAGE_KEY_ICEBREAKER } from "./icebreakerData";

// Re-exported (not just imported) so TraitorsHostPanels.jsx and
// TraitorsPlayerPanels.jsx can gate each individual mini-game's mount
// against the disabled list without a second import line per game.
export {
  STORAGE_KEY_WORDS, STORAGE_KEY_CASINO, STORAGE_KEY_HOT_POTATO, STORAGE_KEY_ZOMBIE,
  STORAGE_KEY_PIGGY, STORAGE_KEY_MASQUERADE, STORAGE_KEY_ATTACK_DEFEND, STORAGE_KEY_VOODOO,
  STORAGE_KEY_MAZE3D, STORAGE_KEY_COFFIN, STORAGE_KEY_ICEBREAKER,
};

// ─── Traitors' own mini-games ───
// Unlike GAME_REGISTRY (lib/challenges/registry.js) — Project B's
// randomly-selectable, ranked/scored/configured challenge engine —
// these 11 are the standalone Traitors app's original always-mounted,
// host-toggled panels (see TraitorsHostPanels.jsx's "challenges" tab
// and TraitorsPlayerPanels.jsx's "challenge" tab): the host manually
// starts/stops each one from its own panel, there's no random pick or
// scoring rank. Kept as a separate registry rather than folded into
// GAME_REGISTRY so they don't show up as choices in Project B's own
// challenge picker, which they were never part of and aren't shaped
// for (no config/duration/rank).
//
// Keys are each game's own `traitors:...` game_state storage key
// (imported straight from its data module, not re-typed here) — reused
// as-is for platform_settings' `disabled_challenges` list (see
// lib/platformSettings.js) so a global disable and a game's own live
// state share one unambiguous identifier, and so they can't collide
// with GAME_REGISTRY's un-namespaced keys in that same flat list.
export const TRAITORS_GAME_REGISTRY = {
  [STORAGE_KEY_WORDS]: { label: "Word Scramble", icon: "🔤" },
  [STORAGE_KEY_CASINO]: { label: "Casino", icon: "🎰" },
  [STORAGE_KEY_HOT_POTATO]: { label: "Hot Potato", icon: "🥔" },
  [STORAGE_KEY_ZOMBIE]: { label: "Zombie Game", icon: "🧟" },
  [STORAGE_KEY_PIGGY]: { label: "Piggy Bank", icon: "🐷" },
  [STORAGE_KEY_MASQUERADE]: { label: "Masquerade Houses", icon: "🎭" },
  [STORAGE_KEY_ATTACK_DEFEND]: { label: "Attack/Defend", icon: "⚔️" },
  [STORAGE_KEY_VOODOO]: { label: "Voodoo Doll", icon: "🪆" },
  [STORAGE_KEY_MAZE3D]: { label: "3D Maze", icon: "🧭" },
  [STORAGE_KEY_COFFIN]: { label: "Coffin Slide", icon: "⚰️" },
  [STORAGE_KEY_ICEBREAKER]: { label: "Icebreaker", icon: "❄️" },
};
