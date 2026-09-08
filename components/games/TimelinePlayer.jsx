import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { reportScore } from "../../lib/challengeScores";
import { buildEventPool, pickEvents } from "../../lib/games/timelineData";

function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}
function shuffle(arr, seed) {
  const rand = seededRandom(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Timeline ───
// See lib/games/timelineData.js for the real event-pool logic and the
// "not enough history yet" gating. Tap events (in the shuffled pile)
// to build your own guessed order on the right; tap one in your order
// to send it back if you change your mind. Scored on however many
// positions end up exactly right — partial credit for a partially
// finished order if time runs out, same as any other in-progress
// score in this app.
export default function TimelinePlayer({ gameId, round, challenge, player, challengeHistory, exileHistory, players }) {
  const poolSeed = challenge?.startedAt || 1;
  const presentSeed = poolSeed + (player?.id ? player.id.length * 131 + player.id.charCodeAt(0) : 0);
  const pool = buildEventPool(challengeHistory, exileHistory, players);
  const [trueOrder] = useState(() => pickEvents(pool, poolSeed).map((e, i) => ({ ...e, id: i })));
  const [shuffledDisplay] = useState(() => shuffle(trueOrder, presentSeed));
  const { timeUp } = useCountdown(challenge?.endsAt);

  const [placedIds, setPlacedIds] = useState([]); // event ids, in the order the player placed them
  const [score, setScore] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const reportedRef = useRef(false);

  const byId = new Map(trueOrder.map((e) => [e.id, e]));
  const remaining = shuffledDisplay.filter((e) => !placedIds.includes(e.id));
  const allPlaced = placedIds.length === trueOrder.length;

  const place = (id) => setPlacedIds((p) => [...p, id]);
  const unplace = (id) => setPlacedIds((p) => p.filter((x) => x !== id));

  const computeScore = () => placedIds.reduce((sum, id, i) => sum + (id === i ? 1 : 0), 0);

  const submit = () => {
    if (submitted) return;
    setScore(computeScore());
    setSubmitted(true);
  };

  useEffect(() => {
    if ((timeUp) && !submitted) {
      setScore(computeScore());
      setSubmitted(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  useEffect(() => {
    if (submitted && score != null && !reportedRef.current) {
      reportedRef.current = true;
      reportScore(gameId, round.round, player.id, player.name, score, { final: true });
    }
  }, [submitted, score]); // eslint-disable-line react-hooks/exhaustive-deps

  if (trueOrder.length === 0) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>🕰️</div>
        <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#00ff9d" }}>Not Enough History Yet</div>
        <p style={{ color: "#6b4f99", fontSize: 12, marginTop: 10, fontStyle: "italic" }}>Timeline needs a few completed rounds of real history to build a puzzle from.</p>
      </Card>
    );
  }

  if (submitted) {
    return <GameResultCard icon="🕰️" title="Timeline Locked In" valueLabel={`${score}/${trueOrder.length} in the right spot`} />;
  }

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🕰️ Timeline</h3>
        <Badge>{placedIds.length}/{trueOrder.length} placed</Badge>
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 12px", fontStyle: "italic" }}>
        Tap events below in the order you think they actually happened.
      </p>

      {placedIds.length > 0 && (
        <div style={{ display: "grid", gap: 6, marginBottom: 14, textAlign: "left" }}>
          <p style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 2px" }}>Your Order</p>
          {placedIds.map((id, i) => (
            <button
              key={id}
              onClick={() => unplace(id)}
              style={{
                display: "flex", gap: 8, alignItems: "center", padding: "8px 12px", borderRadius: 8,
                background: "rgba(255,45,149,0.1)", border: "1px solid #ff2d95", color: "#f5f0ff",
                fontSize: 12.5, cursor: "pointer", textAlign: "left",
              }}
            >
              <span style={{ color: "#ff2d95", fontWeight: 900 }}>{i + 1}.</span> {byId.get(id)?.text} <span style={{ marginLeft: "auto", color: "#6b4f99" }}>✕</span>
            </button>
          ))}
        </div>
      )}

      {remaining.length > 0 && (
        <div style={{ display: "grid", gap: 6, textAlign: "left" }}>
          <p style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 2px" }}>Unplaced</p>
          {remaining.map((e) => (
            <button
              key={e.id}
              onClick={() => place(e.id)}
              style={{
                padding: "10px 12px", borderRadius: 8, background: "#0d0618", border: "1px solid #3d1f5c",
                color: "#f5f0ff", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left",
              }}
            >
              {e.text}
            </button>
          ))}
        </div>
      )}

      {allPlaced && (
        <button
          onClick={submit}
          style={{ marginTop: 14, padding: "12px 28px", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer", background: "linear-gradient(135deg, #ff2d95, #b829ff)", color: "#05010f", border: "none" }}
        >
          Lock In Order
        </button>
      )}
    </Card>
  );
}
