import { Card } from "./ui";

// ─── Stereo Types — Round 2 ("The Remix") results (shared by host + player) ───
// Mirrors StereoTypesASideResults.jsx's own shape almost exactly — see
// that file's own comment for the full reasoning (only rendered once
// round.status === "scored", the one phase it's correct to reveal
// round.anonMap's real mapping directly). The only real differences here:
// each anon entry's tag is the player's CHOSEN superlative (round.picks)
// rather than a dealt one, and the ordered list under it is the ranking
// that player was GIVEN (round.rankings) rather than one they authored —
// same reversal as the rest of this round, see lib/stereoTypesRemix.js.
//
// myPlayerId is optional, same convention as StereoTypesASideResults.jsx
// (the host passes nothing; a player passes their own id for the "your
// score" summary above everyone else's breakdown).
function nameFor(players, id) {
  const p = (players || []).find((pl) => pl.id === id);
  return p?.display_name || "Unknown player";
}

export default function StereoTypesRemixResults({ round, players, myPlayerId }) {
  const result = round?.result;
  if (!result) return null;

  const anonMap = round.anonMap || {};
  const perPlayer = result.perPlayer || {};
  const entries = Object.entries(anonMap).map(([label, ownerId]) => ({
    label,
    ownerId,
    superlative: round.picks?.[ownerId],
    order: round.rankings?.[ownerId] || [],
  }));

  const mine = myPlayerId ? perPlayer[myPlayerId] : null;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {mine && (
        <Card style={{ borderColor: "#f4c430", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5 }}>Your Remix score</div>
          <div style={{ fontSize: 36, fontWeight: 900, color: "#f4c430", fontFamily: "'Anton', 'Arial Narrow', sans-serif" }}>{mine.totalPoints}</div>
          <div style={{ fontSize: 12, color: "#c9b98a", marginTop: 4 }}>
            {mine.pointsFromGuessing} from guessing others correctly &middot; {mine.pointsFromBeingGuessed} from others guessing yours
            {mine.pumpedCorrect === true && <span style={{ color: "#f4c430" }}> &middot; ⚡ pumped guess hit!</span>}
            {mine.pumpedCorrect === false && <span> &middot; ⚡ pumped guess missed</span>}
          </div>
        </Card>
      )}

      <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5 }}>The reveal</div>

      {entries.map(({ label, ownerId, superlative, order }) => {
        const guessers = perPlayer[ownerId]?.guessedCorrectlyBy || [];
        return (
          <Card key={label}>
            <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
              {label} — really <span style={{ color: "#f4c430" }}>{nameFor(players, ownerId)}</span>
            </div>
            <div style={{ color: "#f5eddc", fontWeight: 700, marginBottom: 8, fontSize: 13 }}>{superlative}</div>
            <ol style={{ margin: "0 0 8px", paddingLeft: 20, color: "#f5eddc", fontSize: 13 }}>
              {order.map((pid) => (
                <li key={pid}>{nameFor(players, pid)}{pid === ownerId ? " (self)" : ""}</li>
              ))}
            </ol>
            <div style={{ fontSize: 11, color: "#6b6558" }}>
              {guessers.length === 0 ? "Nobody guessed this one." : `Correctly guessed by: ${guessers.map((id) => nameFor(players, id)).join(", ")}`}
            </div>
          </Card>
        );
      })}

      {/* Per-player scoreboard, sorted high to low — same rationale as
          StereoTypesASideResults.jsx's own. Note this is Round 2's score
          ONLY, not a running season total across both rounds — summing
          across rounds reads from stereo_types_round_scores directly
          (see sql/add-stereo-types-a-side.sql's own comment), which
          nothing in the UI does yet; that's a natural Round 3 add. */}
      <Card>
        <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Round 2 scoreboard</div>
        <div style={{ display: "grid", gap: 6 }}>
          {Object.entries(perPlayer)
            .sort((a, b) => b[1].totalPoints - a[1].totalPoints)
            .map(([pid, p]) => (
              <div key={pid} style={{ display: "flex", justifyContent: "space-between", background: "#0a0e18", borderRadius: 6, padding: "6px 10px" }}>
                <span style={{ color: "#f5eddc", fontSize: 13 }}>{nameFor(players, pid)}</span>
                <span style={{ color: "#f4c430", fontSize: 13, fontWeight: 700 }}>{p.totalPoints} pts</span>
              </div>
            ))}
        </div>
      </Card>
    </div>
  );
}
