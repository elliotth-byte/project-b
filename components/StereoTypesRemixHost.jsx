import { useEffect, useState } from "react";
import { Card, Btn } from "./ui";
import {
  subscribeRemixRound, maybeAdvanceRemixToReveal, maybeScoreRemix, persistRemixRoundScores,
} from "../lib/stereoTypesRemix";
import { startOnBlast } from "../lib/stereoTypesOnBlast";
import StereoTypesRemixResults from "./StereoTypesRemixResults";
import StereoTypesWaitingList from "./StereoTypesWaitingList";

// ─── Stereo Types — Round 2 ("The Remix"), host console ───
// Mirrors StereoTypesASideHost.jsx's own shape closely. Mounted by
// StereoTypesHostPanels.jsx ONLY once KEY_STEREO_TYPES_ROUND is already
// 2 — unlike StereoTypesASideHost.jsx, this component is never
// responsible for actually STARTING its own round: that trigger is
// StereoTypesASideHost.jsx's own auto-advance effect (startRemix, fired
// the moment Round 1 finishes scoring, no host click involved — see
// that file's own comment), which fires while StereoTypesASideHost is
// still the one mounted. By the time this component appears on screen
// at all, startRemix has already run, so `round` here is only ever
// null for the brief instant before the initial subscribeRemixRound
// fetch resolves — the `!round` branch below is just a loading guard,
// not its own "Start Round 2" affordance.
//
// Same "never render picks/guesses/rankings/superlativePool/anonMap
// CONTENT mid-round, only progress counts" rule as Round 1's host
// console — see StereoTypesASideHost.jsx's own comment for why.
export default function StereoTypesRemixHost({ gameId, players }) {
  const [round, setRound] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!gameId) return;
    return subscribeRemixRound(gameId, 2, setRound);
  }, [gameId]);

  // Same opportunistic housekeeping as StereoTypesASideHost.jsx's own
  // effect — every connected client (host and every player) runs this,
  // no single leader. See lib/stereoTypesRemix.js's comments on
  // maybeAdvanceRemixToReveal/maybeScoreRemix for why that's safe.
  useEffect(() => {
    if (!round || !gameId) return;
    if (round.status === "picking") maybeAdvanceRemixToReveal(gameId, 2);
    if (round.status === "reveal") maybeScoreRemix(gameId, 2);
    if (round.status === "scored" && round.result) persistRemixRoundScores(gameId, 2, round.result.perPlayer);
    // Round 3 now starts the moment Round 2 finishes scoring, with no
    // host click required — same reasoning as StereoTypesASideHost.jsx's
    // own auto-advance line (startOnBlast's storageUpdate is the same
    // safe first-write-wins CAS). StereoTypesRemixPlayer.jsx runs the
    // identical line from every player's own tab too. Individual
    // players still each see their own Round 2 results and click
    // through themselves — this only controls when Round 3 exists.
    if (round.status === "scored") startOnBlast(gameId, (players || []).filter((p) => p.approved));
  }, [gameId, round]);

  const handleForceReveal = async () => {
    setBusy(true);
    await maybeAdvanceRemixToReveal(gameId, 2, { force: true });
    setBusy(false);
  };

  const handleForceScore = async () => {
    setBusy(true);
    await maybeScoreRemix(gameId, 2, { force: true });
    setBusy(false);
  };

  if (!round) {
    return (
      <Card style={{ borderColor: "#f4c430" }}>
        <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Round 2 — The Remix</div>
        <p style={{ color: "#c9b98a", fontSize: 13, marginTop: 0, marginBottom: 0, fontStyle: "italic" }}>Loading...</p>
      </Card>
    );
  }

  const totalPlayers = round.playerIds?.length || 0;
  const pickedCount = Object.keys(round.picks || {}).length;
  const guessedCount = Object.keys(round.guesses || {}).length;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {round.status === "picking" && (
        <Card style={{ borderColor: "#f4c430" }}>
          <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            Round 2 — The Remix · Picking in progress
          </div>
          <p style={{ color: "#f5eddc", fontSize: 13, marginTop: 0 }}>{pickedCount} of {totalPlayers} players have picked a superlative.</p>
          <StereoTypesWaitingList
            playerIds={round.playerIds}
            players={players}
            statusFor={(pid) => (round.picks?.[pid] ? { label: "✓ Submitted", done: true } : { label: "Waiting...", done: false })}
          />
          <Btn variant="ghost" small onClick={handleForceReveal} disabled={busy}>Force reveal now (skip anyone AFK)</Btn>
        </Card>
      )}

      {round.status === "reveal" && (
        <Card style={{ borderColor: "#f4c430" }}>
          <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            Round 2 — The Remix · Guessing in progress
          </div>
          <p style={{ color: "#f5eddc", fontSize: 13, marginTop: 0 }}>{guessedCount} of {totalPlayers} players have submitted their guesses.</p>
          <StereoTypesWaitingList
            playerIds={round.playerIds}
            players={players}
            statusFor={(pid) => (round.guesses?.[pid] ? { label: "✓ Submitted", done: true } : { label: "Waiting...", done: false })}
          />
          <Btn variant="ghost" small onClick={handleForceScore} disabled={busy}>Force scoring now (skip anyone AFK)</Btn>
        </Card>
      )}

      {round.status === "scored" && (
        <>
          <StereoTypesRemixResults round={round} players={players} gameId={gameId} />
          <Card style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Round 3 — On Blast</div>
            <p style={{ color: "#6b6558", fontSize: 12, margin: 0 }}>
              Round 3 starts automatically for everyone as soon as they're ready — no action needed here.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
