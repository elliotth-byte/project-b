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
//   1. Eleven games (see SHARED_GAME_INIT) only ever get their real
//      server state set up by the host's own Start Battle click or by
//      random-mode's auto-start (see components/ChallengeHost.jsx and
//      lib/roundEngine.js) — normally. Here, the Test Lab calls that
//      same init function itself, using two synthetic participants.
//      Eight of the eleven (Chains, Close to 20, Masquerade, Torched,
//      Musical Chairs, The Floor, Art Auction, Mystery Button) explicitly refuse to
//      initialize with fewer than 2 — confirmed by reading each one
//      directly, not assumed uniform — so two is exactly enough to
//      init, but only ONE of the two is actually playable; the second
//      (the Ghost) exists purely to satisfy that minimum and never
//      acts. Musical Chairs and The Floor still run a real, complete
//      round or duel this way: the Ghost never claims a chair (or
//      never answers a question), so the test player wins simply by
//      answering/acting correctly themselves — a fine way to preview
//      the actual flow, just not an actual contest against a second
//      live participant. Art Auction similarly still shows the real
//      painting canvas and a real (if lot-of-one) auction, since the
//      Ghost never submits a painting or a bid.
//      Pandora's Boxes needs 3 to init AT ALL (see
//      lib/games/pandorasBoxesData.js) — its own entry below is
//      harmless but this sandbox can't exercise it until it grows a
//      third synthetic participant.
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
};

const gameOptions = Object.entries(GAME_REGISTRY).filter(([key]) => key !== "manual");

export default function ChallengeTestLab({ gameId }) {
  const [selectedKey, setSelectedKey] = useState(null);
  const [session, setSession] = useState(null); // { round, challenge } once a test is live
  const [starting, setStarting] = useState(false);

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
    setSession({ round: { round }, challenge });
    setStarting(false);
  };

  const endTest = () => {
    setSelectedKey(null);
    setSession(null);
  };

  if (selectedKey && session) {
    const GameComponent = GAME_COMPONENTS[selectedKey];
    const entry = GAME_REGISTRY[selectedKey];
    return (
      <div>
        <Card style={{ marginBottom: 12, background: "rgba(255,179,71,0.08)", borderColor: "#ffb347" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <Badge>🧪 Test Mode</Badge>
              <span style={{ marginLeft: 8, fontSize: 13, color: "#f5f0ff", fontWeight: 700 }}>{entry.icon} {entry.label}</span>
            </div>
            <Btn small variant="ghost" onClick={endTest}>✕ End Test</Btn>
          </div>
          <p style={{ fontSize: 11, color: "#ffb347", margin: "6px 0 0" }}>
            Nothing here counts — no real score, no real player sees this.
            {SHARED_GAME_INIT[selectedKey] && " Timeout-driven auto-resolution (round timers, stall handling) won't fire in this preview — only the direct, player-driven interactions are testable here."}
          </p>
        </Card>
        <GameComponent
          key={session.round.round}
          gameId={gameId} round={session.round} challenge={session.challenge}
          player={TEST_PLAYER} players={[TEST_PLAYER, GHOST_PARTICIPANT]}
        />
      </div>
    );
  }

  return (
    <Card>
      <h3 style={{ color: "#f5f0ff", margin: "0 0 6px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🧪 Test Lab</h3>
      <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 12px" }}>
        Preview any Battle game any time, without a live challenge running. Fully isolated — nothing you do here affects the real season.
      </p>
      <div style={{ display: "grid", gap: 6 }}>
        {gameOptions.map(([key, entry]) => (
          <button
            key={key} onClick={() => startTest(key)} disabled={starting}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", textAlign: "left",
              background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "10px 12px",
              color: "#f5f0ff", cursor: starting ? "default" : "pointer", opacity: starting ? 0.6 : 1,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600 }}>{entry.icon} {entry.label}</span>
            <span style={{ fontSize: 10, color: "#6b4f99" }}>{entry.category || "—"}{SHARED_GAME_INIT[key] ? " · limited preview" : ""}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}
