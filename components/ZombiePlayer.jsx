import { useState, useEffect } from "react";
import { Btn, Card, Badge } from "./traitorsUi";
import { storageUpdate, subscribeGameState } from "../lib/gameStorage";
import { ANTIDOTE_WINDOW, STORAGE_KEY_ZOMBIE, haveTouched, resolveTouch } from "../lib/zombieData";

// ─── Zombie Game: Player View ───
//
// Reworked against the real format's rules after the earlier version got
// two things wrong:
//
// 1. TOUCHES NEED CONSENT. A real touch is two people simultaneously
//    placing a hand on a shared table — nothing happens unless both agree.
//    This version is request → accept/decline, resolved only once the
//    other player actually accepts.
//
// 2. STATUS IS SECRET — genuinely, not just hidden behind a click. In the
//    real format, only the two original zombies are ever told their
//    status. A human who gets infected mid-game is NEVER informed — the
//    antidote exists precisely because of that uncertainty ("I *think* I
//    might have touched a zombie"), not as a cure you reach for once
//    you're sure. So: this screen never displays your status unless
//    you're one of the two original zombies, and every UI element
//    (including which buttons are enabled) is deliberately built to never
//    leak status through a side channel either — e.g. the antidote button
//    always shows the identical confirmation message whether or not it
//    actually did anything, so its wording can't be used to deduce status.
//
// One honest limitation worth knowing: this project's shared `game_state`
// table is readable by any player in the game at the database level (see
// the Traitor Roles conversion notes for why that table works that way).
// The UI here never shows anyone's status, but a technically determined
// player could still read the raw data via browser dev tools. Locking
// that down fully would mean moving Zombie's truth into a server-mediated
// system the way Traitor Roles' host_state table does — a bigger change
// than this pass covers, flagged here rather than silently left undone.
export default function ZombiePlayer({ gameId, playerName }) {
  const [st, setSt] = useState(null);
  const [antidoteClicked, setAntidoteClicked] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_ZOMBIE, setSt);
    return unsubscribe;
  }, [gameId]);

  if (!st || !st.active) return null;
  if (st.paused) return (
    <Card style={{ borderColor: "rgba(201,168,76,0.3)", textAlign: "center" }}>
      <div style={{ fontSize: 28, marginBottom: 6 }}>🧟</div>
      <div style={{ color: "#c9a84c", fontWeight: 700 }}>Zombie Game is paused</div>
    </Card>
  );

  const isParticipant = !st.participants || st.participants.includes(playerName);
  if (st.participants && !isParticipant) {
    return (
      <Card style={{ borderColor: "rgba(196,92,60,0.3)", textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>🧟</div>
        <div style={{ color: "#c9a84c", fontWeight: 700 }}>You're spectating the Zombie Game</div>
        <p style={{ color: "#a09080", fontSize: 12, marginTop: 4 }}>
          {st.winner ? (st.winner.type === "zombies" ? "The zombies won — everyone turned." : `Human winner(s): ${st.winner.names.join(", ")}.`) : "No controls for you here — just watch the outcome."}
        </p>
      </Card>
    );
  }

  const isOriginalZombie = st.originalZombies.includes(playerName);
  const others = st.players.filter((p) => p.name !== playerName);
  const myOutgoing = (st.pending || []).find((p) => p.from === playerName);
  const myIncoming = (st.pending || []).filter((p) => p.to === playerName);

  const requestTouch = async (targetName) => {
    const res = await storageUpdate(gameId, STORAGE_KEY_ZOMBIE, (fresh) => {
      if (!fresh || fresh.winner) return null;
      if (haveTouched(fresh, playerName, targetName)) return null;
      // If they already asked to touch me, this action is the accept.
      const incomingIdx = (fresh.pending || []).findIndex((p) => p.from === targetName && p.to === playerName);
      if (incomingIdx !== -1) {
        resolveTouch(fresh, fresh.round, targetName, playerName);
        fresh.pending = fresh.pending.filter((_, i) => i !== incomingIdx);
        return fresh;
      }
      fresh.pending = (fresh.pending || []).filter((p) => p.from !== playerName);
      fresh.pending.push({ from: playerName, to: targetName, time: Date.now() });
      return fresh;
    });
    if (res.ok) setSt(res.value);
  };

  const cancelMyRequest = async () => {
    const res = await storageUpdate(gameId, STORAGE_KEY_ZOMBIE, (fresh) => {
      if (!fresh) return null;
      fresh.pending = (fresh.pending || []).filter((p) => p.from !== playerName);
      return fresh;
    });
    if (res.ok) setSt(res.value);
  };

  const acceptRequest = async (fromName) => {
    const res = await storageUpdate(gameId, STORAGE_KEY_ZOMBIE, (fresh) => {
      if (!fresh) return null;
      const idx = (fresh.pending || []).findIndex((p) => p.from === fromName && p.to === playerName);
      if (idx === -1) return null;
      resolveTouch(fresh, fresh.round, fromName, playerName);
      fresh.pending = fresh.pending.filter((_, i) => i !== idx);
      return fresh;
    });
    if (res.ok) setSt(res.value);
  };

  const declineRequest = async (fromName) => {
    const res = await storageUpdate(gameId, STORAGE_KEY_ZOMBIE, (fresh) => {
      if (!fresh) return null;
      fresh.pending = (fresh.pending || []).filter((p) => !(p.from === fromName && p.to === playerName));
      return fresh;
    });
    if (res.ok) setSt(res.value);
  };

  // Always resolves to the exact same visible outcome no matter what
  // actually happened underneath — that's deliberate, see file header.
  const useAntidote = async () => {
    setAntidoteClicked(true);
    await storageUpdate(gameId, STORAGE_KEY_ZOMBIE, (fresh) => {
      if (!fresh) return fresh;
      if (fresh.antidoteUsed?.[playerName]) return fresh;
      fresh.antidoteUsed = fresh.antidoteUsed || {};
      fresh.antidoteUsed[playerName] = true;
      const inf = fresh.infectionTimes[playerName];
      if (!fresh.originalZombies.includes(playerName) && fresh.statuses[playerName] === "zombie" && inf && Date.now() - inf <= ANTIDOTE_WINDOW) {
        fresh.statuses[playerName] = "human";
      }
      return fresh;
    });
  };

  return (
    <Card style={{ marginBottom: 20, borderColor: "rgba(201,168,76,0.4)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#c9a84c", margin: 0, fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🧟 Zombie Game</h3>
        <Badge color="#c45c3c">Round {st.round}/{st.maxRounds}</Badge>
      </div>

      {isOriginalZombie && (
        <div style={{ background: "rgba(196,92,60,0.1)", border: "1px solid rgba(196,92,60,0.3)", borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: "#c45c3c" }}>🧟 You are one of the two original zombies. Keep it to yourself.</span>
        </div>
      )}

      <div style={{ textAlign: "center", padding: "6px 0", marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: "#a09080" }}>Your score</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#c9a84c" }}>{st.scores?.[playerName] ?? 0}</div>
      </div>

      {st.winner ? (
        <p style={{ textAlign: "center", color: "#7a9a5c", fontSize: 13 }}>
          {st.winner.type === "zombies" ? "The zombies have won." : `Winner${st.winner.names.length > 1 ? "s" : ""}: ${st.winner.names.join(", ")}`}
        </p>
      ) : (
        <>
          {myIncoming.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: "#a09080", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Wants to touch you</div>
              {myIncoming.map((req) => (
                <div key={req.from} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#132038", border: "1px solid #c9a84c55", borderRadius: 8, padding: "8px 12px", marginBottom: 4 }}>
                  <span style={{ fontSize: 14, color: "#f0e6d3" }}>{req.from}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Btn small onClick={() => acceptRequest(req.from)}>Accept</Btn>
                    <Btn small variant="ghost" onClick={() => declineRequest(req.from)}>Decline</Btn>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p style={{ fontSize: 12, color: "#a09080", margin: "0 0 6px", fontStyle: "italic" }}>
            Touching needs both of you to agree. Request a touch, and you'll each score or something else may happen — you won't be told which.
          </p>
          <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
            {others.map((p) => {
              const touched = haveTouched(st, playerName, p.name);
              const requestedByMe = myOutgoing?.to === p.name;
              if (touched) {
                return (
                  <div key={p.id} style={{ padding: "10px 14px", borderRadius: 8, background: "#0a1020", border: "1px solid #253550", color: "#706050", fontSize: 14 }}>
                    ✓ {p.name} — already touched
                  </div>
                );
              }
              if (requestedByMe) {
                return (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 8, background: "#132038", border: "1px solid #c9a84c55" }}>
                    <span style={{ fontSize: 14, color: "#c9a84c" }}>Waiting on {p.name}...</span>
                    <Btn small variant="ghost" onClick={cancelMyRequest}>Cancel</Btn>
                  </div>
                );
              }
              return (
                <button key={p.id} onClick={() => requestTouch(p.name)} disabled={!!myOutgoing} style={{
                  padding: "10px 14px", borderRadius: 8, textAlign: "left",
                  background: "#132038", border: "1px solid #c9a84c55",
                  color: myOutgoing ? "#706050" : "#f0e6d3", cursor: myOutgoing ? "not-allowed" : "pointer", fontSize: 14,
                }}>
                  ✋ Request touch: {p.name}
                </button>
              );
            })}
          </div>

          {!antidoteClicked && !st.antidoteUsed?.[playerName] && !isOriginalZombie && (
            <Btn variant="success" onClick={useAntidote}>💊 Use Antidote</Btn>
          )}
          {(antidoteClicked || st.antidoteUsed?.[playerName]) && !isOriginalZombie && (
            <p style={{ fontSize: 12, color: "#7a9a5c" }}>💊 Antidote administered.</p>
          )}
        </>
      )}

      <div style={{ marginTop: 10, fontSize: 11, color: "#706050" }}>
        {(st.roundSummaries || []).map((s) => <div key={s.round}>Round {s.round}: {s.humans} humans, {s.zombies} zombies</div>)}
      </div>
    </Card>
  );
}
