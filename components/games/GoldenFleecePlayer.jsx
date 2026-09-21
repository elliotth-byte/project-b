import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import { subscribeGoldenFleece, submitChoice, tickGoldenFleece, placementValue, HAZARDS } from "../../lib/games/goldenFleeceData";

// ─── The Golden Fleece — Big Screen (phone side) ───
// Pure controller — the shared path, the pot of gold sitting on it, and
// who else is still in the ruin only ever show on the TV (see
// components/bigscreen/GoldenFleeceTvDisplay.jsx). Your own phone only
// ever needs to tell you what YOU personally have at stake right now
// and give you the one choice that matters: press on, or walk with it.
export default function GoldenFleecePlayer({ gameId, round, player, settings }) {
  const [state, setState] = useState(null);
  const reportedRef = useRef(false);

  useEffect(() => subscribeGoldenFleece(gameId, round.round, setState), [gameId, round.round]);

  // Same belt-and-suspenders redundancy as every other shared timed
  // battle here (see e.g. lib/games/wagerTriviaTvData.js's own header
  // comment on tickWagerTrivia) — the TV drives this too, this just
  // keeps a solo phone from stalling the room if the TV isn't open.
  useEffect(() => {
    const id = setInterval(() => tickGoldenFleece(gameId, round.round, settings), 1000);
    return () => clearInterval(id);
  }, [gameId, round.round, settings]);

  useEffect(() => {
    if (!state) return;
    reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: false });
  }, [state?.goldTotals]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (state?.gameEnded && !reportedRef.current) {
      reportedRef.current = true;
      reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: true });
    }
  }, [state?.gameEnded]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Loading...</p></Card>;

  const myGold = placementValue(state, player.id);

  if (state.gameEnded) {
    return <GameResultCard icon="🐑" title="Expedition Complete!" valueLabel={`${myGold} gold banked`} />;
  }

  const iAmActive = state.activeIds.includes(player.id);
  const myChoice = state.pendingChoices?.[player.id];
  const myCarried = state.carriedGold?.[player.id] || 0;
  const seenHazards = Object.entries(state.hazardCounts || {}).filter(([, count]) => count > 0);
  const decide = (choice) => submitChoice(gameId, round.round, player.id, choice);

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🐑 The Golden Fleece</h3>
        <Badge>{myGold} banked</Badge>
      </div>

      <p style={{ color: "#6b4f99", fontSize: 12, margin: "0 0 12px" }}>
        Chamber {state.chamberNum} of {state.totalChambers} — look at the big screen for the shared path.
      </p>

      {!iAmActive ? (
        <p style={{ color: "#a68fd6", fontSize: 14, fontStyle: "italic" }}>
          You're safely out of this chamber, watching from camp — {myGold} gold banked so far.
        </p>
      ) : myChoice ? (
        <p style={{ color: "#6b4f99", fontSize: 14, fontStyle: "italic" }}>
          {myChoice === "leave" ? "Turning back..." : "Pressing on..."} waiting on everyone else.
        </p>
      ) : (
        <>
          <div style={{ background: "#0d0618", borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
            <p style={{ color: "#ffd700", fontSize: 20, fontWeight: 800, margin: 0, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
              💰 {myCarried} gold in hand
            </p>
            <p style={{ color: "#6b4f99", fontSize: 11, margin: "4px 0 0" }}>at risk until you turn back</p>
          </div>

          {seenHazards.length > 0 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              {seenHazards.map(([hazard, count]) => (
                <span key={hazard} style={{
                  fontSize: 12, padding: "4px 10px", borderRadius: 8,
                  background: count >= 2 ? "rgba(255,56,96,0.15)" : "rgba(255,179,71,0.1)",
                  border: `1px solid ${count >= 2 ? "#ff3860" : "#ffb347"}`, color: count >= 2 ? "#ff3860" : "#ffb347",
                }}>
                  {HAZARDS[hazard]?.icon} {HAZARDS[hazard]?.label} ×{count}
                </span>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button onClick={() => decide("stay")} style={{
              flex: 1, padding: "16px 12px", borderRadius: 10, border: "2px solid #ff3860", background: "rgba(255,56,96,0.1)",
              color: "#ff3860", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
            }}>
              ⚔️ Press On
            </button>
            <button onClick={() => decide("leave")} style={{
              flex: 1, padding: "16px 12px", borderRadius: 10, border: "2px solid #00ff9d", background: "rgba(0,255,157,0.1)",
              color: "#00ff9d", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
            }}>
              🏃 Turn Back
            </button>
          </div>
          {state.pathRelics > 0 && (
            <p style={{ color: "#c9a84c", fontSize: 11, margin: "10px 0 0", fontStyle: "italic" }}>
              🐑 A Fleece shard is on the path — only a SOLO retreat claims it.
            </p>
          )}
        </>
      )}
    </Card>
  );
}
