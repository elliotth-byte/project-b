import { useState, useEffect, useRef } from "react";
import { Btn } from "./traitorsUi";

// ─── Masquerade Houses: Roulette of Mercy ───
// Pure presentation + animation — the actual random pick already happened
// server-side (see lib/traitorsMasqueradeGate.js's spinMasqueradeRoulette)
// before this ever renders a result. This component only drives the CSS
// spin animation toward whatever `savedName` it's handed, the same
// conic-gradient-wheel approach CasinoPlayer.jsx already uses for Roulette.
// Driving the animation off the `savedName` PROP (not off onSpin's return
// value) means every viewer watching the same gameId — not just whoever
// clicked Spin — sees the wheel spin and land in sync.
const SEGMENT_COLORS = ["rgba(124,58,237,0.55)", "rgba(196,92,60,0.55)"];
const SPIN_MS = 3200;

export default function MasqueradeRouletteWheel({ names, savedName, onSpin, disabled }) {
  const [wheelRotation, setWheelRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [revealedName, setRevealedName] = useState(null);
  const lastSpunName = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => () => { if (timeoutRef.current) window.clearTimeout(timeoutRef.current); }, []);

  useEffect(() => {
    if (!savedName || savedName === lastSpunName.current || names.length === 0) return;
    lastSpunName.current = savedName;
    const idx = Math.max(0, names.indexOf(savedName));
    const slotAngle = 360 / names.length;
    const targetAngle = 360 * 6 - idx * slotAngle - slotAngle / 2;
    setSpinning(true);
    setRevealedName(null);
    setWheelRotation((prev) => prev - (prev % 360) + targetAngle);
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      setSpinning(false);
      setRevealedName(savedName);
    }, SPIN_MS);
  }, [savedName, names]);

  const slotAngle = 360 / Math.max(1, names.length);

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
          background: `conic-gradient(${names.map((_, i) => {
            const col = SEGMENT_COLORS[i % 2];
            const step = 100 / names.length;
            return `${col} ${(i * step).toFixed(3)}% ${((i + 1) * step).toFixed(3)}%`;
          }).join(", ")})`,
          transform: `rotate(${wheelRotation}deg)`,
          transition: spinning ? `transform ${SPIN_MS / 1000}s cubic-bezier(0.15, 0.85, 0.25, 1)` : "none",
          boxShadow: "0 0 16px rgba(201,168,76,0.25) inset",
        }}>
          {names.map((n, i) => {
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
            fontSize: 11, fontWeight: 700, color: revealedName ? "#7a9a5c" : "#a09080", padding: 4,
          }}>
            {spinning ? "…" : revealedName || "🎡"}
          </div>
        </div>
      </div>
      {!savedName && (
        <Btn onClick={onSpin} disabled={disabled || spinning} style={{ marginTop: 14 }}>
          {spinning ? "Spinning..." : "🎡 Spin the Wheel"}
        </Btn>
      )}
      {revealedName && (
        <p style={{ fontSize: 13, color: "#7a9a5c", fontWeight: 700, marginTop: 10 }}>
          🎉 {revealedName} is saved and joins the main cast!
        </p>
      )}
    </div>
  );
}
