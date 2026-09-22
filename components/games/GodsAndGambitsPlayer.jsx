import { useState, useEffect, useRef } from "react";
import { Card, Badge, Btn } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import {
  subscribeGodsAndGambits, tickGodsAndGambits, submitGuess, submitBets,
  placementValue, MAX_BETS_PER_PLAYER,
} from "../../lib/games/godsAndGambitsData";

// ─── Gods and Gambits — Big Screen (phone side) ───
// Pure controller — the shared question, the sorted betting board, and
// everyone else's guesses/bankrolls only ever show on the TV (see
// components/bigscreen/GodsAndGambitsTvDisplay.jsx). Your own phone
// only ever needs: your current bankroll, a number pad while guessing,
// the betting board (with a way to size up to 2 bets) while betting,
// and a waiting state otherwise.
export default function GodsAndGambitsPlayer({ gameId, round, player, settings }) {
  const [state, setState] = useState(null);
  const [guessInput, setGuessInput] = useState("");
  const [slots, setSlots] = useState([{ space: null, amount: "" }, { space: null, amount: "" }]);
  const reportedRef = useRef(false);

  useEffect(() => subscribeGodsAndGambits(gameId, round.round, setState), [gameId, round.round]);

  // Same belt-and-suspenders redundancy as every other shared timed
  // battle here (see e.g. lib/games/goldenFleeceData.js's own header
  // comment on tickGoldenFleece) — the TV drives this too, this just
  // keeps a solo phone from stalling the room if the TV isn't open.
  useEffect(() => {
    const id = setInterval(() => tickGodsAndGambits(gameId, round.round, settings), 1000);
    return () => clearInterval(id);
  }, [gameId, round.round, settings]);

  useEffect(() => {
    if (!state) return;
    reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: false });
  }, [state?.bankrolls]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (state?.gameEnded && !reportedRef.current) {
      reportedRef.current = true;
      reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: true });
    }
  }, [state?.gameEnded]); // eslint-disable-line react-hooks/exhaustive-deps

  // A fresh round means a fresh set of local inputs.
  useEffect(() => {
    setGuessInput("");
    setSlots([{ space: null, amount: "" }, { space: null, amount: "" }]);
  }, [state?.roundNum]);

  if (!state) return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Loading...</p></Card>;

  const myBankroll = placementValue(state, player.id);

  if (state.gameEnded) {
    return <GameResultCard icon="🏺" title="The Oracle Falls Silent" valueLabel={`${Math.round(myBankroll)} drachma`} />;
  }

  const haveGuessed = state.guesses?.[player.id] !== undefined;
  const haveBet = state.pendingBets?.[player.id] !== undefined;

  const submitMyGuess = async () => {
    const n = Number(guessInput);
    if (!Number.isFinite(n)) return;
    await submitGuess(gameId, round.round, player.id, n);
  };

  const usedSpaceIds = new Set(slots.map((s) => s.space).filter(Boolean));
  const totalStaked = slots.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  const canPlaceBets = slots.some((s) => s.space && Number(s.amount) > 0) && totalStaked <= myBankroll && totalStaked > 0;

  const setSlot = (idx, patch) => {
    setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const submitMyBets = async (bets) => {
    await submitBets(gameId, round.round, player.id, bets);
  };

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#c9a84c", margin: 0, fontSize: 15, fontFamily: "'Cinzel', 'Segoe UI', serif" }}>🏺 Gods and Gambits</h3>
        <Badge>{Math.round(myBankroll)} ⛁</Badge>
      </div>

      <p style={{ color: "#6b4f99", fontSize: 12, margin: "0 0 12px" }}>
        Round {state.roundNum} of {state.totalRounds} — look at the big screen for the shared board.
      </p>

      {state.phase === "guessing" && (
        haveGuessed ? (
          <p style={{ color: "#a68fd6", fontSize: 14, fontStyle: "italic" }}>Your guess is locked in — waiting on the others...</p>
        ) : (
          <>
            <div style={{ background: "#1c1408", borderRadius: 8, padding: "12px 14px", marginBottom: 14 }}>
              <p style={{ color: "#f5f0ff", fontSize: 14, margin: 0 }}>{state.question?.prompt}</p>
            </div>
            <input
              type="number"
              inputMode="numeric"
              value={guessInput}
              onChange={(e) => setGuessInput(e.target.value)}
              placeholder="Your guess"
              style={{
                width: "100%", padding: "14px 12px", borderRadius: 10, border: "2px solid #c9a84c",
                background: "#0d0a05", color: "#f5f0ff", fontSize: 20, fontWeight: 700, textAlign: "center",
                marginBottom: 12, boxSizing: "border-box",
              }}
            />
            <Btn onClick={submitMyGuess} disabled={guessInput === ""} style={{ width: "100%" }}>
              🔮 Lock In Guess
            </Btn>
          </>
        )
      )}

      {state.phase === "betting" && (
        haveBet ? (
          <p style={{ color: "#a68fd6", fontSize: 14, fontStyle: "italic" }}>Your bets are placed — waiting on the others...</p>
        ) : (
          <>
            <p style={{ color: "#6b4f99", fontSize: 12, margin: "0 0 10px" }}>
              Place up to {MAX_BETS_PER_PLAYER} bets across any space. Total staked can't exceed your {Math.round(myBankroll)} drachma.
            </p>
            <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
              {(state.bettingSpaces || []).map((space) => {
                const label = space.value === null ? "Under Every Guess" : `${space.value}`;
                const slotIdx = slots.findIndex((s) => s.space === space.id);
                const active = slotIdx !== -1;
                return (
                  <div key={space.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                    background: active ? "rgba(201,168,76,0.15)" : "#0d0a05", border: `1px solid ${active ? "#c9a84c" : "#3d2f1c"}`,
                    borderRadius: 8, padding: "8px 12px",
                  }}>
                    <span style={{ fontSize: 13, color: "#f5f0ff", textAlign: "left" }}>
                      {space.value === null ? "🌫️ " : "🔢 "}{label} <span style={{ color: "#c9a84c" }}>({space.odds}:1)</span>
                    </span>
                    {active ? (
                      <input
                        type="number" inputMode="numeric" value={slots[slotIdx].amount}
                        onChange={(e) => setSlot(slotIdx, { amount: e.target.value })}
                        placeholder="drachma"
                        style={{ width: 78, padding: "6px 8px", borderRadius: 6, border: "1px solid #c9a84c", background: "#0d0a05", color: "#f5f0ff", textAlign: "center" }}
                      />
                    ) : (
                      <button
                        onClick={() => {
                          const emptyIdx = slots.findIndex((s) => !s.space);
                          if (emptyIdx === -1) return;
                          setSlot(emptyIdx, { space: space.id });
                        }}
                        disabled={usedSpaceIds.size >= MAX_BETS_PER_PLAYER}
                        style={{
                          padding: "6px 12px", borderRadius: 6, border: "1px solid #c9a84c", background: "transparent",
                          color: "#c9a84c", fontSize: 12, cursor: "pointer",
                        }}
                      >
                        Bet
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <p style={{ color: totalStaked > myBankroll ? "#ff3860" : "#6b4f99", fontSize: 12, marginBottom: 10 }}>
              Staked: {totalStaked} / {Math.round(myBankroll)}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn onClick={() => submitMyBets([])} style={{ flex: 1, background: "transparent", border: "1px solid #6b4f99", color: "#a68fd6" }}>
                Skip Betting
              </Btn>
              <Btn
                onClick={() => submitMyBets(slots.filter((s) => s.space && Number(s.amount) > 0).map((s) => ({ space: s.space, amount: Number(s.amount) })))}
                disabled={!canPlaceBets}
                style={{ flex: 1 }}
              >
                Place Bets
              </Btn>
            </div>
          </>
        )
      )}

      {state.phase === "revealed" && (() => {
        const r = state.reveal;
        if (!r) return null;
        const myPayout = r.payouts?.[player.id];
        const won = myPayout?.netChange || 0;
        return (
          <div>
            <p style={{ color: "#c9a84c", fontSize: 15, fontWeight: 700, margin: "0 0 6px" }}>
              The truth: {r.trueAnswer}
            </p>
            <p style={{ color: won > 0 ? "#00ff9d" : won < 0 ? "#ff3860" : "#a68fd6", fontSize: 14, margin: "0 0 6px" }}>
              {won > 0 ? `+${Math.round(won)}` : Math.round(won)} drachma this round
            </p>
            {myPayout?.bonus > 0 && (
              <p style={{ color: "#ffd700", fontSize: 12, fontStyle: "italic" }}>Your guess was closest — bonus {Math.round(myPayout.bonus)} drachma!</p>
            )}
          </div>
        );
      })()}
    </Card>
  );
}
