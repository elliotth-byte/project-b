import { useEffect, useState } from "react";
import { Card, Btn } from "./ui";
import {
  subscribeRemixRound, submitRemixPick, submitRemixGuesses,
  maybeAdvanceRemixToReveal, maybeScoreRemix, persistRemixRoundScores,
} from "../lib/stereoTypesRemix";
import { startOnBlast } from "../lib/stereoTypesOnBlast";
import StereoTypesRemixResults from "./StereoTypesRemixResults";
import StereoTypesWaitingList from "./StereoTypesWaitingList";
import { notifyPlayersRoundChange } from "../lib/pushNotifications";

function nameFor(players, id) {
  const p = (players || []).find((pl) => pl.id === id);
  return p?.display_name || "Unknown player";
}

// ─── Stereo Types — Round 2 ("The Remix"), player side ───
// Mounts below the title screen in StereoTypesPlayerPanels.jsx, same
// slot StereoTypesASidePlayer.jsx used for Round 1 — that title screen
// (and Boombox/Spotify widget above it) keep running unchanged.
//
// This round's task is the REVERSE of Round 1's — see
// lib/stereoTypesRemix.js's header comment. This player is handed
// round.rankings[player.id] READ-ONLY; there's no reordering UI at all
// here (no drag/move-buttons editor) because there's nothing to
// reorder — just a single radio pick among round.superlativePool, the
// SAME list every other player sees this round too.
//
// ─── Judgment call: the guessing-phase JSX/logic below (anonEntries,
// ownerIds, usedElsewhere, validPermutation, the select+radio-pump row,
// the seed-once effects) is a deliberate near-duplicate of
// StereoTypesASidePlayer.jsx's own reveal-phase implementation rather
// than a shared, extracted component. Structurally the two really are
// the same "guess which real player owns this anonymized (tag + ordered
// list) pair" UI, and extracting it was considered — but
// StereoTypesASidePlayer.jsx is already shipped/working and threads its
// own local hooks straight through that JSX inline; pulling it out
// cleanly would mean editing that file's internals for a feature Round 1
// itself doesn't need touched, which risks regressing an already-working
// round. Per the spec's own guidance, duplicating here is the lower-risk
// call. If a Round 3 (or later) reuse makes this a third copy, THAT'S
// the point a real shared component earns its cost.
export default function StereoTypesRemixPlayer({ gameId, player, players, globalRound, onContinue }) {
  const [round, setRound] = useState(null);
  const [pick, setPick] = useState(null);
  const [assignments, setAssignments] = useState({});
  const [pumpedLabel, setPumpedLabel] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!gameId) return;
    return subscribeRemixRound(gameId, 2, setRound);
  }, [gameId]);

  // Seed the local pick draft once, same "don't let a realtime update
  // from another player clobber what THIS player is mid-deciding"
  // reasoning as StereoTypesASidePlayer.jsx's own order-seeding effect.
  useEffect(() => {
    if (!round || pick) return;
    const mine = round.picks?.[player.id];
    if (mine) setPick(mine);
  }, [round, pick, player.id]);

  // Same reasoning, for this player's own guess draft — seeded once when
  // the round first reaches "reveal" (or on a reload mid-reveal, from
  // whatever was already submitted).
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

  // Opportunistic housekeeping — every connected client runs this, same
  // safety reasoning as lib/stereoTypesRemix.js's own comments on
  // maybeAdvanceRemixToReveal/maybeScoreRemix.
  useEffect(() => {
    if (!round || !gameId) return;
    if (round.status === "picking") maybeAdvanceRemixToReveal(gameId, 2);
    if (round.status === "reveal") maybeScoreRemix(gameId, 2);
    if (round.status === "scored" && round.result) persistRemixRoundScores(gameId, 2, round.result.perPlayer);
    // Round 3 now starts automatically the moment Round 2 finishes
    // scoring — see StereoTypesRemixHost.jsx's identical line/comment.
    if (round.status === "scored") {
      startOnBlast(gameId, (players || []).filter((p) => p.approved)).then((r) => {
        if (r.justStarted) notifyPlayersRoundChange(gameId, "🎤 Round 3 — On Blast", "On Blast has started — head back in to play.", "round-change");
      });
    }
  }, [gameId, round]);

  if (!round) {
    return (
      <Card style={{ borderColor: "#f4c430", textAlign: "center" }}>
        <p style={{ color: "#c9b98a", fontSize: 13, margin: 0, fontStyle: "italic" }}>
          Loading Round 2, The Remix...
        </p>
      </Card>
    );
  }

  const totalPlayers = round.playerIds?.length || 0;
  const pickedCount = Object.keys(round.picks || {}).length;
  const guessedCount = Object.keys(round.guesses || {}).length;
  const myRanking = round.rankings?.[player.id] || [];
  const alreadyPicked = !!round.picks?.[player.id];
  const alreadyGuessed = !!round.guesses?.[player.id];

  const anonEntries = round.status !== "picking" ? Object.entries(round.anonMap || {}) : [];
  // Same "don't offer a self-guess" fix as StereoTypesASidePlayer.jsx's
  // own myLabel/otherAnonEntries — see that file's comment for the full
  // reasoning, unchanged here: a player already knows which anonymized
  // (ranking, pick) pair is their own, so it's auto-resolved/locked
  // rather than offered as a dropdown, and excluded from both what gets
  // submitted and what's offered as an answer on every other label.
  const myAnonEntry = anonEntries.find(([, ownerId]) => ownerId === player.id);
  const myLabel = myAnonEntry?.[0] || null;
  const otherAnonEntries = anonEntries.filter(([label]) => label !== myLabel);
  // Same reasoning as StereoTypesASidePlayer.jsx's ownerIds: the
  // guessable pool is exactly whoever actually has a submitted pick
  // (anonMap's own values), minus this player's own name, not
  // round.playerIds wholesale — a force-advanced AFK player who never
  // picked simply isn't a guessable name this round.
  const ownerIds = otherAnonEntries.map(([, ownerId]) => ownerId);
  const usedElsewhere = (label) => new Set(Object.entries(assignments).filter(([l]) => l !== label).map(([, v]) => v));
  // A full permutation across only the OTHER (N-1) labels/names — same
  // reasoning as StereoTypesASidePlayer.jsx's own validPermutation.
  const validPermutation = otherAnonEntries.length === 0
    || (otherAnonEntries.every(([label]) => !!assignments[label])
      && new Set(Object.values(assignments)).size === otherAnonEntries.length);

  const setAssignment = (label, guessedPlayerId) => setAssignments((prev) => ({ ...prev, [label]: guessedPlayerId }));

  const handleSubmitPick = async () => {
    if (!pick) return;
    setBusy(true);
    await submitRemixPick(gameId, 2, player.id, pick);
    setBusy(false);
  };

  const handleSubmitGuesses = async () => {
    setBusy(true);
    await submitRemixGuesses(gameId, 2, player.id, assignments, pumpedLabel);
    setBusy(false);
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {round.status !== "scored" && (
        <Card style={{ borderColor: "#f4c430" }}>
          <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Round 2 — The Remix</div>
          <p style={{ color: "#f5eddc", fontSize: 13, margin: "0 0 10px" }}>
            {round.status === "picking"
              ? `${pickedCount} of ${totalPlayers} players have picked a superlative.`
              : `${guessedCount} of ${totalPlayers} players have submitted their guesses.`}
          </p>
          <StereoTypesWaitingList
            playerIds={round.playerIds}
            players={players}
            statusFor={(pid) => {
              const done = round.status === "picking" ? !!round.picks?.[pid] : !!round.guesses?.[pid];
              return done ? { label: "✓ Submitted", done: true } : { label: "Waiting...", done: false };
            }}
          />
        </Card>
      )}

      {round.status === "picking" && (
        <Card>
          <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Your ranking, most → least</div>
          <p style={{ color: "#6b6558", fontSize: 12, marginBottom: 8 }}>
            This ranking was randomly assigned to you — nobody wrote it. Pick whichever superlative below you think fits it best.
          </p>
          <ol style={{ margin: "0 0 14px", paddingLeft: 20, color: "#f5eddc", fontSize: 13 }}>
            {myRanking.map((pid) => <li key={pid}>{nameFor(players, pid)}{pid === player.id ? " (you)" : ""}</li>)}
          </ol>
          <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Pick one</div>
          <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
            {(round.superlativePool || []).map((s, i) => (
              <label key={`${s}-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, background: "#0a0e18", borderRadius: 6, padding: "8px 10px", cursor: "pointer" }}>
                <input type="radio" name="remix-pick" checked={pick === s} onChange={() => setPick(s)} />
                <span style={{ color: "#f5eddc", fontSize: 13 }}>{s}</span>
              </label>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Btn small onClick={handleSubmitPick} disabled={busy || !pick}>
              {alreadyPicked ? "Update pick" : "Submit pick"}
            </Btn>
            {alreadyPicked && <span style={{ color: "#f4c430", fontSize: 11, fontWeight: 700 }}>✓ Submitted</span>}
          </div>
        </Card>
      )}

      {round.status === "reveal" && (
        <Card>
          <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            Guess whose ranking is whose
          </div>
          <p style={{ color: "#6b6558", fontSize: 12, marginTop: 0 }}>
            Every OTHER player's name must be used exactly once — you already know which one's yours. Flag ONE guess with "pump up
            the volume" for quadruple points if it's right.
          </p>
          <div style={{ display: "grid", gap: 12 }}>
            {anonEntries.map(([label, ownerId]) => {
              const chosenSuperlative = round.picks?.[ownerId];
              const rankedOrder = round.rankings?.[ownerId] || [];
              const used = usedElsewhere(label);
              const isMine = label === myLabel;
              return (
                <div key={label} style={{ background: "#0a0e18", borderRadius: 8, padding: 10, border: isMine ? "1px solid #f4c430" : "none" }}>
                  <div style={{ color: "#c9b98a", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
                  <div style={{ color: "#f4c430", fontWeight: 700, fontSize: 13, margin: "2px 0 6px" }}>{chosenSuperlative}</div>
                  <ol style={{ margin: "0 0 8px", paddingLeft: 18, color: "#f5eddc", fontSize: 12 }}>
                    {rankedOrder.map((pid) => <li key={pid}>{nameFor(players, pid)}</li>)}
                  </ol>
                  {isMine ? (
                    // Auto-resolved, not an active guess — see this
                    // file's own myLabel comment above.
                    <p style={{ color: "#f4c430", fontSize: 12, fontWeight: 700, margin: 0 }}>✓ This one's yours — no guess needed.</p>
                  ) : (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <select
                        value={assignments[label] || ""}
                        onChange={(e) => setAssignment(label, e.target.value)}
                        style={{ background: "#0f1420", color: "#f5eddc", border: "1px solid #2a3040", borderRadius: 6, padding: "4px 8px", fontSize: 12 }}
                      >
                        <option value="">Who got this ranking?</option>
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
                  )}
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
        <>
          <StereoTypesRemixResults round={round} players={players} myPlayerId={player.id} gameId={gameId} />
          <Card style={{ textAlign: "center" }}>
            {globalRound >= 3 ? (
              <Btn onClick={onContinue}>Continue to Round 3 — On Blast →</Btn>
            ) : (
              <p style={{ color: "#6b6558", fontSize: 12, margin: 0, fontStyle: "italic" }}>
                ⏳ Waiting for everyone to finish Round 2 before Round 3 starts...
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
