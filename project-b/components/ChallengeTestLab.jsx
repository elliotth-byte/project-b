import { useState } from "react";
import { Card, Btn, Badge } from "./ui";
import { GAME_COMPONENTS } from "./ChallengePlayer";
import { GAME_REGISTRY } from "../lib/challengeGames";
import { DEFAULT_GAME_PREFS } from "../lib/gamePrefs";
import { initChains } from "../lib/games/chainsData";
import { initCloseToTwenty } from "../lib/games/closeToTwentyData";
import { initMasquerade } from "../lib/games/masqueradeData";
import { initPit } from "../lib/games/pitData";
import { initScavengerHunt } from "../lib/games/scavengerHuntData";
import { initTorched } from "../lib/games/torchedData";
import { initPandorasBoxes } from "../lib/games/pandorasBoxesData";
import { initMusicalChairs } from "../lib/games/musicalChairsData";
import { initFloor } from "../lib/games/floorData";
import { initArtAuction } from "../lib/games/artAuctionData";
import { initMysteryButton } from "../lib/games/mysteryButtonData";
import { initEyesInTheSystem } from "../lib/games/eyesInTheSystemData";
import { initEyesInTheSystemTv } from "../lib/games/eyesInTheSystemTvData";
import { initWordScrambleTv } from "../lib/games/wordScrambleTvData";
import { initSimonTv } from "../lib/games/simonTvData";
import { initMusicalChairsTv } from "../lib/games/musicalChairsTvData";
import { initBalloono } from "../lib/games/balloonoData";
import { initLaurelThief } from "../lib/games/laurelThiefData";
import { initWagerTrivia } from "../lib/games/wagerTriviaTvData";
import { initTartarusTreadmill } from "../lib/games/tartarusTreadmillData";
import { initSpyfall, SPYFALL_MIN_POOL_TO_CONTINUE } from "../lib/games/spyfallData";
import { initAcrophobia } from "../lib/games/acrophobiaData";
import { initMiniGolf } from "../lib/games/miniGolfData";
import { initGoldenFleece } from "../lib/games/goldenFleeceData";
import { initRiverStyx } from "../lib/games/riverStyxData";
import { initWineDarkSea } from "../lib/games/wineDarkSeaData";
import { initMajorityRules } from "../lib/games/majorityRulesData";
import { initMajorityRulesTv } from "../lib/games/majorityRulesTvData";
import { initTriggerHappyTv } from "../lib/games/triggerHappyTvData";
import { initGodsAndGambits } from "../lib/games/godsAndGambitsData";
import { initDivinersDice } from "../lib/games/divinersDiceData";
import { initSplitFriction } from "../lib/games/splitFrictionData";
import { initCrowns } from "../lib/games/crownsData";
import { initPoseidonsPool } from "../lib/games/poseidonsPoolData";

