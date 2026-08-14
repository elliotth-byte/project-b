import { useState, useEffect } from "react";
import { Card, Badge, Btn } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import { CASE_VALUES, ROUND_OPEN_COUNTS, seededShuffle, computeOffer, formatMoney } from "../../lib/games/dealOrNoDealData";

export default function DealOrNoDealPlayer({ gameId, round, challenge, player }) {
  const seed = (challenge?.startedAt || 1) + (player?.id ? player.id.split("-")[0].length : 0);
  // Case N's true value, fixed for the whole game — assigned once, never
  // re-shuffled, so "my case" genuinely means something.
  const [caseValues] = useState(() => seededShuffle(CASE_VALUES, seed || 1));
  const [myCase, setMyCase] = useState(null); // index into caseValues
  const [openedIndices, setOpenedIndices] = useState(new Set());
  const [roundIndex, setRoundIndex] = useState(0);
  const [openedThisRound, setOpenedThisRound] = useState(0);
  const [offer, setOffer] = useState(null);
  const [dealtAt, setDealtAt] = useState(null); // { amount } once they accept, or reveal their own case
  const [done, setDone] = useState(false);
  const [reported, setReported] = useState(false);

  const pickMyCase = (i) => setMyCase(i);

  const openCase = (i) => {
    if (myCase == null || i === myCase || openedIndices.has(i) || offer != null) return;
    const next = new Set(openedIndices);
    next.add(i);
    setOpenedIndices(next);
    const newOpenedThisRound = openedThisRound + 1;

    const stillClosed = caseValues.map((_, idx) => idx).filter((idx) => idx !== myCase && !next.has(idx));

    // Down to just the player's case and one other — no more offers,
    // this is the final go/no-go: keep your case, or take the last one.
    if (stillClosed.length === 1) {
      const finalValues = [caseValues[myCase], caseValues[stillClosed[0]]];
      setOffer({ amount: computeOffer(finalValues, ROUND_OPEN_COUNTS.length - 1), isFinal: true, otherCaseIndex: stillClosed[0] });
      setOpenedThisRound(newOpenedThisRound);
      return;
    }

    if (newOpenedThisRound >= ROUND_OPEN_COUNTS[Math.min(roundIndex, ROUND_OPEN_COUNTS.length - 1)]) {
      setOffer({ amount: computeOffer(stillClosed.map((idx) => caseValues[idx]), roundIndex), isFinal: false });
    }
    setOpenedThisRound(newOpenedThisRound);
  };

  const acceptDeal = () => {
    if (offer.isFinal) {
      // "Deal" on the final offer means taking the other case, not your
      // own — matches the show's final-two convention (the "offer" IS
      // the other case's value here, framed as a swap).
      setDealtAt({ amount: caseValues[offer.otherCaseIndex], swapped: true });
    } else {
      setDealtAt({ amount: offer.amount });
    }
    setDone(true);
  };

  const declineDeal = () => {
    if (offer.isFinal) {
      // No deal on the final offer = keep your own case, revealed now.
      setDealtAt({ amount: caseValues[myCase], swapped: false });
      setDone(true);
      return;
    }
    setRoundIndex((r) => r + 1);
    setOpenedThisRound(0);
    setOffer(null);
  };

  useEffect(() => {
    if (done && dealtAt && !reported) {
      setReported(true);
      reportScore(gameId, round.round, player.id, player.name, dealtAt.amount, { final: true });
    }
  }, [done, dealtAt, reported]); // eslint-disable-line react-hooks/exhaustive-deps

  if (done && dealtAt) {
    return (
      <GameResultCard
        icon="💼"
        title={dealtAt.swapped != null ? (dealtAt.swapped ? "Swapped!" : "Kept Your Case") : "Deal!"}
        valueLabel={formatMoney(dealtAt.amount)}
      />
    );
  }

  if (myCase == null) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <h3 style={{ color: "#ff2d95", margin: "0 0 6px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>💼 Deal or No Deal</h3>
        <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 14px" }}>Pick your case first — you'll keep it sealed until the very end (or until you deal it away).</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {caseValues.map((_, i) => (
            <button key={i} onClick={() => pickMyCase(i)} style={{
              aspectRatio: "1", borderRadius: 10, cursor: "pointer", background: "#0d0618", border: "2px solid #3d1f5c",
              color: "#f5f0ff", fontSize: 20, fontWeight: 900, fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
            }}>{i + 1}</button>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>💼 Deal or No Deal</h3>
        <Badge>Your case: #{myCase + 1}</Badge>
      </div>

      {offer ? (
        <div>
          <p style={{ color: "#a68fd6", fontSize: 13, margin: "0 0 6px" }}>
            {offer.isFinal ? "Final decision — keep your case, or swap for the last one on the table?" : "The banker calls..."}
          </p>
          <div style={{ fontSize: 32, fontWeight: 900, color: "#00ff9d", fontFamily: "'Orbitron', 'Segoe UI', sans-serif", margin: "8px 0 16px" }}>
            {formatMoney(offer.amount)}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <Btn onClick={acceptDeal}>{offer.isFinal ? "Swap" : "Deal"}</Btn>
            <Btn variant="ghost" onClick={declineDeal}>{offer.isFinal ? "Keep Mine" : "No Deal"}</Btn>
          </div>
        </div>
      ) : (
        <>
          <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 10px" }}>
            Open {ROUND_OPEN_COUNTS[Math.min(roundIndex, ROUND_OPEN_COUNTS.length - 1)] - openedThisRound} more case
            {ROUND_OPEN_COUNTS[Math.min(roundIndex, ROUND_OPEN_COUNTS.length - 1)] - openedThisRound === 1 ? "" : "s"} for the next offer.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
            {caseValues.map((v, i) => {
              const isMine = i === myCase;
              const isOpen = openedIndices.has(i);
              return (
                <button
                  key={i} onClick={() => openCase(i)} disabled={isMine || isOpen}
                  style={{
                    aspectRatio: "1", borderRadius: 10, cursor: (isMine || isOpen) ? "default" : "pointer",
                    background: isMine ? "rgba(255,45,149,0.15)" : isOpen ? "#1a0a2e" : "#0d0618",
                    border: `2px solid ${isMine ? "#ff2d95" : isOpen ? "#3d1f5c" : "#3d1f5c"}`,
                    color: isMine ? "#ff2d95" : isOpen ? "#6b4f99" : "#f5f0ff",
                    fontSize: isOpen ? 11 : 18, fontWeight: 900, fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
                    opacity: isOpen ? 0.6 : 1,
                  }}
                >
                  {isOpen ? formatMoney(v) : isMine ? "★" : i + 1}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 4 }}>
            {caseValues.map((v, i) => (
              <span key={i} style={{
                fontSize: 10, padding: "2px 6px", borderRadius: 4,
                color: openedIndices.has(i) ? "#3d1f5c" : "#a68fd6",
                textDecoration: openedIndices.has(i) ? "line-through" : "none",
              }}>{formatMoney(v)}</span>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
