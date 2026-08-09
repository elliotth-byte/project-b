import { useState } from "react";
import { Card, Btn, Badge } from "./ui";
import { buildRevealOrder } from "../lib/exileLogic";
import { markRevealAcknowledged } from "../lib/revealAck";

// ─── Round Reveal Gate ───
// Once a round's Exile Vote lands in history, EVERY player's screen locks
// into this instead of the normal tabs — no Game/Ceremony/Confessional,
// no roster, nothing that could hint at the result — until they've
// clicked all the way through the same vote-by-vote reveal the host runs
// live. That's deliberate: the whole point is nobody finds out who's
// exiled by peeking at another tab (or, for the person who WAS exiled,
// seeing the "You have been exiled" banner) before the reveal actually
// gets to that moment.
export default function RoundRevealGate({ gameId, player, players, entry }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [advancing, setAdvancing] = useState(false);

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));

  // Prefer the order computed once, server-side, at reveal time (see
  // lib/roundEngine.js) — that's what guarantees every player sees the
  // SAME sequence. Falls back to computing it fresh only for a round
  // that was finalized before this existed (it won't have revealOrder
  // stored), so old history doesn't crash.
  const voteOrder = entry.revealOrder || buildRevealOrder(entry.voteRows);
  const exiledNames = (entry.exiledIds || []).map((id) => byId[id] || "?");
  const chaosHolderName = entry.chaosHolderId ? byId[entry.chaosHolderId] : null;

  // Step 0: intro. Steps 1..N: one vote each. Then (if there's a Power of
  // Chaos holder) the nullify reveal. Then the final result. Each is its
  // own tap-to-continue beat, same pacing as the host's live reveal.
  const steps = [
    { type: "intro" },
    ...voteOrder.map((v) => ({ type: "vote", vote: v })),
    ...(chaosHolderName ? [{ type: "chaos" }] : []),
    { type: "result" },
  ];
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const isLast = stepIndex >= steps.length - 1;

  const next = async () => {
    if (!isLast) {
      setStepIndex((i) => i + 1);
      return;
    }
    setAdvancing(true);
    await markRevealAcknowledged(gameId, entry.round, player.id);
    setAdvancing(false);
  };

  return (
    <div style={{ minHeight: 320, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 2 }}>
          Round {entry.round} {entry.mode === "save" ? "— Double Elimination" : ""}
        </div>
      </div>

      <Card style={{ textAlign: "center", borderColor: "rgba(255,45,149,0.5)", minHeight: 180, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {step.type === "intro" && (
          <>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🃏</div>
            <p style={{ color: "#f5f0ff", fontSize: 16, fontWeight: 700, margin: "0 0 6px", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
              The vote has been cast.
            </p>
            <p style={{ color: "#a68fd6", fontSize: 13, margin: 0 }}>
              Nominees: {(entry.nominees || []).map((n) => n.name).join(", ")}
            </p>
          </>
        )}

        {step.type === "vote" && (
          <>
            <div style={{ fontSize: 28, marginBottom: 10 }}>🗳</div>
            <p style={{ color: "#f5f0ff", fontSize: 17, margin: "0 0 4px" }}>
              <strong>{byId[step.vote.voterId] || "?"}</strong> voted for
            </p>
            <p style={{ color: "#ff3860", fontSize: 22, fontWeight: 700, margin: "0 0 10px", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
              {byId[step.vote.targetId] || "?"}
            </p>
            {step.vote.reason && (
              <p style={{ color: "#a68fd6", fontSize: 12, fontStyle: "italic", margin: 0 }}>"{step.vote.reason}"</p>
            )}
          </>
        )}

        {step.type === "chaos" && (
          <>
            <div style={{ fontSize: 28, marginBottom: 10 }}>🃏</div>
            <p style={{ color: "#f5f0ff", fontSize: 15, margin: "0 0 6px" }}>
              <strong style={{ color: "#ff2d95" }}>{chaosHolderName}</strong> held the Power of Chaos
            </p>
            {entry.nullifiedId ? (
              <p style={{ color: "#a68fd6", fontSize: 14, margin: 0 }}>
                — and nullified <strong style={{ color: "#ff3860" }}>{byId[entry.nullifiedId] || "?"}</strong>'s votes.
              </p>
            ) : (
              <p style={{ color: "#a68fd6", fontSize: 14, margin: 0 }}>— and chose not to use it.</p>
            )}
          </>
        )}

        {step.type === "result" && (
          <>
            <div style={{ fontSize: 40, marginBottom: 10 }}>{exiledNames.length > 0 ? "💀" : "🕊"}</div>
            {exiledNames.length > 0 ? (
              <>
                <p style={{ color: "#a68fd6", fontSize: 13, margin: "0 0 6px" }}>Exiled from the game:</p>
                <p style={{ color: "#ff3860", fontSize: 24, fontWeight: 800, margin: 0, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
                  {exiledNames.join(" & ")}
                </p>
                {exiledNames.includes(byId[player.id]) && (
                  <div style={{ marginTop: 10 }}><Badge color="#ff3860">This was you</Badge></div>
                )}
              </>
            ) : (
              <p style={{ color: "#f5f0ff", fontSize: 16, fontWeight: 700, margin: 0 }}>No one was exiled this round.</p>
            )}
          </>
        )}
      </Card>

      <div style={{ marginTop: 18 }}>
        <Btn onClick={next} disabled={advancing} style={{ width: "100%" }}>
          {advancing ? "..." : isLast ? "Continue" : "Next →"}
        </Btn>
      </div>
      <div style={{ textAlign: "center", marginTop: 10, fontSize: 11, color: "#6b4f99" }}>
        {Math.min(stepIndex + 1, steps.length)} / {steps.length}
      </div>
    </div>
  );
}
