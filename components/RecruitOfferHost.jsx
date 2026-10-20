import { useState, useEffect } from "react";
import { Btn } from "./traitorsUi";
import { hostStorageUpdate } from "../lib/hostStorage";
import { factionLabel, STORAGE_KEY_TRAITOR_ROLES } from "../lib/traitorData";
import { notifyPlayersRoundChange } from "../lib/pushNotifications";
import {
  sendRecruitOffer, withdrawRecruitOffer, deleteRecruitOffer, markRecruitOfferApplied, subscribeRecruitOffers,
} from "../lib/recruitOffers";

// ─── Secret recruitment offers: host side ───
// Lives inside TraitorRolesHost's Recruit section. The target player
// answers on their own screen (components/RecruitOfferPrompt.jsx); nobody
// else can see the offer at all (sql/add-recruit-offers.sql).
//
// Accepting already switches the player's own role in the database. This
// component's other job is to catch the host's private tracker up — the
// first time it sees an accepted offer that hasn't been applied yet, it
// writes the new role into host_state and logs it, once.
export default function RecruitOfferHost({ gameId, players, tr, faithfulAlive, redCount, blackCount }) {
  const [offers, setOffers] = useState([]);
  const [target, setTarget] = useState("");
  const [faction, setFaction] = useState("traitor-red");
  const [message, setMessage] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeRecruitOffers(gameId, setOffers), [gameId]);

  const nameOf = (playerId) => players.find((p) => p.id === playerId)?.display_name || "Unknown player";

  // Catch up the host tracker for any accepted-but-unapplied offers.
  useEffect(() => {
    const toApply = offers.filter((o) => o.status === "accepted" && !o.applied_at);
    if (toApply.length === 0 || !tr) return;
    (async () => {
      for (const o of toApply) {
        const name = nameOf(o.player_id);
        const res = await hostStorageUpdate(gameId, STORAGE_KEY_TRAITOR_ROLES, (fresh) => {
          if (!fresh) return null;
          fresh.roles[name] = o.faction;
          fresh.log = [{ text: `✉️ ${name} accepted a secret recruitment offer — now a ${factionLabel(o.faction)} Traitor`, round: fresh.round, time: new Date().toLocaleTimeString() }, ...fresh.log];
          return fresh;
        });
        if (res.ok) await markRecruitOfferApplied(o.id);
      }
    })();
  }, [offers.map((o) => `${o.id}:${o.status}:${o.applied_at}`).join(","), !!tr]); // eslint-disable-line react-hooks/exhaustive-deps

  const pendingFor = new Set(offers.filter((o) => o.status === "pending").map((o) => o.player_id));
  const eligible = faithfulAlive.filter((p) => !pendingFor.has(p.id));
  const bothFactions = redCount > 0 && blackCount > 0;
  const offerFaction = bothFactions ? faction : blackCount > 0 && redCount === 0 ? "traitor-black" : "traitor-red";

  const send = async () => {
    const p = eligible.find((x) => x.id === target);
    if (!p) return;
    if (!confirm(`Secretly offer ${p.display_name} a place among the ${factionLabel(offerFaction)} Traitors?`)) return;
    setBusy(true);
    const res = await sendRecruitOffer(gameId, p.id, offerFaction, message);
    if (!res.ok) alert("Couldn't send the offer — has sql/add-recruit-offers.sql been run?\n\n" + res.error);
    else {
      await hostStorageUpdate(gameId, STORAGE_KEY_TRAITOR_ROLES, (fresh) => {
        if (!fresh) return null;
        fresh.log = [{ text: `✉️ Secret recruitment offer sent to ${p.display_name} (${factionLabel(offerFaction)})`, round: fresh.round, time: new Date().toLocaleTimeString() }, ...fresh.log];
        return fresh;
      });
      // Vague on purpose, and only to them — a lock-screen banner is
      // visible to anyone standing nearby.
      if (notify) notifyPlayersRoundChange(gameId, "🕯️ A sealed letter", "Something private is waiting for you in the app.", "traitor-private", [p.id]);
      setTarget(""); setMessage("");
    }
    setBusy(false);
  };

  const statusLabel = { pending: "⏳ Waiting", accepted: "🗡️ Accepted", declined: "✋ Declined", withdrawn: "↩️ Withdrawn" };
  const statusColor = { pending: "#c9a84c", accepted: "#c45c3c", declined: "#7a9a5c", withdrawn: "#706050" };

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #253550" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#f0e6d3", marginBottom: 4 }}>✉️ Secret Recruit Offer</div>
      <p style={{ fontSize: 11, color: "#706050", margin: "0 0 8px", fontStyle: "italic" }}>
        Only the player you choose sees this, and they decide. Nobody else, Traitors included, is told.
      </p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
        <select value={target} onChange={(e) => setTarget(e.target.value)}
          style={{ background: "#0a1020", color: "#f0e6d3", border: "1px solid #253550", borderRadius: 6, padding: "4px 6px", fontSize: 12 }}>
          <option value="">Choose a Faithful…</option>
          {eligible.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
        </select>
        {bothFactions && (
          <select value={faction} onChange={(e) => setFaction(e.target.value)}
            style={{ background: "#0a1020", color: "#f0e6d3", border: "1px solid #253550", borderRadius: 6, padding: "4px 6px", fontSize: 12 }}>
            <option value="traitor-red">Red</option>
            <option value="traitor-black">Black</option>
          </select>
        )}
      </div>
      <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Optional message they'll see (e.g. “Join us, or…”)" maxLength={200}
        style={{ width: "100%", boxSizing: "border-box", background: "#0a1020", color: "#f0e6d3", border: "1px solid #253550", borderRadius: 6, padding: "6px 8px", fontSize: 12, marginBottom: 6 }} />
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#a09080", marginBottom: 6, cursor: "pointer" }}>
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        Send them a vague push ("Something private is waiting for you…")
      </label>
      <Btn small variant="danger" onClick={send} disabled={!target || busy}>Send Secret Offer</Btn>

      {offers.length > 0 && (
        <div style={{ display: "grid", gap: 4, marginTop: 10 }}>
          {offers.slice(0, 8).map((o) => (
            <div key={o.id} style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", background: "#0a1020", borderRadius: 6, padding: "4px 8px", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "#f0e6d3" }}>
                {nameOf(o.player_id)} <span style={{ color: "#706050" }}>· {factionLabel(o.faction)}</span>
              </span>
              <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: statusColor[o.status] }}>{statusLabel[o.status]}</span>
                {o.status === "pending" && <Btn small variant="ghost" onClick={() => withdrawRecruitOffer(o.id)}>Withdraw</Btn>}
                {/* An accepted offer stays until the tracker has caught up (applied_at). */}
                {o.status !== "pending" && (o.status !== "accepted" || o.applied_at) && <Btn small variant="ghost" onClick={() => deleteRecruitOffer(o.id)}>✕</Btn>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
