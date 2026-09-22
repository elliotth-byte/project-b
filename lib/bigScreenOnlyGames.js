// Game types that only make sense in Big Screen Mode — they depend on
// a shared TV display existing at all (see components/bigscreen/ for
// each one's actual display component), so offering them to a normal,
// one-phone-per-player season would either be broken or nonsensical.
// Excluded from random selection (and the host's manual picker)
// whenever settings.bigScreenMode is off — see every disabledTypes
// computation in lib/roundEngine.js and components/ChallengeHost.jsx,
// which all merge this in the same way they already merge
// presetIncompleteGameTypes.
export const BIG_SCREEN_ONLY_GAME_TYPES = ["wordscrambletv", "simontv", "musicalchairstv", "eyesinthesystemtv", "balloono", "laurelthieftv", "wagertriviatv", "tartarustreadmill"];

export function bigScreenOnlyGameTypesToExclude(settings) {
  return settings?.bigScreenMode ? [] : BIG_SCREEN_ONLY_GAME_TYPES;
}
