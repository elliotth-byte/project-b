import { useState, useEffect } from "react";
import { Btn, Card, Badge } from "./ui";
import { storageUpdate, subscribeGameState } from "../lib/gameStorage";
import { KEY_FATES, KEY_CHALLENGE } from "../lib/gameState";
import { isValidNomination, nominationsComplete } from "../lib/fatesLogic";
import PostToGroupMe from "./PostToGroupMe";
import { requestAdvance } from "../lib/advanceNow";

export default function FatesHost({ gameId, players, round }) {
  const [fates, setFates] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_FATES, setFates);
    return unsubscribe;
  }, [gameId, round?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_CHALLENGE, setChallenge);
    return unsubscribe;
  }, [gameId, round?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  if (round?.phase !== "fates") {
    return <Card><p style={{ color: "#706050", fontStyle: "italic" }}>Not in the Fates Ceremony phase right now.</p></Card>;
  }
  if (!fates) return <Card><p style={{ color: "#706050", fontStyle: "italic" }}>Loading...</p></Card>;

  const winnerId = (challenge?.placements || []).find((p) => p.place === 1)?.playerId || null;
  const winnerName = players.find((p) => p.id === winnerId)?.display_name;
  const alive = players.filter((p) => p.approved && p.alive);

  const setNomination = async (nominatorId, nomineeId) => {
    await storageUpdate(gameId, KEY_FATES, (fresh) => {
      if (!fresh) return null;
      fresh.nominations = { ...(fresh.nominations || {}), [nominatorId]: nomineeId || undefined };
      if (!nomineeId) delete fresh.nominations[nominatorId];
      return fresh;
    });
  };

  const complete = nominationsComplete(fates.nominatorOrder, fates.nominations);

  const finishNow = async () => {
    setBusy(true);
    await requestAdvance(gameId, true);
    setBusy(false);
  };

  return (
    <Card>
      <h3 style={{ color: "#f0e6d3", margin: "0 0 4px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>⚖️ Fates Ceremony — Round {round.round}</h3>
      <p style={{ color: "#706050", fontSize: 12, margin: "0 0 12px", fontStyle: "italic" }}>
        {winnerName ? `${winnerName} won immunity and can't be nominated.` : ""} Nominations happen in finishing order — 1st among the top 3, then 2nd, then 3rd.
      </p>

      <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
        {fates.nominatorOrder.map((nominator) => {
          const currentNominee = fates.nominations?.[nominator.playerId] || "";
          return (
            <div key={nominator.playerId} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Badge>#{nominator.place}</Badge>
              <span style={{ width: 110, fontSize: 13, fontWeight: 700, color: "#f0e6d3", flexShrink: 0 }}>{nominator.name}</span>
              <select
                value={currentNominee}
                onChange={(e) => setNomination(nominator.playerId, e.target.value)}
                style={{ flex: 1, background: "#0a1020", border: "1px solid #253550", borderRadius: 6, padding: "6px 10px", color: "#f0e6d3", fontSize: 12 }}
              >
                <option value="">— choose nominee —</option>
                {alive.map((p) => {
                  const check = isValidNomination(nominator.playerId, p.id, winnerId);
                  return (
                    <option key={p.id} value={p.id} disabled={!check.ok}>
                      {p.display_name}{!check.ok ? ` (${check.error})` : ""}
                    </option>
                  );
                })}
              </select>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <Btn small onClick={finishNow} disabled={!complete || busy}>{busy ? "Working..." : "Lock Nominations & Continue"}</Btn>
      </div>
      {!complete && <p style={{ color: "#706050", fontSize: 11, fontStyle: "italic", margin: "0 0 12px" }}>Every one of the top 3 needs to submit a nomination first.</p>}

      <PostToGroupMe gameId={gameId} icon="⚖️" label="Fates Ceremony Announcement"
        text={`⚖️ The Fates Ceremony has begun. ${fates.nominatorOrder.map((n) => n.name).join(", ")} will each nominate one player for exile.`} />
    </Card>
  );
}
