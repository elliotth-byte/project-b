import { useEffect, useState } from "react";
import { Card, Btn } from "./ui";
import {
  subscribeOnBlastRound, maybeAdvanceOnBlastToBidding, maybeScoreOnBlast, persistOnBlastRoundScores,
} from "../lib/stereoTypesOnBlast";
import StereoTypesOnBlastResults from "./StereoTypesOnBlastResults";
import StereoTypesFinalStandings from "./StereoTypesFinalStandings";

// ─── Stereo Types — Round 3 ("On Blast"), host console ───
// Mirrors StereoTypesASideHost.jsx/StereoTypesRemixHost.jsx's own shape
// closely. Mounted by StereoTypesHostPanels.jsx ONLY once
// KEY_STEREO_TYPES_ROUND is already 3 — same "never itself responsible
// for STARTING its own round" relationship StereoTypesRemixHost.jsx has
// to StereoTypesASideHost.jsx: the actual trigger is
// StereoTypesRemixHost.jsx's own "Start Round 3 — On Blast" button (now
// wired to lib/stereoTypesOnBlast.js's startOnBlast), which fires while
// StereoTypesRemixHost is still the one mounted.
//
// Same "never render submission/bid/guess CONTENT mid-round, only
// progress counts" rule Rounds 1/2's own host consoles follow — the
// host here NEVER acts as a bidder (there's no host-facing bid/guess
// UI at all, unlike the player console), so this component only ever
// shows counts during "ranking"/"bidding" and the full reveal once
// "scored" — see StereoTypesOnBlastResults.jsx for that reveal.
export default function StereoTypesOnBlastHost({ gameId, players }) {
  const [round, setRound] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!gameId) return;
    return subscribeOnBlastRound(gameId, 3, setRound);
  }, [gameId]);

  // Same opportunistic housekeeping as every other Stereo Types round's
  // host console — every connected client runs this, no single leader.
  useEffect(() => {
    if (!round || !gameId) return;
    if (round.status === "ranking") maybeAdvanceOnBlastToBidding(gameId, 3);
    if (round.status === "bidding") maybeScoreOnBlast(gameId, 3);
    if (round.status === "scored" && round.result) persistOnBlastRoundScores(gameId, 3, round.result.perPlayer);
  }, [gameId, round]);

  const handleForceBidding = async () => {
    setBusy(true);
    await maybeAdvanceOnBlastToBidding(gameId, 3, { force: true });
    setBusy(false);
  };

  const handleForceScore = async () => {
    setBusy(true);
    await maybeScoreOnBlast(gameId, 3, { force: true });
    setBusy(false);
  };

  if (!round) {
    return (
      <Card style={{ borderColor: "#f4c430" }}>
        <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Round 3 — On Blast</div>
        <p style={{ color: "#c9b98a", fontSize: 13, marginTop: 0, marginBottom: 0, fontStyle: "italic" }}>Loading...</p>
      </Card>
    );
  }

  const totalPlayers = round.playerIds?.length || 0;
  const submittedCount = Object.keys(round.submissions || {}).length;
  const bidderIds = Object.keys(round.pairing || {});
  const bidCount = bidderIds.filter((pid) => !!round.bids?.[pid]).length;
  const guessCount = bidderIds.filter((pid) => round.bids?.[pid]?.guess != null).length;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {round.status === "ranking" && (
        <Card style={{ borderColor: "#f4c430" }}>
          <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            Round 3 — On Blast · Ranking in progress
          </div>
          <p style={{ color: "#f5eddc", fontSize: 13, marginTop: 0 }}>{submittedCount} of {totalPlayers} players have submitted their ranking.</p>
          <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
            {(round.playerIds || []).map((pid) => {
              const p = (players || []).find((pl) => pl.id === pid);
              const submitted = !!round.submissions?.[pid];
              return (
                <div key={pid} style={{ display: "flex", justifyContent: "space-between", background: "#0a0e18", borderRadius: 6, padding: "6px 10px" }}>
                  <span style={{ color: "#f5eddc", fontSize: 13 }}>{p?.display_name || "Unknown player"}</span>
                  <span style={{ color: submitted ? "#f4c430" : "#6b6558", fontSize: 11, fontWeight: 700 }}>{submitted ? "✓ Submitted" : "Waiting..."}</span>
                </div>
              );
            })}
          </div>
          <Btn variant="ghost" small onClick={handleForceBidding} disabled={busy}>Force bidding phase now (skip anyone AFK)</Btn>
        </Card>
      )}

      {round.status === "bidding" && (
        <Card style={{ borderColor: "#f4c430" }}>
          <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            Round 3 — On Blast · Bidding in progress
          </div>
          <p style={{ color: "#f5eddc", fontSize: 13, marginTop: 0 }}>
            {bidCount} of {bidderIds.length} have placed a bid · {guessCount} of {bidderIds.length} have submitted a guess.
          </p>
          <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
            {bidderIds.map((pid) => {
              const p = (players || []).find((pl) => pl.id === pid);
              const bid = round.bids?.[pid];
              const status = bid?.guess != null ? "✓ Guessed" : bid ? "Bid placed..." : "Waiting...";
              return (
                <div key={pid} style={{ display: "flex", justifyContent: "space-between", background: "#0a0e18", borderRadius: 6, padding: "6px 10px" }}>
                  <span style={{ color: "#f5eddc", fontSize: 13 }}>{p?.display_name || "Unknown player"}</span>
                  <span style={{ color: bid?.guess != null ? "#f4c430" : "#6b6558", fontSize: 11, fontWeight: 700 }}>{status}</span>
                </div>
              );
            })}
          </div>
          <Btn variant="ghost" small onClick={handleForceScore} disabled={busy}>Force scoring now (skip anyone AFK)</Btn>
        </Card>
      )}

      {round.status === "scored" && (
        <>
          <StereoTypesOnBlastResults round={round} players={players} />
          <StereoTypesFinalStandings gameId={gameId} players={players} />
        </>
      )}
    </div>
  );
}
