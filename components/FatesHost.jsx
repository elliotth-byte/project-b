import { useState, useEffect } from "react";
import { Btn, Card, Badge } from "./ui";
import { storageUpdate, subscribeGameState } from "../lib/gameStorage";
import { KEY_FATES, KEY_CHALLENGE } from "../lib/gameState";
import { isValidNomination, nominationsComplete, takenNomineeIds } from "../lib/fatesLogic";
import { aphroditeBlocksTargeting, findAresImmunePlayerId } from "../lib/characterPowers";
import CopyMessage from "./CopyMessage";
import { requestAdvance } from "../lib/advanceNow";

export default function FatesHost({ gameId, players, round, settings }) {
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
    return <Card><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Not in the Fates Ceremony phase right now.</p></Card>;
  }
  if (!fates) return <Card><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Loading...</p></Card>;

  const winnerId = (challenge?.placements || []).find((p) => p.place === 1)?.playerId || null;
  const aresImmuneId = findAresImmunePlayerId(players, settings, round);
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
    const result = await requestAdvance(gameId, true);
    setBusy(false);
    if (result.error) alert("Couldn't move on: " + result.error);
  };

  return (
    <Card>
      <h3 style={{ color: "#f5f0ff", margin: "0 0 4px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>⚖️ Fates Ceremony — Round {round.round}</h3>
      <p style={{ color: "#6b4f99", fontSize: 12, margin: "0 0 12px", fontStyle: "italic" }}>
        {winnerName ? `${winnerName} won immunity and can't be nominated.` : ""} Nominations happen in finishing order — 1st among the top 3, then 2nd, then 3rd. Nominees can't be duplicated.
      </p>

      <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
        {fates.nominatorOrder.map((nominator) => {
          const currentNominee = fates.nominations?.[nominator.playerId] || "";
          const reason = fates.nominationReasons?.[nominator.playerId];
          const taken = takenNomineeIds(fates.nominations, nominator.playerId);
          const aphroditeBlockedId = aphroditeBlocksTargeting(players, settings, nominator.playerId);
          return (
            <div key={nominator.playerId}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Badge>#{nominator.place}</Badge>
                <span style={{ width: 110, fontSize: 13, fontWeight: 700, color: "#f5f0ff", flexShrink: 0 }}>{nominator.name}</span>
                <select
                  value={currentNominee}
                  onChange={(e) => setNomination(nominator.playerId, e.target.value)}
                  style={{ flex: 1, background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 6, padding: "6px 10px", color: "#f5f0ff", fontSize: 12 }}
                >
                  <option value="">— choose nominee —</option>
                  {alive.map((p) => {
                    const check = isValidNomination(nominator.playerId, p.id, winnerId, taken, aphroditeBlockedId, aresImmuneId);
                    return (
                      <option key={p.id} value={p.id} disabled={!check.ok && p.id !== currentNominee}>
                        {p.display_name}{!check.ok && p.id !== currentNominee ? ` (${check.error})` : ""}
                      </option>
                    );
                  })}
                </select>
              </div>
              {currentNominee && reason && (
                <p style={{ fontSize: 11, color: "#a68fd6", fontStyle: "italic", margin: "4px 0 0 42px" }}>"{reason}"</p>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <Btn small onClick={finishNow} disabled={!complete || busy}>{busy ? "Working..." : "Lock Nominations & Continue"}</Btn>
      </div>
      {!complete && <p style={{ color: "#6b4f99", fontSize: 11, fontStyle: "italic", margin: "0 0 12px" }}>Every one of the top 3 needs to submit a nomination first.</p>}

      <CopyMessage icon="⚖️" label="Fates Ceremony Announcement"
        text={`The fates come for us all. In Greek legend, three decide your fate — one weaves, one measures, one cuts. Today, your fate lies in the hands of three of your fellow players. Whose thread will be permanently cut short?\n\n⚖️ The Fates Ceremony has begun. ${fates.nominatorOrder.map((n) => n.name).join(", ")} will each nominate one player for exile.`} />
    </Card>
  );
}
