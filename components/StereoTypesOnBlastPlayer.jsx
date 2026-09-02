import { useEffect, useState } from "react";
import { Card, Btn } from "./ui";
import {
  subscribeOnBlastRound, submitOnBlastSubmission, submitOnBlastBid, submitOnBlastGuess,
  maybeAdvanceOnBlastToBidding, maybeScoreOnBlast, persistOnBlastRoundScores,
} from "../lib/stereoTypesOnBlast";
import StereoTypesOnBlastResults from "./StereoTypesOnBlastResults";
import StereoTypesFinalStandings from "./StereoTypesFinalStandings";

function nameFor(players, id) {
  const p = (players || []).find((pl) => pl.id === id);
  return p?.display_name || "Unknown player";
}

// ─── Local up/down ranking editor — a deliberate DUPLICATE of
// StereoTypesASidePlayer.jsx's own RankingEditor/moveBtnStyle, not an
// import from it. Extracting a shared component was considered (the
// task spec explicitly asked to "reuse Round 1's ranking UI/logic...
// as directly as practical"), but this phase's own scope boundaries
// explicitly forbid touching StereoTypesASidePlayer.jsx beyond the two
// named exceptions (wiring the Round 3 button, adding the panels
// branch) — pulling RankingEditor out of that file into a shared module
// would mean editing its internals for a feature Round 1 itself doesn't
// need touched, which is exactly the risk that file's own scope note
// warns against. Copying the ~15 lines here instead keeps this phase's
// diff contained to files it's actually supposed to touch, at the cost
// of a second copy of a small, stable, already-shipped component — the
// same trade this codebase already makes for shuffle()/buildAnonMap()
// across every one of these round files. If a future phase needs a
// FOURTH copy, that's the point a real shared component (in its own new
// file, still without editing Round 1/2's existing files) earns its
// cost.
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

// Renders a partner's ranking for the bidder's own eyes — `struckIds`
// (only present once a bid has been placed, see computeHardening in
// lib/stereoTypesOnBlast.js) redacts specific names IN PLACE (keeping
// every row and its position) rather than removing rows outright, per
// the spec's own "blanking/redacting" framing — this is fog-of-war over
// the render, not a change to the underlying order.
function RedactedRanking({ order, players, struckIds }) {
  const struck = new Set(struckIds || []);
  return (
    <ol style={{ margin: "0 0 8px", paddingLeft: 20, color: "#f5eddc", fontSize: 13 }}>
      {(order || []).map((pid) => (
        <li key={pid} style={struck.has(pid) ? { color: "#4a4438", fontStyle: "italic" } : undefined}>
          {struck.has(pid) ? "??? (struck)" : nameFor(players, pid)}
        </li>
      ))}
    </ol>
  );
}

