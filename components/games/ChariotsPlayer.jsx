import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import {
  subscribeChariots, tickChariots, submitPull, searchBush, stealSeat,
  getOutsideIds, placementOrder, placementValue, STOP_DURATION_MS,
} from "../../lib/games/chariotsData";

const REVEAL_LEAD_MS = 10000; // must match components/bigscreen/ChariotsTvDisplay.jsx

// ─── Chariots of Conspire (phone side) ───
// A rider has nothing to click at all — the whole tension is passive:
// stay seated and hope no one finds a rein before the Battle ends. An
// outside player either pulls (during "traveling") or searches bushes
// (during "stopped"); finding a rein flips straight into a one-time
// chariot picker (see stealSeat) rather than sitting in an inventory,
// so the choice has to be made right there or it's wasted when the
// stop ends. See lib/games/chariotsData.js for the full mechanic and
// components/bigscreen/ChariotsTvDisplay.jsx for why the 1st/2nd/3rd
// reveal has to be driven off round.phaseEndsAt on both screens
// instead of anything that fires after challenge.active goes false.
export default function ChariotsPlayer({ gameId, round, challenge, player }) {
  const [state, setState] = useState(null);
  const [now, setNow] = useState(Date.now());
  const reportedRef = useRef(false);

  useEffect(() => subscribeChariots(gameId, round.round, setState), [gameId, round.round]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);

  // Same belt-and-suspenders poll as the TV display itself.
  useEffect(() => {
    const id = setInterval(() => tickChariots(gameId, round.round), 500);
    return () => clearInterval(id);
  }, [gameId, round.round]);

  useEffect(() => {
    if (!state) return;
    reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: false });
  }, [state?.seats]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!challenge?.active && state && !reportedRef.current) {
      reportedRef.current = true;
      reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: true });
    }
  }, [challenge?.active, state]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!challenge?.active) {
    let label = "Not aboard";
    if (state) {
      const chariotIndex = (state.seats || []).indexOf(player.id);
      if (chariotIndex !== -1) {
        const order = placementOrder(state);
        const rank = order.indexOf(chariotIndex);
        label = rank === 0 ? "🥇 1st Place!" : rank === 1 ? "🥈 2nd Place" : "🥉 3rd Place";
      }
    }
    return <GameResultCard icon="🐎" title="Chariots of Conspire" valueLabel={label} />;
  }
  if (!state) return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Loading...</p></Card>;

  const revealStart = round?.phaseEndsAt ? round.phaseEndsAt - REVEAL_LEAD_MS : null;
  const revealing = revealStart != null && now >= revealStart;
  const myChariotIndex = state.seats.indexOf(player.id);
  const riding = myChariotIndex !== -1;
  const pendingSteal = !!state.pendingSteals[player.id];
  const outsideIds = getOutsideIds(state);
  const activePullers = outsideIds.filter((id) => state.pullClicks[id] && now - state.pullClicks[id] <= 1800).length;

  if (revealing) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <h3 style={{ color: "#c9a84c", margin: "0 0 8px", fontSize: 15 }}>🐎 Chariots of Conspire</h3>
        <p style={{ color: "#f5f0ff", fontSize: 15 }}>The procession is making its final stop — look at the big screen for the reveal!</p>
      </Card>
    );
  }

  const doPull = () => submitPull(gameId, round.round, player.id);
  const doSearch = (i) => searchBush(gameId, round.round, player.id, i);
  const doSteal = (chariotIndex) => stealSeat(gameId, round.round, player.id, chariotIndex);

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🐎 Chariots of Conspire</h3>
        <Badge color={riding ? "#00ff9d" : "#6b4f99"}>{riding ? `Riding — Chariot ${myChariotIndex + 1}` : "Outside"}</Badge>
      </div>

      {riding && state.phase === "traveling" && (
        <p style={{ color: "#a68fd6", fontSize: 14 }}>You're aboard and safe for now. Everyone outside is pulling toward the next stop.</p>
      )}
      {riding && state.phase === "stopped" && (
        <p style={{ color: "#ff3860", fontSize: 14, fontWeight: 700 }}>🛑 Stopped! Someone outside could find a rein and steal your seat — hold on.</p>
      )}

      {!riding && pendingSteal && (
        <>
          <p style={{ color: "#c9a84c", fontSize: 15, fontWeight: 700, margin: "0 0 10px" }}>✨ You found a magic rein! Pick a chariot to steal:</p>
          <div style={{ display: "grid", gap: 8 }}>
            {state.seats.map((riderId, i) => (
              <button key={i} onClick={() => doSteal(i)} style={{
                padding: "12px 16px", borderRadius: 10, border: "2px solid #c9a84c", background: "rgba(201,168,76,0.1)",
                color: "#c9a84c", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
              }}>
                Chariot {i + 1}
              </button>
            ))}
          </div>
        </>
      )}

      {!riding && !pendingSteal && state.phase === "traveling" && (
        <>
          <p style={{ color: "#a68fd6", fontSize: 13, margin: "0 0 12px" }}>
            Pull to speed the chariots toward their next stop — {activePullers}/{outsideIds.length} pulling right now.
          </p>
          <button onClick={doPull} style={{
            width: "100%", padding: "20px 24px", borderRadius: 12, border: "2px solid #00d9ff", background: "rgba(0,217,255,0.1)",
            color: "#00d9ff", fontSize: 18, fontWeight: 800, cursor: "pointer", fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
          }}>
            💪 PULL
          </button>
        </>
      )}

      {!riding && !pendingSteal && state.phase === "stopped" && (
        <>
          <p style={{ color: "#a68fd6", fontSize: 13, margin: "0 0 12px" }}>
            Search the bushes — 2 hide a magic rein. {Math.max(0, Math.ceil((STOP_DURATION_MS - (now - state.phaseStartedAt)) / 1000))}s left.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {(state.bushes || []).map((bush, i) => (
              <button
                key={i}
                disabled={!!bush.searchedBy}
                onClick={() => doSearch(i)}
                style={{
                  padding: "18px 0", borderRadius: 10, fontSize: 28, cursor: bush.searchedBy ? "default" : "pointer",
                  background: bush.searchedBy ? (bush.hasRein ? "rgba(201,168,76,0.14)" : "#150a28") : "rgba(0,255,157,0.08)",
                  border: `2px solid ${bush.searchedBy ? (bush.hasRein ? "#c9a84c" : "#3d1f5c") : "#00ff9d"}`,
                }}
              >
                {bush.searchedBy ? (bush.hasRein ? "✨" : "🌿") : "🌳"}
              </button>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
