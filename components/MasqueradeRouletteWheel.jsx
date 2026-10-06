import { useState, useEffect, useRef } from "react";
import { Btn } from "./traitorsUi";

// ─── Masquerade Houses: Roulette of Mercy ───
// Pure presentation + animation — the actual random pick(s) already
// happened server-side (see lib/traitorsMasqueradeGate.js's
// spinMasqueradeRoulette) before this ever renders a result. This
// component only drives the CSS spin animation toward whatever
// `savedNames` it's handed, the same conic-gradient-wheel approach
// CasinoPlayer.jsx already uses for Roulette. Driving the animation off
// the `savedNames` PROP (not off onSpin's return value) means every
// viewer watching the same gameId — not just whoever clicked Spin — sees
// the wheel spin and land in sync.
//
// Host can configure more than one survivor now — rather than inventing
// a wheel that lands on several segments at once (confusing, and the
// pointer metaphor stops making sense), this plays back ONE spin per
// survivor in sequence, each time shrinking the wheel to exclude names
// already saved by an earlier spin in this same sequence. All N names
// are already decided and persisted the moment the first spin starts
// (see spinMasqueradeRoulette), so a page reload mid-sequence just
// replays the remaining reveals rather than re-rolling anything.
const SEGMENT_COLORS = ["rgba(124,58,237,0.55)", "rgba(196,92,60,0.55)"];
const SPIN_MS = 3200;
const PAUSE_BETWEEN_SPINS_MS = 900;

export default function MasqueradeRouletteWheel({ names, savedNames, onSpin, disabled }) {
  const [wheelRotation, setWheelRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [revealedNames, setRevealedNames] = useState([]);
  const lastSavedKey = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => () => { if (timeoutRef.current) window.clearTimeout(timeoutRef.current); }, []);

  const spinToIndex = (idx) => {
    const winner = savedNames[idx];
    const pool = names.filter((n) => !savedNames.slice(0, idx).includes(n));
    const poolIdx = Math.max(0, pool.indexOf(winner));
    const slotAngle = 360 / Math.max(1, pool.length);
    const targetAngle = 360 * 6 - poolIdx * slotAngle - slotAngle / 2;
    setSpinning(true);
    setWheelRotation((prev) => prev - (prev % 360) + targetAngle);
    timeoutRef.current = window.setTimeout(() => {
      setSpinning(false);
      setRevealedNames((prev) => [...prev, winner]);
      if (idx + 1 < savedNames.length) {
        timeoutRef.current = window.setTimeout(() => spinToIndex(idx + 1), PAUSE_BETWEEN_SPINS_MS);
      }
    }, SPIN_MS);
  };

  useEffect(() => {
    const key = (savedNames || []).join("|");
    if (!savedNames?.length || key === lastSavedKey.current || names.length === 0) return;
    lastSavedKey.current = key;
    setRevealedNames([]);
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    spinToIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedNames, names]);

  const pool = names.filter((n) => !revealedNames.includes(n));
  const slotAngle = 360 / Math.max(1, pool.length);
  const allRevealed = savedNames?.length > 0 && revealedNames.length >= savedNames.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", margin: "10px 0" }}>
      <div style={{ position: "relative", width: 220, height: 220 }}>
        <div style={{
          position: "absolute", left: "50%", top: -6, transform: "translateX(-50%)",
          width: 0, height: 0, borderLeft: "9px solid transparent", borderRight: "9px solid transparent",
          borderTop: "16px solid #c9a84c", zIndex: 2,
        }} />
        <div style={{
          position: "relative", width: 220, height: 220, borderRadius: "50%", border: "4px solid #c9a84c",
          background: `conic-gradient(${pool.map((_, i) => {
            const col = SEGMENT_COLORS[i % 2];
            const step = 100 / pool.length;
            return `${col} ${(i * step).toFixed(3)}% ${((i + 1) * step).toFixed(3)}%`;
          }).join(", ")})`,
          transform: `rotate(${wheelRotation}deg)`,
          transition: spinning ? `transform ${SPIN_MS / 1000}s cubic-bezier(0.15, 0.85, 0.25, 1)` : "none",
          boxShadow: "0 0 16px rgba(201,168,76,0.25) inset",
        }}>
          {pool.map((n, i) => {
            const angle = i * slotAngle + slotAngle / 2;
            return (
              <div key={n} style={{
                position: "absolute", left: "50%", top: "50%", width: 90,
                transform: `rotate(${angle}deg) translate(0, -92px) rotate(${-angle}deg) translateX(-50%)`,
                textAlign: "center", fontSize: 11, fontWeight: 700, color: "#f0e6d3", pointerEvents: "none",
              }}>
                {n}
              </div>
            );
          })}
        </div>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%", background: "#0a1020", border: "2px solid #c9a84c",
            display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center",
            fontSize: 11, fontWeight: 700, color: revealedNames.length ? "#7a9a5c" : "#a09080", padding: 4,
          }}>
            {spinning ? "…" : revealedNames[revealedNames.length - 1] || "🎡"}
          </div>
        </div>
      </div>
      {!savedNames?.length && (
        <Btn onClick={onSpin} disabled={disabled || spinning} style={{ marginTop: 14 }}>
          {spinning ? "Spinning..." : "🎡 Spin the Wheel"}
        </Btn>
      )}
      {revealedNames.length > 0 && (
        <p style={{ fontSize: 13, color: "#7a9a5c", fontWeight: 700, marginTop: 10, textAlign: "center" }}>
          🎉 {revealedNames.join(", ")} {revealedNames.length > 1 ? "are" : "is"} saved and join{revealedNames.length > 1 ? "" : "s"} the main cast!
          {!allRevealed && savedNames?.length > revealedNames.length && (
            <><br /><span style={{ fontSize: 11, color: "#a09080", fontWeight: 400 }}>Spinning for the next survivor...</span></>
          )}
        </p>
      )}
    </div>
  );
}
