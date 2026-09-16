import { myIncompletePresets } from "../lib/presetReadiness";

const PRESET_LABELS = {
  torched: "Set your Torched hiding spot (Options tab)",
  floor: "Set your Floor specialty (Options tab)",
};

// ─── Preset Checklist ───
// Same floating-card pattern as OnboardingChecklist.jsx (see that
// file's own comment) — deliberately doesn't start showing until
// Round 2, not Round 1: these are challenge-selection prerequisites,
// not a new-player walkthrough, and a player sitting through Round 1
// with a "go set this up" card already competing for attention
// against the actual onboarding checklist would be exactly the
// mid-Round-1 pileup this is trying to avoid. See
// lib/presetReadiness.js for the full reasoning on why Torched and
// The Floor specifically can't be selected — by random pick, by
// Hephaestus's draw, or by the host's own manual picker — until every
// alive, approved player has done this; this card is the player-facing
// nudge that pairs with that gate.
//
// Positioned lower (top: 78%) than OnboardingChecklist's own 50% so
// the two can both be visible at once without overlapping, for the
// (real, possible) case of a player who's behind on both by Round 2.
export default function PresetChecklist({ player, round, onOpenOptions }) {
  if (!round || round.round < 2) return null;
  const incomplete = myIncompletePresets(player);
  if (incomplete.length === 0) return null;

  return (
    <div style={{
      position: "fixed", top: "78%", right: 8, transform: "translateY(-50%)", zIndex: 140,
      background: "#150a28", border: "1px solid #ff2d95", borderRadius: 12, padding: 14,
      width: 200, boxShadow: "0 2px 16px rgba(0,0,0,0.5)",
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#ff2d95", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
        Setup needed
      </div>
      <div style={{ display: "grid", gap: 8, marginBottom: 6 }}>
        {incomplete.map((gameType) => (
          <div
            key={gameType}
            onClick={onOpenOptions}
            style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 11.5, color: "#e0d4ff", cursor: "pointer" }}
          >
            <span>⬜</span>
            <span>{PRESET_LABELS[gameType] || gameType}</span>
          </div>
        ))}
      </div>
      <p style={{ color: "#6b4f99", fontSize: 10, margin: 0, fontStyle: "italic" }}>
        These challenges won't be offered until everyone's set theirs.
      </p>
    </div>
  );
}