// ─── Test Lab ───
// Lets the host preview any game at any time, without needing a live
// Battle running — useful for checking a new or unfamiliar game before
// actually putting it in front of players. Deliberately isolated from
// the real season: every write this generates uses a round number that
// can never collide with a genuine round (see SANDBOX_ROUND below), and
// the "player" is a synthetic identity, not a real row in `players` —
// nothing here can corrupt real scores, real challenge history, or
// anything a real player would see.
//
// Two honest limits, surfaced directly in the UI rather than left for
// the host to discover by confusion:
//   1. Every game in SHARED_GAME_INIT only ever gets its real server
//      state set up by the host's own Start Battle click or by
//      random-mode's auto-start (see components/ChallengeHost.jsx and
//      lib/roundEngine.js) — normally. Here, the Test Lab calls that
//      same init function itself, using two synthetic participants.
//      Most of these explicitly refuse to initialize with fewer than 2
//      — confirmed by reading each one directly, not assumed uniform —
//      so two is exactly enough to init, but only ONE of the two is
//      actually playable; the second (the Ghost) exists purely to
//      satisfy that minimum and never acts. Games like Musical Chairs,
//      The Floor, Eyes in the System, Balloono, Laurel Thief, and the
//      Big Screen variants still run a real, complete round or duel
//      this way: the Ghost never claims a chair, answers, pops a
//      balloon, etc., so the test player wins simply by acting
//      correctly themselves — a fine way to preview the actual flow,
//      just not an actual contest against a second live participant.
//      Art Auction similarly still shows the real painting canvas and
//      a real (if lot-of-one) auction, since the Ghost never submits a
//      painting or a bid.
//      Two games need MORE than 2 to do anything useful here:
//      Pandora's Boxes needs 3 to init AT ALL (see
//      lib/games/pandorasBoxesData.js) — its own entry below is
//      harmless but this sandbox can't exercise it until it grows a
//      third synthetic participant. Spyfall needs more than
//      MIN_POOL_TO_CONTINUE (3) remaining to keep going (see
//      lib/games/spyfallData.js) — with only 2 here, it inits
//      successfully but immediately takes its own graceful "not enough
//      people left" branch and ends the round on the spot, so it
//      previews as an instant Game Over screen rather than a real
//      round.
//   2. Server-side automation that runs on a live poll cycle — Torched's
//      placement timeout, Masquerade's turn timeout, Scavenger Hunt's
//      round auto-advance, Chains' auto-lock-on-resolve, Musical
//      Chairs' own phase timers — is all driven
//      by lib/roundEngine.js reading the REAL, current round's phase.
//      A sandboxed round number is invisible to that entirely, so none
//      of that safety-net automation fires here. The core, player-
//      driven interactions all work identically to the real thing;
//      only the "what happens if nobody acts" behaviors don't.

const TEST_PLAYER = {
  id: "00000000-0000-0000-0000-000000000001", name: "Test Player (You)",
  gamePrefs: DEFAULT_GAME_PREFS, battleBanRound: null, torchedPreset: null, powerState: {}, alias: null, inactivityStrikes: 0,
};
const GHOST_PARTICIPANT = { id: "00000000-0000-0000-0000-000000000002", name: "Test Opponent (inactive)" };

