import { useEffect, useState } from "react";
import { Card, Btn } from "./ui";
import {
  subscribeASideRound, startASide, maybeAdvanceASideToReveal, maybeScoreASide, persistASideRoundScores,
} from "../lib/stereoTypesASide";
import StereoTypesASideResults from "./StereoTypesASideResults";

// ─── Stereo Types — Round 1 ("A Side"), host console ───
// Mounts below the roster card in StereoTypesHostPanels.jsx. Deliberately
// never renders round.rankings/round.guesses/round.superlatives/round.anonMap
// CONTENT while the round is still in progress — only counts ("3 of 6
// submitted") — per the spec's own explicit requirement that the host
// sees live progress but not the actual content during ranking/reveal.
// Once round.status === "scored", full content is fair game (see
// StereoTypesASideResults) — that's the point of that phase.
export default function StereoTypesASideHost({ gameId, players }) {
  const [round, setRound] = useState(null);
  const [busy, setBusy] = useState(false);
  const approvedPlayers = (players || []).filter((p) => p.approved);

  useEffect(() => {
    if (!gameId) return;
    return subscribeASideRound(gameId, 1, setRound);
  }, [gameId]);

  // Same opportunistic housekeeping as StereoTypesASidePlayer.jsx's own
  // effect — the host's own tab is just another client here, no more
  // "in charge" of advancing the round than any player's is. See
  // lib/stereoTypesASide.js's comments on why running this from every
  // connected client is safe.
  useEffect(() => {
    if (!round || !gameId) return;
    if (round.status === "ranking") maybeAdvanceASideToReveal(gameId, 1);
    if (round.status === "reveal") maybeScoreASide(gameId, 1);
    // Redundant-but-safe re-attempt of the ledger upsert — see
    // lib/stereoTypesASide.js's own comment on persistASideRoundScores
    // for why more than one client attempting this is fine.
    if (round.status === "scored" && round.result) persistASideRoundScores(gameId, 1, round.result.perPlayer);
  }, [gameId, round]);

  const handleStart = async () => {
    setBusy(true);
    const res = await startASide(gameId, approvedPlayers);
    if (!res.ok && res.error) window.alert(res.error);
    setBusy(false);
  };

  const handleForceReveal = async () => {
    setBusy(true);
    await maybeAdvanceASideToReveal(gameId, 1, { force: true });
    setBusy(false);
  };

  const handleForceScore = async () => {
    setBusy(true);
    await maybeScoreASide(gameId, 1, { force: true });
    setBusy(false);
  };

  if (!round) {
    return (
      <Card style={{ borderColor: "#f4c430" }}>
        <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Round 1 — A Side</div>
        <p style={{ color: "#c9b98a", fontSize: 13, marginTop: 0 }}>
          Deals every approved player a different superlative, then has them rank the whole room by it. Needs at least 2 approved
          players to start.
        </p>
        <Btn onClick={handleStart} disabled={busy || approvedPlayers.length < 2}>Start A Side</Btn>
        {approvedPlayers.length < 2 && (
          <p style={{ color: "#6b6558", fontSize: 11, marginTop: 8, marginBottom: 0 }}>Approve at least 2 players first.</p>
        )}
      </Card>
    );
  }

  const totalPlayers = round.playerIds?.length || 0;
  const submittedCount = Object.keys(round.rankings || {}).length;
  const guessedCount = Object.keys(round.guesses || {}).length;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {round.status === "ranking" && (
        <Card style={{ borderColor: "#f4c430" }}>
          <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            Round 1 — A Side · Ranking in progress
          </div>
          <p style={{ color: "#f5eddc", fontSize: 13, marginTop: 0 }}>{submittedCount} of {totalPlayers} players have submitted their ranking.</p>
          <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
            {(round.playerIds || []).map((pid) => {
              const p = (players || []).find((pl) => pl.id === pid);
              const submitted = !!round.rankings?.[pid];
              return (
                <div key={pid} style={{ display: "flex", justifyContent: "space-between", background: "#0a0e18", borderRadius: 6, padding: "6px 10px" }}>
                  <span style={{ color: "#f5eddc", fontSize: 13 }}>{p?.display_name || "Unknown player"}</span>
                  <span style={{ color: submitted ? "#f4c430" : "#6b6558", fontSize: 11, fontWeight: 700 }}>{submitted ? "✓ Submitted" : "Waiting..."}</span>
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
            Round 1 — A Side · Guessing in progress
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
          <StereoTypesASideResults round={round} players={players} />
          <Card style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Round 2 — The Remix</div>
            <Btn disabled>Round 2 coming soon</Btn>
          </Card>
        </>
      )}
    </div>
  );
}
