// Unchanged from the original artifact — this logic doesn't touch storage
// at all, so it needed zero changes for the Supabase migration.

export const WORD_SETS = [
  { name: "The Castle", words: ["THRONE", "KNIGHT", "SHIELD", "CROWN", "FEAST", "TOWER", "MOTTO"] },
  { name: "Elements", words: ["FLAME", "FROST", "STORM", "OCEAN", "EARTH", "SMOKE", "SPARK"] },
  { name: "Creatures", words: ["TIGER", "EAGLE", "SHARK", "VIPER", "RAVEN", "WOLF", "FALCON"] },
  { name: "Cosmos", words: ["COMET", "LUNAR", "ORBIT", "SOLAR", "VENUS", "NOVA", "COSMOS"] },
  { name: "Gems & Stones", words: ["AMBER", "IVORY", "CORAL", "PEARL", "SLATE", "ONYX", "TOPAZ"] },
  { name: "Mythology", words: ["ATLAS", "HYDRA", "TITAN", "SIREN", "MEDUSA", "CHAOS", "ORACLE"] },
  { name: "Spycraft", words: ["CIPHER", "AGENT", "DECOY", "VAULT", "TRACE", "MOLE", "SIGNAL"] },
  { name: "Kitchen", words: ["BROTH", "SPICE", "ROAST", "CREAM", "OLIVE", "SAUCE", "GRAVY"] },
  { name: "Weather", words: ["BLAZE", "SLEET", "CLOUD", "GALES", "HUMID", "MISTY", "THAW"] },
  { name: "Music", words: ["PIANO", "DRUMS", "VOCAL", "CHORD", "TEMPO", "SOLO", "VERSE"] },
];
import { COLOR_BLIND_SAFE_PALETTE } from "./colorBlindPalette";

export const WORDS_PER_SET = 7;
// Always uses the colorblind-safe palette — unlike Match 3, there's no
// "vibrant default" tradeoff being made here, so this doesn't need to be
// gated behind the player's colorblind preference (see
// lib/gamePrefs.js): a safe palette costs nothing for anyone who doesn't
// need it.
export const WORD_COLORS = COLOR_BLIND_SAFE_PALETTE;
export const WORD_FONTS = [
  "'Courier New', Courier, monospace",
  "'Orbitron', 'Segoe UI', sans-serif",
  "'Brush Script MT', cursive",
  "'Trebuchet MS', sans-serif",
  "'Georgia', serif",
  "'Impact', 'Arial Narrow Bold', sans-serif",
  "'Consolas', 'Lucida Console', monospace",
];

export function playerHash(name, seed) {
  let h = seed || 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function getPlayerWordSet(playerName, seed) {
  return WORD_SETS[playerHash(playerName, seed) % WORD_SETS.length];
}

export function initFloatingLetters(words, W, H) {
  const letters = [];
  words.forEach((word, wi) => {
    for (const char of word) {
      letters.push({
        char, wi,
        x: Math.random() * (W - 28) + 4,
        y: Math.random() * (H - 32) + 4,
        vx: (Math.random() - 0.5) * 1.6 + (Math.random() > 0.5 ? 0.4 : -0.4),
        vy: (Math.random() - 0.5) * 1.6 + (Math.random() > 0.5 ? 0.4 : -0.4),
        // Anti-screenshot: each letter fades in and out on its own cycle
        // (randomized period + phase, so they're never all faded — or all
        // visible — at the same instant). A single screenshot only ever
        // catches a partial view; solving still requires actually
        // watching the board for a few seconds. See the render loop in
        // WordScramblePlayer.jsx for how this opacity is applied.
        fadePeriodMs: 1800 + Math.random() * 1400,
        fadePhase: Math.random() * Math.PI * 2,
      });
    }
  });
  return letters.sort(() => Math.random() - 0.5);
}

