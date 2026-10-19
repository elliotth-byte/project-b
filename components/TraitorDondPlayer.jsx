import { useState, useEffect } from "react";
import { Btn, Card, Badge } from "./traitorsUi";
import { subscribeTraitorState } from "../lib/traitorStorage";
import { ROUND_OPEN_COUNTS, formatMoney } from "../lib/games/dealOrNoDealData";
import {
  TRAITOR_FACTIONS, dondFactionKey, dondProgressText,
  traitorPickCase, traitorOpenCase, traitorAcceptDeal, traitorDeclineDeal,
} from "../lib/traitorDondData";

// ─── Secret Deal or No Deal: Traitor view ───
// Renders nothing at all unless this player is a living Traitor AND the
// host has a game running for their faction. A Faithful's client never
// even queries for it (and the RLS in sql/add-traitor-deal-or-no-deal.sql
// would return nothing if it did). See lib/traitorDondData.js.
export default function TraitorDondPlayer({ gameId, player, myRole }) {
  const isTraitor = TRAITOR_FACTIONS.includes(myRole);
  const [g, setG] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!gameId || !isTraitor) { setG(null); return; }
    return subscribeTraitorState(gameId, dondFactionKey(myRole), setG);
  }, [gameId, isTraitor, myRole]);

  if (!isTraitor || !g || g.status !== "active") return null;

  const isMe = g.playerId === player.id;
  const act = async (fn) => {
    if (!isMe || busy) return;
    setBusy(true);
    const next = await fn();
    if (next) setG((prev) => ({ ...prev, ...next }));
    setBusy(false);
  };

  const gold = "#c9a84c";
  const header = (
    <>
      <div style={{ fontSize: 30, marginBottom: 4 }}>💼</div>
      <h2 style={{ color: gold, margin: "0 0 4px", fontFamily: "'Palatino Linotype', Palatino, Georgia, serif", fontSize: 19 }}>The Traitors' Deal</h2>
      <p style={{ color: "#706050", fontSize: 11, margin: "0 0 14px", fontStyle: "italic" }}>
        🤫 Only your fellow Traitors can see this. The Faithful don't know it's happening — keep it that way.
      </p>
    </>
  );
  const shell = (children) => (
    <Card style={{
      marginBottom: 20, textAlign: "center", padding: "22px 18px",
      background: "linear-gradient(160deg, #17120a 0%, #0e1830 100%)",
      border: `2px solid ${gold}`, boxShadow: "0 0 24px rgba(201,168,76,0.2)",
    }}>
      {header}
      {children}
    </Card>
  );

  const rivalLine = g.hasRival && (
    <p style={{ color: "#a09080", fontSize: 12, margin: "10px 0 0", fontStyle: "italic" }}>
      A rival from the shadows is playing their own board. Who they are stays hidden.
    </p>
  );

  // ── Finished ──
  if (g.done && g.dealtAt) {
    const o = g.outcome;
    return shell(
      <>
        <p style={{ color: "#a09080", fontSize: 13, margin: "0 0 4px" }}>
          {isMe ? "You" : g.playerName} {g.dealtAt.swapped == null ? "took the deal" : g.dealtAt.swapped ? "swapped cases" : "kept the case"} and walked away with
        </p>
        <div style={{ fontSize: 32, fontWeight: 900, color: gold, fontFamily: "'Courier New', monospace", margin: "6px 0 10px" }}>{formatMoney(g.dealtAt.amount)}</div>
        {o && o.result !== "solo" && (
          <p style={{ color: o.result === "won" ? "#7a9a5c" : o.result === "lost" ? "#c45c3c" : gold, fontSize: 14, fontWeight: 700, margin: 0 }}>
            {o.result === "won" && `Your faction beat its rival — they only managed ${formatMoney(o.rivalAmount)}.`}
            {o.result === "lost" && `Your rival walked away with ${formatMoney(o.rivalAmount)} — more than you.`}
            {o.result === "tie" && `A dead heat — your rival also walked away with ${formatMoney(o.rivalAmount)}.`}
          </p>
        )}
        {!o && g.hasRival && <p style={{ color: "#706050", fontSize: 12, margin: 0, fontStyle: "italic" }}>Waiting on the host to reveal how your rival did…</p>}
      </>
    );
  }

  // ── A faction-mate is playing: watch only ──
  if (!isMe) {
    return shell(
      <>
        <p style={{ color: "#f0e6d3", fontSize: 14, margin: "0 0 4px" }}><strong>{g.playerName}</strong> is playing for your faction.</p>
        <p style={{ color: "#a09080", fontSize: 12, margin: "0 0 10px" }}>{dondProgressText(g)}{g.offer ? ` — ${formatMoney(g.offer.amount)}` : ""}</p>
        <Board g={g} />
        {rivalLine}
      </>
    );
  }

  // ── Me: pick a case ──
  if (g.myCase == null) {
    return shell(
      <>
        <p style={{ color: "#a09080", fontSize: 13, margin: "0 0 12px" }}>You've been chosen to play for your faction. Pick your case — it stays sealed until the end.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(44px, 1fr))", gap: 6 }}>
          {g.caseValues.map((_, i) => (
            <button key={i} disabled={busy} onClick={() => act(() => traitorPickCase(gameId, myRole, i))} style={caseStyle({})}>{i + 1}</button>
          ))}
        </div>
        {rivalLine}
      </>
    );
  }

  // ── Me: opening cases / offers ──
  const quota = ROUND_OPEN_COUNTS[Math.min(g.roundIndex, ROUND_OPEN_COUNTS.length - 1)] - g.openedThisRound;
  return shell(
    <>
      <div style={{ marginBottom: 10 }}><Badge color={gold}>Your case: #{g.myCase + 1}</Badge></div>
      {g.offer ? (
        <div style={{ marginBottom: 12 }}>
          <p style={{ color: "#a09080", fontSize: 13, margin: "0 0 4px" }}>
            {g.offer.isFinal ? "Final decision — keep your case, or swap for the last one on the table?" : "The banker calls…"}
          </p>
          <div style={{ fontSize: 30, fontWeight: 900, color: gold, fontFamily: "'Courier New', monospace", margin: "6px 0 12px" }}>{formatMoney(g.offer.amount)}</div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <Btn disabled={busy} onClick={() => act(() => traitorAcceptDeal(gameId, myRole))}>{g.offer.isFinal ? "Swap" : "Deal"}</Btn>
            <Btn variant="ghost" disabled={busy} onClick={() => act(() => traitorDeclineDeal(gameId, myRole))}>{g.offer.isFinal ? "Keep Mine" : "No Deal"}</Btn>
          </div>
        </div>
      ) : (
        <p style={{ color: "#a09080", fontSize: 12, margin: "0 0 10px" }}>Open {quota} more case{quota === 1 ? "" : "s"} for the next offer.</p>
      )}
      <Board g={g} onOpen={g.offer || busy ? null : (i) => act(() => traitorOpenCase(gameId, myRole, i))} />
      {rivalLine}
    </>
  );
}

