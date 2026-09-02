import { supabase } from "./supabaseClient";
import { storageGet, storageSet, storageUpdate, subscribeGameState } from "./gameStorage";
import { SUPERLATIVES } from "./stereoTypesSuperlatives";
import { KEY_STEREO_TYPES_ROUND } from "./stereoTypesASide";

// ============================================================
// Stereo Types — Round 3, "On Blast" (the final round)
//
// Read lib/stereoTypesASide.js and lib/stereoTypesRemix.js FULLY first —
// this file assumes both and doesn't re-explain what's identical: the
// game_state-row-per-round shape, the version-checked CAS db.update, the
// "every connected client runs the advance/score housekeeping
// opportunistically, nobody's a single leader" ethos, and the privacy
// model (game_state's RLS lets every approved player/host read every
// key — hidden by what the UI renders, not by the row itself).
//
// ─── IMPORTANT CORRECTION BAKED INTO THIS DESIGN ───
// An earlier draft of this file modeled Step 3 (bidding/guessing) as a
// SEQUENTIAL, one-bidder-at-a-time "turn" with everyone else watching a
// single live turn play out. That was wrong, per direct clarification
// from the game's designer: every player who was dealt a bidder role
// bids and guesses AT THE SAME TIME as everyone else, exactly like
// Round 1/2's simultaneous ranking/picking + guessing phases — nobody
// waits on anybody else, there's no turn order, and there's no "active
// bidder" spectator view. "Everyone else spectates, but does not
// participate" (the line that originally motivated the sequential
// design) turned out to mean something much narrower: a player who is
// only someone's PARTNER for a given pairing has nothing to submit for
// THAT pairing — not that the whole round runs as a one-at-a-time show.
// The result is that this round's shape ends up structurally very close
// to Round 1/2 after all: an independent-submission phase, then a
// second independent-submission phase, then one atomic scoring pass —
// just with the second phase (bidding+guessing) split into two small
// per-player writes instead of one.
//
// Rules, in the shape actually implemented below:
//   1. ("ranking" status) Every approved player is personally dealt
//      THREE candidate superlatives (candidatePools — personalized per
//      player, unlike Round 2's single shared pool). Each player picks
//      whichever one they want, then privately ranks every approved
//      player (including themselves) by it, most -> least — reusing
//      Round 1's ranking UI/logic as directly as practical (see
//      components/StereoTypesOnBlastPlayer.jsx's own RankingEditor).
//   2. Once everyone's submitted (or the host force-advances), every
//      submitter is assigned exactly one "partner" via a random
//      derangement (buildDerangement below) — nobody is ever paired
//      with themselves, and every submitter is a bidder for exactly one
//      partner and a partner for exactly one (different) bidder.
//   3. ("bidding" status) Every bidder, independently and concurrently,
//      privately sees their own assigned partner's submitted ranking and
//      partner's original 3 candidates, places a bid (any non-negative
//      integer — the spec is explicit that there's no upper cap), and
//      that bid's size determines a ONE-TIME, stored "hardening" of
//      what THAT bidder sees for their own guess (see computeHardening's
//      own comment for the exact formula/reasoning) — then submits a
//      guess from the (possibly hardened) option list. Nobody else can
//      see any of this content while it's in progress, same "host/other
//      players see progress counts, not content" rule Round 1/2 already
//      follow — there's no live single-bidder spectator view here.
//   4. Once every bidder has bid AND guessed (or the host force-scores),
//      scores are computed once, atomically, exactly like Round 1/2's
//      own scoring: correct guess -> bidder gets their bid amount AND
//      their partner gets a flat bonus; incorrect guess -> bidder LOSES
//      their bid amount (a real deduction — see computeOnBlastScores's
//      own comment on this judgment call). Every real player's true
//      chosen superlative, every bid, every guess, and every outcome is
//      then shown to EVERYONE, fully revealed — no more secrecy once
//      scored, same as Round 1/2's own results screens already do.
// ============================================================

export function onBlastKey(round) {
  return `stereo_types:on-blast:${round}`;
}

