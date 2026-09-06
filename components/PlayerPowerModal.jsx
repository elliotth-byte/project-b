import { powerByName, powerFor } from "../lib/characterPowers";

// ─── Player Power Modal ───
// What a portrait tap on PlayerMemoryWall.jsx opens — the answer to
// "wait, what does that person's power actually do again, and have
// they used their Favor of the Fates / won anything / are they up this
// round?" without anyone having to scroll back through old messages or
// ask the host directly. Pulls from exactly the same data
// PlayerMemoryWall.jsx already has on hand (winnerIds/nomineeIds for
// the glow, settings for character powers, fatesHolderId from the most
// recently REVEALED round) — nothing new is fetched here, this is
// purely a focused view of information the wall already knows.
export default function PlayerPowerModal({ player, settings, isWinner, isNominee, heldFatesLastRound, onClose }) {
  const power = powerFor(player, settings);
  const meta = power ? powerByName(power) : null;
  // Only worth calling out as "originally so-and-so's" when the power
  // has actually come apart from this player's own alias — via
  // Dionysus's swap, or random-mode assignment that just happened not
  // to land on their own alias. When they match, saying "Power of X
  // (God)" right after their own name would just be redundant noise.
  const decoupled = power && player.alias && power !== player.alias;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(5,1,15,0.75)", zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#150a28", border: "1px solid #3d1f5c", borderRadius: 14,
          padding: 20, maxWidth: 340, width: "100%", maxHeight: "80vh", overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <h3 style={{ color: "#f5f0ff", margin: 0, fontSize: 17, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
            {player.display_name}
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#a68fd6", fontSize: 20, cursor: "pointer", lineHeight: 1, padding: 0 }}>×</button>
        </div>

        <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
          <StatusRow show={isWinner} icon="🏆" color="#ffd700" label="Has won a battle this season" />
          <StatusRow show={isNominee} icon="⚠️" color="#ff3860" label="Nominated for exile this round" />
          <StatusRow show={heldFatesLastRound} icon="🎲" color="#00d9ff" label="Held the Favor of the Fates last round" />
          {!isWinner && !isNominee && !heldFatesLastRound && (
            <p style={{ color: "#6b4f99", fontSize: 12, margin: 0, fontStyle: "italic" }}>No battle wins, nominations, or Favor of the Fates yet.</p>
          )}
        </div>

        <div style={{ borderTop: "1px solid #3d1f5c", paddingTop: 14 }}>
          {settings?.characterPowersMode === "off" || settings?.characterPowersMode == null ? (
            <p style={{ color: "#6b4f99", fontSize: 12, margin: 0, fontStyle: "italic" }}>Character powers are off this season.</p>
          ) : !power ? (
            <p style={{ color: "#6b4f99", fontSize: 12, margin: 0, fontStyle: "italic" }}>No power assigned.</p>
          ) : (
            <>
              <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Power</div>
              <p style={{ color: "#f5f0ff", fontSize: 15, fontWeight: 700, margin: "0 0 6px" }}>
                {meta?.icon} {meta?.powerName || power}
                {decoupled && <span style={{ color: "#a68fd6", fontWeight: 400, fontSize: 12 }}> (originally {power}'s)</span>}
              </p>
              {meta && !meta.implemented && (
                <p style={{ color: "#ff9f4d", fontSize: 11, margin: "0 0 6px", fontStyle: "italic" }}>Not yet active this season.</p>
              )}
              <p style={{ color: "#a68fd6", fontSize: 13, margin: 0, lineHeight: 1.5 }}>{meta?.description}</p>
              {meta?.phase && (
                <p style={{ color: "#6b4f99", fontSize: 11, margin: "8px 0 0", fontStyle: "italic" }}>{meta.phase}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusRow({ show, icon, color, label }) {
  if (!show) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#0d0618", border: `1px solid ${color}55`, borderRadius: 8, padding: "8px 12px" }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ color: "#f5f0ff", fontSize: 13, fontWeight: 600 }}>{label}</span>
    </div>
  );
}