// Six games whose player components strictly require this to have
// already happened elsewhere (confirmed by checking each one's actual
// imports — none of them import an init function themselves, unlike
// e.g. Deal or No Deal, which deliberately self-initializes and needs
// nothing here).
//
// pandorasboxes is a seventh, registered below for completeness, but
// genuinely can't be previewed here at all: it refuses to initialize
// below 3 real participants (round 2's "never back to whoever gave it
// to you" rule is structurally impossible with only 2 people — see
// lib/games/pandorasBoxesData.js), and this sandbox only ever has the
// two synthetic ones above. Calling its init here is harmless — it
// just no-ops — but the Test Lab has no way to actually exercise this
// one until it grows a third synthetic participant.
const SHARED_GAME_INIT = {
  chains: (gameId, round, participants) => initChains(gameId, round, participants),
  closeto20: (gameId, round, participants) => initCloseToTwenty(gameId, round, participants, Date.now()),
  masquerade: (gameId, round, participants) => initMasquerade(gameId, round, participants, Date.now()),
  pit: (gameId, round, participants) => initPit(gameId, round, participants, Date.now()),
  scavengerhunt: (gameId, round, participants) => initScavengerHunt(gameId, round, participants, Date.now()),
  torched: (gameId, round, participants) => initTorched(gameId, round, participants, Date.now(), {}),
  pandorasboxes: (gameId, round, participants) => initPandorasBoxes(gameId, round, participants),
  // Unlike pandorasboxes above, this one only needs 2 participants
  // (MIN_PARTICIPANTS in lib/games/musicalChairsData.js) — so this IS
  // fully exercisable here, just as a single-chair, one-round game.
  musicalchairs: (gameId, round, participants) => initMusicalChairs(gameId, round, participants, Date.now(), 60),
  // Neither synthetic participant below has a floor_specialty set, so
  // this always exercises the auto-assign fallback for both — a fine
  // way to preview the actual duel/choosing flow, just never the
  // "player picked their own category ahead of time" path.
  floor: (gameId, round, participants) => initFloor(gameId, round, participants, Date.now(), 60),
  // 2 synthetic participants is exactly MIN_PARTICIPANTS, so this
  // fully exercises the painting canvas and the bidding UI's own
  // controls — just against a Ghost who never actually submits a
  // painting or a bid, so there's only ever one real lot in the
  // gallery and nothing to bid on.
  artauction: (gameId, round, participants) => initArtAuction(gameId, round, participants, Date.now(), 60),
  // Same 2-participant floor as Musical Chairs/Floor — fully
  // exercisable here, including both scenarios (whichever one the
  // random 50/50 lands on for a given preview). The Ghost never presses
  // or passes, so Scenario A's race is trivially won by the test
  // player, and Scenario B just... never gets its first press at all
  // unless the test player provides it themselves — a fine way to
  // preview both branches, just not a real contest.
  mysterybutton: (gameId, round, participants) => initMysteryButton(gameId, round, participants, Date.now(), 60),
  // Everything below was added later, after this map first shipped with
  // only the eleven games above — every one of these silently rendered
  // "Loading..." forever in Test Lab until now, since without an entry
  // here the shared state row this game's player component subscribes
  // to was simply never created.
  eyesinthesystem: (gameId, round, participants) => initEyesInTheSystem(gameId, round, participants, Date.now()),
  eyesinthesystemtv: (gameId, round, participants) => initEyesInTheSystemTv(gameId, round, participants, Date.now()),
  wordscrambletv: (gameId, round, participants) => initWordScrambleTv(gameId, round, participants, Date.now()),
  simontv: (gameId, round, participants) => initSimonTv(gameId, round, participants, Date.now()),
  musicalchairstv: (gameId, round, participants) => initMusicalChairsTv(gameId, round, participants, Date.now()),
  balloono: (gameId, round, participants) => initBalloono(gameId, round, participants, Date.now()),
  // laurelthief and laurelthieftv are two GAME_REGISTRY entries backed
  // by the same shared-state init function (see lib/games/laurelThiefData.js)
  // — the TV variant just renders a different display component from
  // the same state, so both keys map here.
  laurelthief: (gameId, round, participants) => initLaurelThief(gameId, round, participants, Date.now()),
  laurelthieftv: (gameId, round, participants) => initLaurelThief(gameId, round, participants, Date.now()),
  wagertriviatv: (gameId, round, participants) => initWagerTrivia(gameId, round, participants, Date.now()),
  tartarustreadmill: (gameId, round, participants) => initTartarusTreadmill(gameId, round, participants, Date.now()),
  // Spyfall's own MIN_POOL_TO_CONTINUE is 3 (see lib/games/spyfallData.js)
  // — with only our two synthetic participants, init immediately takes
  // the graceful "not enough people left" branch and ends the round on
  // the spot, so this previews as an instant Game Over screen rather
  // than a real round. Not broken, just not a useful preview until this
  // sandbox grows a third synthetic participant (same caveat as
  // Pandora's Boxes above).
  spyfall: (gameId, round, participants) => initSpyfall(gameId, round, participants, Date.now()),
  acrophobia: (gameId, round, participants) => initAcrophobia(gameId, round, participants, Date.now()),
  minigolf: (gameId, round, participants) => initMiniGolf(gameId, round, participants, Date.now()),
  // Fully exercisable with just the two synthetic participants — every
  // decision window resolves the instant both have chosen (the Ghost
  // never will, so in practice each window resolves on its own timeout
  // instead — see lib/games/goldenFleeceData.js's own "not deciding
  // defaults to leave" comment), which means the Ghost effectively
  // leaves almost every chamber immediately, and the test player ends
  // up soloing most of the delve — a fine way to preview the real flow,
  // just not an actual contest against a second live participant.
  goldenfleece: (gameId, round, participants) => initGoldenFleece(gameId, round, participants, Date.now()),
  // Turn-based, unlike everything above — fully exercisable with two
  // synthetic participants (each has a real turn), just against a
  // Ghost who never actually acts, so the housekeeping tick's own
  // idle-turn timeout (see lib/games/riverStyxData.js's tickRiverStyx)
  // is what actually plays the Ghost's turns here, not a real opponent
  // deciding anything.
  riverstyx: (gameId, round, participants) => initRiverStyx(gameId, round, participants, Date.now()),
  winedarksea: (gameId, round, participants) => initWineDarkSea(gameId, round, participants, Date.now()),
  // Both Majority Rules modes need real shared server state (the 8-
  // question set, who's answered what) the same way every other entry
  // in this map does — with only the two synthetic participants here,
  // every question ends up pitting the Test Player against the Ghost,
  // who never answers, so every question's "majority" is trivially
  // whatever the Test Player themselves picked. Still a fine way to
  // preview the actual question flow and (for the TV variant) the
  // reveal/leaderboard/sudden-death sequence end to end.
  majorityrules: (gameId, round, participants) => initMajorityRules(gameId, round, participants, Date.now()),
  majorityrulestv: (gameId, round, participants) => initMajorityRulesTv(gameId, round, participants, Date.now()),
  triggerhappytv: (gameId, round, participants) => initTriggerHappyTv(gameId, round, participants, Date.now()),
  // Fully exercisable with just the two synthetic participants — every
  // guessing/betting window resolves the instant both have responded
  // (the Ghost never will, so in practice each window resolves on its
  // own timeout instead, same as lib/games/goldenFleeceData.js's own
  // "not deciding" convention noted above), which previews the real
  // guess -> betting board -> reveal flow end to end across all 3
  // rounds against a Ghost who simply never guesses or bets.
  godsandgambits: (gameId, round, participants) => initGodsAndGambits(gameId, round, participants, Date.now()),
  // Genuinely the best-suited entry in this whole map for the
  // Multiplayer Test mode below — this is the one battle in the app
  // built explicitly with NO player-count cap (see
  // lib/games/divinersDiceData.js's own header), so bumping the
  // synthetic-participant slider up toward MULTIPLAYER_MAX here is a
  // real, meaningful sanity check of the turn order (every synthetic
  // player gets an equal-share turn, looping back to the front), the
  // shared white-mark fan-out to everyone at once, and the TV's
  // per-player grid actually staying legible with a full table of
  // panels — not just a 2-vs-Ghost preview like most entries above.
  divinersdice: (gameId, round, participants) => initDivinersDice(gameId, round, participants, Date.now()),
  // Fully exercisable with just the two synthetic participants — this
  // is exactly MIN_PARTICIPANTS (see lib/games/splitFrictionData.js),
  // so both the offering slider and the accept/reject decisions render
  // for real. The Ghost never sets or locks in an offer, so the test
  // player's single outbound offer to them always resolves via the
  // offering phase's own timeout default (a neutral 50/50) rather than
  // a real lock-in, and the Ghost's own offer to the test player
  // likewise defaults — a fine way to preview the full flow end to end,
  // just not an actual contest against a second live participant.
  splitfriction: (gameId, round, participants) => initSplitFriction(gameId, round, participants, Date.now(), 60),
  // Both game types (crowns/crownstv) share the exact same underlying
  // state (see initCrowns's own gate in lib/roundEngine.js) — a real
  // two-crown deal against the Ghost participant, so proposing a trade
  // and having the Ghost's side of it accept/decline is genuinely
  // testable here too.
  crowns: (gameId, round, participants) => initCrowns(gameId, round, participants, Date.now()),
  crownstv: (gameId, round, participants) => initCrowns(gameId, round, participants, Date.now()),
  // Both game types (poseidonspool/poseidonspooltv) share the exact
  // same underlying state (see initPoseidonsPool's own gate in
  // lib/roundEngine.js) — a real two-ball table against the Ghost
  // participant, so aiming and shooting is genuinely testable here too.
  poseidonspool: (gameId, round, participants) => initPoseidonsPool(gameId, round, participants, Date.now(), 60),
  poseidonspooltv: (gameId, round, participants) => initPoseidonsPool(gameId, round, participants, Date.now(), 60),
};

