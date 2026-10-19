import { useState, useEffect } from "react";
import { Btn, Card, Badge } from "./traitorsUi";
import { subscribeTraitorState } from "../lib/traitorStorage";
import { hostStorageUpdate } from "../lib/hostStorage";
import { STORAGE_KEY_TRAITOR_ROLES, factionLabel } from "../lib/traitorData";
import { hidePendingVictims } from "../lib/pendingMurders";
import { formatMoney } from "../lib/games/dealOrNoDealData";
import { notifyPlayersRoundChange } from "../lib/pushNotifications";
import {
  TRAITOR_FACTIONS, dondFactionKey, dondProgressText, startTraitorDond, stopTraitorDond, shareOutcome,
} from "../lib/traitorDondData";

// ─── Secret Deal or No Deal: Host Control ───
// Optional and off by default. Turning it on creates one private board per
// Traitor faction, each played by one Traitor the host picks. See
// lib/traitorDondData.js for how secrecy is enforced.
export default function TraitorDondHost({ gameId, players, tr }) {
  const [games, setGames] = useState({});
  const [picks, setPicks] = useState({});
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsubs = TRAITOR_FACTIONS.map((f) =>
      subscribeTraitorState(gameId, dondFactionKey(f), (v) => setGames((prev) => ({ ...prev, [f]: v })))
    );
    return () => unsubs.forEach((u) => u());
  }, [gameId]);

  if (!tr) return null;

  const alive = hidePendingVictims(players, tr).filter((p) => p.alive);
  const traitorsBy = Object.fromEntries(TRAITOR_FACTIONS.map((f) => [f, alive.filter((p) => tr.roles?.[p.display_name] === f)]));
  const factionsAvailable = TRAITOR_FACTIONS.filter((f) => traitorsBy[f].length > 0);
  const running = TRAITOR_FACTIONS.filter((f) => games[f]?.status === "active");
  const isOn = running.length > 0;

  const log = (text) => hostStorageUpdate(gameId, STORAGE_KEY_TRAITOR_ROLES, (fresh) => {
    if (!fresh) return null;
    fresh.log = [{ text, round: fresh.round, time: new Date().toLocaleTimeString() }, ...fresh.log];
    return fresh;
  });

  const pickFor = (f) => {
    const chosen = picks[f] ?? (traitorsBy[f].length === 1 ? traitorsBy[f][0].id : "");
    return traitorsBy[f].find((p) => p.id === chosen) || null;
  };

  const turnOn = async () => {
    const chosen = {};
    for (const f of factionsAvailable) {
      const p = pickFor(f);
      if (!p) { alert(`Pick a player for the ${factionLabel(f)} Traitors.`); return; }
      chosen[f] = { id: p.id, name: p.display_name };
    }
    if (!confirm(`Start secret Deal or No Deal for ${Object.values(chosen).map((c) => c.name).join(" and ")}?`)) return;
    setBusy(true);
    const ok = await startTraitorDond(gameId, chosen);
    if (!ok) alert("Couldn't start it — has sql/add-traitor-deal-or-no-deal.sql been run?");
    else {
      await log(`🤫 Secret Deal or No Deal started: ${Object.entries(chosen).map(([f, c]) => `${c.name} (${factionLabel(f)})`).join(", ")}`);
      // Vague on purpose, and only to the chosen players — a lock-screen
      // banner that says "Deal or No Deal" could be seen by anyone nearby.
      if (notify) notifyPlayersRoundChange(gameId, "🗡️ The shadows stir", "Something's waiting for you in the Roundtable tab.", "traitor-private", Object.values(chosen).map((c) => c.id));
    }
    setBusy(false);
  };

  const turnOff = async () => {
    if (!confirm("Turn off secret Deal or No Deal? Both boards are deleted, and the players stop seeing it.")) return;
    setBusy(true);
    const summary = running.map((f) => `${games[f].playerName} (${factionLabel(f)}): ${games[f].done && games[f].dealtAt ? formatMoney(games[f].dealtAt.amount) : "unfinished"}`).join(", ");
    await stopTraitorDond(gameId);
    await log(`🤫 Secret Deal or No Deal ended — ${summary}`);
    setGames({});
    setBusy(false);
  };

  const allDone = isOn && running.every((f) => games[f].done && games[f].dealtAt);
  const shared = isOn && running.every((f) => games[f].outcome);

  const reveal = async () => {
    setBusy(true);
    await shareOutcome(gameId, games);
    await log(`🤫 Secret Deal or No Deal results shared: ${running.map((f) => `${games[f].playerName} ${formatMoney(games[f].dealtAt.amount)}`).join(" vs ")}`);
    setBusy(false);
  };

  return (
    <Card style={{ borderColor: "rgba(201,168,76,0.35)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
        <h3 style={{ color: "#f0e6d3", margin: 0, fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🤫 Secret Deal or No Deal</h3>
        <Badge color={isOn ? "#c9a84c" : "#706050"}>{isOn ? "On — Traitors only" : "Off"}</Badge>
      </div>

      {!isOn && (
        <>
          <p style={{ fontSize: 12, color: "#a09080", margin: "0 0 10px", fontStyle: "italic" }}>
            One Traitor from each faction plays their own board. Only their faction can see it; the Faithful never know it's happening, and neither faction learns who the other's player is.
          </p>
          {factionsAvailable.length === 0 ? (
            <p style={{ fontSize: 12, color: "#706050", margin: 0 }}>No living Traitors yet.</p>
          ) : (
            <>
              {factionsAvailable.map((f) => (
                <div key={f} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: f === "traitor-red" ? "#c45c3c" : "#c9a84c", width: 110 }}>{factionLabel(f)} player:</span>
                  <select
                    value={pickFor(f)?.id || ""} onChange={(e) => setPicks({ ...picks, [f]: e.target.value })}
                    style={{ background: "#0a1020", color: "#f0e6d3", border: "1px solid #253550", borderRadius: 6, padding: "4px 6px", fontSize: 12 }}
                  >
                    <option value="">Choose…</option>
                    {traitorsBy[f].map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                  </select>
                </div>
              ))}
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#a09080", margin: "8px 0 10px", cursor: "pointer" }}>
                <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
                Send the chosen players a vague push ("Something's waiting for you…")
              </label>
              <Btn small onClick={turnOn} disabled={busy}>Turn On in Secret</Btn>
            </>
          )}
        </>
      )}

      {isOn && (
        <>
          <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
            {running.map((f) => {
              const g = games[f];
              return (
                <div key={f} style={{ background: "#0a1020", borderRadius: 6, padding: "6px 10px", display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, color: "#f0e6d3" }}>
                    <span style={{ color: f === "traitor-red" ? "#c45c3c" : "#c9a84c" }}>{factionLabel(f)}</span> · {g.playerName}
                  </span>
                  <span style={{ fontSize: 12, color: "#a09080" }}>
                    {dondProgressText(g)}
                    {g.done && g.dealtAt ? ` · ${formatMoney(g.dealtAt.amount)}` : g.offer ? ` · offer ${formatMoney(g.offer.amount)}` : ""}
                  </span>
                </div>
              );
            })}
          </div>
          {TRAITOR_FACTIONS.some((f) => !running.includes(f) && traitorsBy[f].length > 0) && (
            <p style={{ fontSize: 11, color: "#c45c3c", margin: "0 0 8px" }}>
              A faction has living Traitors but no board (factions merged, or a recruit since it started). Turn it off and on again to include them.
            </p>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {allDone && !shared && <Btn small onClick={reveal} disabled={busy}>{running.length > 1 ? "Reveal Result to Both Sides" : "Mark Finished"}</Btn>}
            {shared && <span style={{ fontSize: 12, color: "#7a9a5c", alignSelf: "center" }}>✓ Results shared (rival amounts only, no names)</span>}
            <Btn small variant="danger" onClick={turnOff} disabled={busy}>Turn Off</Btn>
          </div>
        </>
      )}
    </Card>
  );
}
