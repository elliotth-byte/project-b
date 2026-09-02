import { useEffect, useState } from "react";
import { Card, Btn } from "./ui";
import {
  subscribeRemixRound, maybeAdvanceRemixToReveal, maybeScoreRemix, persistRemixRoundScores,
} from "../lib/stereoTypesRemix";
import StereoTypesRemixResults from "./StereoTypesRemixResults";

// ─── Stereo Types — Round 2 ("The Remix"), host console ───
// Mirrors StereoTypesASideHost.jsx's own shape closely. Mounted by
// StereoTypesHostPanels.jsx ONLY once KEY_STEREO_TYPES_ROUND is already
// 2 — unlike StereoTypesASideHost.jsx, this component is never
// responsible for actually STARTING its own round: that trigger is
// StereoTypesASideHost.jsx's own "Round 2 coming soon" button (now
// wired to lib/stereoTypesRemix.js's startRemix), which fires while
// StereoTypesASideHost is still the one mounted. By the time this
// component appears on screen at all, startRemix has already run, so
// `round` here is only ever null for the brief instant before the
// initial subscribeRemixRound fetch resolves — the `!round` branch below
// is just a loading guard, not its own "Start Round 2" affordance.
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
          <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
            {(round.playerIds || []).map((pid) => {
              const p = (players || []).find((pl) => pl.id === pid);
              const picked = !!round.picks?.[pid];
              return (
                <div key={pid} style={{ display: "flex", justifyContent: "space-between", background: "#0a0e18", borderRadius: 6, padding: "6px 10px" }}>
                  <span style={{ color: "#f5eddc", fontSize: 13 }}>{p?.display_name || "Unknown player"}</span>
                  <span style={{ color: picked ? "#f4c430" : "#6b6558", fontSize: 11, fontWeight: 700 }}>{picked ? "✓ Submitted" : "Waiting..."}</span>
                </div>
              );
            })}
          </div>
          <Btn variant="ghost" small onClick={handleForceReveal} disabled={busy}>Force reveal now (skip anyone AFK)</Btn>
        </Card>
      )}

      {round.status === "reveal" && (
        <Card style={{ borderColor: "#f4c430" }}>
          <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            Round 2 — The Remix · Guessing in progress
          </div>
          <p style={{ color: "#f5eddc", fontSize: 13, marginTop: 0 }}>{guessedCount} of {totalPlayers} players have submitted their guesses.</p>
          <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
            {(round.playerIds || []).map((pid) => {
              const p = (players || []).find((pl) => pl.id === pid);
              const guessed = !!round.guesses?.[pid];
              return (
                <div key={pid} style={{ display: "flex", justifyContent: "space-between", background: "#0a0e18", borderRadius: 6, padding: "6px 10px" }}>
                  <span style={{ color: "#f5eddc", fontSize: 13 }}>{p?.display_name || "Unknown player"}</span>
                  <span style={{ color: guessed ? "#f4c430" : "#6b6558", fontSize: 11, fontWeight: 700 }}>{guessed ? "✓ Submitted" : "Waiting..."}</span>
                </div>
              );
            })}
          </div>
          <Btn variant="ghost" small onClick={handleForceScore} disabled={busy}>Force scoring now (skip anyone AFK)</Btn>
        </Card>
      )}

      {round.status === "scored" && (
        <>
          <StereoTypesRemixResults round={round} players={players} />
          <Card style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Round 3 — On Blast</div>
            <Btn disabled>Round 3 coming soon</Btn>
          </Card>
        </>
      )}
    </div>
  );
}
