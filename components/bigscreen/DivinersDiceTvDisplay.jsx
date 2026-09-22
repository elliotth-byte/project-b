import { useState, useEffect } from "react";
import {
  subscribeDivinersDice, tickDivinersDice, placementValue, marksCount, rowScore,
  ROW_COLORS, ROW_SEQUENCE,
} from "../../lib/games/divinersDiceData";

// ─── Big Screen: The Diviner's Dice ───
// See lib/games/divinersDiceData.js for the full mechanic and the
// verified real-Qwixx rules it's reskinned from. The dice (2 white +
// up to 4 living colored ones) sit front and center — that's the one
// piece of shared, changing-every-roll state everybody needs to read
// at a glance from across the room. Every player's own scoresheet is
// laid out below it as a compact grid that has to scale from a
// 3-player game to a 12+-player one just as gracefully (see the
// `auto-fill`/`minmax` grid below) — no player count cap here, unlike
// the physical board game (which is capped mainly because it only
// ships one shared set of dice and pad of paper scoresheets; this
// version broadcasts the same shared roll to everyone's own phone at
// once, so that constraint simply doesn't apply digitally).
export default function DivinersDiceTvDisplay({ gameId, round, players, settings }) {
  const [state, setState] = useState(null);
  useEffect(() => subscribeDivinersDice(gameId, round.round, setState), [gameId, round.round]);

  useEffect(() => {
    const id = setInterval(() => tickDivinersDice(gameId, round.round, settings), 1200);
    return () => clearInterval(id);
  }, [gameId, round.round, settings]);

  if (!state) return <div style={{ textAlign: "center", color: "#6b4f99", padding: 60 }}>Loading...</div>;

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));
  const nameOf = (id) => byId[id] || "?";

  if (state.gameEnded) {
    const ranked = [...state.participantIds].sort((a, b) => placementValue(state, b) - placementValue(state, a));
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3, marginBottom: 12 }}>
          🔮 The Diviner's Dice — The Omens Are Sealed
        </div>
        <p style={{ fontSize: 15, color: "#a68fd6", margin: "0 0 24px" }}>
          {state.endReason === "penalties" ? "A diviner's attention wandered one too many times." : "Two omen-tracks have closed forever."}
        </p>
        <div style={{ display: "grid", gap: 10, maxWidth: 520, margin: "0 auto" }}>
          {ranked.map((id, i) => (
            <div key={id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", borderRadius: 10,
              background: i === 0 ? "rgba(255,215,0,0.12)" : "#0d0618", border: `1px solid ${i === 0 ? "#ffd700" : "#3d1f5c"}`,
            }}>
              <span style={{ fontSize: 16, color: i === 0 ? "#ffd700" : "#f5f0ff", fontWeight: i === 0 ? 800 : 500 }}>
                {i === 0 ? "👑 " : `#${i + 1} `}{nameOf(id)}
              </span>
              <span style={{ fontSize: 16, color: "#00ff9d", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>{placementValue(state, id)} pts</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const whiteSum = state.dice?.white ? state.dice.white[0] + state.dice.white[1] : null;

  return (
    <div style={{ padding: "24px 32px" }}>
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <div style={{ fontSize: 13, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3, marginBottom: 6 }}>🔮 The Diviner's Dice</div>
        <p style={{ color: "#f5f0ff", fontSize: 16, margin: 0 }}>
          {state.phase === "awaiting-roll" ? <>Waiting on <b style={{ color: "#ffd700" }}>{nameOf(state.activePlayerId)}</b> to cast the dice...</>
            : <>It's <b style={{ color: "#ffd700" }}>{nameOf(state.activePlayerId)}</b>'s roll — everyone may mark the white sum.</>}
        </p>
      </div>

      <DiceRow dice={state.dice} lockedColors={state.lockedColors} whiteSum={whiteSum} />

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12, marginTop: 26,
      }}>
        {state.turnOrder.map((id) => (
          <PlayerSheet
            key={id}
            name={nameOf(id)}
            sheet={state.sheets[id]}
            lockedColors={state.lockedColors}
            isActive={id === state.activePlayerId}
            hasResponded={state.pendingWhite[id] !== undefined}
            score={placementValue(state, id)}
          />
        ))}
      </div>

      <ActionLog log={state.log} nameOf={nameOf} />
    </div>
  );
}

function DiceRow({ dice, lockedColors, whiteSum }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
      {[0, 1].map((i) => (
        <Die key={`w${i}`} value={dice?.white?.[i]} bg="#f5f0ff" fg="#0d0618" border="#a68fd6" label="White" />
      ))}
      {whiteSum != null && (
        <div style={{ fontSize: 22, color: "#ffd700", fontWeight: 800, margin: "0 6px", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>= {whiteSum}</div>
      )}
      <div style={{ width: 1, alignSelf: "stretch", background: "#3d1f5c", margin: "0 4px" }} />
      {ROW_COLORS.map(({ id, hex, icon, label }) => {
        const locked = lockedColors.includes(id);
        return (
          <Die
            key={id}
            value={locked ? null : dice?.[id]}
            bg={locked ? "#241436" : hex}
            fg={locked ? "#6b4f99" : "#0d0618"}
            border={locked ? "#3d1f5c" : hex}
            label={label}
            icon={icon}
            locked={locked}
          />
        );
      })}
    </div>
  );
}

function Die({ value, bg, fg, border, label, icon, locked }) {
  return (
    <div style={{ textAlign: "center", opacity: locked ? 0.45 : 1 }}>
      <div style={{
        width: 58, height: 58, borderRadius: 12, background: bg, color: fg, border: `3px solid ${border}`,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 800,
        fontFamily: "'Orbitron', 'Segoe UI', sans-serif", boxShadow: locked ? "none" : `0 0 16px ${border}55`,
        textDecoration: locked ? "line-through" : "none",
      }}>
        {locked ? "✕" : (value ?? "–")}
      </div>
      <div style={{ fontSize: 10, color: "#6b4f99", marginTop: 4, textTransform: "uppercase", letterSpacing: 1 }}>
        {icon ? `${icon} ` : ""}{label}{locked ? " (out)" : ""}
      </div>
    </div>
  );
}

function PlayerSheet({ name, sheet, lockedColors, isActive, hasResponded, score }) {
  return (
    <div style={{
      background: "#0d0618", borderRadius: 10, padding: "10px 12px",
      border: `2px solid ${isActive ? "#ffd700" : "#3d1f5c"}`,
      boxShadow: isActive ? "0 0 14px rgba(255,215,0,0.3)" : "none",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: isActive ? "#ffd700" : "#f5f0ff" }}>
          {isActive ? "🎲 " : ""}{name}
        </span>
        <span style={{ fontSize: 12, color: "#00ff9d", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>{score}</span>
      </div>
      <div style={{ display: "grid", gap: 3 }}>
        {ROW_COLORS.map(({ id, hex }) => {
          const seq = ROW_SEQUENCE[id];
          const marks = sheet[id].marks;
          const locked = lockedColors.includes(id) && marksCount(sheet, id) > 0 && marks[marks.length - 1];
          return (
            <div key={id} style={{ display: "flex", gap: 2, alignItems: "center" }}>
              {seq.map((n, i) => (
                <div key={n} style={{
                  width: 13, height: 13, borderRadius: 3, fontSize: 7, lineHeight: "13px", textAlign: "center",
                  background: marks[i] ? hex : "rgba(255,255,255,0.06)",
                  color: marks[i] ? "#0d0618" : "#6b4f99",
                  border: `1px solid ${marks[i] ? hex : "#241436"}`,
                  fontWeight: 700,
                }}>
                  {marks[i] ? "" : n}
                </div>
              ))}
              <span style={{ fontSize: 9, color: lockedColors.includes(id) ? "#ff3860" : "#6b4f99", marginLeft: 2 }}>
                {locked ? "🔒" : `${rowScore(sheet, id)}p`}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 5, fontSize: 10, color: "#ff3860" }}>
        {"✗".repeat(sheet.penalties)}{sheet.penalties === 0 ? <span style={{ color: "#3d1f5c" }}>no penalties</span> : ""}
      </div>
      {isActive && (
        <div style={{ fontSize: 9, color: hasResponded ? "#00ff9d" : "#a68fd6", marginTop: 3, fontStyle: "italic" }}>
          {hasResponded ? "marked / passed" : "deciding..."}
        </div>
      )}
    </div>
  );
}

function logLine(entry, nameOf) {
  const n = nameOf(entry.playerId);
  switch (entry.kind) {
    case "roll": return `🎲 ${n} rolled — white sum ${entry.whiteSum}.`;
    case "auto-roll": return `⏱️ ${n} took too long — rolled automatically (white sum ${entry.whiteSum}).`;
    case "white-mark": return `✅ ${n} marked ${entry.number} on the shared roll.`;
    case "white-pass": return `${n} passed on the shared mark.`;
    case "colored-mark": return `⭐ ${n} used their bonus to mark ${entry.number}.`;
    case "colored-pass": return `${n} passed on their bonus mark.`;
    case "lock": { const c = ROW_COLORS.find((r) => r.id === entry.color); return `🔒 ${n} closed the ${c?.label || entry.color} track!`; }
    case "penalty": return `❌ ${n} marked nothing this turn — penalty taken.`;
    case "auto-pass": return `⏱️ ${n} ran out of time to respond — passed automatically.`;
    case "auto-pass-colored": return `⏱️ ${n} ran out of time on their bonus — passed automatically.`;
    default: return null;
  }
}

function ActionLog({ log, nameOf }) {
  const lines = (log || []).filter((e) => e.kind !== "start").slice(-8).reverse();
  return (
    <div style={{ marginTop: 22, background: "#0d0618", borderRadius: 10, padding: "10px 16px", maxWidth: 640, marginLeft: "auto", marginRight: "auto" }}>
      <div style={{ fontSize: 10, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>Omen Log</div>
      {lines.length === 0 && <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic", margin: 0 }}>The dice have yet to fall...</p>}
      {lines.map((entry, i) => {
        const text = logLine(entry, nameOf);
        if (!text) return null;
        return <p key={i} style={{ color: "#a68fd6", fontSize: 12, margin: "2px 0" }}>{text}</p>;
      })}
    </div>
  );
}
