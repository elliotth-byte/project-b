import { useState } from "react";
import { Card, Btn } from "./ui";
import { GAME_COMPONENTS } from "./ChallengePlayer";
import { GAME_REGISTRY } from "../lib/challengeGames";

// ─── Practice Mode — player side ───
// The other half of components/ChallengeTestLab.jsx: that one lets a
// HOST preview any game ahead of putting it in front of players; this
// lets a PLAYER try one out for themselves before actually competing
// in it for real, reachable from the Help tab any time (not just
// before their first Battle).
//
// Deliberately scoped to score-based games only (see
// NOT_SOLO_PRACTICABLE below) — the simple, self-contained ones
// (Basketball, Stack, Simon, Pegasus's Flight, and the rest that need
// no special multi-participant setup) are genuinely practicable alone,
// since they were always one person against a clock or their own
// mistakes to begin with. Anything requiring a real second party
// (Agora's trading, Scavenger Hunt's shared temples, The Floor's
// duels, and everything else components/ChallengeTestLab.jsx's own
// SHARED_GAME_INIT has to synthesize a Ghost participant for) isn't
// offered here — a solo "practice" run against nobody wouldn't
// exercise the part that actually needs practicing.
//
// Same sandboxing the Test Lab uses and for the same reason: a
// negative round number can never collide with a real round (rounds
// only ever count up from 1) or with a previous practice session's own
// leftover state, and this genuinely uses the player's OWN id — a
// practice score is a real, harmless row in a round nothing else will
// ever read, not a fake identity the way the Test Lab's synthetic
// Test Player is (a host isn't a real contestant; a practicing player
// already is one).
// Also excludes a second category: games whose entire content is
// generated from REAL season history (challenge/exile history, real
// chat messages) rather than anything self-contained — Season Trivia,
// Timeline, and Who Said It? (see each one's own blurb/data file) all
// build their actual questions from what's already happened in this
// specific season. A sandboxed practice round has none of that history
// to draw from, so these wouldn't have anything real to quiz on even
// though they don't technically need a second participant the way the
// games above do.
const NOT_SOLO_PRACTICABLE = new Set([
  "chains", "closeto20", "masquerade", "pit", "scavengerhunt", "torched",
  "pandorasboxes", "musicalchairs", "floor", "artauction", "mysterybutton",
  "seasontrivia", "timeline", "whosaidit",
]);

const practiceOptions = Object.entries(GAME_REGISTRY).filter(
  ([key]) => key !== "manual" && !NOT_SOLO_PRACTICABLE.has(key) && GAME_COMPONENTS[key]
);

export default function PracticeMode({ gameId, player }) {
  const [selectedKey, setSelectedKey] = useState(null);
  const [session, setSession] = useState(null); // { round, challenge } once a practice run is live

  if (!gameId || !player) return null;

  const startPractice = (key) => {
    const entry = GAME_REGISTRY[key];
    const round = -Date.now(); // always negative, always unique — see this file's own header comment
    const durationSec = entry.defaultDurationSec || 300;
    const challenge = {
      gameType: key, active: true, round,
      startedAt: Date.now(), endsAt: Date.now() + durationSec * 1000,
      participantIds: [player.id],
    };
    setSelectedKey(key);
    setSession({ round: { round }, challenge });
  };

  const endPractice = () => {
    setSelectedKey(null);
    setSession(null);
  };

  if (selectedKey && session) {
    const GameComponent = GAME_COMPONENTS[selectedKey];
    return (
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5 }}>
            🎮 Practicing — {GAME_REGISTRY[selectedKey].label}
          </span>
          <Btn small variant="ghost" onClick={endPractice}>Done</Btn>
        </div>
        <p style={{ fontSize: 11, color: "#6b4f99", margin: "0 0 10px", fontStyle: "italic" }}>
          This run doesn't count toward anything — score away.
        </p>
        <GameComponent gameId={gameId} round={session.round} challenge={session.challenge} player={player} players={[player]} />
      </Card>
    );
  }

  return (
    <Card>
      <div style={{ fontSize: 12, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
        🎮 Practice a Battle
      </div>
      <p style={{ fontSize: 12, color: "#6b4f99", margin: "0 0 10px", fontStyle: "italic" }}>
        Try any of these on your own before you have to compete in one for real. Doesn't affect your score or anyone else's.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>
        {practiceOptions.map(([key, entry]) => (
          <button
            key={key}
            onClick={() => startPractice(key)}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              padding: "10px 6px", borderRadius: 10, cursor: "pointer",
              background: "#0d0618", border: "1px solid #3d1f5c", color: "#f5f0ff", fontSize: 11, fontWeight: 600,
            }}
          >
            <span style={{ fontSize: 20 }}>{entry.icon}</span>
            {entry.label}
          </button>
        ))}
      </div>
    </Card>
  );
}