// ─── Stereo Types — Round 3 ("On Blast"), player side ───
// Mounts below the title screen in StereoTypesPlayerPanels.jsx, same
// slot Rounds 1/2's own player components used. See
// lib/stereoTypesOnBlast.js's header comment for the full rules and, in
// particular, the note on why Step 3 (bidding/guessing) is CONCURRENT —
// every bidder here acts entirely independently and privately; there is
// no "whose turn is it" state and no spectator view of anyone else's
// in-progress bid/guess, same "progress counts only, never content"
// privacy rule Rounds 1/2 already follow for their own simultaneous
// phases.
//
// `players` is the full roster (see pages/play.jsx's own `allPlayers`),
// used for id -> display_name lookups AND to resolve this player's own
// `user_id` (needed only once we reach the final standings screen, to
// check which stickers this account has already unlocked before
// offering the win-claim picker — see StereoTypesFinalStandings.jsx).
export default function StereoTypesOnBlastPlayer({ gameId, player, players }) {
  const [round, setRound] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [order, setOrder] = useState(null);
  const [bidInput, setBidInput] = useState("");
  const [guess, setGuess] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!gameId) return;
    return subscribeOnBlastRound(gameId, 3, setRound);
  }, [gameId]);

  // Seed the local ranking draft once, same "don't let a realtime
  // update from another player clobber what THIS player is mid-editing"
  // reasoning as StereoTypesASidePlayer.jsx's own order-seeding effect.
  useEffect(() => {
    if (!round || order) return;
    const mine = round.submissions?.[player.id];
    setOrder(mine?.order || round.playerIds || []);
    if (mine?.chosen) setChosen(mine.chosen);
  }, [round, order, player.id]);

  // Seed the local bid/guess drafts once, when this player's own bidder
  // turn data first shows up (or on a reload mid-bidding).
  useEffect(() => {
    if (!round || round.status !== "bidding") return;
    const mine = round.bids?.[player.id];
    if (mine && bidInput === "") setBidInput(String(mine.bid));
    if (mine?.guess && guess === null) setGuess(mine.guess);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.status]);

  // Opportunistic housekeeping — every connected client (host and every
  // player) runs this, same safety reasoning as lib/stereoTypesOnBlast.js's
  // own comments on maybeAdvanceOnBlastToBidding/maybeScoreOnBlast.
  useEffect(() => {
    if (!round || !gameId) return;
    if (round.status === "ranking") maybeAdvanceOnBlastToBidding(gameId, 3);
    if (round.status === "bidding") maybeScoreOnBlast(gameId, 3);
    if (round.status === "scored" && round.result) persistOnBlastRoundScores(gameId, 3, round.result.perPlayer);
  }, [gameId, round]);

  if (!round) {
    return (
      <Card style={{ borderColor: "#f4c430", textAlign: "center" }}>
        <p style={{ color: "#c9b98a", fontSize: 13, margin: 0, fontStyle: "italic" }}>
          Waiting for the host to start Round 3, On Blast...
        </p>
      </Card>
    );
  }

  const totalPlayers = round.playerIds?.length || 0;
  const submittedCount = Object.keys(round.submissions || {}).length;
  const bidderIds = Object.keys(round.pairing || {});
  const bidCount = bidderIds.filter((pid) => !!round.bids?.[pid]).length;
  const guessCount = bidderIds.filter((pid) => round.bids?.[pid]?.guess != null).length;

  const myCandidates = round.candidatePools?.[player.id] || [];
  const mySubmission = round.submissions?.[player.id];
  const myPartnerId = round.pairing?.[player.id]; // who I bid on (my "partner" for this pairing)
  const myBid = round.bids?.[player.id];

  const move = (i, dir) => {
    setOrder((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const handleSubmitRanking = async () => {
    if (!chosen) return;
    setBusy(true);
    await submitOnBlastSubmission(gameId, 3, player.id, chosen, order);
    setBusy(false);
  };

  const handlePlaceBid = async () => {
    setBusy(true);
    await submitOnBlastBid(gameId, 3, player.id, bidInput);
    setBusy(false);
    setGuess(null); // a new/updated bid means a fresh hardened option list — don't carry a stale guess forward
  };

  const handleSubmitGuess = async () => {
    if (!guess) return;
    setBusy(true);
    await submitOnBlastGuess(gameId, 3, player.id, guess);
    setBusy(false);
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {round.status !== "scored" && (
        <Card style={{ borderColor: "#f4c430" }}>
          <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Round 3 — On Blast</div>
          <p style={{ color: "#f5eddc", fontSize: 13, margin: 0 }}>
            {round.status === "ranking"
              ? `${submittedCount} of ${totalPlayers} players have submitted their ranking.`
              : `${bidCount} of ${bidderIds.length} have placed a bid · ${guessCount} of ${bidderIds.length} have submitted a guess.`}
          </p>
        </Card>
      )}

      {round.status === "ranking" && order && (
        <Card>
          <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Pick one</div>
          <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
            {myCandidates.map((s, i) => (
              <label key={`${s}-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, background: "#0a0e18", borderRadius: 6, padding: "8px 10px", cursor: "pointer" }}>
                <input type="radio" name="on-blast-choice" checked={chosen === s} onChange={() => setChosen(s)} />
                <span style={{ color: "#f5eddc", fontSize: 13 }}>{s}</span>
              </label>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
            Rank everyone, most → least, by whichever you picked above
          </div>
          <p style={{ color: "#6b6558", fontSize: 12, marginBottom: 8 }}>
            Someone else will bid on guessing which of your 3 options this ranking is really about — nobody sees it until Round 3's reveal.
          </p>
          <RankingEditor order={order} players={players} onMove={move} />
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
            <Btn small onClick={handleSubmitRanking} disabled={busy || !chosen}>
              {mySubmission ? "Update submission" : "Submit"}
            </Btn>
            {mySubmission && <span style={{ color: "#f4c430", fontSize: 11, fontWeight: 700 }}>✓ Submitted</span>}
          </div>
        </Card>
      )}

      {round.status === "bidding" && !myPartnerId && (
        <Card style={{ textAlign: "center" }}>
          <p style={{ color: "#6b6558", fontSize: 12, fontStyle: "italic", margin: 0 }}>
            You didn't submit in time for Round 3's ranking phase, so there's no bidder turn for you this round — sit back for the reveal.
          </p>
        </Card>
      )}

      {round.status === "bidding" && myPartnerId && (
        <Card>
          <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
            Your bid — guessing {nameFor(players, myPartnerId)}'s superlative
          </div>
          <p style={{ color: "#6b6558", fontSize: 12, marginTop: 0, marginBottom: 10 }}>
            This is the ranking {nameFor(players, myPartnerId)} submitted, and the 3 options they were choosing between. Bid any
            number of points — the bigger the bid, the more your OWN view of this gets hardened (extra fake options mixed in,
            some names blanked out) before you guess. Guess right and you win your bid, plus your partner gets 3 points. Guess
            wrong and you lose your bid.
          </p>

          {!myBid ? (
            <RedactedRanking order={round.submissions?.[myPartnerId]?.order} players={players} struckIds={null} />
          ) : (
            <RedactedRanking order={round.submissions?.[myPartnerId]?.order} players={players} struckIds={myBid.hardening?.struckPlayerIds} />
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: myBid ? 14 : 0, flexWrap: "wrap" }}>
            <input
              type="number"
              min="0"
              step="1"
              value={bidInput}
              onChange={(e) => setBidInput(e.target.value)}
              placeholder="Bid points"
              style={{ background: "#0f1420", color: "#f5eddc", border: "1px solid #2a3040", borderRadius: 6, padding: "6px 10px", fontSize: 13, width: 100 }}
            />
            <Btn small onClick={handlePlaceBid} disabled={busy || bidInput === ""}>
              {myBid ? "Change bid" : "Place bid"}
            </Btn>
            {myBid && <span style={{ color: "#f4c430", fontSize: 11, fontWeight: 700 }}>Current bid: {myBid.bid} pts</span>}
          </div>

          {myBid && (
            <>
              <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                Which was really their pick?
              </div>
              <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
                {(myBid.hardening?.optionsShown || []).map((s, i) => (
                  <label key={`${s}-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, background: "#0a0e18", borderRadius: 6, padding: "8px 10px", cursor: "pointer" }}>
                    <input type="radio" name="on-blast-guess" checked={guess === s} onChange={() => setGuess(s)} />
                    <span style={{ color: "#f5eddc", fontSize: 13 }}>{s}</span>
                  </label>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Btn small onClick={handleSubmitGuess} disabled={busy || !guess}>
                  {myBid.guess ? "Update guess" : "Submit guess"}
                </Btn>
                {myBid.guess && <span style={{ color: "#f4c430", fontSize: 11, fontWeight: 700 }}>✓ Guess locked in</span>}
              </div>
            </>
          )}
        </Card>
      )}

      {round.status === "scored" && (
        <>
          <StereoTypesOnBlastResults round={round} players={players} myPlayerId={player.id} />
          <StereoTypesFinalStandings gameId={gameId} players={players} myPlayerId={player.id} />
        </>
      )}
    </div>
  );
}
