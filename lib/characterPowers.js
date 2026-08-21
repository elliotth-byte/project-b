// ─── Character Powers ───
// A season-level variant (see lib/gameState.js's characterPowersMode)
// that gives certain players a special, ongoing ability tied to one of
// the 14 god aliases (see lib/aliases.js — same exact 14 names, on
// purpose: "assigned by character" mode is just "your power is
// whichever alias you are", no separate assignment needed for that
// mode at all).
//
// Landing in phases, not all at once — this file carries the full
// reference list (name/phase/description) for all 14 from the start,
// so host/player-facing "here's what your power does" displays are
// complete immediately, but `implemented` marks which ones actually
// have enforcement logic wired in anywhere yet. An unimplemented power
// shows up correctly in every display; it just doesn't DO anything
// mechanically yet.
//
// Phase 1 (implemented here): Aphrodite, Zeus, Demeter, Poseidon.
// Phase 2 (planned): Athena, Hermes, Hestia — all three hook into the
// Power of Chaos flow specifically, so landing them together once those
// interactions are settled.
// Phase 3 (planned): Ares, Hephaestus, Hades, Artemis, Hera, Dionysus.
// Hephaestus specifically is blocked on a not-yet-built random-
// challenge-selection system — its own entry notes this.

export const CHARACTER_POWERS = [
  {
    name: "Aphrodite", icon: "💘", phase: "At the beginning of the game", implemented: true,
    description: "Choose and announce one player in the first round of the game. That player can never nominate or vote for you.",
  },
  {
    name: "Ares", icon: "⚔️", phase: "At the beginning of the game", implemented: false,
    description: "Choose and announce one player in the first round of the game. You receive immunity from being nominated the round after they are eliminated, and may then choose another target.",
  },
  {
    name: "Hephaestus", icon: "🔥", phase: "At the beginning of the challenge", implemented: false,
    description: "You can see two options for the next round's challenge and pick between the two of them.",
  },
  {
    name: "Hades", icon: "💀", phase: "At the beginning of the challenge", implemented: false,
    description: "Can play in the re-entry challenge an unlimited number of times.",
  },
  {
    name: "Demeter", icon: "🌾", phase: "At the beginning of the challenge", implemented: true,
    description: "In score-based challenges, you may make a second attempt at the challenge if you choose — your second attempt outright replaces your first.",
  },
  {
    name: "Zeus", icon: "⚡", phase: "At the end of the challenge", implemented: true,
    description: "If you finish in 2nd or 3rd in the challenge, you are moved into the 1st place position instead.",
  },
  {
    name: "Poseidon", icon: "🌊", phase: "At the end of the challenge", implemented: true,
    description: "Once per game, choose a Fates Ceremony and Exile Vote that must occur with DMs turned off.",
  },
  {
    name: "Athena", icon: "🦉", phase: "At the Power of Chaos selection", implemented: false,
    description: "Can make the player with the Power of Chaos swap their initial choice for a secondary choice — the holder picks the new choice themselves.",
  },
  {
    name: "Hermes", icon: "🪽", phase: "At the Power of Chaos selection", implemented: false,
    description: "Can see and discuss the player saved by the Power of Chaos ahead of the vote reveal.",
  },
  {
    name: "Hestia", icon: "🔥", phase: "At the Power of Chaos selection", implemented: false,
    description: "Gets to draw two Power of Chaos cards instead of one, improving the odds of becoming the holder.",
  },
  {
    name: "Apollo", icon: "🏹", phase: "During voting deliberation", implemented: false,
    description: "You may cast a second vote at each elimination. You may cast your votes for the same player or two different players.",
  },
  {
    name: "Artemis", icon: "🏕", phase: "During voting deliberation", implemented: false,
    description: "You may cancel the vote of another player of your choice at each elimination. You must announce you are choosing to do so before the deliberation period ends.",
  },
  {
    name: "Hera", icon: "👑", phase: "During voting deliberation", implemented: false,
    description: "At the start of each voting deliberation period, you may exile one player from the main chat for that deliberation window — they're automatically reinstated once it ends.",
  },
  {
    name: "Dionysus", icon: "🍇", phase: "During voting deliberation", implemented: false,
    description: "Does not have the ability to cast a vote. At the end of each round, swap power cards with any player of your choosing. If they had a target (Aphrodite or Ares), you inherit their target.",
  },
];

