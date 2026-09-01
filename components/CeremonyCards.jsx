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

// ─── Identity Reveal ───
// The "who was actually who" moment every alias season builds toward —
// shown once the season is truly over (see gameEnded gating at the
// call sites in CeremonyPlayer.jsx/HistoryTab.jsx), covering the WHOLE
// cast rather than just the three finalists FinaleCard itself is scoped
// to. Uses real_display_name specifically, not display_name — the two
// resolution functions that build the players list passed in here
// (resolveIdentities for players, resolveIdentitiesForHost for the
// host) format display_name completely differently from each other
// (a bare alias mid-season vs. a host-only "Real (Alias)" combined
// string), but both set real_display_name the exact same way
// regardless of which one ran upstream — that consistency is what
// makes this safe to reuse from both call sites without needing to
// know which one produced the list. Filters to players who actually
// have an alias on record — someone who joined after alias mode was
// turned on, or never finished onboarding, has nothing to reveal.
export function IdentityRevealCard({ players }) {
  const revealed = (players || []).filter((p) => p.approved && p.alias);
  if (revealed.length === 0) return null;
  return (
    <Card>
      <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
        🎭 Who Was Who
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
        {revealed.map((p) => (
          <div key={p.id} style={{ background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "8px 10px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#ff2d95" }}>{p.alias}</div>
            <div style={{ fontSize: 11, color: "#a68fd6" }}>{p.real_display_name}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function FinaleCard({ finale, rows, byId, showComments, qa }) {
  const winnerName = finale.winnerId ? byId[finale.winnerId] : null;
  const statementEntries = Object.entries(qa?.statements || {});
  const questions = qa?.questions || [];
  return (
    <Card style={{ borderColor: "rgba(255,45,149,0.5)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🔥 The Finale</h3>
        {winnerName && <Badge color="#00ff9d">Winner: {winnerName}</Badge>}
      </div>
      <p style={{ fontSize: 12, color: "#a68fd6", margin: "0 0 4px" }}>
        Finalists: {(finale.finalists || []).map((f) => byId[f.playerId] || f.name).join(", ")}
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

      {/* Final Statements and Jury Q&A bubble — not secret (visible to
          everyone live during the Finale itself), so this shows
          regardless of finale.revealed, matching how a regular round's
          Battle/Fates results already show before that round's Exile
          Vote tally is revealed. This is what "a ceremony like all
          rounds" was actually missing here — the vote tally alone told
          you WHO won, but none of the pitch or questioning that led up
          to it, unlike every regular round's ceremony which preserves
          the full nomination reasoning. Names resolved via byId rather
          than any name stored on the statement/question itself
          (finale.finalists[].name, q.jurorName) — those are frozen at
          whenever they were first written, which would never correctly
          reveal real names once the game actually ends; byId reacts to
          that the same way the rest of this card already does. */}
      {(statementEntries.length > 0 || questions.length > 0) && (
        <Card style={{ marginBottom: 10 }}>
          {statementEntries.length > 0 && (
            <div style={{ marginBottom: questions.length > 0 ? 14 : 0 }}>
              <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                🎤 Final Statements
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {statementEntries.map(([finalistId, s]) => (
                  <div key={finalistId}>
                    <p style={{ fontSize: 12, color: "#f5f0ff", fontWeight: 700, margin: "0 0 2px" }}>{byId[finalistId] || "?"}</p>
                    <p style={{ fontSize: 12, color: "#a68fd6", margin: 0, whiteSpace: "pre-wrap" }}>{s.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {questions.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                ❓ Jury Questions
              </div>
              <div style={{ display: "grid", gap: 12 }}>
                {questions.map((q) => (
                  <div key={q.id}>
                    <p style={{ fontSize: 12, color: "#ff3860", fontWeight: 700, margin: "0 0 2px" }}>{byId[q.jurorId] || q.jurorName} asks:</p>
                    <p style={{ fontSize: 12, color: "#f5f0ff", margin: "0 0 6px", whiteSpace: "pre-wrap" }}>{q.text}</p>
                    <div style={{ display: "grid", gap: 4, paddingLeft: 10, borderLeft: "2px solid #3d1f5c" }}>
                      {(finale.finalists || []).map((f) => {
                        const r = q.responses?.[f.playerId];
                        if (!r) return null;
                        return (
                          <p key={f.playerId} style={{ fontSize: 11, color: "#a68fd6", margin: 0 }}>
                            <strong style={{ color: "#f5f0ff" }}>{byId[f.playerId] || f.name}:</strong> {r.text}
                          </p>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {finale.revealed ? (
        <>
          <VoteRowsList rows={rows} showComments={showComments} />
          {winnerName && (
            <p style={{ fontSize: 15, color: "#f5f0ff", margin: "10px 0 0", fontWeight: 700, textAlign: "center" }}>
              🏆 <span style={{ color: "#00ff9d" }}>{winnerName}</span> wins Panopticon!
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