const gameOptions = Object.entries(GAME_REGISTRY).filter(([key]) => key !== "manual");

// ─── Multiplayer Test mode ───
// Everything above this point (TEST_PLAYER, GHOST_PARTICIPANT,
// SHARED_GAME_INIT, startTest, the solo render branch below) is the
// original single-player Test Lab flow, kept completely unchanged and
// still the default. This section adds an ADDITIONAL mode, offered only
// for games that already have a SHARED_GAME_INIT entry — solo,
// self-contained games (Sliding Puzzle, Life's a Tapestry, the
// non-TV Trigger Happy, and anything else with no SHARED_GAME_INIT
// entry) have no shared server state for a second simulated player to
// interact with, so there's nothing for a "multiplayer" preview to add
// there; that existing "single Start Test button" flow is exactly
// right for them and is left untouched.
//
// Instead of a fixed [TEST_PLAYER, GHOST_PARTICIPANT] pair, this builds
// N synthetic players (same shape/id-convention as TEST_PLAYER, just
// parameterized) and calls the SAME SHARED_GAME_INIT function with all
// N of them as real participants, then mounts N separate GameComponent
// instances side by side — one per synthetic player — all pointed at
// the same gameId/round/challenge, so they all read and write the same
// shared game_state row exactly like N real players' browser tabs
// would. See makeSynthPlayer/MULTIPLAYER_MIN/MULTIPLAYER_MAX below for
// the per-game participant-count limits this clamps to.

