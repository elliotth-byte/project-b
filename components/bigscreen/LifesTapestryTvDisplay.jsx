import { useMemo, useState, useEffect } from "react";
import { subscribeScores } from "../../lib/challengeScores";
import { subscribeGameState } from "../../lib/gameStorage";
import { KEY_CHALLENGE } from "../../lib/gameState";
import { TAPESTRY_W, TAPESTRY_H, TAPESTRY_VARIANTS, pickVariantIndex } from "../../lib/games/lifesTapestryData";
import { useCountdown } from "../games/useCountdown";

// ─── Big Screen: Life's a Tapestry ───
// The regular version (components/games/LifesTapestryPlayer.jsx) shows
// its own little reference thumbnail right on the phone. This variant
// is mechanically identical in every other way — same grid, same shift
// arrows, same scramble, same scoring — it just drops that thumbnail
// from the phone entirely and puts a big one here instead, the only
// place it ever shows. There's no real shared game state to subscribe
// to (the puzzle itself is fully self-contained per phone, seeded off
// the challenge's own shared startedAt — see LifesTapestryPlayer.jsx),
// so this only needs two things: the SAME variant every phone
// independently resolves from that same seed, and the standard
// pb:challenge-scores feed (see lib/challenges/scores.js) for a live
// "who's actually solved it" roster.
export default function LifesTapestryTvDisplay({ gameId, round, players }) {
  // display.jsx doesn't pass the live challenge object down to TV
  // components (see its own BattleComponent render) — every other TV
  // display gets what it needs from its own game-specific shared state
  // instead, but this game has none (see this file's own header
  // comment), so this subscribes to the challenge directly, the same
  // key components/ChallengePlayer.jsx itself reads.
  const [challenge, setChallenge] = useState(null);
  useEffect(() => subscribeGameState(gameId, KEY_CHALLENGE, setChallenge), [gameId]);

  const [scores, setScores] = useState({});
  useEffect(() => subscribeScores(gameId, round.round, setScores), [gameId, round.round]);

  const { remainingSec } = useCountdown(challenge?.endsAt);
  const variant = useMemo(() => TAPESTRY_VARIANTS[pickVariantIndex(challenge?.startedAt || 1)], [challenge?.startedAt]);

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));
  const participantIds = challenge?.participantIds || [];
  const solved = participantIds.filter((id) => scores[id]?.locked && scores[id]?.value >= 100000000000 / 2).length; // FINISH_BASE tier — see LifesTapestryPlayer.jsx's own comment; a locked score anywhere near that tier only ever comes from an actual solve, never a ran-out-the-clock partial count
  const roster = [...participantIds].sort((a, b) => (scores[b]?.value || 0) - (scores[a]?.value || 0));

  return (
    <div style={{ padding: 40, display: "grid", gridTemplateColumns: "1fr 320px", gap: 36, minHeight: "70vh", alignItems: "start" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3, marginBottom: 8 }}>
          🧵 Life's a Tapestry
        </div>
        <p style={{ color: "#a68fd6", fontSize: 14, margin: "0 0 20px" }}>
          Rebuild this on your phone — shift whole rows and columns until it matches.
        </p>
        <div
          style={{
            width: Math.min(560, TAPESTRY_W * 1.1), height: Math.min(560, TAPESTRY_W * 1.1) * (TAPESTRY_H / TAPESTRY_W),
            margin: "0 auto", borderRadius: 12, border: "3px solid #ffb347", boxShadow: "0 0 40px rgba(255,179,71,0.25)",
            backgroundImage: `url("${variant.dataUri}")`, backgroundSize: "cover", backgroundPosition: "center",
          }}
        />
        {remainingSec != null && (
          <div style={{ marginTop: 20, fontSize: 20, color: remainingSec <= 30 ? "#ff3860" : "#f5f0ff", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
            ⏱ {Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, "0")}
          </div>
        )}
      </div>

      <div>
        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>
          {solved} of {participantIds.length} solved
        </div>
        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {roster.length === 0 && <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Waiting for everyone to tap Go...</p>}
          {roster.map((id) => {
            const s = scores[id];
            const finished = s?.locked && s.value >= 100000000000 / 2;
            return (
              <div key={id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0d0618",
                borderRadius: 8, padding: "10px 14px", border: `1px solid ${finished ? "#00ff9d" : "#3d1f5c"}`,
              }}>
                <span style={{ fontSize: 14, color: "#f5f0ff" }}>{byId[id] || "?"}</span>
                <span style={{ fontSize: 13, color: finished ? "#00ff9d" : "#6b4f99" }}>{finished ? "✅ Done" : "🧵 Weaving..."}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
