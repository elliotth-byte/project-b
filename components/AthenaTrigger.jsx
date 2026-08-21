import { useState, useEffect } from "react";
import { Card, Btn } from "./ui";
import { subscribeGameState, storageUpdate } from "../lib/gameStorage";
import { KEY_EXILE, KEY_FINALE } from "../lib/gameState";
import { powerFor } from "../lib/characterPowers";

// ─── Athena's character power (see lib/characterPowers.js) ───
// "Can make the player with the Power of Chaos swap their initial
// choice for a secondary choice." Athena never sees or picks the new
// choice herself — she can only flip a public flag (athenaForceSwapPending)
// that the holder's own screen (ChaosPowerPlayer.jsx) reacts to; the
// actual replacement pick is still entirely the holder's own doing,
// confirmed against the season's host ("Power of Chaos chooses", not
// Athena). Limited to once per round — see athenaForceSwapUsed below —
// so this can't be used to endlessly harass whoever's holding it.
export default function AthenaTrigger({ gameId, player, round, settings }) {
  const isExile = round?.phase === "exile";
  const isFinale = round?.phase === "finale";
  const key = isExile ? KEY_EXILE : isFinale ? KEY_FINALE : null;
  const [state, setState] = useState(null);
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    if (!key) return;
    const unsubscribe = subscribeGameState(gameId, key, setState);
    return unsubscribe;
  }, [gameId, key, round?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  const isAthena = powerFor(player, settings) === "Athena";
  if (!isAthena || !key || !state) return null;
  if (!state.chaosHolderId || state.chaosHolderId === player.id) return null; // nobody to force yet, or she IS the holder herself
  if (state.athenaForceSwapUsed) return null; // once per round, already spent

  if (state.athenaForceSwapPending) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center", borderColor: "#0ea5e9" }}>
        <div style={{ fontSize: 22, marginBottom: 4 }}>🦉</div>
        <p style={{ color: "#a68fd6", fontSize: 12, margin: 0 }}>Waiting on the Power of Khaos holder to pick their replacement...</p>
      </Card>
    );
  }

  const trigger = async () => {
    if (!confirm("Force the Power of Khaos holder to swap their pick? They'll choose the replacement themselves — you won't see what either pick was.")) return;
    setTriggering(true);
    await storageUpdate(gameId, key, (fresh) => (fresh ? { ...fresh, athenaForceSwapPending: true, athenaForceSwapUsed: true } : fresh));
    setTriggering(false);
  };

  return (
    <Card style={{ marginBottom: 20, textAlign: "center", borderColor: "#0ea5e9" }}>
      <div style={{ fontSize: 22, marginBottom: 4 }}>🦉</div>
      <h3 style={{ color: "#f5f0ff", margin: "0 0 4px", fontSize: 15 }}>Athena's Power</h3>
      <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 10px" }}>
        Force the Power of Khaos holder to swap their pick for a different one — usable once per round, and you'll never learn what either pick was.
      </p>
      <Btn small onClick={trigger} disabled={triggering}>{triggering ? "Forcing..." : "🦉 Force a Swap"}</Btn>
    </Card>
  );
}
