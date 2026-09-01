import { useState, useEffect } from "react";
import { Btn, Card, PausedBanner } from "./traitorsUi";
import { storageUpdate, subscribeGameState } from "../lib/gameStorage";
import { STORAGE_KEY_PIGGY } from "../lib/piggyData";

// ─── Piggy Bank: Player View ───
export default function PiggyPlayer({ gameId, playerName }) {
  const [st, setSt] = useState(null);
  const [alloc, setAlloc] = useState({});

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_PIGGY, setSt);
    return unsubscribe;
  }, [gameId]);

  if (!st || !st.active) return null;
  if (st.paused) return <PausedBanner icon="🐷" title="Piggy Bank" />;

  const isParticipant = !st.participants || st.participants.includes(playerName);
  if (st.participants && !isParticipant) {
    return (
      <Card style={{ marginBottom: 20, borderColor: "rgba(201,168,76,0.3)", textAlign: "center" }}>
        <h3 style={{ color: "#c9a84c", margin: "0 0 6px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🐷 Piggy Bank</h3>
        <p style={{ color: "#a09080", fontSize: 13, margin: 0, fontStyle: "italic" }}>
          {st.revealed ? (st.winners?.length ? `Winner(s): ${st.winners.join(", ")}.` : "No eligible winner.") : "You're spectating — allocations are hidden until reveal anyway."}
        </p>
      </Card>
    );
  }

  const submitted = st.submitted.includes(playerName);
  const targets = st.players; // now includes yourself — you can feed your own bank
  const total = Object.values(alloc).reduce((a, b) => a + (b || 0), 0);
  const usedTargets = Object.entries(alloc).filter(([, v]) => v > 0).length;
  const valid = total === 13 && usedTargets >= 2;

  const submit = async () => {
    if (!valid) return;
    const res = await storageUpdate(gameId, STORAGE_KEY_PIGGY, (fresh) => {
      if (!fresh || fresh.submitted.includes(playerName)) return null;
      fresh.allocations[playerName] = Object.fromEntries(Object.entries(alloc).filter(([, v]) => v > 0));
      fresh.submitted = [...fresh.submitted, playerName];
      return fresh;
    });
    if (res.ok) setSt(res.value);
  };

  return (
    <Card style={{ marginBottom: 20, borderColor: "rgba(201,168,76,0.3)" }}>
      <h3 style={{ color: "#c9a84c", margin: "0 0 6px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🐷 Piggy Bank</h3>
      {submitted ? (
        <p style={{ color: "#7a9a5c", fontSize: 13, textAlign: "center", padding: 10 }}>✓ Your 13 coins are placed. Await the reveal.</p>
      ) : (
        <>
          <p style={{ fontSize: 12, color: "#a09080", margin: "0 0 8px", fontStyle: "italic" }}>
            Spread exactly 13 coins across at least 2 banks — including your own, if you want.
          </p>
          <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
            {targets.map((p) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0a1020", borderRadius: 6, padding: "6px 10px" }}>
                <span style={{ fontSize: 13, color: "#f0e6d3" }}>{p.name}{p.name === playerName ? " (you)" : ""}</span>
                <input
                  type="number" min={0} max={13} value={alloc[p.name] || 0}
                  onChange={(e) => setAlloc({ ...alloc, [p.name]: Math.max(0, Math.min(13, Number(e.target.value) || 0)) })}
                  style={{ width: 56, background: "#132038", border: "1px solid #253550", borderRadius: 6, padding: "4px 6px", color: "#f0e6d3", fontSize: 13 }}
                />
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: total === 13 ? "#7a9a5c" : "#c45c3c", marginBottom: 8 }}>
            Allocated {total}/13 coins across {usedTargets} bank{usedTargets === 1 ? "" : "s"}{usedTargets < 2 ? " (need ≥2)" : ""}
          </p>
          <Btn onClick={submit} disabled={!valid}>Submit Allocation</Btn>
        </>
      )}
    </Card>
  );
}
