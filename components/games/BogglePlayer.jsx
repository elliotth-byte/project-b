import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { reportScore } from "../../lib/challengeScores";
import { generateBoggleBoard, isAdjacent, boggleWordScore } from "../../lib/games/boggleData";
import { isValidBoggleWord } from "../../lib/games/boggleWords";

const BOGGLE_DURATION_MS = 3 * 60 * 1000; // flat 3 minutes, independent of the host's round length — same pattern as Match 3/Whack-a-Mole

export default function BogglePlayer({ gameId, round, challenge, player }) {
  const seed = (challenge?.startedAt || 1) + (player?.id ? player.id.split("-")[0].length : 0);
  const [board] = useState(() => generateBoggleBoard(seed || 1));
  const [startedAt, setStartedAt] = useState(null);
  const { remainingSec, timeUp } = useCountdown(startedAt ? startedAt + BOGGLE_DURATION_MS : null);
  const [path, setPath] = useState([]); // indices selected in order for the current word
  const [found, setFound] = useState([]); // [{ word, score }]
  const [foundWordSet, setFoundWordSet] = useState(new Set());
  const [message, setMessage] = useState(null);
  const [done, setDone] = useState(false);
  const reportedRef = useRef(false);
  const score = found.reduce((s, f) => s + f.score, 0);

  useEffect(() => {
    // A one-shot local start (not persisted server-side — unlike Match 3,
    // Boggle has no "resume where you left off" need worth the extra
    // round-trip; if the tab reloads mid-game, a fresh 3 minutes is an
    // acceptable tradeoff for a much simpler component).
    setStartedAt(Date.now());
  }, []);

  const currentWord = path.map((i) => board[i]).join("");

  const tapCell = (i) => {
    if (done || path.includes(i)) return;
    if (path.length === 0) { setPath([i]); return; }
    const last = path[path.length - 1];
    if (!isAdjacent(last, i)) return;
    setPath([...path, i]);
  };

  const clearPath = () => setPath([]);

  const submitWord = () => {
    const word = currentWord;
    setPath([]);
    if (word.length < 3) { flashMessage("Too short — 3 letters minimum.", false); return; }
    if (foundWordSet.has(word)) { flashMessage(`Already found "${word}".`, false); return; }
    if (!isValidBoggleWord(word)) { flashMessage(`"${word}" isn't in the word list.`, false); return; }
    const gained = boggleWordScore(word);
    setFound((f) => [...f, { word, score: gained }]);
    setFoundWordSet((s) => new Set(s).add(word));
    flashMessage(`"${word}" — +${gained}!`, true);
  };

  const flashMessage = (text, good) => {
    setMessage({ text, good });
    window.setTimeout(() => setMessage(null), 1400);
  };

  useEffect(() => {
    if (!startedAt) return;
    reportScore(gameId, round.round, player.id, player.name, score, { final: false });
  }, [score, startedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (timeUp && !reportedRef.current) {
      reportedRef.current = true;
      setDone(true);
      reportScore(gameId, round.round, player.id, player.name, score, { final: true });
    }
  }, [timeUp]); // eslint-disable-line react-hooks/exhaustive-deps

  if (done) {
    return <GameResultCard icon="🔠" title="Time's Up" valueLabel={`${score} pts — ${found.length} word${found.length === 1 ? "" : "s"}`} />;
  }
  if (!startedAt) {
    return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p></Card>;
  }

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🔠 Boggle</h3>
        <Badge color={remainingSec != null && remainingSec <= 15 ? "#ff3860" : "#ff2d95"}>{remainingSec != null ? `${remainingSec}s` : ""} · {score} pts</Badge>
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 8px", fontStyle: "italic" }}>Trace adjacent letters (including diagonals) to spell words. 3 letters minimum, no reusing a tile.</p>

      <div style={{ minHeight: 20, marginBottom: 6 }}>
        {message ? (
          <span style={{ fontSize: 13, fontWeight: 700, color: message.good ? "#00ff9d" : "#ff3860" }}>{message.text}</span>
        ) : (
          <span style={{ fontSize: 16, fontWeight: 900, color: "#f5f0ff", letterSpacing: 2, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>{currentWord || "\u00A0"}</span>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 56px)", gridTemplateRows: "repeat(4, 56px)", gap: 5, margin: "0 auto 10px", width: "fit-content" }}>
        {board.map((letter, i) => {
          const selectedIdx = path.indexOf(i);
          const selected = selectedIdx !== -1;
          return (
            <button
              key={i}
              onClick={() => tapCell(i)}
              style={{
                width: 56, height: 56, borderRadius: 8, fontSize: letter.length > 1 ? 18 : 22, fontWeight: 900,
                cursor: "pointer", fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
                background: selected ? "rgba(255,45,149,0.25)" : "#0d0618",
                border: `2px solid ${selected ? "#ff2d95" : "#3d1f5c"}`,
                color: selected ? "#ff2d95" : "#f5f0ff",
                position: "relative",
              }}
            >
              {letter}
              {selected && <span style={{ position: "absolute", top: 2, right: 4, fontSize: 9, color: "#a68fd6" }}>{selectedIdx + 1}</span>}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 12 }}>
        <button onClick={clearPath} disabled={path.length === 0} style={{
          padding: "8px 16px", borderRadius: 8, background: "#0d0618", border: "1px solid #3d1f5c",
          color: "#a68fd6", fontSize: 13, cursor: path.length ? "pointer" : "default", opacity: path.length ? 1 : 0.4,
        }}>Clear</button>
        <button onClick={submitWord} disabled={path.length < 3} style={{
          padding: "8px 20px", borderRadius: 8, cursor: path.length >= 3 ? "pointer" : "default",
          background: path.length >= 3 ? "linear-gradient(135deg, #ff2d95, #b829ff)" : "#3d1f5c",
          color: path.length >= 3 ? "#05010f" : "#6b4f99", border: "none", fontSize: 13, fontWeight: 700,
        }}>Submit Word</button>
      </div>

      {found.length > 0 && (
        <div style={{ textAlign: "left", maxHeight: 100, overflowY: "auto", background: "#0d0618", borderRadius: 8, padding: "8px 12px" }}>
          {[...found].reverse().map((f, i) => (
            <div key={i} style={{ fontSize: 12, color: "#a68fd6", display: "flex", justifyContent: "space-between" }}>
              <span>{f.word}</span><span style={{ color: "#00ff9d" }}>+{f.score}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
