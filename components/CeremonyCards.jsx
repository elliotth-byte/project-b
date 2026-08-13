import { Card, Badge } from "./ui";
import { GAME_REGISTRY } from "../lib/challengeGames";
import { formatPlacementValue } from "../lib/challengeScores";

// ─── Shared between the host's History tab and the player's Ceremony tab ───
// Both surfaces show the same underlying record (challenge placements,
// who nominated whom, the vote breakdown, the Finale) — this is that
// presentation, defined once so the two views can't drift apart. Neither
// surface here decides what's secret and what isn't; that's already
// baked into the data each caller passes in (see CeremonyPlayer.jsx's
// header comment for why live vote tallies never show up before a
// reveal).

export function LiveNominationsRecap({ nominatorOrder, nominations, nominationReasons, byId, showComments }) {
  if (!nominatorOrder?.length) return null;
  return (
    <div style={{ textAlign: "left", marginTop: 12 }}>
      <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
        ⚖️ Who nominated whom
      </div>
      <div style={{ display: "grid", gap: 4 }}>
        {nominatorOrder.map((n) => (
          <div key={n.playerId}>
            <p style={{ fontSize: 12, color: "#f5f0ff", margin: 0 }}>
              #{n.place} <strong>{n.name}</strong>{" "}
              {nominations?.[n.playerId] ? (
                <>nominated <span style={{ color: "#ff3860" }}>{byId[nominations[n.playerId]] || "—"}</span></>
              ) : (
                <span style={{ color: "#6b4f99", fontStyle: "italic" }}>still deciding...</span>
              )}
            </p>
            {showComments && nominations?.[n.playerId] && nominationReasons?.[n.playerId] && (
              <p style={{ fontSize: 11, color: "#a68fd6", fontStyle: "italic", margin: "2px 0 0" }}>"{nominationReasons[n.playerId]}"</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChallengePlacementsList({ placements, gameType, rankDirection }) {
  return (
    <div style={{ display: "grid", gap: 3 }}>
      {[...(placements || [])].sort((a, b) => a.place - b.place).map((p) => {
        const scoreLabel = formatPlacementValue(p, gameType, rankDirection);
        return (
          <div key={p.playerId} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
            <span style={{ color: p.place === 1 ? "#ff2d95" : "#a68fd6", fontWeight: p.place === 1 ? 700 : 500 }}>
              #{p.place} {p.name}
            </span>
            {scoreLabel && <span style={{ color: p.forfeited ? "#ff3860" : "#6b4f99" }}>{scoreLabel}</span>}
          </div>
        );
      })}
    </div>
  );
}

export function ChallengeResultsCard({ entry: c }) {
  const registryEntry = c.gameType && GAME_REGISTRY[c.gameType];
  const rankDirection = registryEntry?.rank === "time-asc" ? "time-asc" : "score-desc";
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
          ⚔️ Round {c.round} Battle{registryEntry && ` — ${registryEntry.icon} ${registryEntry.label}`}
        </h3>
        {c.finalFour && <Badge color="#ff3860">Final Four</Badge>}
      </div>
      <ChallengePlacementsList placements={c.placements} gameType={c.gameType} rankDirection={rankDirection} />
    </Card>
  );
}

export function VoteRowsList({ rows, showComments }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ fontSize: 12, color: "#a68fd6", padding: "4px 8px", background: "#0d0618", borderRadius: 6 }}>
          <strong style={{ color: "#f5f0ff" }}>{r.voter}</strong> → <span style={{ color: r.nullified ? "#6b4f99" : "#ff3860" }}>{r.target}</span>
          {r.nullified && <span style={{ color: "#6b4f99" }}> (nullified)</span>}
          {showComments && r.reason && <div style={{ fontStyle: "italic", marginTop: 2 }}>"{r.reason}"</div>}
        </div>
      ))}
    </div>
  );
}

