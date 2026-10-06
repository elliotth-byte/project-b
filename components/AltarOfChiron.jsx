import { useState } from "react";
import { Card, Btn } from "./ui";
import { supabase } from "../lib/supabaseClient";
import { sendGroupMessage } from "../lib/chatData";
import { powerFor, powerByName } from "../lib/characterPowers";

// A stone altar bearing a bronze cauldron — lit with a flickering fire
// when a power is still there to burn, reduced to a thin curl of smoke
// once it's been sacrificed. Three flame shapes with staggered
// animation-delay/duration (same inline-<style>-inside-the-SVG approach
// as components/games/BalloonoIcons.jsx's AmphoraIcon) give the fire an
// irregular, non-synchronized flicker rather than one shape pulsing
// uniformly.
export function AltarOfChironIcon({ size = 80, lit = true }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {/* Stone base */}
      <path d="M28,94 L72,94 L65,80 L35,80 Z" fill="#5a5560" stroke="#231f28" strokeWidth="1.5" />
      <rect x="37" y="70" width="26" height="11" rx="1" fill="#6b6570" stroke="#231f28" strokeWidth="1.5" />
      <rect x="37" y="70" width="26" height="11" rx="1" fill="none" stroke="#847e8c" strokeWidth="0.8" opacity="0.5" />
      {/* Bronze cauldron */}
      <path d="M24,58 Q24,73 50,73 Q76,73 76,58 L71,45 L29,45 Z" fill="#2a2420" stroke="#140f0c" strokeWidth="1.5" />
      <ellipse cx="50" cy="45" rx="23" ry="5.5" fill="#3a3028" stroke="#140f0c" strokeWidth="1.5" />
      <ellipse cx="50" cy="45" rx="23" ry="5.5" fill="none" stroke="#5c4f3e" strokeWidth="0.8" opacity="0.6" />

      {lit ? (
        <g>
          <path className="chiron-flame chiron-flame-a" d="M50,44 C43,33 39,26 50,8 C61,26 57,33 50,44 Z" fill="#ff9d2e" />
          <path className="chiron-flame chiron-flame-b" d="M41,44 C37,35 35,28 41,15 C47,28 45,35 41,44 Z" fill="#ff5c2e" />
          <path className="chiron-flame chiron-flame-c" d="M59,44 C55,35 53,28 59,15 C65,28 63,35 59,44 Z" fill="#ffd23f" />
        </g>
      ) : (
        <path className="chiron-smoke" d="M50,44 Q45,36 50,29 Q55,22 50,13" stroke="#8a8694" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.5" />
      )}

      <style>{`
        .chiron-flame { transform-box: fill-box; transform-origin: 50% 100%; animation: chiron-flicker 1s ease-in-out infinite; }
        .chiron-flame-a { animation-delay: 0s; animation-duration: 1.05s; }
        .chiron-flame-b { animation-delay: 0.2s; animation-duration: 0.85s; }
        .chiron-flame-c { animation-delay: 0.4s; animation-duration: 1.2s; }
        @keyframes chiron-flicker {
          0%, 100% { transform: scaleY(1) scaleX(1) rotate(0deg); opacity: 0.95; }
          30% { transform: scaleY(1.18) scaleX(0.88) rotate(-3deg); opacity: 1; }
          60% { transform: scaleY(0.88) scaleX(1.08) rotate(2deg); opacity: 0.82; }
        }
        .chiron-smoke { transform-box: fill-box; transform-origin: 50% 100%; animation: chiron-smoke-drift 3.2s ease-in-out infinite; }
        @keyframes chiron-smoke-drift {
          0%, 100% { opacity: 0.35; transform: translateY(0) scaleX(1); }
          50% { opacity: 0.6; transform: translateY(-5px) scaleX(1.15); }
        }
      `}</style>
    </svg>
  );
}

// ─── Altar of Chiron: trigger ───
// See lib/characterPowers.js's own "Altar of Chiron" section for the
// permanence mechanics. Unlike every other power trigger (Poseidon,
// Ares, etc.), this is NOT phase-gated at its mount site in pages/
// play.jsx — "at any time" is the whole point of this one.
export default function AltarOfChiron({ gameId, player, settings }) {
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const state = player?.powerState || player?.power_state;
  const sacrificed = !!state?.chironSacrificed;
  const currentPower = sacrificed ? state?.chironSacrificedPower : powerFor(player, settings);
  const meta = currentPower ? powerByName(currentPower) : null;

  if (!sacrificed && !currentPower) return null;

  if (sacrificed) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center", borderColor: "#5a4f3e" }}>
        <AltarOfChironIcon size={60} lit={false} />
        <p style={{ color: "#a68fd6", fontSize: 12, margin: "6px 0 0" }}>
          You sacrificed {meta ? `your ${meta.powerName}` : "your power"} at the Altar of Chiron — gone for good.
        </p>
      </Card>
    );
  }

  const activate = async () => {
    setSaving(true);
    setError(null);
    const { error: dbError } = await supabase
      .from("players")
      .update({
        power_state: {
          ...(player.powerState || {}),
          chironSacrificed: true,
          chironSacrificedPower: currentPower,
          chironSacrificedAt: Date.now(),
        },
      })
      .eq("id", player.id);
    setSaving(false);
    if (dbError) { setError("Couldn't save: " + dbError.message); return; }
    setConfirming(false);
    // Same first-person, player-attributed announcement pattern Poseidon/
    // Ares/Aphrodite use for their own power moments.
    await sendGroupMessage(gameId, player.id, player.name, `🔥 I have sacrificed my ${meta?.powerName || "power"} at the Altar of Chiron.`, player.name);
  };

  return (
    <Card style={{ marginBottom: 20, textAlign: "center", borderColor: "#ff5c2e" }}>
      <AltarOfChironIcon size={72} lit />
      <h3 style={{ color: "#f5f0ff", margin: "6px 0 4px", fontSize: 15 }}>Altar of Chiron</h3>
      <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 10px" }}>
        Walk away from your {meta?.powerName || "power"} forever. There's no undoing this, and no reward beyond the statement it makes.
      </p>
      {error && <p style={{ fontSize: 11.5, color: "#ff3860", margin: "0 0 10px" }}>{error}</p>}
      {confirming ? (
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <Btn small variant="ghost" onClick={() => setConfirming(false)} disabled={saving}>Cancel</Btn>
          <Btn small variant="danger" onClick={activate} disabled={saving}>{saving ? "Sacrificing..." : "Confirm Sacrifice"}</Btn>
        </div>
      ) : (
        <Btn small variant="danger" onClick={() => setConfirming(true)}>🔥 Visit the Altar</Btn>
      )}
    </Card>
  );
}
