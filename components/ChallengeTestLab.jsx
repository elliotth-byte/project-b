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
//   1. Six games (see SHARED_GAME_INIT) only ever get their real
//      server state set up by the host's own Start Battle click or by
//      random-mode's auto-start (see components/ChallengeHost.jsx and
//      lib/roundEngine.js) — normally. Here, the Test Lab calls that
//      same init function itself, using two synthetic participants
//      (Chains, Close to 20, Masquerade, and Torched all explicitly
//      refuse to initialize with fewer than 2 — confirmed by reading
//      each one directly, not assumed uniform). Only ONE of those two
//      is actually playable in this preview; the second exists purely
//      to satisfy that minimum and never acts.
//   2. Server-side automation that runs on a live poll cycle — Torched's
//      placement timeout, Masquerade's turn timeout, Scavenger Hunt's
//      round auto-advance, Chains' auto-lock-on-resolve — is all driven
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
const SHARED_GAME_INIT = {
  chains: (gameId, round, participants) => initChains(gameId, round, participants),
  closeto20: (gameId, round, participants) => initCloseToTwenty(gameId, round, participants, Date.now()),
  masquerade: (gameId, round, participants) => initMasquerade(gameId, round, participants, Date.now()),
  pit: (gameId, round, participants) => initPit(gameId, round, participants, Date.now()),
  scavengerhunt: (gameId, round, participants) => initScavengerHunt(gameId, round, participants, Date.now()),
  torched: (gameId, round, participants) => initTorched(gameId, round, participants, Date.now(), {}),
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