export function RoundCeremonyCard({ entry: e, challenge, rows, byId, showComments }) {
  const nominatorOrder = e.fatesNominatorOrder || [];
  const nominations = e.fatesNominations || {};
  const nominationReasons = e.fatesNominationReasons || {};
  const exiledNames = (e.exiledIds || []).map((id) => byId[id] || "?");
  const registryEntry = challenge?.gameType && GAME_REGISTRY[challenge.gameType];
  const rankDirection = registryEntry?.rank === "time-asc" ? "time-asc" : "score-desc";

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
          Round {e.round} Ceremony
        </h3>
        {e.mode === "save" && <Badge color="#ff3860">Double Elimination</Badge>}
      </div>

      {/* Challenge bubble — placements and scores */}
      {challenge && (
        <Card>
          <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            ⚔️ Battle{registryEntry && ` — ${registryEntry.icon} ${registryEntry.label}`}
          </div>
          <ChallengePlacementsList placements={challenge.placements} gameType={challenge.gameType} rankDirection={rankDirection} />
        </Card>
      )}

      {/* Fates Ceremony bubble — who nominated whom, in finishing order */}
      <Card>
        <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
          ⚖️ Fates Ceremony
        </div>
        {nominatorOrder.length > 0 ? (
          <div style={{ display: "grid", gap: 4 }}>
            {nominatorOrder.map((n) => (
              <div key={n.playerId}>
                <p style={{ fontSize: 12, color: "#f5f0ff", margin: 0 }}>
                  #{n.place} <strong>{n.name}</strong> nominated{" "}
                  <span style={{ color: "#ff3860" }}>{byId[nominations[n.playerId]] || "—"}</span>
                </p>
                {showComments && nominationReasons[n.playerId] && (
                  <p style={{ fontSize: 11, color: "#a68fd6", fontStyle: "italic", margin: "2px 0 0" }}>"{nominationReasons[n.playerId]}"</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 12, color: "#6b4f99", fontStyle: "italic", margin: 0 }}>
            Final Four — everyone besides the Battle winner was automatically nominated.
          </p>
        )}
      </Card>

      {/* Exile Vote bubble */}
      <Card>
        <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
          🃏 Exile Vote {e.mode === "save" ? "(voting to SAVE)" : "(voting to eliminate)"}
        </div>
        <p style={{ fontSize: 12, color: "#a68fd6", margin: "0 0 4px" }}>
          Nominees: {(e.nominees || []).map((n) => n.name).join(", ")}
        </p>
        {e.chaosHolderId && (
          <div style={{ margin: "0 0 4px" }}>
            <p style={{ fontSize: 11, color: "#a68fd6", fontStyle: "italic", margin: 0 }}>
              🃏 Power of Khaos held by {byId[e.chaosHolderId] || "?"}
              {e.nullifiedId && <> — nullified <strong>{byId[e.nullifiedId] || "?"}</strong>'s votes</>}
            </p>
            {showComments && e.nullifiedReason && (
              <p style={{ fontSize: 11, color: "#a68fd6", fontStyle: "italic", margin: "2px 0 0" }}>"{e.nullifiedReason}"</p>
            )}
          </div>
        )}
        <VoteRowsList rows={rows} showComments={showComments} />
        <p style={{ fontSize: 13, color: "#f5f0ff", margin: "8px 0 0", fontWeight: 700 }}>
          {exiledNames.length > 0
            ? <>💀 <span style={{ color: "#ff3860" }}>{exiledNames.join(" and ")}</span> {exiledNames.length > 1 ? "were" : "was"} exiled.</>
            : "No one was exiled this round."}
        </p>
      </Card>
    </div>
  );
}

export function FinaleCard({ finale, rows, byId, showComments }) {
  const winnerName = finale.winnerId ? byId[finale.winnerId] : null;
  return (
    <Card style={{ borderColor: "rgba(255,45,149,0.5)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🔥 The Finale</h3>
        {winnerName && <Badge color="#00ff9d">Winner: {winnerName}</Badge>}
      </div>
      <p style={{ fontSize: 12, color: "#a68fd6", margin: "0 0 4px" }}>
        Finalists: {(finale.finalists || []).map((f) => f.name).join(", ")}
      </p>
      {finale.chaosHolderId && (
        <div style={{ margin: "0 0 4px" }}>
          <p style={{ fontSize: 11, color: "#a68fd6", fontStyle: "italic", margin: 0 }}>
            🃏 Power of Khaos held by {byId[finale.chaosHolderId] || "?"}
            {finale.nullifiedFinalistId && <> — nullified <strong>{byId[finale.nullifiedFinalistId] || "?"}</strong>, who couldn't win</>}
          </p>
          {showComments && finale.nullifiedReason && (
            <p style={{ fontSize: 11, color: "#a68fd6", fontStyle: "italic", margin: "2px 0 0" }}>"{finale.nullifiedReason}"</p>
          )}
        </div>
      )}
      {finale.revealed ? (
        <>
          <VoteRowsList rows={rows} showComments={showComments} />
          {winnerName && (
            <p style={{ fontSize: 15, color: "#f5f0ff", margin: "10px 0 0", fontWeight: 700, textAlign: "center" }}>
              🏆 <span style={{ color: "#00ff9d" }}>{winnerName}</span> wins Project B!
            </p>
          )}
        </>
      ) : (
        <p style={{ fontSize: 12, color: "#6b4f99", fontStyle: "italic", margin: "6px 0 0" }}>
          Every exiled player is voting right now. The breakdown shows up here once it's revealed.
        </p>
      )}
    </Card>
  );
}
