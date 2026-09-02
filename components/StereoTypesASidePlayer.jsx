import { useEffect, useState } from "react";
import { Card, Btn } from "./ui";
import {
  subscribeASideRound, submitASideRanking, submitASideGuesses,
  maybeAdvanceASideToReveal, maybeScoreASide, persistASideRoundScores,
} from "../lib/stereoTypesASide";
import StereoTypesASideResults from "./StereoTypesASideResults";

function nameFor(players, id) {
  const p = (players || []).find((pl) => pl.id === id);
  return p?.display_name || "Unknown player";
}

// Up/down reordering — see package.json: no drag library in this app's
// dependencies, and dragging a short list on a phone screen tends to be
// fiddly to get right without one. Plain move buttons per row are a
// smaller, more predictable build for exactly the same outcome (turn a
// starting order into any other order, one step at a time).
function RankingEditor({ order, players, onMove }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {order.map((pid, i) => (
        <div key={pid} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0a0e18", borderRadius: 6, padding: "6px 10px" }}>
          <span style={{ color: "#f5eddc", fontSize: 13 }}>{i + 1}. {nameFor(players, pid)}</span>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => onMove(i, -1)} disabled={i === 0} style={moveBtnStyle(i === 0)}>▲</button>
            <button onClick={() => onMove(i, 1)} disabled={i === order.length - 1} style={moveBtnStyle(i === order.length - 1)}>▼</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function moveBtnStyle(disabled) {
  return {
    background: "#1a2030", border: "1px solid #2a3040", color: disabled ? "#3a3f4c" : "#f4c430",
    borderRadius: 4, width: 28, height: 24, cursor: disabled ? "not-allowed" : "pointer", fontSize: 12,
  };
}

// ─── Stereo Types — Round 1 ("A Side"), player side ───
// Mounts below the title screen/Spotify widget in StereoTypesPlayerPanels.jsx
// — those keep running exactly as before; this is purely additive
// content stacked underneath, same "vertical stack of cards" shape
// every other Stereo Types screen already uses.
//
// `players` is expected to be the FULL raw players-table roster for
// this game (see pages/play.jsx's own `allPlayers`) — used only for
// id -> display_name/color lookups here; every actual game-logic
// decision (who's in this round, whose ranking is whose) goes through
// `round.playerIds`/`round.anonMap` instead, which are frozen at the
// moment the round started and don't drift if someone joins mid-round.
export default function StereoTypesASidePlayer({ gameId, player, players }) {
  const [round, setRound] = useState(null);
  const [order, setOrder] = useState(null);
  const [assignments, setAssignments] = useState({});
  const [pumpedLabel, setPumpedLabel] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!gameId) return;
    return subscribeASideRound(gameId, 1, setRound);
  }, [gameId]);

  // Seed the local reorder draft once, the first time a round (or this
  // player's own prior submission) shows up. Deliberately NOT re-run on
  // every later `round` change — realtime updates from OTHER players
  // finishing their own ranking shouldn't ever clobber whatever this
  // player is mid-reordering.
  useEffect(() => {
    if (!round || order) return;
    setOrder(round.rankings?.[player.id] || round.playerIds || []);
  }, [round, order, player.id]);

  // Same reasoning, for this player's own guess draft — seeded once
  // when the round first reaches "reveal" (or on a page reload mid-
  // reveal, from whatever this player already submitted).
  useEffect(() => {
    if (!round || round.status !== "reveal") return;
    if (Object.keys(assignments).length > 0) return;
    const mine = round.guesses?.[player.id];
    if (mine) {
      setAssignments(mine.assignments || {});
      setPumpedLabel(mine.pumpedLabel || null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.status]);

  // Opportunistic housekeeping. Every connected client (host AND every
  // player) runs this same effect — see lib/stereoTypesASide.js's own
  // comments on maybeAdvanceASideToReveal/maybeScoreASide for why that's
  // safe: both are no-ops unless the round is genuinely ready to move
  // on, and lib/dbAdapter.js's version-checked db.update guarantees
  // only one caller's write actually lands even if several clients
  // happen to call this in the same instant.
  useEffect(() => {
    if (!round || !gameId) return;
    if (round.status === "ranking") maybeAdvanceASideToReveal(gameId, 1);
    if (round.status === "reveal") maybeScoreASide(gameId, 1);
    // Once scored, redundantly-but-harmlessly re-attempt the ledger
    // upsert (see lib/stereoTypesASide.js's own comment on
    // persistASideRoundScores) in case the client that actually won the
    // scoring race never got a chance to write it itself (e.g. it lost
    // its connection right after winning).
    if (round.status === "scored" && round.result) persistASideRoundScores(gameId, 1, round.result.perPlayer);
  }, [gameId, round]);

  if (!round) {
    return (
      <Card style={{ borderColor: "#f4c430", textAlign: "center" }}>
        <p style={{ color: "#c9b98a", fontSize: 13, margin: 0, fontStyle: "italic" }}>
          Waiting for the host to start Round 1, A Side...
        </p>
      </Card>
    );
  }

  const totalPlayers = round.playerIds?.length || 0;
  const submittedCount = Object.keys(round.rankings || {}).length;
  const guessedCount = Object.keys(round.guesses || {}).length;
  const mySuperlative = round.superlatives?.[player.id];
  const alreadySubmittedRanking = !!round.rankings?.[player.id];
  const alreadyGuessed = !!round.guesses?.[player.id];

  const anonEntries = round.status !== "ranking" ? Object.entries(round.anonMap || {}) : [];
  // The pool of real names a guess can be assigned to is exactly whoever
  // actually has a ranking to guess (anonMap's own values) — NOT
  // round.playerIds wholesale. Those normally match exactly, but if the
  // host force-advanced past someone who never submitted a ranking (see
  // maybeAdvanceASideToReveal), that person simply isn't a guessable
  // name at all this round; there's no ranking of theirs to assign.
  const ownerIds = anonEntries.map(([, ownerId]) => ownerId);
  const usedElsewhere = (label) => new Set(Object.entries(assignments).filter(([l]) => l !== label).map(([, v]) => v));
  const validPermutation = anonEntries.length > 0
    && anonEntries.every(([label]) => !!assignments[label])
    && new Set(Object.values(assignments)).size === anonEntries.length;

  const move = (i, dir) => {
    setOrder((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const setAssignment = (label, guessedPlayerId) => setAssignments((prev) => ({ ...prev, [label]: guessedPlayerId }));

  const handleSubmitRanking = async () => {
    setBusy(true);
    await submitASideRanking(gameId, 1, player.id, order);
    setBusy(false);
  };

  const handleSubmitGuesses = async () => {
    setBusy(true);
    await submitASideGuesses(gameId, 1, player.id, assignments, pumpedLabel);
    setBusy(false);
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {round.status !== "scored" && (
        <Card style={{ borderColor: "#f4c430" }}>
          <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Round 1 — A Side</div>
          <p style={{ color: "#f5eddc", fontSize: 13, margin: 0 }}>
            {round.status === "ranking"
              ? `${submittedCount} of ${totalPlayers} players have submitted their ranking.`
              : `${guessedCount} of ${totalPlayers} players have submitted their guesses.`}
          </p>
        </Card>
      )}

      {round.status === "ranking" && order && (
        <Card>
          <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Your superlative</div>
          <p style={{ color: "#f4c430", fontWeight: 700, fontSize: 15, marginTop: 0, marginBottom: 4 }}>{mySuperlative}</p>
          <p style={{ color: "#6b6558", fontSize: 12, marginBottom: 12 }}>
            Rank every player, including yourself, from MOST to LEAST this applies. Nobody sees whose list is whose until everyone's in.
          </p>
          <RankingEditor order={order} players={players} onMove={move} />
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
            <Btn small onClick={handleSubmitRanking} disabled={busy}>
              {alreadySubmittedRanking ? "Update ranking" : "Submit ranking"}
            </Btn>
            {alreadySubmittedRanking && <span style={{ color: "#f4c430", fontSize: 11, fontWeight: 700 }}>✓ Submitted</span>}
          </div>
        </Card>
      )}

      {round.status === "reveal" && (
        <Card>
          <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            Guess whose ranking is whose
          </div>
          <p style={{ color: "#6b6558", fontSize: 12, marginTop: 0 }}>
            Every real player's name must be used exactly once — including working out your own. Flag ONE guess with "pump up the
            volume" for double points if it's right.
          </p>
          <div style={{ display: "grid", gap: 12 }}>
            {anonEntries.map(([label, ownerId]) => {
              const superlative = round.superlatives?.[ownerId];
              const rankedOrder = round.rankings?.[ownerId] || [];
              const used = usedElsewhere(label);
              return (
                <div key={label} style={{ background: "#0a0e18", borderRadius: 8, padding: 10 }}>
                  <div style={{ color: "#c9b98a", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
                  <div style={{ color: "#f4c430", fontWeight: 700, fontSize: 13, margin: "2px 0 6px" }}>{superlative}</div>
                  <ol style={{ margin: "0 0 8px", paddingLeft: 18, color: "#f5eddc", fontSize: 12 }}>
                    {rankedOrder.map((pid) => <li key={pid}>{nameFor(players, pid)}</li>)}
                  </ol>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <select
                      value={assignments[label] || ""}
                      onChange={(e) => setAssignment(label, e.target.value)}
                      style={{ background: "#0f1420", color: "#f5eddc", border: "1px solid #2a3040", borderRadius: 6, padding: "4px 8px", fontSize: 12 }}
                    >
                      <option value="">Who wrote this?</option>
                      {ownerIds.map((pid) => (
                        <option key={pid} value={pid} disabled={used.has(pid) && assignments[label] !== pid}>
                          {nameFor(players, pid)}
                        </option>
                      ))}
                    </select>
                    <label style={{ display: "flex", alignItems: "center", gap: 4, color: "#c9b98a", fontSize: 11 }}>
                      <input type="radio" name="pump" checked={pumpedLabel === label} onChange={() => setPumpedLabel(label)} />
                      ⚡ Pump up the volume
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Btn small onClick={handleSubmitGuesses} disabled={busy || !validPermutation}>
              {alreadyGuessed ? "Update guesses" : "Submit guesses"}
            </Btn>
            {alreadyGuessed && <span style={{ color: "#f4c430", fontSize: 11, fontWeight: 700 }}>✓ Submitted</span>}
            {pumpedLabel && (
              <button onClick={() => setPumpedLabel(null)} style={{ background: "transparent", border: "none", color: "#6b6558", fontSize: 11, textDecoration: "underline", cursor: "pointer" }}>
                clear pump
              </button>
            )}
          </div>
        </Card>
      )}

      {round.status === "scored" && (
        <StereoTypesASideResults round={round} players={players} myPlayerId={player.id} />
      )}
    </div>
  );
}
