import { useState, useRef, useEffect } from "react";
import { Card, Badge, Btn } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { usePersistedStart } from "./usePersistedStart";
import { generateTargetColors, rgbToHex, computeHueRoundScore } from "../../lib/games/hueData";
import { reportScore } from "../../lib/challengeScores";

// Solo, client-only — see lib/games/hueData.js's own header comment for
// why this is the right pattern here (matches SpotDiffPlayer.jsx),
// unlike Deal or No Deal which genuinely needed server persistence.
//
// Three targets in sequence now, not one — see
// lib/games/hueData.js's own comment on generateTargetColors for why: a
// single color could be matched and locked in within seconds, ending
// the whole shared challenge for everyone almost as soon as it began.
// `index` tracks which of the three is current; each "Lock in Color"
// press records that color's own mix and either advances to the next
// target or, on the last one, submits the whole round at once.
export default function HuePlayer({ gameId, round, challenge, player }) {
  const { timeUp } = useCountdown(challenge?.endsAt);
  const seed = (challenge?.startedAt || 1) + (player?.id ? player.id.length : 0);
  const [targets] = useState(() => generateTargetColors(seed));
  const startTime = usePersistedStart(gameId, round.round, challenge?.startedAt, player.id);
  const [index, setIndex] = useState(0);
  const [mixes, setMixes] = useState(() => targets.map(() => null));
  const [mix, setMix] = useState({ r: 128, g: 128, b: 128 });
  const [done, setDone] = useState(false);
  const [finalResult, setFinalResult] = useState(null);
  const reportedRef = useRef(false);

  const target = targets[index];

  const submitRound = (allMixes) => {
    if (reportedRef.current || !startTime) return;
    reportedRef.current = true;
    const elapsedMs = Math.max(0, Date.now() - startTime); // clamped -- a device clock drifting mid-session must never send this negative (see RedLightGreenLightPlayer.jsx for the full story on why this matters: it INFLATES a score instead of just corrupting it the usual way)
    const totalDurationMs = challenge?.endsAt && challenge?.startedAt ? challenge.endsAt - challenge.startedAt : null;
    // A player who runs out of time mid-sequence (timeUp below) may
    // still have null entries for colors they never got to — those
    // score as a total miss (mix defaulting to the neutral gray this
    // component starts every color on) rather than being excluded, so
    // rushing ahead and leaving colors unattempted is never better than
    // a genuine (if imperfect) guess at each one.
    const safeMixes = allMixes.map((m) => m || { r: 128, g: 128, b: 128 });
    const result = computeHueRoundScore(targets, safeMixes, elapsedMs, totalDurationMs);
    setFinalResult(result);
    setDone(true);
    reportScore(gameId, round.round, player.id, player.name, result.value, { final: true });
  };

  const lockIn = () => {
    const updated = [...mixes];
    updated[index] = mix;
    setMixes(updated);
    if (index < targets.length - 1) {
      setIndex(index + 1);
      setMix({ r: 128, g: 128, b: 128 });
    } else {
      submitRound(updated);
    }
  };

  useEffect(() => {
    if (timeUp && !reportedRef.current) submitRound(mixes);
  }, [timeUp]); // eslint-disable-line react-hooks/exhaustive-deps

  if (done) {
    return (
      <GameResultCard
        icon="🎨"
        title="Locked in"
        valueLabel={finalResult ? `${finalResult.closeness.toFixed(1)} / 100 close (avg. of ${targets.length})` : "Submitted"}
      />
    );
  }

  if (!startTime) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p>
      </Card>
    );
  }

  const sliders = [
    { key: "r", label: "Red", color: "#ff3860" },
    { key: "g", label: "Green", color: "#00ff9d" },
    { key: "b", label: "Blue", color: "#4d96ff" },
  ];

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🎨 Hue</h3>
        <Badge>Color {index + 1} of {targets.length}</Badge>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <div style={{ flex: 1, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ height: 90, background: rgbToHex(target.r, target.g, target.b) }} />
          <div style={{ background: "#0d0618", padding: "6px 4px" }}>
            <p style={{ fontSize: 10, color: "#6b4f99", margin: 0, textTransform: "uppercase" }}>Target</p>
            <p style={{ fontSize: 12, color: "#f5f0ff", margin: 0, fontWeight: 700 }}>{target.name}</p>
          </div>
        </div>
        <div style={{ flex: 1, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ height: 90, background: rgbToHex(mix.r, mix.g, mix.b) }} />
          <div style={{ background: "#0d0618", padding: "6px 4px" }}>
            <p style={{ fontSize: 10, color: "#6b4f99", margin: 0, textTransform: "uppercase" }}>Your Mix</p>
            <p style={{ fontSize: 12, color: "#f5f0ff", margin: 0, fontWeight: 700 }}>{rgbToHex(mix.r, mix.g, mix.b)}</p>
          </div>
        </div>
      </div>

      {sliders.map(({ key, label, color }) => (
        <div key={key} style={{ marginBottom: 12, textAlign: "left" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
            <span style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase" }}>{label}</span>
            <span style={{ fontSize: 13, color, fontWeight: 700 }}>{mix[key]}</span>
          </div>
          <input
            type="range" min={0} max={255} value={mix[key]}
            onChange={(e) => setMix((m) => ({ ...m, [key]: Number(e.target.value) }))}
            style={{ width: "100%", accentColor: color }}
          />
        </div>
      ))}

      <Btn onClick={lockIn} style={{ marginTop: 8 }}>
        {index < targets.length - 1 ? "🖌 Lock in & Next Color" : "🖌 Lock in Final Color"}
      </Btn>
    </Card>
  );
}
