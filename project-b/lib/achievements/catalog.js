import { GAME_REGISTRY } from "../challenges/registry";
import { CHARACTER_POWERS } from "../characterPowers";

// ─── Achievement Catalog ───
// The full list of every achievement that exists, both hand-authored
// (STATIC_ACHIEVEMENTS below) and generated from data this app already
// has (battleAchievements/godAchievements) — one Master/Adept pair per
// registered battle, one win-badge per god — rather than hand-listing
// dozens of near-identical entries that would just go stale the moment
// a new battle or power gets added. See lib/achievements/evaluate.js
// for how each one actually gets earned.

export const STATIC_ACHIEVEMENTS = [
  // ── Season Outcomes ──
  { key: "won_season", name: "Ascension", icon: "👑", description: "Won a season.", category: "Season Outcomes" },
  { key: "runner_up", name: "Second Throne", icon: "🥈", description: "Reached the finale, didn't win.", category: "Season Outcomes" },
  { key: "first_to_fall", name: "First to Fall", icon: "🌋", description: "The first player exiled that season.", category: "Season Outcomes" },
  { key: "untouchable", name: "Untouchable", icon: "🛡️", description: "Never nominated for exile, all season.", category: "Season Outcomes" },
  { key: "phoenix", name: "Phoenix", icon: "🐍", description: "Nominated 3+ times but still reached the finale.", category: "Season Outcomes" },

  // ── Battle Performance ──
  { key: "zeus_champion_battles", name: "Zeus's Champion", icon: "⚡", description: "Won 3+ Battles in one season.", category: "Battle Performance" },
  { key: "opening_strike", name: "Opening Strike", icon: "🎯", description: "Won your very first Battle.", category: "Battle Performance" },
  { key: "polymath", name: "Polymath", icon: "🎭", description: "Won Battles across 4+ different categories in one season.", category: "Battle Performance" },
  { key: "underdog_triumph", name: "Underdog's Triumph", icon: "🥊", description: "Won a Battle the round right after being nominated.", category: "Battle Performance" },
  { key: "cold_streak", name: "Cold Streak", icon: "❄️", description: "Finished a season without ever winning a Battle.", category: "Battle Performance" },

  // ── Voting & Social ──
  { key: "beloved", name: "Beloved", icon: "🗳️", description: "Never received a single exile vote, all season.", category: "Voting & Social" },
  { key: "fates_favorite", name: "Fate's Favorite", icon: "🔮", description: "Held the Favor of the Fates 3+ times in one season.", category: "Voting & Social" },
  { key: "puppeteer", name: "Puppeteer", icon: "🌪️", description: "Nominated 5+ different players across a season.", category: "Voting & Social" },
  { key: "aphrodites_chosen", name: "Aphrodite's Chosen", icon: "💘", description: "Selected as Aphrodite's protected target.", category: "Voting & Social" },

  // ── Powers ──
  { key: "divine_gift", name: "Divine Gift", icon: "✨", description: "Held a character power for a season.", category: "Powers" },
  { key: "borrowed_fire", name: "Borrowed Fire", icon: "🍇", description: "Held a power that wasn't originally yours.", category: "Powers" },

  // ── Hosting ──
  { key: "first_broadcast", name: "First Broadcast", icon: "🎙️", description: "Hosted your first season.", category: "Hosting" },
  { key: "chronicler", name: "Chronicler", icon: "📜", description: "Hosted 5 seasons.", category: "Hosting" },

  // ── Longevity ──
  { key: "initiation", name: "Initiation", icon: "🌟", description: "Completed your first season.", category: "Longevity" },
  { key: "regular", name: "Regular", icon: "🔄", description: "Played 5 seasons.", category: "Longevity" },
  { key: "dynasty", name: "Dynasty", icon: "👑", description: "Won 3 seasons.", category: "Longevity" },

  // ── Fun / Rare ──
  { key: "patron_of_the_arts", name: "Patron of the Arts", icon: "🎨", description: "Won 3+ pieces in a single Art Auction.", category: "Fun / Rare" },
  { key: "blaze_of_glory", name: "Blaze of Glory", icon: "💀", description: "Eliminated in the very first round.", category: "Fun / Rare" },
  { key: "marathon", name: "Marathon", icon: "🕰️", description: "Played a season that ran 15+ rounds.", category: "Fun / Rare" },

  // ── Stereo Types ──
  // Deliberately its own separate evaluation path — see
  // lib/achievements/evaluate.js's own header comment on why Stereo
  // Types data isn't read the same way the rest of this file's rules
  // read Project B/Traitors data.
  { key: "stereo_champion", name: "Stereo Types Champion", icon: "🎧", description: "Highest score at the end of a Stereo Types season.", category: "Stereo Types" },
  { key: "round_perfect", name: "Round Perfect", icon: "💯", description: "Correctly guessed everyone else's ranking in a single A Side round.", category: "Stereo Types" },
  { key: "pump_up_the_volume", name: "Pump Up the Volume", icon: "🔊", description: "Your pumped (doubled) guess was correct.", category: "Stereo Types" },
];

export function battleMasterKey(gameType) { return `battle_master:${gameType}`; }
export function battleAdeptKey(gameType) { return `battle_adept:${gameType}`; }

// One Master/Adept pair per registered battle (see
// lib/challenges/registry.js) — generated, not hand-listed, so this
// never goes stale when a battle gets added or renamed.
export function battleAchievements() {
  return Object.entries(GAME_REGISTRY)
    .filter(([key]) => key !== "manual")
    .flatMap(([key, g]) => [
      { key: battleMasterKey(key), name: `${g.label} Master`, icon: g.icon, description: `Finished 1st in ${g.label}.`, category: "Battle Mastery" },
      { key: battleAdeptKey(key), name: `${g.label} Adept`, icon: g.icon, description: `Finished top 3 in ${g.label}.`, category: "Battle Mastery" },
    ]);
}

export function godWinKey(godName) { return `god_win:${godName}`; }

// One per god (see lib/characterPowers.js) — same generated-not-listed
// reasoning as battleAchievements above.
export function godAchievements() {
  return CHARACTER_POWERS.map((c) => ({
    key: godWinKey(c.name),
    name: `Won as ${c.powerName || c.name}`,
    icon: c.icon,
    description: `Won a season while holding ${c.powerName} (${c.name}'s power).`,
    category: "Won As Each God",
  }));
}

export function fullCatalog() {
  return [...STATIC_ACHIEVEMENTS, ...battleAchievements(), ...godAchievements()];
}

export function catalogByKey() {
  const map = {};
  fullCatalog().forEach((a) => { map[a.key] = a; });
  return map;
}
