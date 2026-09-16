// ─── Preset-Required Challenges ───
// Some challenge types have a pre-configurable, secret setup a player
// picks ahead of time on their own schedule — Torched's hiding-spot
// preset (torched_preset) and The Floor's specialty
// (floor_specialty), both set from the player's Options tab (see
// components/OptionsPanel.jsx). Both were originally entirely
// optional — a player who never set one just got prompted to choose
// live, on the spot, the moment that specific challenge actually got
// selected. The deliberate change here: these challenge types are no
// longer offered by random selection (or drawn as one of Hephaestus's
// two options) AT ALL until every currently alive, approved player has
// actually set theirs — see PresetChecklist.jsx for the player-facing
// nudge this pairs with, and lib/roundEngine.js's own merge of this
// list into disabledTypes at every random-selection call site.
//
// A new game with its own preset mechanic just needs its type added to
// this list and its own field added to isPresetReady's switch — the
// actual gating (challenge selection, the checklist) reads from these
// two exports and doesn't need any other change.
export const PRESET_REQUIRED_GAME_TYPES = ["torched", "floor"];

function isPresetReady(player, gameType) {
  if (gameType === "torched") return !!player.torched_preset;
  if (gameType === "floor") return !!player.floor_specialty;
  return true; // not actually a preset-required type — never blocks
}

// Players who are still alive and approved — an eliminated player's
// unset preset shouldn't permanently block a game type nobody's
// waiting on them for. Returns the subset of PRESET_REQUIRED_GAME_TYPES
// that should currently be treated as disabled for selection purposes,
// i.e. at least one relevant player hasn't set theirs yet.
export function presetIncompleteGameTypes(players) {
  const eligible = (players || []).filter((p) => p.approved && p.alive);
  return PRESET_REQUIRED_GAME_TYPES.filter((gameType) => eligible.some((p) => !isPresetReady(p, gameType)));
}

// The specific preset-required types THIS player still needs to set —
// what PresetChecklist.jsx actually renders. Deliberately not the same
// as presetIncompleteGameTypes (which is about the whole roster, for
// gating selection) — this is about one player's own to-do list.
export function myIncompletePresets(player) {
  return PRESET_REQUIRED_GAME_TYPES.filter((gameType) => !isPresetReady(player, gameType));
}