function caseStyle({ mine, open, clickable = true }) {
  return {
    aspectRatio: "1", borderRadius: 8, cursor: clickable ? "pointer" : "default",
    background: mine ? "rgba(201,168,76,0.15)" : open ? "#0a1020" : "#132038",
    border: `2px solid ${mine ? "#c9a84c" : "#253550"}`,
    color: mine ? "#c9a84c" : open ? "#706050" : "#f0e6d3",
    fontSize: open ? 9 : 14, fontWeight: 800, fontFamily: "'Courier New', monospace",
    opacity: open ? 0.6 : 1, padding: 0,
  };
}

function Board({ g, onOpen }) {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(44px, 1fr))", gap: 6, marginBottom: 10 }}>
        {g.caseValues.map((v, i) => {
          const mine = i === g.myCase;
          const open = g.openedIndices.includes(i);
          const clickable = !!onOpen && !mine && !open;
          return (
            <button key={i} disabled={!clickable} onClick={() => clickable && onOpen(i)} style={caseStyle({ mine, open, clickable })}>
              {open ? formatMoney(v) : mine ? "★" : i + 1}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 4 }}>
        {[...g.caseValues].sort((a, b) => a - b).map((v) => {
          const gone = g.openedIndices.some((i) => g.caseValues[i] === v);
          return (
            <span key={v} style={{ fontSize: 10, padding: "2px 5px", color: gone ? "#3a4a66" : "#a09080", textDecoration: gone ? "line-through" : "none" }}>{formatMoney(v)}</span>
          );
        })}
      </div>
    </>
  );
}
