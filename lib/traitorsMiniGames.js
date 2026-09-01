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
//
// `blurb` is the "how to play" text shown on each game's own rules gate
// (see components/games/TraitorsRulesGate.jsx) — the parity counterpart
// to GAME_REGISTRY's own `blurb` field (see lib/challenges/registry.js
// and ChallengePlayer.jsx's "Go" screen), read from here instead of
// re-typed per Player component so there's one place to fix a wording
// bug instead of eleven.
export const TRAITORS_GAME_REGISTRY = {
  [STORAGE_KEY_WORDS]: {
    label: "Word Scramble", icon: "🔤",
    blurb: "Unscramble your own secret set of words before the timer stops — type each answer as fast as you can; solved words lock in green.",
  },
  [STORAGE_KEY_CASINO]: {
    label: "Casino", icon: "🎰",
    blurb: "Spend your tokens at Blackjack, Hold'em, or Roulette — place a bet, then hit/stand, check/bet/fold, or spin the wheel to grow (or lose) your stack.",
  },
  [STORAGE_KEY_HOT_POTATO]: {
    label: "Hot Potato", icon: "🥔",
    blurb: "Whoever's holding a potato when its timer hits zero is eliminated — pass it to someone else before it explodes.",
  },
  [STORAGE_KEY_ZOMBIE]: {
    label: "Zombie Game", icon: "🧟",
    blurb: "Request a touch with another player; if they accept, something happens to one of you — you won't be told what. Use your one-time antidote if you're worried you've been infected.",
  },
  [STORAGE_KEY_PIGGY]: {
    label: "Piggy Bank", icon: "🐷",
    blurb: "Secretly split exactly 13 coins across at least 2 players' banks (your own included) — whoever ends up with the fullest bank wins once every allocation is revealed.",
  },
  [STORAGE_KEY_MASQUERADE]: {
    label: "Masquerade Houses", icon: "🎭",
    blurb: "Figure out your own house's members to SHIELD them, and identify a rival house's members to KILL them — a correct guess protects or eliminates a whole house at once.",
  },
  [STORAGE_KEY_ATTACK_DEFEND]: {
    label: "Attack/Defend", icon: "⚔️",
    blurb: "Launch one attack for your team by mashing a button that keeps moving — it racks up points for your side until an enemy player defends to shut it down.",
  },
  [STORAGE_KEY_VOODOO]: {
    label: "Voodoo Doll", icon: "🪆",
    blurb: "Prick a limb on a doll to reveal letters of its owner's eulogy (once per hour), then guess who each doll belongs to — a correct guess eliminates them instantly.",
  },
  [STORAGE_KEY_MAZE3D]: {
    label: "3D Maze", icon: "🧭",
    blurb: "Navigate a first-person maze using the arrows/WASD or the on-screen buttons — reach the far corner as fast as you can. Your first move starts the clock.",
  },
  [STORAGE_KEY_COFFIN]: {
    label: "Coffin Slide", icon: "⚰️",
    blurb: "Slide the coffin pieces along their tracks to clear a path for the Traitor's Coffin to reach the exit — fewer moves and less time is better.",
  },
  [STORAGE_KEY_ICEBREAKER]: {
    label: "Icebreaker", icon: "❄️",
    blurb: "Submit a question, then anonymously answer everyone else's — once revealed, study the anonymous answer sets and guess who wrote each one.",
  },
};