// ─── Zeus ───
// "If you finish in 2nd or 3rd, you are moved into the 1st place
// position instead." No limit was specified for this one (unlike, say,
// Poseidon's explicit "once per game"), so it's treated as automatic —
// applies every eligible round, not a one-time or opt-in thing. A
// forfeited Zeus never triggers this even if forfeiting happens to
// leave them sitting in 2nd/3rd on a small roster — bumping someone who
// didn't actually play to 1st would be absurd.
//
// Shifts rather than swaps: Zeus is spliced out of wherever they
// finished and inserted at the very front, and everyone between their
// old spot and 1st shifts down by exactly one slot — not a straight
// swap with whoever was 1st, which would unfairly hammer that one
// person while leaving anyone else in between untouched. Reads more
// like "cut to the front of the line" than "trade spots with the
// winner", which is the more natural take on "moved into 1st place".
export function applyZeusPower(placements, players, settings) {
  if (!placements || settings?.characterPowersMode === "off") return placements;
  const zeusPlayer = players.find((p) => powerFor(p, settings) === "Zeus");
  if (!zeusPlayer) return placements;
  const idx = placements.findIndex((pl) => pl.playerId === zeusPlayer.id);
  if (idx !== 1 && idx !== 2) return placements; // only 2nd (index 1) or 3rd (index 2) trigger this
  if (placements[idx].forfeited) return placements;
  const reordered = [...placements];
  const [zeusEntry] = reordered.splice(idx, 1);
  reordered.unshift(zeusEntry);
  return reordered.map((pl, i) => ({ ...pl, place: i + 1 }));
}

export function powerByName(name) {
  return CHARACTER_POWERS.find((p) => p.name === name) || null;
}

// A player's resolved power name (or null if the season has powers off,
// or this specific player simply wasn't assigned one — e.g. more
// players than the 14 available powers in random mode, or no alias yet
// in by_character mode). Never returns an unimplemented power's name
// any differently than an implemented one — display code checks
// `implemented` itself via powerByName() where that distinction
// matters, this just resolves WHICH power (if any) a player has.
export function powerFor(player, settings) {
  const mode = settings?.characterPowersMode || "off";
  if (mode === "off") return null;
  // Dionysus's character power (see below in this file): swapping power
  // cards has to work identically whether the season resolves power
  // from alias (by_character) or a separate random assignment — rather
  // than literally swap aliases (disruptive to identity, and
  // meaningless in random mode anyway) or add a second parallel
  // resolution path, a swap just stamps BOTH players' power_state with
  // powerOverride, which this checks before either mode-specific rule
  // below. Checked first so it's authoritative regardless of mode, and
  // survives being swapped again later — powerFor always reflects
  // whoever CURRENTLY holds a power, however many times it's moved.
  const state = player?.power_state || player?.powerState;
  if (state?.powerOverride) return state.powerOverride;
  if (mode === "by_character") return player?.alias || null;
  // Two different shapes reach this function depending on caller: raw
  // roster rows straight from Supabase use power_state (the real
  // column name), while pages/play.jsx's own derived `player` object
  // (passed to things like ChallengePlayer.jsx) exposes the same data
  // as powerState (camelCase, matching that object's other fields like
  // torchedPreset/battleBanRound). Checking both rather than picking
  // one — confirmed this gap for real: AdminHost.jsx's own call passes
  // raw roster rows (power_state, fine either way), but
  // ChallengePlayer.jsx's Demeter check passes the camelCase `player`
  // object specifically, which would have silently never matched
  // "random" mode without this.
  if (mode === "random") return player?.power_state?.assignedPower || player?.powerState?.assignedPower || null;
  return null;
}

// ─── Aphrodite ───
// "Choose and announce one player in the first round. That player can
// never nominate or vote for you." Target stored on Aphrodite's OWN row
// (power_state.aphroditeTarget), set once during round 1 — see the
// picker UI wherever it's rendered in the Game tab. Once set, it's
// permanent for the season; there's no "choose again" language for
// Aphrodite the way there explicitly is for Ares, so this is a one-time
// pick, not something that gets re-opened.
//
// Returns the Aphrodite player's id if actingPlayerId is currently
// blocked from nominating or voting for them, or null if no block
// applies — used identically by both the Fates nomination UI and every
// voting UI (Exile Vote, Finale), since the restriction is the same
// "can never nominate OR vote for you" in both directions.
export function aphroditeBlocksTargeting(players, settings, actingPlayerId) {
  const aphroditePlayer = (players || []).find(
    (p) => powerFor(p, settings) === "Aphrodite" && p.power_state?.aphroditeTarget === actingPlayerId
  );
  return aphroditePlayer?.id || null;
}

