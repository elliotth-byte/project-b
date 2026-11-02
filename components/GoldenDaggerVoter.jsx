import { useState, useEffect } from "react";
import { Card } from "./traitorsUi";
import { subscribeGameState } from "../lib/gameStorage";
import { STORAGE_KEY_ROUND_INFO } from "../lib/roundtableData";
import { subscribeGoldenDagger, fetchGoldenDagger, castGoldenVote } from "../lib/goldenDagger";

const GOLD = "#e0b84c";

// ─── Golden Dagger: Player View ───
// Renders ONLY for the one player who currently holds the dagger, and
// nothing at all for everyone else — including whether a dagger exists.
// That's enforced by the database, not just here: the golden_daggers row is
// only readable by the host and the holder's own account (see
// sql/add-golden-dagger.sql), so for any other player `dagger` below is
// simply null. Casting goes through the cast_golden_vote function, which
// re-checks on the server that the caller is the holder, voting is open for
// this round, and the target is a living player other than themselves.
export default function GoldenDaggerVoter({ gameId, playerName }) {
  const [roundInfo, setRoundInfo] = useState(null);
  const [dagger, setDagger] = useState(null);
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_ROUND_INFO, setRoundInfo);
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    const unsubscribe = subscribeGoldenDagger(gameId, setDagger);
    return unsubscribe;
  }, [gameId]);

  // The host can read the golden_daggers row too (and may be playing), so
  // "I got a row back" doesn't prove I'm the holder — compare ids.
  const me = (roundInfo?.players || []).find((p) => p.name === playerName);
  const isHolder = !!(dagger && me && dagger.player_id === me.id);
  if (!isHolder || !roundInfo) return null;

  const votingOpen = !!roundInfo.votingOpen;
  const castThisRound = !!(dagger.vote_target && dagger.vote_round === roundInfo.round);
  if (!votingOpen && !castThisRound) return null;

  const others = (roundInfo.players || []).filter((p) => p.name !== playerName);

  const submit = async () => {
    if (!target || busy) return;
    setBusy(true);
    setError(null);
    const res = await castGoldenVote(gameId, roundInfo.round, target, reason.trim());
    if (res.ok) {
      setDagger(await fetchGoldenDagger(gameId));
      setEditing(false);
    } else {
      setError("That vote couldn't be recorded — voting may have just closed. Try again if it's still open.");
    }
    setBusy(false);
  };

  const startEdit = () => {
    setTarget(dagger.vote_target || "");
    setReason(dagger.vote_reason || "");
    setError(null);
    setEditing(true);
  };

  const cardStyle = {
    marginBottom: 20, border: `2px solid ${GOLD}`,
    background: "linear-gradient(160deg, #1d1808 0%, #0e1830 100%)",
    boxShadow: "0 0 22px rgba(224,184,76,0.22)",
  };
  const heading = (
    <>
      <div style={{ fontSize: 28, textAlign: "center", marginBottom: 4 }}>🏆</div>
      <h3 style={{ color: GOLD, textAlign: "center", margin: "0 0 4px", fontSize: 17, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>
        The Golden Dagger
      </h3>
    </>
  );

  if (castThisRound && !editing) {
    return (
      <Card style={cardStyle}>
        {heading}
        <p style={{ color: "#f0e6d3", fontSize: 15, textAlign: "center", margin: "0 0 6px" }}>
          Your extra vote: <strong style={{ color: GOLD }}>{dagger.vote_target}</strong>
        </p>
        {dagger.vote_reason && (
          <p style={{ color: "#a09080", fontSize: 13, fontStyle: "italic", textAlign: "center", margin: "0 0 10px" }}>"{dagger.vote_reason}"</p>
        )}
        <p style={{ color: "#706050", fontSize: 12, textAlign: "center", margin: "0 0 12px" }}>
          Only you know you hold the dagger. It stays secret until the host reveals the votes.
        </p>
        {votingOpen && (
          <div style={{ textAlign: "center" }}>
            <button onClick={startEdit} style={{
              background: "transparent", border: "1px solid #253550", borderRadius: 10, padding: "10px 24px",
              color: "#a09080", fontSize: 14, cursor: "pointer", fontFamily: "'Palatino Linotype', Palatino, Georgia, serif",
            }}>Change My Extra Vote</button>
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card style={cardStyle}>
      {heading}
      <p style={{ color: "#a09080", fontSize: 13, textAlign: "center", margin: "0 0 14px", fontStyle: "italic" }}>
        You hold the Golden Dagger. Cast a second vote this round — in secret.
      </p>
      <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
        {others.map((p) => (
          <button key={p.id} onClick={() => setTarget(p.name)} style={{
            background: target === p.name ? "rgba(224,184,76,0.14)" : "#0a1020",
            border: `2px solid ${target === p.name ? GOLD : "#253550"}`, borderRadius: 10, padding: "12px 18px",
            cursor: "pointer", color: target === p.name ? GOLD : "#f0e6d3", fontSize: 15,
            fontWeight: target === p.name ? 700 : 500, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif",
            textAlign: "left", width: "100%",
          }}>{target === p.name ? "🏆  " : ""}{p.name}</button>
        ))}
        {others.length === 0 && <p style={{ color: "#706050", fontSize: 12, fontStyle: "italic" }}>No other players yet.</p>}
      </div>
      {target && (
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={`Why ${target}? (optional)`} rows={2}
          style={{
            width: "100%", background: "#0a1020", border: "1px solid #253550", borderRadius: 10, padding: "12px 16px",
            color: "#f0e6d3", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif",
            resize: "vertical", outline: "none", boxSizing: "border-box", lineHeight: 1.6, marginBottom: 12,
          }} />
      )}
      {error && <p style={{ color: "#c45c3c", fontSize: 12, margin: "0 0 10px" }}>{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={submit} disabled={!target || busy} style={{
          flex: 1, background: target && !busy ? `linear-gradient(135deg, ${GOLD}, #b8943e)` : "#253550",
          color: target && !busy ? "#0c1425" : "#706050", border: "none", borderRadius: 10, padding: "14px 24px",
          fontSize: 16, fontWeight: 700, cursor: target && !busy ? "pointer" : "not-allowed",
          fontFamily: "'Palatino Linotype', Palatino, Georgia, serif", letterSpacing: 0.5,
        }}>{busy ? "Casting..." : castThisRound ? "Update Extra Vote" : "Cast Golden Vote"}</button>
        {editing && (
          <button onClick={() => setEditing(false)} style={{
            background: "transparent", border: "1px solid #253550", borderRadius: 10, padding: "14px 18px",
            color: "#a09080", fontSize: 14, cursor: "pointer",
          }}>Cancel</button>
        )}
      </div>
    </Card>
  );
}
