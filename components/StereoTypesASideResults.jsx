import { Card } from "./ui";

// ─── Stereo Types — A Side results (shared by host + player) ───
// Only ever rendered once round.status === "scored", i.e. once
// lib/stereoTypesASide.js's maybeScoreASide has actually committed a
// `result` — this is the one place in the whole round it's correct to
// reveal round.anonMap's real mapping (which anon label belongs to
// which player) directly in the UI; every earlier phase's components
// (StereoTypesASidePlayer/Host.jsx) are deliberately careful never to
// render that mapping while it's still supposed to be a mystery.
//
// myPlayerId is optional — the host passes nothing (there's no "your
// score" to call out for a Console that isn't itself a player), a
// player passes their own id to get the score summary above everyone
// else's breakdown.
function nameFor(players, id) {
  const p = (players || []).find((pl) => pl.id === id);
  return p?.display_name || "Unknown player";
}

export default function StereoTypesASideResults({ round, players, myPlayerId }) {
  const result = round?.result;
  if (!result) return null;

  const anonMap = round.anonMap || {};
  const perPlayer = result.perPlayer || {};
  const entries = Object.entries(anonMap).map(([label, ownerId]) => ({
    label,
    ownerId,
    superlative: round.superlatives?.[ownerId],
    order: round.rankings?.[ownerId] || [],
  }));

  const mine = myPlayerId ? perPlayer[myPlayerId] : null;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {mine && (
        <Card style={{ borderColor: "#f4c430", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5 }}>Your A Side score</div>
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

      {/* Per-player scoreboard, sorted high to low — makes the "who won
          the round" question answerable at a glance instead of everyone
          having to scan every card above and add it up themselves. */}
      <Card>
        <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Round 1 scoreboard</div>
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
