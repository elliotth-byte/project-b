import { useEffect, useState } from "react";
import { Card, Btn } from "./ui";
import {
  subscribeASideRound, startASide, maybeAdvanceASideToReveal, maybeScoreASide, persistASideRoundScores,
} from "../lib/stereoTypesASide";
import { startRemix } from "../lib/stereoTypesRemix";
import StereoTypesASideResults from "./StereoTypesASideResults";
import StereoTypesWaitingList from "./StereoTypesWaitingList";
import { notifyPlayersRoundChange } from "../lib/pushNotifications";

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
    // Round 2 now starts the moment Round 1 finishes scoring, with no
    // host click required — startRemix's own storageUpdate is already
    // a "first write wins, everyone else's call is a safe no-op" CAS
    // (see that function's own comment), same as every other line in
    // this effect, so running it opportunistically from the host's tab
    // AND every player's own tab (StereoTypesASidePlayer.jsx has the
    // identical line) is exactly as safe as the rest of this file
    // already assumes. Individual players still each see their own
    // Round 1 results and click through into Round 2 themselves
    // (that's StereoTypesASidePlayer.jsx's own onContinue) — this only
    // ever controls when Round 2 exists to click into, not who's
    // looking at it yet.
    if (round.status === "scored") {
      startRemix(gameId, approvedPlayers).then((r) => {
        if (r.justStarted) notifyPlayersRoundChange(gameId, "🔁 Round 2 — The Remix", "The Remix has started — head back in to play.", "round-change");
      });
    }
  }, [gameId, round]);

  const handleStart = async () => {
    setBusy(true);
    const res = await startASide(gameId, approvedPlayers);
    if (!res.ok && res.error) window.alert(res.error);
    else if (res.ok) notifyPlayersRoundChange(gameId, "🅰️ Round 1 — A Side", "A Side has started — head in to get your superlative.", "round-change");
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
          <StereoTypesWaitingList
            playerIds={round.playerIds}
            players={players}
            statusFor={(pid) => (round.rankings?.[pid] ? { label: "✓ Submitted", done: true } : { label: "Waiting...", done: false })}
          />
          <Btn variant="ghost" small onClick={handleForceReveal} disabled={busy}>Force reveal now (skip anyone AFK)</Btn>
        </Card>
      )}

      {round.status === "reveal" && (
        <Card style={{ borderColor: "#f4c430" }}>
          <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            Round 1 — A Side · Guessing in progress
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
          <StereoTypesASideResults round={round} players={players} gameId={gameId} />
          <Card style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Round 2 — The Remix</div>
            <p style={{ color: "#6b6558", fontSize: 12, margin: 0 }}>
              {/* No manual "Start Round 2" button here anymore — see the
                  auto-advance effect above. Every player independently
                  clicks their own "Continue" once they've seen Round 1's
                  results (StereoTypesASidePlayer.jsx's own onContinue),
                  so this card is purely informational for the host. */}
              Round 2 starts automatically for everyone as soon as they're ready — no action needed here.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
