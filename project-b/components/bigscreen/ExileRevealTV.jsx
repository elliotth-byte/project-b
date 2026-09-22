import { useState, useEffect } from "react";
import { buildRevealOrder, tallySoFar } from "../../lib/exileLogic";
import { subscribeBigScreenRevealStep, setBigScreenRevealStep } from "../../lib/bigScreenReveal";

// ─── Big Screen: Exile Vote Reveal ───
// TV-sized counterpart to components/RoundRevealGate.jsx — same
// steps/tally logic and the exact same voteOrder (preferring
// entry.revealOrder, computed once server-side, for the identical
// reason RoundRevealGate's own comment gives: every viewer needs to
// see the same sequence). The real difference is WHO drives it and
// HOW: RoundRevealGate is per-player, stepped independently by
// whoever's tapping their own phone; this reads and advances one
// shared step counter (see lib/bigScreenReveal.js) so everyone
// watching the same TV is always looking at the same beat at the same
// time. No per-player acknowledgment, no "This was you" badge — this
// isn't any one player's screen.
export default function ExileRevealTV({ gameId, players, entry }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [advancing, setAdvancing] = useState(false);

  useEffect(() => subscribeBigScreenRevealStep(gameId, entry.round, setStepIndex), [gameId, entry.round]);

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));

  const voteOrder = entry.revealOrder || buildRevealOrder(entry.voteRows);
  const exiledNames = (entry.exiledIds || []).map((id) => byId[id] || "?");
  const chaosHolderName = entry.chaosHolderId ? byId[entry.chaosHolderId] : null;

  const steps = [
    { type: "intro" },
    ...voteOrder.map((v) => ({ type: "vote", vote: v })),
    ...(chaosHolderName ? [{ type: "chaos" }] : []),
    { type: "result" },
  ];
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const isLast = stepIndex >= steps.length - 1;

  const next = async () => {
    if (isLast || advancing) return;
    setAdvancing(true);
    await setBigScreenRevealStep(gameId, entry.round, stepIndex + 1);
    setAdvancing(false);
  };

  return (
    <div style={{ minHeight: "70vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", padding: 40 }}>
      <div style={{ fontSize: 22, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 4, marginBottom: 24 }}>
        Round {entry.round} {entry.mode === "save" ? "— Double Elimination" : ""}
      </div>

      {step.type === "intro" && (
        <>
          <div style={{ fontSize: 96, marginBottom: 20 }}>🃏</div>
          <p style={{ color: "#f5f0ff", fontSize: 48, fontWeight: 700, margin: "0 0 16px", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
            The vote has been cast.
          </p>
          <p style={{ color: "#a68fd6", fontSize: 28, margin: 0 }}>
            Nominees: {(entry.nominees || []).map((n) => n.name).join(", ")}
          </p>
        </>
      )}

      {step.type === "vote" && (
        <>
          <div style={{ fontSize: 64, marginBottom: 20 }}>🗳</div>
          <p style={{ color: "#f5f0ff", fontSize: 34, margin: "0 0 8px" }}>
            <strong>{byId[step.vote.voterId] || "?"}</strong> voted for
          </p>
          <p style={{ color: "#ff3860", fontSize: 64, fontWeight: 700, margin: "0 0 24px", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
            {byId[step.vote.targetId] || "?"}
          </p>
          {step.vote.reason && (
            <p style={{ color: "#a68fd6", fontSize: 22, fontStyle: "italic", margin: "0 0 28px" }}>"{step.vote.reason}"</p>
          )}
          <div style={{ borderTop: "1px solid #3d1f5c", paddingTop: 20, marginTop: 10, width: "100%", maxWidth: 800 }}>
            <div style={{ fontSize: 16, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>Overall Vote Tally</div>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 14 }}>
              {(() => {
                const nomineeIds = (entry.nominees || []).map((n) => n.playerId);
                const tally = tallySoFar(voteOrder.slice(0, stepIndex), nomineeIds);
                return nomineeIds.map((id) => (
                  <div key={id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#0d0618", borderRadius: 10, padding: "10px 20px" }}>
                    <span style={{ fontSize: 22, color: "#f5f0ff", fontWeight: 700 }}>{byId[id] || "?"}</span>
                    <span style={{ fontSize: 26, color: "#ff3860", fontWeight: 800, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>{tally[id]}</span>
                  </div>
                ));
              })()}
            </div>
          </div>
        </>
      )}

      {step.type === "chaos" && (
        <>
          <div style={{ fontSize: 64, marginBottom: 20 }}>🃏</div>
          <p style={{ color: "#f5f0ff", fontSize: 30, margin: "0 0 12px" }}>
            <strong style={{ color: "#ff2d95" }}>{chaosHolderName}</strong> held the Favor of the Fates
          </p>
          {entry.nullifiedId ? (
            <p style={{ color: "#a68fd6", fontSize: 26, margin: 0 }}>
              — and nullified <strong style={{ color: "#ff3860" }}>{byId[entry.nullifiedId] || "?"}</strong>'s votes.
            </p>
          ) : (
            <p style={{ color: "#a68fd6", fontSize: 26, margin: 0 }}>— and chose not to use it.</p>
          )}
        </>
      )}

      {step.type === "result" && (
        <>
          <div style={{ fontSize: 120, marginBottom: 20 }}>{exiledNames.length > 0 ? "💀" : "🕊"}</div>
          {exiledNames.length > 0 ? (
            <>
              <p style={{ color: "#a68fd6", fontSize: 26, margin: "0 0 12px" }}>Exiled from the game:</p>
              <p style={{ color: "#ff3860", fontSize: 72, fontWeight: 800, margin: 0, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
                {exiledNames.join(" & ")}
              </p>
            </>
          ) : (
            <p style={{ color: "#f5f0ff", fontSize: 48, fontWeight: 700, margin: 0 }}>No one was exiled this round.</p>
          )}
        </>
      )}

      {!isLast && (
        <button
          onClick={next} disabled={advancing}
          style={{
            marginTop: 48, background: "linear-gradient(135deg, #ff2d95, #b829ff)", border: "none", borderRadius: 14,
            color: "#05010f", fontSize: 24, fontWeight: 700, padding: "18px 48px", cursor: "pointer",
            fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
          }}
        >
          {advancing ? "..." : "Next →"}
        </button>
      )}
      <div style={{ marginTop: 20, fontSize: 16, color: "#6b4f99" }}>
        {Math.min(stepIndex + 1, steps.length)} / {steps.length}
      </div>
    </div>
  );
}