// ─── Poseidon ───
// "Once per game, choose a Fates Ceremony and Exile Vote that must
// occur with DMs turned off." Activated (see wherever the trigger UI
// lives) by stamping power_state.poseidonRound with whatever round
// number was current at the moment of activation — that one round's
// Fates AND Exile phases both get DMs blocked, regardless of which of
// the two phases was actually active when Poseidon clicked. Once per
// season: poseidonRound, once set, never changes again.
//
// Checks BOTH the snake_case (raw roster rows) and camelCase (pages/
// play.jsx's derived `player` object) shapes on each player in the
// list, same reasoning as powerFor above — players arrays reaching this
// function are a mix depending on caller.
export function isPoseidonDmBlockActive(players, settings, round) {
  if (!round || (round.phase !== "fates" && round.phase !== "exile")) return false;
  return (players || []).some((p) => {
    if (powerFor(p, settings) !== "Poseidon") return false;
    const state = p.power_state || p.powerState;
    return state?.poseidonRound === round.round;
  });
}

// ─── Ares ───
// "Choose and announce one player in round 1. You receive immunity from
// being nominated the round after they are eliminated, and may then
// choose another target." Scoped to EXILE eliminations specifically
// (not quitting) — "eliminated" most naturally reads as the core voted-
// out game mechanic, and this is the one place (roundEngine.js's exile
// outcome) that cleanly covers it without also having to hook the
// entirely separate, client-side, RLS-gated quit flow.
//
// Called once, right after a round's exile outcome is applied — for
// every player just exiled, checks whether any Ares player had them as
// their target, and if so stamps that Ares player's OWN row with
// immunity for the NEXT round and clears their target (so the "pick a
// new one" UI reappears immediately — see AresTrigger.jsx). Returns the
// set of { playerId, patch } writes the caller needs to actually apply
// — this function only computes what should change, roundEngine.js's
// existing client/db plumbing is what performs the writes, same
// separation as the rest of this file.
export function computeAresImmunityUpdates(exiledIds, players, settings, currentRound) {
  const updates = [];
  for (const p of players || []) {
    if (powerFor(p, settings) !== "Ares") continue;
    const state = p.power_state || p.powerState;
    if (state?.aresTarget && exiledIds.includes(state.aresTarget)) {
      updates.push({ playerId: p.id, power_state: { ...state, aresTarget: null, aresImmunityRound: currentRound + 1 } });
    }
  }
  return updates;
}

// Whether the given player is CURRENTLY immune from nomination this
// round — used by isValidNomination the same way winnerId already is.
export function aresIsImmune(player, round) {
  const state = player?.power_state || player?.powerState;
  return !!(state?.aresImmunityRound && round?.round === state.aresImmunityRound);
}

// Finds WHICH player (if any) currently holds Ares's power and is
// immune this round — at most one, since only one player can hold any
// given power at a time. Same shape as aphroditeBlocksTargeting: a
// single id computed once per render, passed into every
// isValidNomination call rather than recomputing per-candidate.
export function findAresImmunePlayerId(players, settings, round) {
  const aresPlayer = (players || []).find((p) => powerFor(p, settings) === "Ares" && aresIsImmune(p, round));
  return aresPlayer?.id || null;
}

// ─── Hades ───
// "Can play in the re-entry challenge an unlimited number of times."
// lib/reentryLogic.js's own resolveReentryAttempt is deliberately
// decoupled from character powers entirely (pure re-entry logic, no
// storage or player-power dependency) — this is the one place that
// overrides its result, rather than threading Hades-awareness into that
// file. Takes and returns a plain status string (not importing
// REENTRY_STATUS from reentryLogic.js) specifically to avoid this file
// depending on that one just for a single string constant.
export function overrideStatusForHades(status, player, settings) {
  if (status === "eliminated_forever" && powerFor(player, settings) === "Hades") return "pending";
  return status;
}