// Same synthetic-id convention as TEST_PLAYER above, just parameterized
// per slot (1-indexed) instead of hardcoded.
const makeSynthPlayer = (n) => ({
  id: `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
  name: `Test Player ${n}`,
  display_name: `Test Player ${n}`,
  gamePrefs: DEFAULT_GAME_PREFS, battleBanRound: null, torchedPreset: null, powerState: {}, alias: null, inactivityStrikes: 0,
});

// Absolute ceiling on simulated players — purely a UI/screen-space
// choice (8 bordered panels already needs horizontal scrolling on most
// screens), not tied to any game's own logic.
const MULTIPLAYER_MAX = 8;

// Per-game floor, ABOVE the map's own generic default of 2. Confirmed
// against each game's own init-time validation (see the same files
// SHARED_GAME_INIT's comments above already point to):
//   - pandorasboxes hard-refuses to initialize at all below 3 real
//     participants (lib/games/pandorasBoxesData.js's own
//     MIN_PARTICIPANTS) — round 2's "never back to whoever gave it to
//     you" rule is structurally impossible with only 2.
//   - spyfall initializes fine with 2, but its own
//     SPYFALL_MIN_POOL_TO_CONTINUE (3, exported from
//     lib/games/spyfallData.js) means a pool AT or below 3 immediately
//     takes the "not enough people left" branch and ends the round on
//     the spot — so this sandbox needs strictly more than 3, i.e. 4, to
//     actually preview a real round of it rather than an instant Game
//     Over.
// Every other SHARED_GAME_INIT entry has no stricter minimum than the
// generic 2 (confirmed by reading each one's own init-time guard, where
// it has one at all).
const MULTIPLAYER_MIN = { pandorasboxes: 3, spyfall: SPYFALL_MIN_POOL_TO_CONTINUE + 1 };

const multiplayerMinFor = (key) => MULTIPLAYER_MIN[key] || 2;
const multiplayerDefaultFor = (key) => Math.max(3, multiplayerMinFor(key));

export default function ChallengeTestLab({ gameId }) {
  const [selectedKey, setSelectedKey] = useState(null);
  const [session, setSession] = useState(null); // { round, challenge, mode, players } once a test is live
  const [starting, setStarting] = useState(false);
  // How many simulated players each testable game's Multiplayer Test
  // control is currently set to — keyed by game key, so switching games
  // doesn't lose your last choice for another one. Seeded lazily
  // (multiplayerDefaultFor) the first time each game's control renders.
  const [multiCounts, setMultiCounts] = useState({});

  const setMultiCount = (key, n) => {
    const clamped = Math.max(multiplayerMinFor(key), Math.min(MULTIPLAYER_MAX, n));
    setMultiCounts((prev) => ({ ...prev, [key]: clamped }));
  };

  const startTest = async (key) => {
    setStarting(true);
    const entry = GAME_REGISTRY[key];
    const round = -Date.now(); // always negative, always unique per test — can never collide with a real round or a previous test session's leftover state
    const durationSec = entry.defaultDurationSec || 300;
    const challenge = {
      gameType: key, active: true, round,
      startedAt: Date.now(), endsAt: Date.now() + durationSec * 1000,
      participantIds: [TEST_PLAYER.id, GHOST_PARTICIPANT.id],
    };
    if (SHARED_GAME_INIT[key]) {
      await SHARED_GAME_INIT[key](gameId, round, [TEST_PLAYER, GHOST_PARTICIPANT]);
    }
    setSelectedKey(key);
    setSession({ round: { round }, challenge, mode: "solo", players: [TEST_PLAYER, GHOST_PARTICIPANT] });
    setStarting(false);
  };

  // Multiplayer counterpart to startTest above — only ever called for
  // keys that have a SHARED_GAME_INIT entry (the control that triggers
  // this isn't rendered otherwise). Builds N synthetic players instead
  // of the fixed Test Player + Ghost pair and passes ALL of them as
  // real, real-acting participants.
  const startMultiplayerTest = async (key) => {
    setStarting(true);
    const entry = GAME_REGISTRY[key];
    const count = Math.max(multiplayerMinFor(key), Math.min(MULTIPLAYER_MAX, multiCounts[key] || multiplayerDefaultFor(key)));
    const synthPlayers = Array.from({ length: count }, (_, i) => makeSynthPlayer(i + 1));
    const round = -Date.now();
    const durationSec = entry.defaultDurationSec || 300;
    const challenge = {
      gameType: key, active: true, round,
      startedAt: Date.now(), endsAt: Date.now() + durationSec * 1000,
      participantIds: synthPlayers.map((p) => p.id),
    };
    await SHARED_GAME_INIT[key](gameId, round, synthPlayers);
    setSelectedKey(key);
    setSession({ round: { round }, challenge, mode: "multi", players: synthPlayers });
    setStarting(false);
  };

  const endTest = () => {
    setSelectedKey(null);
    setSession(null);
  };

  if (selectedKey && session) {
    const GameComponent = GAME_COMPONENTS[selectedKey];
    const entry = GAME_REGISTRY[selectedKey];
    const isMulti = session.mode === "multi";
    return (
      <div>
        <Card style={{ marginBottom: 12, background: "rgba(255,179,71,0.08)", borderColor: "#ffb347" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
            <div>
              <Badge>{isMulti ? `🧪 Multiplayer Test (${session.players.length})` : "🧪 Test Mode"}</Badge>
              <span style={{ marginLeft: 8, fontSize: 13, color: "#f5f0ff", fontWeight: 700 }}>{entry.icon} {entry.label}</span>
            </div>
            <Btn small variant="ghost" onClick={endTest}>✕ End Test</Btn>
          </div>
          <p style={{ fontSize: 11, color: "#ffb347", margin: "6px 0 0" }}>
            Nothing here counts — no real score, no real player sees this.
            {isMulti
              ? " Every panel below is a separate simulated player acting against the SAME shared game state — act in one, watch the others update."
              : (SHARED_GAME_INIT[selectedKey] && " Timeout-driven auto-resolution (round timers, stall handling) won't fire in this preview — only the direct, player-driven interactions are testable here.")}
          </p>
        </Card>
        {isMulti ? (
          <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
            {session.players.map((p, i) => (
              <div
                key={p.id}
                style={{
                  flex: "0 0 300px", width: 300, border: "1px solid #3d1f5c", borderRadius: 12,
                  background: "#0d0618", padding: 10, maxHeight: "80vh", overflowY: "auto",
                }}
              >
                <div style={{
                  fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase",
                  color: "#ffb347", marginBottom: 8, textAlign: "center",
                }}>
                  {p.name}
                </div>
                <GameComponent
                  key={`${session.round.round}-${p.id}`}
                  gameId={gameId} round={session.round} challenge={session.challenge}
                  player={p} players={session.players}
                />
              </div>
            ))}
          </div>
        ) : (
          <GameComponent
            key={session.round.round}
            gameId={gameId} round={session.round} challenge={session.challenge}
            player={TEST_PLAYER} players={session.players}
          />
        )}
      </div>
    );
  }

  return (
    <Card>
      <h3 style={{ color: "#f5f0ff", margin: "0 0 6px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🧪 Test Lab</h3>
      <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 12px" }}>
        Preview any Battle game any time, without a live challenge running. Fully isolated — nothing you do here affects the real season.
        Games with real shared server state also offer a Multiplayer Test: simulate several players at once, side by side, all acting
        against the same shared state.
      </p>
      <div style={{ display: "grid", gap: 6 }}>
        {gameOptions.map(([key, entry]) => {
          const sharable = !!SHARED_GAME_INIT[key];
          const count = multiCounts[key] || multiplayerDefaultFor(key);
          return (
            <div
              key={key}
              style={{
                background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "10px 12px",
                opacity: starting ? 0.6 : 1,
              }}
            >
              <button
                onClick={() => startTest(key)} disabled={starting}
                style={{
                  display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", textAlign: "left",
                  background: "none", border: "none", padding: 0, color: "#f5f0ff", cursor: starting ? "default" : "pointer",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600 }}>{entry.icon} {entry.label}</span>
                <span style={{ fontSize: 10, color: "#6b4f99" }}>{entry.category || "—"}{sharable ? " · limited preview" : ""}</span>
              </button>
              {sharable && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, paddingTop: 8, borderTop: "1px dashed #3d1f5c" }}>
                  <span style={{ fontSize: 10, color: "#a68fd6" }}>Multiplayer Test:</span>
                  <button
                    onClick={() => setMultiCount(key, count - 1)} disabled={starting || count <= multiplayerMinFor(key)}
                    style={{ width: 22, height: 22, borderRadius: 6, border: "1px solid #3d1f5c", background: "#150a28", color: "#f5f0ff", cursor: "pointer" }}
                  >−</button>
                  <span style={{ fontSize: 12, color: "#f5f0ff", fontWeight: 700, minWidth: 16, textAlign: "center" }}>{count}</span>
                  <button
                    onClick={() => setMultiCount(key, count + 1)} disabled={starting || count >= MULTIPLAYER_MAX}
                    style={{ width: 22, height: 22, borderRadius: 6, border: "1px solid #3d1f5c", background: "#150a28", color: "#f5f0ff", cursor: "pointer" }}
                  >+</button>
                  <span style={{ fontSize: 9, color: "#6b4f99" }}>players (min {multiplayerMinFor(key)}, max {MULTIPLAYER_MAX})</span>
                  <Btn small variant="ghost" onClick={() => startMultiplayerTest(key)} disabled={starting} style={{ marginLeft: "auto" }}>
                    Start Multiplayer Test
                  </Btn>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