export function subscribeOnBlastRound(gameId, round, onChange) {
  return subscribeGameState(gameId, onBlastKey(round), onChange);
}

// Local Fisher-Yates — same "every file keeps its own private copy"
// precedent lib/stereoTypesASide.js/lib/stereoTypesRemix.js already set.
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Deals THREE candidate superlatives to each player, personalized (not
// shared — see this file's header comment). Same degenerate-pool
// fallback precedent as lib/stereoTypesASide.js's dealSuperlatives and
// lib/stereoTypesRemix.js's drawSuperlativePool: repeat with a console
// warning rather than crash the round if the pool's too small.
function dealOnBlastCandidatePools(playerIds, pool = SUPERLATIVES) {
  const pools = {};
  if (!pool || pool.length === 0) {
    playerIds.forEach((id) => {
      pools[id] = ["Most likely to do literally anything", "Most likely to do literally anything", "Most likely to do literally anything"];
    });
    console.warn("Stereo Types: superlative pool is empty — On Blast dealt placeholder candidates to everyone.");
    return pools;
  }
  if (pool.length < 3) {
    console.warn(`Stereo Types: superlative pool (${pool.length}) has fewer than 3 entries — On Blast candidate sets will repeat within a player's own 3.`);
  }
  playerIds.forEach((id) => {
    const shuffled = shuffle(pool);
    const three = [];
    for (let i = 0; i < 3; i++) three.push(shuffled[i % shuffled.length]);
    pools[id] = three;
  });
  return pools;
}

// A random derangement (permutation with zero fixed points) of `ids`:
// shuffle into a random order, then pair each entry with the NEXT one in
// that order, wrapping around (a single rotated cycle). Rotating a cycle
// by 1 can never map an element back to itself for any n >= 2, so this
// is guaranteed fixed-point-free by construction — no rejection-sampling
// ("shuffle, check for fixed points, reshuffle if any") needed, and
// nothing here can ever loop. This is NOT a uniform sample over every
// possible derangement (a single rotated cycle is one specific
// structure among many), but the spec only asks for "a random
// derangement" — it never asks for every derangement to be equally
// likely — and a rotated cycle is a much smaller, easier-to-verify-
// correct piece of code than sampling uniformly over all of them.
function buildDerangement(ids) {
  const order = shuffle(ids);
  const n = order.length;
  const pairing = {};
  order.forEach((bidderId, i) => { pairing[bidderId] = order[(i + 1) % n]; });
  return pairing;
}

// ─── Host action: deal candidate pools, open the ranking phase ───
// Idempotent by construction, same reasoning as startASide/startRemix's
// own identical guards.
export async function startOnBlast(gameId, approvedPlayers) {
  const playerIds = (approvedPlayers || []).map((p) => p.id);
  if (playerIds.length < 2) {
    return { ok: false, error: "Need at least 2 approved players to start On Blast." };
  }

  const candidatePools = dealOnBlastCandidatePools(playerIds);

  const res = await storageUpdate(gameId, onBlastKey(3), (fresh) => {
    if (fresh) return fresh; // already started — leave it alone
    return {
      round: 3,
      status: "ranking", // "ranking" -> "bidding" -> "scored"
      startedAt: Date.now(),
      playerIds, // roster frozen at round-start, same reasoning as Rounds 1/2
      candidatePools, // { playerId: [superlative, superlative, superlative] }
      submissions: {}, // { playerId: { chosen, order } } — filled in as players submit Step 1
      biddingStartedAt: null,
      pairing: null, // { bidderId: partnerId } — the random derangement, set once at ranking -> bidding
      bids: {}, // { bidderId: { bid, hardening, guess, bidSubmittedAt, guessedAt } } — filled in concurrently during "bidding"
      result: null, // set once, atomically, by maybeScoreOnBlast below
    };
  });

  if (res.ok) await storageSet(gameId, KEY_STEREO_TYPES_ROUND, 3);
  return { ok: res.ok };
}

// A player submitting (or re-submitting, while still "ranking") their
// own chosen superlative + ranking. Most fields in this app get zero
// server-side re-validation beyond the round's own status guard (see
// this file's header comment on the shared trust model) — but `chosen`
// gets one extra check here on purpose: it becomes the durable "ground
// truth" every bidder's guess is later checked against, and the
// bidder's own option list is always built FROM candidatePools[ownerId]
// (see computeHardening below) — so an invalid `chosen` that isn't one
// of this player's own three dealt candidates wouldn't just be an odd
// input, it would make that pairing's guess literally unwinnable by
// construction (the correct answer wouldn't even be one of the choices
// shown). That's a correctness guard against a bug or a tampered
// request, not an attempt at exhaustive server-side validation.
export async function submitOnBlastSubmission(gameId, round, playerId, chosenSuperlative, orderedPlayerIds) {
  const res = await storageUpdate(gameId, onBlastKey(round), (fresh) => {
    if (!fresh || fresh.status !== "ranking") return fresh;
    if (!fresh.candidatePools?.[playerId]?.includes(chosenSuperlative)) return fresh;
    return { ...fresh, submissions: { ...fresh.submissions, [playerId]: { chosen: chosenSuperlative, order: orderedPlayerIds } } };
  });
  return { ok: res.ok };
}

// Moves "ranking" -> "bidding" the moment every approved player has
// submitted, or immediately if `force` is set — same race-safety
// reasoning as lib/stereoTypesASide.js's maybeAdvanceASideToReveal
// (every connected client calls this opportunistically; db.update's CAS
// makes whichever call actually flips the status the only one that
// matters). Building the derangement needs at least 2 real submissions
// to mean anything (a derangement of 1 element is impossible — the one
// person would have to be their own partner) — same "refuse rather than
// open a phase that could never produce a meaningful result" reasoning
// as maybeAdvanceASideToReveal's own submitterIds.length === 0 guard,
// just with a floor of 2 instead of 0 since this phase needs pairs.
export async function maybeAdvanceOnBlastToBidding(gameId, round, { force = false } = {}) {
  const res = await storageUpdate(gameId, onBlastKey(round), (fresh) => {
    if (!fresh || fresh.status !== "ranking") return fresh;
    const submitterIds = Object.keys(fresh.submissions || {});
    const allSubmitted = (fresh.playerIds || []).every((pid) => submitterIds.includes(pid));
    if (!allSubmitted && !force) return fresh;
    if (submitterIds.length < 2) return fresh;
    return { ...fresh, status: "bidding", biddingStartedAt: Date.now(), pairing: buildDerangement(submitterIds), bids: {} };
  });
  return res.value;
}

// ─── The bid -> hardening formula — the central judgment call in this
// whole round, since the spec only says bid size should convert into
// difficulty and doesn't say how much or how. Named constants below,
// each with its own reasoning; nothing here is a bare magic number.
// ============================================================

// Flat bonus a partner receives whenever their bidder guesses correctly
// — "your partner gets 3 points," verbatim from the spec.
const ON_BLAST_PARTNER_BONUS = 3;

// Absolute ceiling on fake superlatives ("decoys") that can ever be
// added to a bidder's own option list, no matter how big the bid. The
// true list is always 3 candidates; capping decoys at 3 means the
// option list a bidder ever has to read tops out at 6 total — still a
// normal multiple-choice size, never "an absurd wall of choices."
const ON_BLAST_MAX_DECOYS = 3;

// Never redact so many real names from a bidder's own view of their
// partner's ranking that fewer than this many remain visible. A
// "ranking" with only 0-1 visible names left isn't a puzzle anymore —
// it's either an unsolvable guess or, worse, an accidental giveaway
// depending on which one name survives — so this is a floor, not a
// suggestion.
const ON_BLAST_MIN_VISIBLE_PLAYERS = 2;

// Hard ceiling on decoys + struck names COMBINED, regardless of bid
// size. This is what actually keeps "any number of points" (the spec's
// own words — there is deliberately no bid cap) from ever translating
// into an unbounded, degenerate puzzle: no matter how enormous a bid
// gets, the difficulty budget it can buy tops out here.
const ON_BLAST_MAX_DIFFICULTY_BUDGET = 6;

// The bid size at which bidToDifficultyBudget below first reaches the
// ceiling above. Purely documentation — sqrt(36) === 6 exactly — kept as
// its own named constant so the relationship between "how big a bid do
// you actually need to hit max difficulty" and the ceiling itself is
// legible at a glance rather than something you have to work out from
// the formula.
const ON_BLAST_BUDGET_SATURATION_BID = 36;

// Bid -> a difficulty "budget" to spend on decoys/strikes. sqrt growth
// (rather than linear) on purpose: bigger bid -> more-or-equal difficulty
// (strictly monotonic, satisfying the spec's own implicit requirement),
// but with steadily diminishing returns, so a genuinely huge bid (again,
// nothing here caps bid size itself) doesn't demand a genuinely huge
// number of decoys/strikes — Math.min saturates it at
// ON_BLAST_MAX_DIFFICULTY_BUDGET well before that. sqrt specifically
// (over something like log) because it's clean at both ends: sqrt(0) is
// exactly 0 (a bid of 0 -> zero hardening, no special-casing needed the
// way log(0) would require), and it's a single, easy-to-audit line.
function bidToDifficultyBudget(bid) {
  const safeBid = Math.max(0, Math.floor(Number(bid) || 0));
  return Math.min(ON_BLAST_MAX_DIFFICULTY_BUDGET, Math.floor(Math.sqrt(safeBid)));
}

// Computed ONCE per bid (called only from submitOnBlastBid below,
// exactly once per write) and stored in game_state rather than
// recomputed on every render — per the spec's own explicit requirement
// that this split be "stable and auditable," not re-rolled every time
// the bidder's screen happens to re-render.
//
// "Randomly assigned between the following two options" (the spec's own
// words) is implemented as: take the bid's total difficulty budget and
// split it randomly between decoys (0..min(budget, MAX_DECOYS)) and
// strikes (whatever's left, capped by both the round's own roster size
// and MIN_VISIBLE_PLAYERS). Any budget left over after both caps are
// hit is simply unspent — the marginal value of an even bigger bid
// saturates once both effects are already maxed out, which is the
// intended behavior (a bid of 1000 isn't meaningfully "harder" to guess
// against than a bid of 36; it's just a bigger risk).
function computeHardening(bid, partnerCandidates, partnerOrder) {
  const budget = bidToDifficultyBudget(bid);
  const maxDecoys = Math.min(budget, ON_BLAST_MAX_DECOYS);
  const decoyCount = maxDecoys > 0 ? Math.floor(Math.random() * (maxDecoys + 1)) : 0;
  const maxStrikes = Math.max(0, (partnerOrder?.length || 0) - ON_BLAST_MIN_VISIBLE_PLAYERS);
  const strikeCount = Math.max(0, Math.min(budget - decoyCount, maxStrikes));

  // Decoys are drawn from the SAME shared pool everything else in this
  // game uses, excluding the partner's own true 3 — so a decoy is
  // indistinguishable in tone/format from a real option; nothing marks
  // it as fake in the option list itself (that would defeat the point).
  const decoyPool = shuffle(SUPERLATIVES.filter((s) => !partnerCandidates.includes(s)));
  const decoyOptions = decoyPool.slice(0, decoyCount);
  const struckPlayerIds = shuffle(partnerOrder || []).slice(0, strikeCount);
  const optionsShown = shuffle([...(partnerCandidates || []), ...decoyOptions]);

  return { budget, decoyCount, strikeCount, decoyOptions, struckPlayerIds, optionsShown };
}

// A player placing (or changing — allowed up until they've also locked
// in a guess, same "editable until you're really done" convention
// Rounds 1/2 use for rankings/picks) their own bid. Recomputes hardening
// fresh every time this is called, INCLUDING on a genuine re-bid before
// any guess exists — that's a deliberate, different case from "don't
// re-randomize on every render": a real change of bid amount is a new
// decision, and it's correct (not a bug) for the harder puzzle to be
// re-rolled along with it.
export async function submitOnBlastBid(gameId, round, bidderId, bidAmount) {
  const res = await storageUpdate(gameId, onBlastKey(round), (fresh) => {
    if (!fresh || fresh.status !== "bidding") return fresh;
    const partnerId = fresh.pairing?.[bidderId];
    if (!partnerId) return fresh; // this player has no bidder role this round (never submitted Step 1 in time)
    if (fresh.bids?.[bidderId]?.guess != null) return fresh; // guess is already locked in — see submitOnBlastGuess's own comment
    const bid = Math.max(0, Math.floor(Number(bidAmount) || 0));
    const partnerCandidates = fresh.candidatePools?.[partnerId] || [];
    const partnerOrder = fresh.submissions?.[partnerId]?.order || [];
    const hardening = computeHardening(bid, partnerCandidates, partnerOrder);
    return { ...fresh, bids: { ...fresh.bids, [bidderId]: { bid, hardening, guess: null, bidSubmittedAt: Date.now() } } };
  });
  return { ok: res.ok };
}

// A player submitting (or changing, same convention) their own guess —
// must already have a bid on file (that's what produced the hardened
// option list they're guessing from in the first place).
export async function submitOnBlastGuess(gameId, round, bidderId, guessedSuperlative) {
  const res = await storageUpdate(gameId, onBlastKey(round), (fresh) => {
    if (!fresh || fresh.status !== "bidding") return fresh;
    const existing = fresh.bids?.[bidderId];
    if (!existing) return fresh; // no bid on file yet — nothing to guess against
    return { ...fresh, bids: { ...fresh.bids, [bidderId]: { ...existing, guess: guessedSuperlative, guessedAt: Date.now() } } };
  });
  return { ok: res.ok };
}

// ─── Pure scoring function ───
// A deterministic function of the round's own already-committed state
// (submissions + pairing + bids) — called from INSIDE the db.update
// callback below, same reasoning as computeASideScores/computeRemixScores
// (recomputes against the latest `fresh` on every CAS retry rather than
// replaying a stale outer snapshot).
//
// Scoring, per pairing (bidderId -> partnerId):
//   - No bid on file at all (bidder never acted, or was force-scored
//     before ever bidding): zero score change either way — nothing was
//     ever wagered, so there's nothing to win or lose.
//   - A bid exists but no guess was ever locked in (force-scored mid-
//     bid): treated as a genuine wrong guess, NOT a free pass — the bid
//     itself was already a completed commitment (submitOnBlastBid
//     already computed real hardening against it), so going AFK after
//     that point still costs the bid. This mirrors the same "the risk
//     was already taken" reasoning a real wrong guess gets below.
//   - Correct guess: bidder's score += their bid; partner's score +=
//     ON_BLAST_PARTNER_BONUS (flat, regardless of bid size).
//   - Incorrect guess: bidder's score -= their bid — a real, negative-
//     capable deduction, not a "no-op forfeit floored at zero." This is
//     the literal reading of the spec's own "you lose all the points you
//     bid" (as opposed to a softer "you simply don't gain anything"
//     reading) — see this file's own header/PR notes for why that's the
//     primary interpretation here, and how easy it'd be to flip if that
//     guess is wrong: the entire effect is this one `correct ? bid :
//     -bid` expression below, nothing else in the codebase depends on
//     round scores staying non-negative.
function computeOnBlastScores(state) {
  const perPlayer = {};
  (state.playerIds || []).forEach((pid) => {
    perPlayer[pid] = { totalPoints: 0, bidderResult: null, partnerBonusFrom: null };
  });

  const pairing = state.pairing || {};
  Object.entries(pairing).forEach(([bidderId, partnerId]) => {
    const b = state.bids?.[bidderId];
    if (!b) {
      perPlayer[bidderId].bidderResult = { partnerId, bid: 0, guess: null, correct: null, delta: 0 };
      return; // never bid at all — nothing wagered, nothing to score, see comment above
    }
    const chosen = state.submissions?.[partnerId]?.chosen;
    const guessedAtAll = b.guess != null;
    const correct = guessedAtAll && b.guess === chosen;
    const delta = correct ? b.bid : -b.bid;

    perPlayer[bidderId].totalPoints += delta;
    perPlayer[bidderId].bidderResult = { partnerId, bid: b.bid, guess: b.guess ?? null, correct: guessedAtAll ? correct : false, delta, hardening: b.hardening };

    if (correct) {
      perPlayer[partnerId].totalPoints += ON_BLAST_PARTNER_BONUS;
      perPlayer[partnerId].partnerBonusFrom = bidderId;
    }
  });

  return perPlayer;
}

// ─── Race-condition-safe scoring, same CAS-retry-recompute pattern as
// lib/stereoTypesASide.js's maybeScoreASide / lib/stereoTypesRemix.js's
// maybeScoreRemix — see maybeScoreASide's own (lengthy) comment for the
// full reasoning, unchanged here in spirit. Even though this round's
// bidding phase is fully concurrent rather than the earlier sequential-
// turn design, the two races this still has to guard against are
// exactly the ones called out for that earlier design too: a bidder's
// own submit button double-firing (harmless here — submitOnBlastBid/
// submitOnBlastGuess are themselves just ordinary CAS writes, safe to
// retry/duplicate) and a host force-score racing a genuinely-just-landed
// guess (guarded the same way maybeScoreASide guards it: `fresh.result`
// already set is a hard no-op, and the `allGuessed` check is
// recomputed fresh on every attempt, never from a captured outer value).
export async function maybeScoreOnBlast(gameId, round, { force = false } = {}) {
  const computeToken = `${Date.now()}:${Math.random().toString(36).slice(2)}`;

  const res = await storageUpdate(gameId, onBlastKey(round), (fresh) => {
    if (!fresh || fresh.status !== "bidding") return fresh;
    if (fresh.result) return fresh; // already scored — no-op

    const bidderIds = Object.keys(fresh.pairing || {});
    const allDone = bidderIds.every((pid) => fresh.bids?.[pid]?.guess != null);
    if (!allDone && !force) return fresh; // still waiting on someone — try again later

    const perPlayer = computeOnBlastScores(fresh);
    // status flips to "scored" in this SAME write — closes bid/guess
    // editing the same way Rounds 1/2's own scoring write closes theirs.
    return { ...fresh, status: "scored", result: { computeToken, computedAt: Date.now(), perPlayer } };
  });

  if (!res.ok || !res.value?.result) return null;
  if (res.value.result.computeToken !== computeToken) return res.value.result; // we lost the race — nothing else for THIS call to do

  await persistOnBlastRoundScores(gameId, round, res.value.result.perPlayer);
  return res.value.result;
}

// Persists this round's point totals into the same durable, cross-
// round-summable ledger Rounds 1/2 use (sql/add-stereo-types-a-side.sql's
// stereo_types_round_scores), as round = 3 rows — same table, no new
// migration needed for this, same as Round 2's own reuse. Points can be
// NEGATIVE here (a bidder who lost a big bid) — the table's own `points
// int` column is a signed integer, so that's a non-issue at the schema
// level. A plain upsert, deliberately safe to call more than once and
// from more than one client — see persistASideRoundScores's own comment
// for the full reasoning, unchanged here.
export async function persistOnBlastRoundScores(gameId, round, perPlayer) {
  const rows = Object.entries(perPlayer || {}).map(([playerId, p]) => ({
    game_id: gameId,
    round,
    player_id: playerId,
    points: p.totalPoints,
  }));
  if (rows.length === 0) return { ok: true };
  const { error } = await supabase.from("stereo_types_round_scores").upsert(rows, { onConflict: "game_id,round,player_id" });
  if (error) {
    console.error("Stereo Types: failed to persist Round 3 (On Blast) scores (safe to retry later — this upsert is idempotent):", error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function getOnBlastRound(gameId, round) {
  return storageGet(gameId, onBlastKey(round));
}
