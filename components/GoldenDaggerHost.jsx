import { useState, useEffect } from "react";
import { Btn } from "./traitorsUi";
import { assignGoldenDagger, revokeGoldenDagger } from "../lib/goldenDagger";
import { subscribeHostState } from "../lib/hostStorage";
import { STORAGE_KEY_TRAITOR_ROLES } from "../lib/traitorData";
import { hidePendingVictims } from "../lib/pendingMurders";

const GOLD = "#e0b84c";

// ─── Golden Dagger: Host Control ───
// One dagger per game. Whoever holds it can cast a second, extra vote at
// each Roundtable (see components/GoldenDaggerVoter.jsx). Only the host and
// the holder's own account can read who holds it — see
// sql/add-golden-dagger.sql — so assigning it here is secret from everyone
// else. The holder's name is also hidden on this panel until "Show" is
// tapped, so it's safe to leave open on a shared screen.
//
// `dagger` is the live golden_daggers row (or null) and is owned by the
// parent (RoundtableHost) so the vote tally can use it too; `onChange`
// hands back the new row after assigning/revoking.
export default function GoldenDaggerHost({ gameId, players: rawPlayers, dagger, round, onChange }) {
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(false);
  const [error, setError] = useState(null);
  const [tr, setTr] = useState(null);

  // A murdered player still looks alive to everyone until the Afternoon Tea
  // reveal (see lib/pendingMurders.js), so the raw roster would still offer
  // them here. Treat pending victims as dead, the same way the Murder Vote
  // and Traitor Roles panels do.
  useEffect(() => {
    const unsubscribe = subscribeHostState(gameId, STORAGE_KEY_TRAITOR_ROLES, setTr);
    return unsubscribe;
  }, [gameId]);
  const players = hidePendingVictims(rawPlayers, tr);

  const alive = players.filter((p) => p.alive);
  const holder = dagger ? players.find((p) => p.id === dagger.player_id) : null;
  const holderOut = !!holder && !holder.alive;
  const votedThisRound = !!(dagger?.vote_target && dagger.vote_round === round);

  const assign = async () => {
    if (!pick || busy) return;
    const next = players.find((p) => p.id === pick);
    if (!next || !next.alive) return;
    if (dagger && !confirm(`Move the Golden Dagger to ${next.display_name}?\n\nAny extra vote the current holder has already cast this round is cleared.`)) return;
    setBusy(true);
    setError(null);
    const res = await assignGoldenDagger(gameId, pick);
    setBusy(false);
    if (!res.ok) {
      setError(`Couldn't assign it: ${res.error?.message || "unknown error"}. If this is the first time, has sql/add-golden-dagger.sql been run in Supabase?`);
      return;
    }
    onChange(res.row);
    setPick("");
    setShown(true);
  };

  const revoke = async () => {
    if (busy) return;
    if (!confirm("Take the Golden Dagger back? Nobody will hold it, and any extra vote already cast is discarded.")) return;
    setBusy(true);
    setError(null);
    const res = await revokeGoldenDagger(gameId);
    setBusy(false);
    if (!res.ok) { setError(`Couldn't revoke it: ${res.error?.message || "unknown error"}`); return; }
    onChange(null);
    setShown(false);
  };

  return (
    <div style={{ border: `1px solid ${GOLD}55`, background: "rgba(224,184,76,0.05)", borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: GOLD, marginBottom: 4 }}>🏆 Golden Dagger</div>
      <p style={{ fontSize: 11, color: "#a09080", margin: "0 0 8px", fontStyle: "italic" }}>
        Secretly gives one player a second vote at each Roundtable while they hold it. Only they can see it — everyone else finds out when you reveal the votes.
      </p>

      {dagger && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8, fontSize: 12 }}>
          <span style={{ color: "#a09080" }}>Held by:</span>
          <strong style={{ color: shown ? GOLD : "#706050", letterSpacing: shown ? 0 : 2 }}>
            {shown ? (holder?.display_name || "unknown player") : "••••••"}
          </strong>
          <Btn small variant="ghost" onClick={() => setShown((v) => !v)}>{shown ? "Hide" : "Show"}</Btn>
          {shown && holderOut && <span style={{ color: "#c45c3c" }}>⚠️ eliminated — reassign it</span>}
          {shown && !holderOut && (
            <span style={{ color: votedThisRound ? "#7a9a5c" : "#706050" }}>
              {votedThisRound ? `extra vote cast for round ${round}` : "no extra vote yet this round"}
            </span>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <select value={pick} onChange={(e) => setPick(e.target.value)} style={{ background: "#0a1020", border: "1px solid #253550", borderRadius: 6, color: "#f0e6d3", fontSize: 12, padding: "5px 8px" }}>
          <option value="">{dagger ? "Move to…" : "Assign to…"}</option>
          {alive.filter((p) => p.id !== dagger?.player_id).map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
        </select>
        <Btn small onClick={assign} disabled={!pick || busy}>{dagger ? "Move Dagger" : "Assign Dagger"}</Btn>
        {dagger && <Btn small variant="ghost" onClick={revoke} disabled={busy}>Revoke</Btn>}
      </div>

      {error && <p style={{ fontSize: 11, color: "#c45c3c", margin: "8px 0 0" }}>{error}</p>}
    </div>
  );
}
