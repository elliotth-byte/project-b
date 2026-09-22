import { useEffect, useState } from "react";
import { Card } from "./ui";
import { subscribeStereoTypesReactions, toggleStereoTypesReaction } from "../lib/stereoTypesReactions";
import StereoTypesReactionBar from "./StereoTypesReactionBar";

// ─── Stereo Types — Round 3 ("On Blast") results (shared by host + player) ───
// Only ever rendered once round.status === "scored" (lib/stereoTypesOnBlast.js's
// maybeScoreOnBlast has committed a `result`) — this is the one place it's
// correct to reveal every pairing's TRUE chosen superlative, full option
// list (including which were fake decoys), which names were struck from
// the bidder's own view, and every bid/guess/outcome directly — matching
// this phase's own corrected design: once resolved, everyone sees the
// full correct-answer reveal for every pairing, no more secrecy, same as
// StereoTypesASideResults.jsx/StereoTypesRemixResults.jsx already do for
// Rounds 1/2 at their own conclusions.
//
// myPlayerId is optional, same convention as those two files (the host
// passes nothing; a player passes their own id for a "your result"
// summary above everyone else's breakdown).
function nameFor(players, id) {
  const p = (players || []).find((pl) => pl.id === id);
  return p?.display_name || "Unknown player";
}

export default function StereoTypesOnBlastResults({ round, players, myPlayerId, gameId }) {
  const result = round?.result;
  // Same reasoning as StereoTypesASideResults.jsx's own reactions
  // subscription. Keyed by bidderId here rather than an anon label —
  // this round has no anonymity left to preserve by the reveal phase
  // (see this file's own header comment), so bidderId is already the
  // stable, unique-per-entry identifier every other part of this
  // screen keys off of.
  const [reactions, setReactions] = useState({});
  useEffect(() => {
    if (!gameId || !round?.round) return;
    return subscribeStereoTypesReactions(gameId, `on-blast:${round.round}`, setReactions);
  }, [gameId, round?.round]);
  if (!result) return null;

  const perPlayer = result.perPlayer || {};
  const pairing = round.pairing || {};

  const mine = myPlayerId ? perPlayer[myPlayerId] : null;
  const myBidderResult = mine?.bidderResult;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {mine && (
        <Card style={{ borderColor: "#f4c430", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5 }}>Your On Blast result</div>
          <div style={{ fontSize: 36, fontWeight: 900, color: mine.totalPoints < 0 ? "#ff6b6b" : "#f4c430", fontFamily: "'Anton', 'Arial Narrow', sans-serif" }}>
            {mine.totalPoints > 0 ? `+${mine.totalPoints}` : mine.totalPoints}
          </div>
          <div style={{ fontSize: 12, color: "#c9b98a", marginTop: 4 }}>
            {myBidderResult?.bid > 0 || myBidderResult?.guess
              ? `You bid ${myBidderResult.bid} on ${nameFor(players, myBidderResult.partnerId)}'s list and guessed ${myBidderResult.correct ? "correctly" : "wrong"} (${myBidderResult.delta >= 0 ? "+" : ""}${myBidderResult.delta})`
              : "You didn't place a bid this round."}
            {mine.partnerBonusFrom && <span style={{ color: "#f4c430" }}> &middot; +3 as {nameFor(players, mine.partnerBonusFrom)}'s partner</span>}
          </div>
        </Card>
      )}

      <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5 }}>The reveal</div>

      {Object.entries(pairing).map(([bidderId, partnerId]) => {
        const bidderResult = perPlayer[bidderId]?.bidderResult;
        const submission = round.submissions?.[partnerId];
        const options = bidderResult?.hardening?.optionsShown || round.candidatePools?.[partnerId] || [];
        const decoySet = new Set(bidderResult?.hardening?.decoyOptions || []);
        const struckSet = new Set(bidderResult?.hardening?.struckPlayerIds || []);
        const hadBid = !!bidderResult && (bidderResult.bid > 0 || bidderResult.guess);
        return (
          <Card key={bidderId}>
            <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
              <span style={{ color: "#f4c430" }}>{nameFor(players, bidderId)}</span> bid on <span style={{ color: "#f4c430" }}>{nameFor(players, partnerId)}</span>'s list
            </div>
            <div style={{ color: "#f5eddc", fontWeight: 700, marginBottom: 4, fontSize: 13 }}>
              Really: {submission?.chosen}
            </div>
            <ol style={{ margin: "0 0 8px", paddingLeft: 20, color: "#f5eddc", fontSize: 13 }}>
              {(submission?.order || []).map((pid) => (
                <li key={pid} style={struckSet.has(pid) ? { color: "#6b6558" } : undefined}>
                  {nameFor(players, pid)}
                  {pid === partnerId ? " (self)" : ""}
                  {struckSet.has(pid) && <span style={{ color: "#6b6558", fontStyle: "italic" }}> — struck from {nameFor(players, bidderId)}'s view</span>}
                </li>
              ))}
            </ol>
            {options.length > 0 && (
              <div style={{ fontSize: 12, color: "#c9b98a", marginBottom: 8 }}>
                Options shown: {options.map((o, i) => (
                  <span key={`${o}-${i}`} style={decoySet.has(o) ? { color: "#6b6558", fontStyle: "italic" } : { color: "#f5eddc" }}>
                    {o}{decoySet.has(o) ? " (decoy)" : ""}{i < options.length - 1 ? " · " : ""}
                  </span>
                ))}
              </div>
            )}
            {hadBid ? (
              <div style={{ fontSize: 12, color: bidderResult.correct ? "#f4c430" : "#ff6b6b", fontWeight: 700 }}>
                Bid {bidderResult.bid} · guessed "{bidderResult.guess || "(no guess)"}" · {bidderResult.correct ? "CORRECT" : "WRONG"} ·{" "}
                {nameFor(players, bidderId)} {bidderResult.delta >= 0 ? "+" : ""}{bidderResult.delta}
                {bidderResult.correct && ` · ${nameFor(players, partnerId)} +3`}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "#6b6558" }}>{nameFor(players, bidderId)} never placed a bid — no points changed hands.</div>
            )}
            {gameId && myPlayerId && (
              <StereoTypesReactionBar
                reactions={reactions[bidderId]}
                myPlayerId={myPlayerId}
                onToggle={(emoji) => toggleStereoTypesReaction(gameId, `on-blast:${round.round}`, bidderId, myPlayerId, emoji)}
              />
            )}
          </Card>
        );
      })}

      <Card>
        <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Round 3 scoreboard</div>
        <div style={{ display: "grid", gap: 6 }}>
          {Object.entries(perPlayer)
            .sort((a, b) => b[1].totalPoints - a[1].totalPoints)
            .map(([pid, p]) => (
              <div key={pid} style={{ display: "flex", justifyContent: "space-between", background: "#0a0e18", borderRadius: 6, padding: "6px 10px" }}>
                <span style={{ color: "#f5eddc", fontSize: 13 }}>{nameFor(players, pid)}</span>
                <span style={{ color: p.totalPoints < 0 ? "#ff6b6b" : "#f4c430", fontSize: 13, fontWeight: 700 }}>
                  {p.totalPoints > 0 ? `+${p.totalPoints}` : p.totalPoints} pts
                </span>
              </div>
            ))}
        </div>
      </Card>
    </div>
  );
}
