import { supabase } from "./supabaseClient";
import { storageGet, storageSet, storageUpdate, subscribeGameState } from "./gameStorage";
import { SUPERLATIVES, getSuperlativePool } from "./stereoTypesSuperlatives";
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

  // getSuperlativePool() (lib/stereoTypesSuperlatives.js) is the static
  // SUPERLATIVES list plus any admin-approved player submissions — the
  // one call site swap Phase 8 makes in this file. computeHardening's
  // own decoy draw further below deliberately keeps pulling straight
  // from the static SUPERLATIVES import, not this pool — that's a
  // decoy-generation detail inside an already-in-progress bidding phase,
  // not a "deal superlatives to start the round" call site, and out of
  // scope for this one-call-site-per-file swap.
  const candidatePools = dealOnBlastCandidatePools(playerIds, await getSuperlativePool());

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
//
// ─── CORRECTION BAKED INTO THIS DESIGN ───
// An earlier draft of this formula converted a bid into a diminishing-
// returns "difficulty budget" (sqrt(bid), capped at 6) that got split
// between decoys/strikes. That was wrong, per direct clarification from
// the game's designer after playtesting: the relationship is meant to be
// literal and 1:1, not diminishing. Each individual POINT of the bid is,
// on its own, independently and randomly assigned to become EITHER one
// additional decoy OR one additional struck real name — so a bid of N
// points produces, in expectation, N total hardening effects (split
// across the two buckets), not a budget that saturates at 6 regardless
// of how big N gets. The "randomly assigned between the two options" per
// point is implemented below as an independent 50/50 coin flip per
// point — the spec calls for "random and independent," and 50/50 is the
// natural, unbiased reading of that with no stated skew toward either
// bucket.
// ============================================================

// Flat bonus a partner receives whenever their bidder guesses correctly
// — "your partner gets 3 points," verbatim from the spec.
const ON_BLAST_PARTNER_BONUS = 3;

// Never redact so many real names from a bidder's own view of their
// partner's ranking that NONE remain visible — "at least one name should
// stay on the list," verbatim from the designer's own correction. A
// floor of 1 (not 2 — an earlier draft's floor, tightened per that same
// correction) is the least you can redact down to and still have
// something left to actually guess about.
const ON_BLAST_MIN_VISIBLE_PLAYERS = 1;

// Computed ONCE per bid (called only from submitOnBlastBid below, at the
// moment a bid is first — and only ever — committed, never recomputed on
// a later render or a later read of the same bid) and stored in
// game_state rather than recomputed live, per the spec's own explicit
// requirement that this split be "stable and auditable."
//
// Mechanism: safeBid independent Bernoulli(0.5) trials, one per point —
// heads adds to the decoy tally, tails adds to the strike tally, each
// tally capped at the REAL ceiling for that bucket (see maxDecoys/
// maxStrikes below — neither ceiling is an arbitrary balance choice,
// both are "how much of this effect could possibly exist"). When a
// flip's own bucket is already at its real ceiling, the point isn't
// wasted — it redirects to the OTHER bucket if that one still has room,
// so a large bid keeps having a real effect on whichever side isn't
// saturated yet. Only once BOTH buckets are simultaneously saturated do
// further points genuinely stop mattering — an honest degeneracy (a
// giant bid against a tiny roster/pool), not a bug — and the loop below
// breaks out early the moment that happens rather than spinning through
// however many millions of points a bid might contain for no effect.
function computeHardening(bid, partnerCandidates, partnerOrder) {
  const safeBid = Math.max(0, Math.floor(Number(bid) || 0));

  // Decoys are drawn from the SAME shared pool everything else in this
  // game uses, excluding the partner's own true 3 — so a decoy is
  // indistinguishable in tone/format from a real option; nothing marks
  // it as fake in the option list itself (that would defeat the point).
  // Their real ceiling is simply how many such unused superlatives exist
  // — you cannot add a decoy that isn't actually there to add.
  const decoyPool = shuffle(SUPERLATIVES.filter((s) => !partnerCandidates.includes(s)));
  const maxDecoys = decoyPool.length;

  // Strikes' real ceiling is the roster size minus the floor above —
  // redacting further than that would leave fewer real names visible
  // than the spec's own "at least one name stays on the list" allows.
  const maxStrikes = Math.max(0, (partnerOrder?.length || 0) - ON_BLAST_MIN_VISIBLE_PLAYERS);

  let decoyCount = 0;
  let strikeCount = 0;
  for (let i = 0; i < safeBid; i++) {
    if (decoyCount >= maxDecoys && strikeCount >= maxStrikes) break; // both buckets saturated — every remaining point is a genuine no-op, so stop here
    if (Math.random() < 0.5) {
      if (decoyCount < maxDecoys) decoyCount++;
      else strikeCount++; // decoy bucket full — redirect this point's effect to strikes instead
    } else {
      if (strikeCount < maxStrikes) strikeCount++;
      else decoyCount++; // strike bucket full — redirect this point's effect to decoys instead
    }
  }

  const decoyOptions = decoyPool.slice(0, decoyCount);
  const struckPlayerIds = shuffle(partnerOrder || []).slice(0, strikeCount);
  const optionsShown = shuffle([...(partnerCandidates || []), ...decoyOptions]);

  return { decoyCount, strikeCount, decoyOptions, struckPlayerIds, optionsShown };
}

// A player placing their own bid — ONE TIME ONLY, per direct correction
// from the game's designer after playtesting: bidding must be BLIND. An
// earlier draft let a bidder change their bid any time before locking in
// a guess, which meant they could already be looking at their own
// hardened (possibly decoy-stuffed, possibly redacted) option list and
// change their mind about the bid with that information in hand — that
// defeats the entire point of a bid being a wager placed before you know
// what you're up against. Now: the FIRST call to this per bidder per
// round is the only one that ever does anything (computes hardening
// once, against the bid that was actually placed blind, and stores it
// alongside the bid) — every subsequent call for the same bidder is a
// hard no-op, same as an already-locked guess already was. The caller
// (components/StereoTypesOnBlastPlayer.jsx) enforces this on the UI side
// too — no "Change bid" affordance exists once a bid is on file — but
// the real guarantee is here, since this is the only function that can
// ever write a bid.
export async function submitOnBlastBid(gameId, round, bidderId, bidAmount) {
  const res = await storageUpdate(gameId, onBlastKey(round), (fresh) => {
    if (!fresh || fresh.status !== "bidding") return fresh;
    const partnerId = fresh.pairing?.[bidderId];
    if (!partnerId) return fresh; // this player has no bidder role this round (never submitted Step 1 in time)
    if (fresh.bids?.[bidderId]) return fresh; // a bid is already on file for this bidder — locked in for good, see comment above
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
