import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { reportScore } from "../../lib/challengeScores";
import {
  subscribePit, submitOffer, withdrawOffer, themeById, maxThemeCount, placementValue,
} from "../../lib/games/pitData";

export default function PitPlayer({ gameId, round, challenge, player, players }) {
  const [pit, setPit] = useState(null);
  const [pitLoaded, setPitLoaded] = useState(false);
  const { timeUp } = useCountdown(challenge?.endsAt);
  const [selectedTheme, setSelectedTheme] = useState(null);
  const [selectedCount, setSelectedCount] = useState(1);
  const reportedRef = useRef(new Set());

  useEffect(() => {
    const unsubscribe = subscribePit(gameId, round.round, (v) => { setPit(v); setPitLoaded(true); });
    return unsubscribe;
  }, [gameId, round.round]);

  const byName = (id) => players?.find((p) => p.id === id)?.display_name || "?";

  const myHand = pit?.hands?.[player.id] || [];
  const myOffer = pit?.pool?.find((o) => o.playerId === player.id);
  const iHaveWon = pit?.finishOrder?.includes(player.id);
  const myFinishRank = pit?.finishOrder?.indexOf(player.id);

  // Report my own final score the moment either I've won, or time runs
  // out — same "everyone eventually reports, whenever their own outcome
  // is decided" pattern as the Plinko bracket.
  useEffect(() => {
    if (!pit || reportedRef.current.has(player.id)) return;
    if (iHaveWon || timeUp) {
      reportedRef.current.add(player.id);
      reportScore(gameId, round.round, player.id, player.name, placementValue(pit, player.id), { final: true });
    }
  }, [pit, iHaveWon, timeUp]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live running score too, same as every other game, so the host's
  // leaderboard reflects progress before the round actually ends.
  useEffect(() => {
    if (!pit || iHaveWon || timeUp) return;
    reportScore(gameId, round.round, player.id, player.name, placementValue(pit, player.id), { final: false });
  }, [pit?.hands?.[player.id]]); // eslint-disable-line react-hooks/exhaustive-deps

  const handCounts = {};
  myHand.forEach((c) => (handCounts[c] = (handCounts[c] || 0) + 1));

  const offer = async () => {
    if (!selectedTheme || selectedCount < 1) return;
    const cards = Array(selectedCount).fill(selectedTheme);
    await submitOffer(gameId, round.round, player.id, cards);
    setSelectedTheme(null);
    setSelectedCount(1);
  };

  const withdraw = () => withdrawOffer(gameId, round.round, player.id);

  if (!challenge?.active) return null;
  if (pit === null && !pitLoaded) {
    return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p></Card>;
  }
  if (pit === null && pitLoaded) {
    // Degenerate case — fewer than 2 participants, nothing to trade with.
    return <GameResultCard icon="🏺" title="Not Enough Traders" valueLabel="No market to corner" />;
  }

  if (iHaveWon) {
    return (
      <GameResultCard
        icon="🏺"
        title={myFinishRank === 0 ? "Cornered the Market — 1st!" : myFinishRank === 1 ? "Cornered the Market — 2nd!" : "Cornered the Market — 3rd!"}
        valueLabel={themeById(myHand[0])?.label || ""}
      />
    );
  }

  if (timeUp) {
    const best = maxThemeCount(myHand);
    return <GameResultCard icon="🏺" title="Trading's Closed" valueLabel={`Best: ${best}/9 of one set`} />;
  }

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🏺 Mount Olympus Pit</h3>
        <Badge>{pit.finishOrder.length}/3 have cornered a market</Badge>
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 10px", fontStyle: "italic" }}>
        Offer 1-4 cards of one set into the pool. The moment someone else offers the same count, you swap blind — first 3 to hold all 9 of one set win.
      </p>

      {pit.finishOrder.length > 0 && (
        <p style={{ fontSize: 11, color: "#ffd700", margin: "0 0 10px" }}>
          Already cornered: {pit.finishOrder.map((id, i) => `${i + 1}. ${byName(id)}`).join(" · ")}
        </p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 14 }}>
        {Object.entries(handCounts).map(([themeId, count]) => {
          const theme = themeById(themeId);
          const selected = selectedTheme === themeId;
          return (
            <button
              key={themeId}
              onClick={() => { setSelectedTheme(themeId); setSelectedCount(1); }}
              disabled={!!myOffer}
              style={{
                padding: "10px 6px", borderRadius: 10, cursor: myOffer ? "default" : "pointer",
                background: selected ? "rgba(255,45,149,0.2)" : "#0d0618",
                border: `2px solid ${selected ? "#ff2d95" : count >= 9 ? "#ffd700" : "#3d1f5c"}`,
                opacity: myOffer ? 0.5 : 1,
              }}
            >
              <div style={{ fontSize: 22 }}>{theme?.icon}</div>
              <div style={{ fontSize: 10, color: "#a68fd6", margin: "2px 0" }}>{theme?.label}</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: count >= 9 ? "#ffd700" : "#f5f0ff" }}>×{count}</div>
            </button>
          );
        })}
      </div>

      {myOffer ? (
        <div style={{ background: "rgba(255,45,149,0.08)", border: "1px solid rgba(255,45,149,0.3)", borderRadius: 10, padding: "10px 14px", marginBottom: 10 }}>
          <p style={{ fontSize: 13, color: "#f5f0ff", margin: "0 0 8px" }}>
            Offering <strong>{myOffer.cards.length}</strong> card{myOffer.cards.length === 1 ? "" : "s"} — waiting for a match...
          </p>
          <button onClick={withdraw} style={{
            padding: "6px 16px", borderRadius: 6, background: "#0d0618", border: "1px solid #3d1f5c",
            color: "#a68fd6", fontSize: 12, cursor: "pointer",
          }}>Withdraw</button>
        </div>
      ) : selectedTheme ? (
        <div style={{ background: "#0d0618", borderRadius: 10, padding: "10px 14px", marginBottom: 10 }}>
          <p style={{ fontSize: 12, color: "#a68fd6", margin: "0 0 8px" }}>How many {themeById(selectedTheme)?.label} to offer? (blind — you won't know what you get back)</p>
          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 10 }}>
            {[1, 2, 3, 4].filter((n) => n <= handCounts[selectedTheme]).map((n) => (
              <button key={n} onClick={() => setSelectedCount(n)} style={{
                width: 36, height: 36, borderRadius: 8, cursor: "pointer",
                background: selectedCount === n ? "rgba(255,45,149,0.25)" : "#150a28",
                border: `2px solid ${selectedCount === n ? "#ff2d95" : "#3d1f5c"}`,
                color: selectedCount === n ? "#ff2d95" : "#f5f0ff", fontWeight: 700,
              }}>{n}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button onClick={() => setSelectedTheme(null)} style={{ padding: "8px 14px", borderRadius: 6, background: "transparent", border: "1px solid #3d1f5c", color: "#a68fd6", fontSize: 12, cursor: "pointer" }}>Cancel</button>
            <button onClick={offer} style={{
              padding: "8px 20px", borderRadius: 6, cursor: "pointer", background: "linear-gradient(135deg, #ff2d95, #b829ff)",
              color: "#05010f", border: "none", fontSize: 13, fontWeight: 700,
            }}>Offer It</button>
          </div>
        </div>
      ) : null}

      {pit.pool.filter((o) => o.playerId !== player.id).length > 0 && (
        <p style={{ fontSize: 11, color: "#6b4f99", marginBottom: 8 }}>
          In the pool: {pit.pool.filter((o) => o.playerId !== player.id).map((o) => `${byName(o.playerId)} (${o.cards.length})`).join(", ")}
        </p>
      )}

      {pit.tradeLog.length > 0 && (
        <div style={{ textAlign: "left", maxHeight: 80, overflowY: "auto", background: "#0d0618", borderRadius: 8, padding: "6px 10px" }}>
          {[...pit.tradeLog].reverse().slice(0, 8).map((t, i) => (
            <div key={i} style={{ fontSize: 10, color: "#6b4f99" }}>{byName(t.aId)} ↔ {byName(t.bId)} traded {t.count}</div>
          ))}
        </div>
      )}
    </Card>
  );
}
