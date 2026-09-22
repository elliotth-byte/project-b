import { useState, useEffect, useRef } from "react";
import { Btn, Card, CardFace, PausedBanner } from "./traitorsUi";
import { storageUpdate, subscribeGameState } from "../lib/gameStorage";
import {
  freshDeck, bjValue, pokerRank, POKER_NAMES,
  ROULETTE_WHEEL_ORDER, ROULETTE_REDS, STORAGE_KEY_CASINO,
} from "../lib/casinoData";
import { TRAITORS_GAME_REGISTRY } from "../lib/traitorsMiniGames";
import TraitorsRulesGate from "./games/TraitorsRulesGate";

// ─── Casino: Player View ───
// Game logic (Blackjack/Hold'em/Roulette) is unchanged from the original —
// only the storage layer and the "don't reload right after my own write"
// guard changed. The original needed that guard because it was polling
// every 5s and would otherwise flicker/overwrite local game state with a
// stale read; realtime pushes are always current, so this version drops
// the guard and just trusts each incoming update.
export default function CasinoPlayer({ gameId, playerName }) {
  const [st, setSt] = useState(null);
  const [bet, setBet] = useState(10);
  const [game, setGame] = useState("blackjack");
  const [bj, setBj] = useState(null); // {deck, player, dealer, done}
  const [result, setResult] = useState(null);
  const [rouletteBet, setRouletteBet] = useState({ type: "red", number: 0 });
  const [wheelRotation, setWheelRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [landedNumber, setLandedNumber] = useState(null);
  const [hand, setHand] = useState(null); // Hold'em hand — must be declared here, not after the early returns below
  const spinTimeoutRef = useRef(null);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_CASINO, setSt);
    return unsubscribe;
  }, [gameId]);

  useEffect(() => () => { if (spinTimeoutRef.current) window.clearTimeout(spinTimeoutRef.current); }, []);

  if (!st || !st.active) return null;
  if (st.paused) return <PausedBanner icon="🎰" title="Casino" />;

  const isParticipant = !st.participants || st.participants.includes(playerName);
  if (st.participants && !isParticipant) {
    return (
      <Card style={{ marginBottom: 20, borderColor: "rgba(201,168,76,0.3)", textAlign: "center" }}>
        <h3 style={{ color: "#c9a84c", margin: "0 0 6px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🎰 Casino</h3>
        <p style={{ color: "#a09080", fontSize: 13, margin: 0, fontStyle: "italic" }}>The casino's open, but you're spectating this round.</p>
      </Card>
    );
  }

  const balance = st.balances?.[playerName] ?? 0;

  const applyDelta = async (gameName, betAmt, delta) => {
    const res = await storageUpdate(gameId, STORAGE_KEY_CASINO, (fresh) => {
      if (!fresh) return null;
      fresh.balances[playerName] = (fresh.balances[playerName] || 0) + delta;
      fresh.logs = [...(fresh.logs || []), { player: playerName, game: gameName, bet: betAmt, delta, result: delta >= 0 ? "win" : "loss", time: Date.now() }];
      return fresh;
    });
    if (res.ok) setSt(res.value);
  };

  const validBet = bet > 0 && bet <= balance;

  // Blackjack
  const dealBJ = () => {
    if (!validBet) return;
    const d = freshDeck();
    setBj({ deck: d, player: [d.pop(), d.pop()], dealer: [d.pop(), d.pop()], done: false });
    setResult(null);
  };
  const hit = () => {
    const d = [...bj.deck];
    const p = [...bj.player, d.pop()];
    const nb = { ...bj, deck: d, player: p };
    if (bjValue(p) > 21) finishBJ(nb, true); else setBj(nb);
  };
  const stand = () => finishBJ(bj, false);
  const finishBJ = (state, busted) => {
    let dealer = [...state.dealer];
    const d = [...state.deck];
    if (!busted) while (bjValue(dealer) < 17) dealer.push(d.pop());
    const pv = bjValue(state.player), dv = bjValue(dealer);
    let delta, msg;
    const isBJ = state.player.length === 2 && pv === 21;
    if (busted || pv > 21) { delta = -bet; msg = "Bust! You lose."; }
    else if (dv > 21 || pv > dv) { delta = isBJ ? Math.floor(bet * 1.5) : bet; msg = isBJ ? "Blackjack! 🎉" : "You win!"; }
    else if (pv < dv) { delta = -bet; msg = "Dealer wins."; }
    else { delta = 0; msg = "Push."; }
    setBj({ ...state, dealer, done: true });
    setResult({ msg, delta });
    applyDelta("Blackjack", bet, delta);
  };

  // Hold'em — was a single "Deal Hand" click that resolved everything
  // instantly with zero decisions. Now a real 4-street hand: preflop, flop,
  // turn, river, each requiring you to Check, Bet (raise the pot), or Fold
  // before the next card(s) are revealed. The bot opponent always calls —
  // your decisions (how much to commit, when to walk away) are what
  // actually matters here, same as the real strategic tension of the game.
  const STREET_REVEAL = { preflop: 0, flop: 3, turn: 4, river: 5 };
  const NEXT_STREET = { preflop: "flop", flop: "turn", turn: "river", river: "showdown" };

  const dealHoldem = () => {
    if (!validBet) return;
    const d = freshDeck();
    const playerHole = [d.pop(), d.pop()];
    const oppHole = [d.pop(), d.pop()];
    const board = [d.pop(), d.pop(), d.pop(), d.pop(), d.pop()];
    setHand({ playerHole, oppHole, board, revealed: 0, pot: bet, street: "preflop", done: false });
    setResult(null);
  };

  const resolveShowdown = (h) => {
    const pr = pokerRank([...h.playerHole, ...h.board]);
    const or_ = pokerRank([...h.oppHole, ...h.board]);
    const delta = pr > or_ ? h.pot : pr < or_ ? -h.pot : 0;
    const msg = pr > or_ ? `You win with ${POKER_NAMES[Math.floor(pr / 1000000)]}!` : pr < or_ ? `Opponent's ${POKER_NAMES[Math.floor(or_ / 1000000)]} beats you.` : "Split pot.";
    setHand({ ...h, done: true, revealed: 5, street: "showdown" });
    setResult({ msg, delta, player: h.playerHole, opp: h.oppHole, board: h.board });
    applyDelta("Hold'em", h.pot, delta);
  };

  const checkHand = () => {
    if (!hand || hand.done) return;
    const ns = NEXT_STREET[hand.street];
    if (ns === "showdown") resolveShowdown(hand);
    else setHand({ ...hand, street: ns, revealed: STREET_REVEAL[ns] });
  };

  const betMoreHoldem = () => {
    if (!hand || hand.done || hand.pot + bet > balance) return;
    const ns = NEXT_STREET[hand.street];
    const bumped = { ...hand, pot: hand.pot + bet };
    if (ns === "showdown") resolveShowdown(bumped);
    else setHand({ ...bumped, street: ns, revealed: STREET_REVEAL[ns] });
  };

  const foldHoldem = () => {
    if (!hand || hand.done) return;
    const delta = -hand.pot;
    setHand({ ...hand, done: true, revealed: 5 });
    setResult({ msg: `You folded — lost ${hand.pot}.`, delta, player: hand.playerHole, opp: hand.oppHole, board: hand.board });
    applyDelta("Hold'em", hand.pot, delta);
  };

  // Roulette
  const spin = () => {
    if (!validBet || spinning) return;
    const n = Math.floor(Math.random() * 37);
    const slotAngle = 360 / ROULETTE_WHEEL_ORDER.length;
    const slotIndex = ROULETTE_WHEEL_ORDER.indexOf(n);
    const targetAngle = 360 * 6 - (slotIndex * slotAngle) - slotAngle / 2;
    setSpinning(true);
    setResult(null);
    setLandedNumber(null);
    setWheelRotation((prev) => prev - (prev % 360) + targetAngle);
    if (spinTimeoutRef.current) window.clearTimeout(spinTimeoutRef.current);
    spinTimeoutRef.current = window.setTimeout(() => {
      let win = false, mult = 1;
      if (rouletteBet.type === "red") win = ROULETTE_REDS.includes(n);
      else if (rouletteBet.type === "black") win = n !== 0 && !ROULETTE_REDS.includes(n);
      else if (rouletteBet.type === "odd") win = n !== 0 && n % 2 === 1;
      else if (rouletteBet.type === "even") win = n !== 0 && n % 2 === 0;
      else if (rouletteBet.type === "number") { win = n === Number(rouletteBet.number); mult = 35; }
      const delta = win ? bet * mult : -bet;
      setLandedNumber(n);
      setSpinning(false);
      setResult({ msg: `Spin: ${n} ${n === 0 ? "" : ROULETTE_REDS.includes(n) ? "🔴" : "⚫"} — ${win ? "You win!" : "You lose."}`, delta });
      applyDelta("Roulette", bet, delta);
    }, 3200);
  };

  const registryEntry = TRAITORS_GAME_REGISTRY[STORAGE_KEY_CASINO];

  return (
    <TraitorsRulesGate icon={registryEntry.icon} label={registryEntry.label} blurb={registryEntry.blurb} resetKey={st.createdAt}>
    <Card style={{ marginBottom: 20, borderColor: "rgba(201,168,76,0.3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#c9a84c", margin: 0, fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🎰 Casino</h3>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#c9a84c", fontFamily: "'Courier New', monospace" }}>{balance} 🪙</span>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {["blackjack", "holdem", "roulette"].map((g) => (
          <button key={g} onClick={() => { setGame(g); setResult(null); setBj(null); setHand(null); }} style={{
            flex: 1, padding: "6px 0", borderRadius: 6, fontSize: 12, cursor: "pointer",
            background: game === g ? "rgba(201,168,76,0.15)" : "#0a1020",
            border: `1px solid ${game === g ? "#c9a84c" : "#253550"}`, color: game === g ? "#c9a84c" : "#a09080",
          }}>
            {g === "blackjack" ? "🃏 Blackjack" : g === "holdem" ? "♠ Hold'Em" : "🎡 Roulette"}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: "#a09080" }}>Bet:</span>
        <input type="number" min={1} max={balance} value={bet}
          onChange={(e) => setBet(Math.max(1, Math.min(balance, Number(e.target.value) || 0)))}
          style={{ width: 70, background: "#0a1020", border: "1px solid #253550", borderRadius: 6, padding: "6px 8px", color: "#f0e6d3", fontSize: 13 }} />
        {!validBet && <span style={{ fontSize: 11, color: "#c45c3c" }}>Invalid bet</span>}
      </div>
      {balance <= 0 && <p style={{ fontSize: 12, color: "#c45c3c" }}>Out of tokens!</p>}

      {game === "blackjack" && (
        <div>
          {!bj ? <Btn onClick={dealBJ} disabled={!validBet}>Deal</Btn> : (
            <div>
              <div style={{ fontSize: 12, color: "#a09080" }}>Dealer: {bj.done ? bjValue(bj.dealer) : "?"}</div>
              <div>
                {bj.dealer.map((c, i) => (bj.done || i === 0)
                  ? <CardFace key={i} c={c} />
                  : <span key={i} style={{ display: "inline-block", background: "#253550", borderRadius: 5, padding: "3px 6px", margin: 2, minWidth: 20, textAlign: "center", color: "#0a1020" }}>?</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "#a09080", marginTop: 6 }}>You: {bjValue(bj.player)}</div>
              <div>{bj.player.map((c, i) => <CardFace key={i} c={c} />)}</div>
              {!bj.done && (
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <Btn small onClick={hit}>Hit</Btn>
                  <Btn small variant="ghost" onClick={stand}>Stand</Btn>
                </div>
              )}
              {bj.done && <Btn small onClick={dealBJ} disabled={!validBet} style={{ marginTop: 8 }}>Deal Again</Btn>}
            </div>
          )}
        </div>
      )}

      {game === "holdem" && (
        <div>
          {!hand ? (
            <Btn onClick={dealHoldem} disabled={!validBet}>Deal Hand</Btn>
          ) : (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#a09080", marginBottom: 6 }}>
                <span>Street: <strong style={{ color: "#c9a84c" }}>{hand.street}</strong></span>
                <span>Pot: <strong style={{ color: "#c9a84c" }}>{hand.pot}</strong></span>
              </div>

              <div style={{ fontSize: 12, color: "#a09080" }}>Board:</div>
              <div style={{ minHeight: 30 }}>
                {hand.board.slice(0, hand.revealed).map((c, i) => <CardFace key={i} c={c} />)}
                {hand.revealed === 0 && <span style={{ fontSize: 11, color: "#706050", fontStyle: "italic" }}>not revealed yet</span>}
              </div>

              <div style={{ fontSize: 12, color: "#a09080", marginTop: 6 }}>Your hand:</div>
              <div>{hand.playerHole.map((c, i) => <CardFace key={i} c={c} />)}</div>

              {hand.done && (
                <>
                  <div style={{ fontSize: 12, color: "#a09080", marginTop: 6 }}>Opponent:</div>
                  <div>{hand.oppHole.map((c, i) => <CardFace key={i} c={c} />)}</div>
                </>
              )}

              {!hand.done ? (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <Btn small variant="ghost" onClick={checkHand}>Check</Btn>
                  <Btn small onClick={betMoreHoldem} disabled={hand.pot + bet > balance}>Bet +{bet}</Btn>
                  <Btn small variant="danger" onClick={foldHoldem}>Fold</Btn>
                </div>
              ) : (
                <Btn small onClick={dealHoldem} disabled={!validBet} style={{ marginTop: 10 }}>Deal Again</Btn>
              )}
            </div>
          )}
        </div>
      )}

      {game === "roulette" && (
        <div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {["red", "black", "odd", "even", "number"].map((t) => (
              <button key={t} onClick={() => setRouletteBet({ ...rouletteBet, type: t })} style={{
                padding: "5px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer",
                background: rouletteBet.type === t ? "rgba(201,168,76,0.15)" : "#0a1020",
                border: `1px solid ${rouletteBet.type === t ? "#c9a84c" : "#253550"}`, color: rouletteBet.type === t ? "#c9a84c" : "#a09080",
              }}>{t}</button>
            ))}
          </div>
          {rouletteBet.type === "number" && (
            <input type="number" min={0} max={36} value={rouletteBet.number}
              onChange={(e) => setRouletteBet({ ...rouletteBet, number: e.target.value })}
              style={{ width: 60, background: "#0a1020", border: "1px solid #253550", borderRadius: 6, padding: "6px 8px", color: "#f0e6d3", marginBottom: 8 }} />
          )}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", margin: "6px 0 12px" }}>
            <div style={{ position: "relative", width: 160, height: 160 }}>
              <div style={{
                position: "absolute", left: "50%", top: -4, transform: "translateX(-50%)",
                width: 0, height: 0, borderLeft: "7px solid transparent", borderRight: "7px solid transparent",
                borderTop: "12px solid #c9a84c", zIndex: 2,
              }} />
              <div style={{
                width: 160, height: 160, borderRadius: "50%", border: "4px solid #c9a84c",
                background: `conic-gradient(${ROULETTE_WHEEL_ORDER.map((num, i) => {
                  const col = num === 0 ? "#2a7a4c" : ROULETTE_REDS.includes(num) ? "#c45c3c" : "#1a1a1a";
                  const step = 100 / ROULETTE_WHEEL_ORDER.length;
                  return `${col} ${(i * step).toFixed(3)}% ${((i + 1) * step).toFixed(3)}%`;
                }).join(", ")})`,
                transform: `rotate(${wheelRotation}deg)`,
                transition: spinning ? "transform 3.1s cubic-bezier(0.15, 0.85, 0.25, 1)" : "none",
                boxShadow: "0 0 16px rgba(201,168,76,0.25) inset",
              }} />
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                <div style={{
                  width: 46, height: 46, borderRadius: "50%", background: "#0a1020", border: "2px solid #c9a84c",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 15, fontWeight: 700,
                  color: landedNumber !== null && !spinning ? (landedNumber === 0 ? "#7a9a5c" : ROULETTE_REDS.includes(landedNumber) ? "#ff8a70" : "#f0e6d3") : "#a09080",
                  fontFamily: "'Courier New', monospace",
                }}>
                  {spinning ? "…" : landedNumber !== null ? landedNumber : "🎡"}
                </div>
              </div>
            </div>
            <Btn onClick={spin} disabled={!validBet || spinning} style={{ marginTop: 10 }}>{spinning ? "Spinning..." : "Spin 🎡"}</Btn>
          </div>
        </div>
      )}

      {result?.msg && (
        <div style={{
          marginTop: 10, padding: 8, borderRadius: 6,
          background: result.delta > 0 ? "rgba(122,154,92,0.12)" : result.delta < 0 ? "rgba(196,92,60,0.12)" : "#0a1020",
          fontSize: 13, color: result.delta > 0 ? "#7a9a5c" : result.delta < 0 ? "#c45c3c" : "#a09080",
        }}>
          {result.msg} ({result.delta >= 0 ? "+" : ""}{result.delta})
        </div>
      )}
    </Card>
    </TraitorsRulesGate>
  );
}
