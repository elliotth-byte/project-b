import { useState, useEffect } from "react";
import { Btn, Card, PausedBanner } from "./traitorsUi";
import { storageUpdate, subscribeGameState } from "../lib/gameStorage";
import { VOODOO_HOUR, VOODOO_LIMBS, STORAGE_KEY_VOODOO } from "../lib/voodooData";
import { logChallengeResult } from "../lib/challengeHistory";

// ─── Voodoo Doll: Player View ───
export default function VoodooPlayer({ gameId, playerName }) {
  const [st, setSt] = useState(null);
  const [selDoll, setSelDoll] = useState(null);
  const [guessOwner, setGuessOwner] = useState("");
  const [justCorrect, setJustCorrect] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_VOODOO, setSt);
    return unsubscribe;
  }, [gameId]);

  if (!st || !st.active) return null;
  if (st.paused) return <PausedBanner icon="🪆" title="Voodoo Doll" />;

  const isParticipant = !st.participants || st.participants.includes(playerName);
  if (st.participants && !isParticipant) {
    return (
      <Card style={{ marginBottom: 20, borderColor: "rgba(124,58,237,0.3)", textAlign: "center" }}>
        <h3 style={{ color: "#c9a84c", margin: "0 0 6px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🪆 Voodoo Doll</h3>
        <p style={{ color: "#a09080", fontSize: 13, margin: 0, fontStyle: "italic" }}>
          {st.winner ? `${(Array.isArray(st.winner) ? st.winner : [st.winner]).join(", ")} was last standing.` : "You're spectating this round."}
        </p>
      </Card>
    );
  }

  const last = st.lastRevealAt?.[playerName] || 0;
  const canReveal = Date.now() - last >= VOODOO_HOUR;
  const msLeft = VOODOO_HOUR - (Date.now() - last);
  const eliminated = st.eliminated.includes(playerName);
  const guessCooldown = st.guessCooldownUntil?.[playerName] || 0;
  const canGuess = Date.now() >= guessCooldown;
  const guessMsLeft = guessCooldown - Date.now();

  // A limb is used up for EVERYONE the instant any one player pricks it —
  // that's the actual fix here. Before, the 5 limb buttons were purely
  // cosmetic and every one of them did the same random-reveal action, so
  // there was nothing to lock and no way for other players to see that a
  // limb had already been tried.
  const doReveal = async (dollId, limb) => {
    if (!canReveal) return;
    const res = await storageUpdate(gameId, STORAGE_KEY_VOODOO, (fresh) => {
      if (!fresh) return null;
      if (Date.now() - (fresh.lastRevealAt?.[playerName] || 0) < VOODOO_HOUR) return null;
      const doll = fresh.dolls.find((d) => d.dollId === dollId);
      if (!doll || (doll.prickedLimbs || []).includes(limb)) return null;
      doll.prickedLimbs = [...(doll.prickedLimbs || []), limb];
      const idxs = doll.limbMap?.[limb] || [];
      doll.revealedIndices = [...new Set([...doll.revealedIndices, ...idxs])];
      fresh.lastRevealAt = { ...(fresh.lastRevealAt || {}), [playerName]: Date.now() };
      return fresh;
    });
    if (res.ok) setSt(res.value);
  };

  const submitGuess = async (dollId) => {
    if (!guessOwner || !canGuess) return;
    let correct = false;
    const res = await storageUpdate(gameId, STORAGE_KEY_VOODOO, (fresh) => {
      if (!fresh) return null;
      if (Date.now() < (fresh.guessCooldownUntil?.[playerName] || 0)) return null;
      const doll = fresh.dolls.find((d) => d.dollId === dollId);
      correct = !!(doll && doll.owner === guessOwner);
      fresh.guesses = fresh.guesses || {};
      fresh.guesses[playerName] = [...(fresh.guesses[playerName] || []), { dollId, guessedOwner: guessOwner, correct, time: Date.now() }];
      if (correct) {
        // Fully reveal this doll — the eulogy AND the owner's name become
        // public the instant they're eliminated, not just "(revealed)"
        // with no actual name attached, which is what happened before.
        doll.fullyRevealed = true;
        for (let i = 0; i < doll.eulogy.length; i++) if (!doll.revealedIndices.includes(i)) doll.revealedIndices.push(i);
        if (!fresh.eliminated.includes(doll.owner)) fresh.eliminated.push(doll.owner);
        const remain = fresh.players.filter((p) => !fresh.eliminated.includes(p.name));
        const target = Math.max(1, fresh.numWinners || 1);
        if (remain.length <= target && !fresh.winner) fresh.winner = remain.map((p) => p.name);
        // Correct guess: no cooldown applied — you get an immediate
        // follow-up guess within the same hour, per house rules.
      } else {
        // Wrong guess costs you the rest of this hour.
        fresh.guessCooldownUntil = { ...(fresh.guessCooldownUntil || {}), [playerName]: Date.now() + VOODOO_HOUR };
      }
      return fresh;
    });
    if (res.ok) {
      setSt(res.value);
      setGuessOwner("");
      if (correct) { setJustCorrect(true); setTimeout(() => setJustCorrect(false), 4000); }
      if (res.value.winner) logChallengeResult(gameId, { challenge: "Voodoo Doll", winners: res.value.winner });
    }
  };

  const renderEulogy = (doll) => doll.eulogy.split("").map((ch, i) => (!/[a-zA-Z]/.test(ch) || doll.revealedIndices.includes(i)) ? ch : "_").join("");
  const myGuesses = st.guesses?.[playerName] || [];

  return (
    <Card style={{ marginBottom: 20, borderColor: "rgba(124,58,237,0.3)" }}>
      <h3 style={{ color: "#c9a84c", margin: "0 0 6px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🪆 Voodoo Doll</h3>
      {st.winner ? (
        <p style={{ textAlign: "center", color: "#c9a84c", padding: 10 }}>🏆 {(Array.isArray(st.winner) ? st.winner : [st.winner]).join(", ")} — last standing!</p>
      ) : eliminated ? (
        <p style={{ textAlign: "center", color: "#c45c3c", padding: 10 }}>💀 You have been identified and eliminated.</p>
      ) : (
        <>
          {justCorrect && (
            <p style={{ fontSize: 13, color: "#7a9a5c", fontWeight: 700, margin: "0 0 6px" }}>🎉 Correct! You get an immediate follow-up guess.</p>
          )}
          <p style={{ fontSize: 12, color: "#a09080", margin: "0 0 6px", fontStyle: "italic" }}>
            {canReveal ? "You may prick one un-pricked limb to reveal its letters." : `Next limb reveal in ${Math.ceil(msLeft / 60000)} min.`}
          </p>
          {st.dolls.map((d) => {
            const dollEliminated = st.eliminated.includes(d.owner);
            return (
              <div key={d.dollId} style={{ background: "#0a1020", borderRadius: 8, padding: 8, marginBottom: 6, border: selDoll === d.dollId ? "1px solid #c9a84c" : "1px solid #253550" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: dollEliminated ? "#706050" : "#f0e6d3" }}>
                    Doll {d.dollId}{dollEliminated ? ` → ${d.owner} (eliminated)` : ""}
                  </span>
                  {!dollEliminated && <button onClick={() => setSelDoll(d.dollId)} style={{ fontSize: 11, background: "transparent", border: "1px solid #253550", borderRadius: 5, color: "#a09080", cursor: "pointer", padding: "2px 8px" }}>select</button>}
                </div>
                <div style={{ fontSize: 12, color: "#c9a84c", fontFamily: "'Courier New', monospace", wordBreak: "break-word", marginBottom: 4 }}>{renderEulogy(d)}</div>
                {!dollEliminated && (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {VOODOO_LIMBS.map((limb) => {
                      const used = (d.prickedLimbs || []).includes(limb);
                      return (
                        <button
                          key={limb} disabled={!canReveal || used} onClick={() => doReveal(d.dollId, limb)}
                          style={{
                            fontSize: 10, padding: "3px 6px", borderRadius: 5,
                            cursor: (canReveal && !used) ? "pointer" : "not-allowed",
                            background: used ? "#0a1020" : (canReveal ? "#132038" : "#0a1020"),
                            border: `1px solid ${used ? "#c45c3c55" : "#253550"}`,
                            color: used ? "#706050" : (canReveal ? "#a09080" : "#706050"),
                            textDecoration: used ? "line-through" : "none",
                          }}
                        >{limb}{used ? " ✓" : ""}</button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {!canGuess ? (
            <p style={{ fontSize: 12, color: "#706050", marginTop: 8 }}>No guesses left this hour — next one available in {Math.ceil(guessMsLeft / 60000)} min.</p>
          ) : (
            <div style={{ marginTop: 8 }}>
              <p style={{ fontSize: 12, color: "#a09080", margin: "0 0 4px" }}>Guess: who owns Doll {selDoll || "?"}</p>
              <div style={{ display: "flex", gap: 6 }}>
                <select value={guessOwner} onChange={(e) => setGuessOwner(e.target.value)} style={{ flex: 1, background: "#0a1020", border: "1px solid #253550", borderRadius: 6, padding: "6px 8px", color: "#f0e6d3", fontSize: 12 }}>
                  <option value="">Guess owner...</option>
                  {st.players.filter((p) => p.name !== playerName).map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
                <Btn small onClick={() => submitGuess(selDoll)} disabled={!selDoll || !guessOwner}>Guess</Btn>
              </div>
            </div>
          )}
          {myGuesses.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 11, color: "#706050" }}>
              {myGuesses.slice(-3).reverse().map((g, i) => (
                <div key={i}>Guessed Doll {g.dollId} = {g.guessedOwner}: {g.correct ? <span style={{ color: "#7a9a5c" }}>correct</span> : <span style={{ color: "#c45c3c" }}>wrong</span>}</div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