// ─── Artemis ───
// "You may cancel the vote of another player of your choice at each
// elimination. You must announce you are choosing to do so before the
// deliberation period ends." Stored PUBLICLY on the round's own exile/
// finale state (e.g. state.artemisCancelledVoterId), not secretly like
// the Power of Chaos holder's pick — "announce" means this is meant to
// be visible the moment she does it, not revealed later. Every place
// that builds voteRows from the raw votes object needs to filter
// through this same helper before those rows reach
// computeEliminateOutcome/computeSaveOutcome/computeFinaleOutcome (see
// lib/exileLogic.js) — those stay pure and untouched, same reasoning as
// lib/reentryLogic.js being left alone for Hades: this is a caller-side
// filter, not a change to the vote-counting rules themselves.
export function filterCancelledVote(voteRows, cancelledVoterId) {
  if (!cancelledVoterId) return voteRows;
  return (voteRows || []).filter((v) => v.voterId !== cancelledVoterId);
}

// ─── Hera ───
// "At the start of each voting deliberation period, you may exile one
// player from the main chat for that deliberation window — automatic
// reinstatement once it ends, usable every round." Stored the same way
// as Artemis's cancellation (state.heraExiledPlayerId on the round's
// exile/finale state) — public the instant it's used, and "automatic
// reinstatement once it ends" falls out naturally from being scoped to
// THAT round's own key: a new round's exile/finale state starts fresh,
// so there's nothing to explicitly clear when deliberation ends.
export function heraChatBlockActive(state, targetPlayerId) {
  return !!(state?.heraExiledPlayerId && state.heraExiledPlayerId === targetPlayerId);
}

// ─── Dionysus ───
// "Does not have the ability to cast a vote. At the end of each round,
// swap power cards with any player of your choosing. If they had a
// target (Aphrodite or Ares), you inherit their target." Confirmed
// against the season's host: happens every round, the power itself
// keeps moving ("hot potatoed") — whoever currently resolves to
// "Dionysus" via powerFor (however many times it's been swapped
// around) carries both the no-vote restriction and the ability to swap
// again at the next round's end, same as any other power is just
// whoever currently holds it.
//
// Returns the two power_state patches the caller needs to write — one
// for Dionysus's own row, one for the player being swapped with. Only
// Aphrodite/Ares target-state is explicitly carried over, per the rule
// text — other powers' persistent state (Poseidon's used flag, for
// instance) is deliberately left behind on the original holder's row
// rather than guessed at being transferable too; nothing in the rule
// calls for it, and leaving it in place is harmless since that row no
// longer resolves to that power anyway.
export function computeDionysusSwap(dionysusPlayer, targetPlayer, settings) {
  const targetsPower = powerFor(targetPlayer, settings);
  const dionysusState = { ...(dionysusPlayer.power_state || dionysusPlayer.powerState || {}) };
  const targetState = { ...(targetPlayer.power_state || targetPlayer.powerState || {}) };

  dionysusState.powerOverride = targetsPower;
  targetState.powerOverride = "Dionysus";

  if (targetsPower === "Aphrodite" && targetState.aphroditeTarget) {
    dionysusState.aphroditeTarget = targetState.aphroditeTarget;
    targetState.aphroditeTarget = null;
  }
  if (targetsPower === "Ares") {
    if (targetState.aresTarget) { dionysusState.aresTarget = targetState.aresTarget; targetState.aresTarget = null; }
    if (targetState.aresImmunityRound) { dionysusState.aresImmunityRound = targetState.aresImmunityRound; targetState.aresImmunityRound = null; }
  }

  return {
    dionysusUpdate: { playerId: dionysusPlayer.id, power_state: dionysusState },
    targetUpdate: { playerId: targetPlayer.id, power_state: targetState },
  };
}

function shuffle(arr) {
  // Fisher-Yates — deliberately not the common `.sort(() => Math.random()
  // - 0.5)` trick, which is a well-known NON-uniform shuffle (some
  // orderings come out more likely than others). Doesn't matter for
  // most party-game randomness, but "why does the same person keep
  // getting the strong power" is exactly the kind of complaint a biased
  // shuffle invites, and a correct shuffle costs nothing extra here.
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Random-mode assignment — one power per player, no repeats, assigned
// once (typically triggered by the host before Round 1 starts). Returns
// { playerId: powerName } for every player passed in; if there are more
// players than powers (>14), the extras simply get no power at all
// (null) rather than doubling anyone up, since the source material
// doesn't describe what a duplicate power would even mean.
export function assignRandomPowers(players) {
  const shuffled = shuffle(CHARACTER_POWERS);
  const assignments = {};
  players.forEach((p, i) => {
    assignments[p.id] = shuffled[i]?.name || null;
  });
  return assignments;
}
