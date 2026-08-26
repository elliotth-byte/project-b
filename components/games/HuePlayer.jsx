import { useState, useRef, useEffect } from "react";
import { Card, Badge, Btn } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { usePersistedStart } from "./usePersistedStart";
import { generateTargetColor, rgbToHex, computeHueScore } from "../../lib/games/hueData";
import { reportScore } from "../../lib/challengeScores";

// Solo, client-only — see lib/games/hueData.js's own header comment for
// why this is the right pattern here (matches SpotDiffPlayer.jsx),
// unlike Deal or No Deal which genuinely needed server persistence.
export default function HuePlayer({ gameId, round, challenge, player }) {
  const { timeUp } = useCountdown(challenge?.endsAt);
  const seed = (challenge?.startedAt || 1) + (player?.id ? player.id.length : 0);
  const [target] = useState(() => generateTargetColor(seed));
  const startTime = usePersistedStart(gameId, round.round, challenge?.startedAt, player.id);
  const [mix, setMix] = useState({ r: 128, g: 128, b: 128 });
  const [done, setDone] = useState(false);
  const [finalResult, setFinalResult] = useState(null);
  const reportedRef = useRef(false);

  const submit = () => {
    if (reportedRef.current || !startTime) return;
    reportedRef.current = true;
    const elapsedMs = Date.now() - startTime;
    const totalDurationMs = challenge?.endsAt && challenge?.startedAt ? challenge.endsAt - challenge.startedAt : null;
    const result = computeHueScore(target, mix, elapsedMs, totalDurationMs);
    setFinalResult(result);
    setDone(true);
    reportScore(gameId, round.round, player.id, player.name, result.value, { final: true });
  };

  useEffect(() => {
    if (timeUp && !reportedRef.current) submit();
  }, [timeUp]); // eslint-disable-line react-hooks/exhaustive-deps

  if (done) {
    return (
      <GameResultCard
        icon="🎨"
        title={`Locked in — ${target.name}`}
        valueLabel={finalResult ? `${finalResult.closeness.toFixed(1)} / 100 close` : "Submitted"}
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
        <Badge>Trust your eyes</Badge>
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

      <Btn onClick={submit} style={{ marginTop: 8 }}>🖌 Lock in Color</Btn>
    </Card>
  );
}
