import { useState, useEffect, useMemo } from "react";
import { Btn, Card, Badge } from "./traitorsUi";
import { supabase } from "../lib/supabaseClient";
import { hostStorageSet, hostStorageUpdate, subscribeHostState } from "../lib/hostStorage";
import { isTraitor, factionLabel, roleDisplay, STORAGE_KEY_TRAITOR_ROLES } from "../lib/traitorData";
import { murderScript, banishScript, walkScript, teaArrivalScripts } from "../lib/slackScripts";
import { setPlayerRole } from "../lib/playerRoles";
import PostToSlack from "./PostToSlack";
import StaggeredSlackPost from "./StaggeredSlackPost";

// ─── Traitor Roles: Host-Only Tracker ───
//
// This is deliberately host-only, with no player-facing counterpart — same
// as the original, where this data lived in the host's own personal
// browser storage and no player ever saw it. Here it lives in the
// `host_state` table instead, which has its own strict RLS: only the host
// can read or write it, period, regardless of what any player's browser
// tries. See sql/add-host-state.sql for exactly why this couldn't just be
// another game_state key.
//
// Two scope notes, flagged the same way earlier conversions were:
// 1. "Alive" status is NOT duplicated here — it stays the single shared
//    `players.alive` column everyone else (Roundtable, Word Scramble, etc.)
//    already reads. Murder/Banish/Walk/Restore all update that shared
//    column directly, alongside the secret role bookkeeping kept here.
// 2. The original's CAST_VOTE/SET_REASON/voteHistory system — a *separate*,
//    host-manual vote tracker that existed in parallel with the shared
//    voting players actually interact with — is not carried over. The
//    Roundtable conversion already gives the host a live, player-driven
//    voting flow, which is strictly better than a second, disconnected
//    manual one. Likewise, "add a mid-season player with no account" isn't
//    supported, since every player here is a real signed-up account.
export default function TraitorRolesHost({ gameId, players }) {
  const [tr, setTr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showTea, setShowTea] = useState(false);
  const [redCount, setRedCount] = useState(1);
  const [blackCount, setBlackCount] = useState(0);
  const [murderFaction, setMurderFaction] = useState("traitor-red");
  const [pendingAction, setPendingAction] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [restoreRoles, setRestoreRoles] = useState({});
  const [lastAnnouncement, setLastAnnouncement] = useState(null);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeHostState(gameId, STORAGE_KEY_TRAITOR_ROLES, (value) => {
      setTr(value);
      setLoading(false);
    });
    return unsubscribe;
  }, [gameId]);

  const initialize = async () => {
    const state = {
      roles: {}, shielded: {}, daggerStolen: false, round: 1,
      eliminations: [], returns: [], shieldHistory: {},
      log: [{ text: "Traitor tracking started.", round: 1, time: new Date().toLocaleTimeString() }],
    };
    players.forEach((p) => { state.roles[p.display_name] = "faithful"; });
    await hostStorageSet(gameId, STORAGE_KEY_TRAITOR_ROLES, state);
    setTr(state);
    // Mirror into player_roles so each player can see their own role —
    // see sql/add-murder-vote.sql for why this can't just live in the
    // host-only host_state table alone.
    await Promise.all(players.map((p) => setPlayerRole(gameId, p.id, "faithful")));
  };

  const addLog = (fresh, text) => {
    fresh.log = [{ text, round: fresh.round, time: new Date().toLocaleTimeString() }, ...fresh.log];
    return fresh;
  };

  const setPlayersAlive = async (ids, aliveVal, eliminationType = null) => {
    const { error } = await supabase.from("players").update({ alive: aliveVal, elimination_type: eliminationType }).in("id", ids);
    if (error) console.error("Failed to update player alive status:", error);
  };

  const alive = players.filter((p) => p.alive);
  const eliminated = players.filter((p) => !p.alive);
  const aliveNames = alive.map((p) => p.display_name);
  const teaLines = useMemo(() => teaArrivalScripts(aliveNames), [aliveNames.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const redTraitors = tr ? alive.filter((p) => tr.roles[p.display_name] === "traitor-red") : [];
  const blackTraitors = tr ? alive.filter((p) => tr.roles[p.display_name] === "traitor-black") : [];
  const faithfulAlive = tr ? alive.filter((p) => tr.roles[p.display_name] === "faithful" || !tr.roles[p.display_name]) : [];

  const assignTraitors = async () => {
    if (redCount + blackCount === 0) { alert("Assign at least one traitor."); return; }
    if (redCount + blackCount > alive.length) { alert("Not enough living players for that many traitors."); return; }
    const res = await hostStorageUpdate(gameId, STORAGE_KEY_TRAITOR_ROLES, (fresh) => {
      if (!fresh) return null;
      const shuffled = [...alive].sort(() => Math.random() - 0.5);
      const redNames = new Set(shuffled.slice(0, redCount).map((p) => p.display_name));
      const blackNames = new Set(shuffled.slice(redCount, redCount + blackCount).map((p) => p.display_name));
      players.forEach((p) => {
        fresh.roles[p.display_name] = redNames.has(p.display_name) ? "traitor-red" : blackNames.has(p.display_name) ? "traitor-black" : "faithful";
      });
      return addLog(fresh, `🎭 Traitors assigned: ${redCount} Red, ${blackCount} Black.`);
    });
    if (res.ok) {
      setTr(res.value);
      await Promise.all(players.map((p) => setPlayerRole(gameId, p.id, res.value.roles[p.display_name])));
    }
  };

  const confirmAction = async () => {
    if (!pendingAction || busy) return;
    setBusy(true);
    const { type, id, name, faction } = pendingAction;

    if (type === "MURDER" || type === "BANISH" || type === "WALK") {
      const res = await hostStorageUpdate(gameId, STORAGE_KEY_TRAITOR_ROLES, (fresh) => {
        if (!fresh) return null;
        const placement = alive.length;
        const label = type === "MURDER" ? "Murdered" : type === "BANISH" ? "Banished" : "Walked";
        fresh.eliminations = [...fresh.eliminations, { name, role: fresh.roles[name], type: label, round: fresh.round, placement, killedBy: faction || null }];
        fresh.shielded[name] = false;
        const icon = type === "MURDER" ? "💀" : type === "BANISH" ? "⚖️" : "🚪";
        const suffix = type === "MURDER" && faction ? ` by ${factionLabel(faction)}` : type === "BANISH" ? ` (${roleDisplay(fresh.roles[name])})` : "";
        return addLog(fresh, `${icon} ${name} was ${label.toLowerCase()}${suffix}`);
      });
      if (res.ok) {
        setTr(res.value);
        const elimType = type === "MURDER" ? "murdered" : type === "BANISH" ? "banished" : "walked";
        await setPlayersAlive([id], false, elimType);
        if (type === "MURDER") {
          const shieldedNames = Object.keys(res.value.shielded).filter((n) => res.value.shielded[n] && n !== name);
          setLastAnnouncement({ icon: "💀", label: "Murder Announcement", text: murderScript(name, shieldedNames) });
        } else if (type === "BANISH") {
          setLastAnnouncement({ icon: "⚖️", label: "Banish Announcement", text: banishScript(name) });
        } else if (type === "WALK") {
          setLastAnnouncement({ icon: "🚪", label: "Walk Announcement", text: walkScript(name) });
        }
      }
    } else if (type === "RECRUIT") {
      const res = await hostStorageUpdate(gameId, STORAGE_KEY_TRAITOR_ROLES, (fresh) => {
        if (!fresh) return null;
        fresh.roles[name] = faction;
        return addLog(fresh, `👁️ ${name} was recruited as a ${factionLabel(faction)} Traitor`);
      });
      if (res.ok) { setTr(res.value); await setPlayerRole(gameId, id, faction); }
    } else if (type === "MERGE_FACTIONS") {
      const res = await hostStorageUpdate(gameId, STORAGE_KEY_TRAITOR_ROLES, (fresh) => {
        if (!fresh) return null;
        const mergedNames = [];
        Object.keys(fresh.roles).forEach((n) => {
          if (isTraitor(fresh.roles[n])) { fresh.roles[n] = "traitor-red"; mergedNames.push(n); }
        });
        return addLog(fresh, `🔀 Traitor factions merged — ${mergedNames.join(", ")} are now one alliance`);
      });
      if (res.ok) {
        setTr(res.value);
        const mergedPlayers = players.filter((p) => isTraitor(res.value.roles[p.display_name]));
        await Promise.all(mergedPlayers.map((p) => setPlayerRole(gameId, p.id, "traitor-red")));
      }
    }
    setPendingAction(null);
    setBusy(false);
  };

  const toggleShield = async (name) => {
    const res = await hostStorageUpdate(gameId, STORAGE_KEY_TRAITOR_ROLES, (fresh) => {
      if (!fresh) return null;
      const gaining = !fresh.shielded[name];
      fresh.shielded[name] = gaining;
      if (gaining) {
        fresh.shieldHistory = fresh.shieldHistory || {};
        const current = fresh.shieldHistory[fresh.round] || [];
        if (!current.includes(name)) fresh.shieldHistory[fresh.round] = [...current, name];
      }
      return addLog(fresh, gaining ? `🛡️ ${name} won a shield` : `🛡️ ${name} lost their shield`);
    });
    if (res.ok) setTr(res.value);
  };

  const toggleDagger = async () => {
    const res = await hostStorageUpdate(gameId, STORAGE_KEY_TRAITOR_ROLES, (fresh) => {
      if (!fresh) return null;
      fresh.daggerStolen = !fresh.daggerStolen;
      return fresh;
    });
    if (res.ok) setTr(res.value);
  };

  const restore = async (id, name, role) => {
    const res = await hostStorageUpdate(gameId, STORAGE_KEY_TRAITOR_ROLES, (fresh) => {
      if (!fresh) return null;
      fresh.roles[name] = role;
      fresh.returns = [...(fresh.returns || []), { name, round: fresh.round, restoredRole: role, time: new Date().toLocaleTimeString() }];
      return addLog(fresh, `🔁 ${name} returned to the game as ${roleDisplay(role)}`);
    });
    if (res.ok) { setTr(res.value); await setPlayersAlive([id], true, null); await setPlayerRole(gameId, id, role); }
  };

  const nextRound = async () => {
    const res = await hostStorageUpdate(gameId, STORAGE_KEY_TRAITOR_ROLES, (fresh) => {
      if (!fresh) return null;
      Object.keys(fresh.shielded).forEach((n) => { fresh.shielded[n] = false; });
      fresh.round += 1;
      return addLog(fresh, `— Round ${fresh.round} begins —`);
    });
    if (res.ok) setTr(res.value);
  };

  if (loading) return <Card><p style={{ color: "#706050", fontStyle: "italic" }}>Loading...</p></Card>;

  if (!tr) {
    return (
      <Card style={{ borderColor: "rgba(196,92,60,0.3)" }}>
        <h3 style={{ color: "#f0e6d3", margin: "0 0 8px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🎭 Traitor Roles — Setup</h3>
        <p style={{ color: "#a09080", fontSize: 13, margin: "0 0 12px", fontStyle: "italic" }}>
          Host-only. Players never see this panel or anything in it — no one but you can read this data, even by inspecting the app directly.
        </p>
        <Btn onClick={initialize} disabled={players.length === 0}>Start Tracking Roles</Btn>
      </Card>
    );
  }

  const badgeRow = (p) => {
    const role = tr.roles[p.display_name];
    return (
      <span key={p.id} style={{ fontSize: 11 }}>
        <Badge color={role === "traitor-red" ? "#c45c3c" : role === "traitor-black" ? "#c9a84c" : "#7a9a5c"}>
          {p.display_name}{tr.shielded[p.display_name] ? " 🛡️" : ""}
        </Badge>
      </span>
    );
  };

  return (
    <Card style={{ borderColor: "rgba(196,92,60,0.35)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#f0e6d3", margin: 0, fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🎭 Traitor Roles</h3>
        <Badge color="#c9a84c">Round {tr.round}</Badge>
      </div>

      {pendingAction && (
        <div style={{
          background: pendingAction.type === "MURDER" ? "rgba(196,92,60,0.1)" : "rgba(245,166,35,0.1)",
          border: "1px solid rgba(196,92,60,0.35)", borderRadius: 10, padding: "12px 16px",
          display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#f0e6d3" }}>
            {pendingAction.type === "MURDER" && `💀 Murder ${pendingAction.name}?${pendingAction.faction ? ` (by ${factionLabel(pendingAction.faction)})` : ""}`}
            {pendingAction.type === "BANISH" && `⚖️ Banish ${pendingAction.name}?`}
            {pendingAction.type === "WALK" && `🚪 ${pendingAction.name} is walking away?`}
            {pendingAction.type === "RECRUIT" && `👁️ Recruit ${pendingAction.name} as ${pendingAction.faction === "traitor-black" ? "Black" : "Red"} Traitor?`}
            {pendingAction.type === "MERGE_FACTIONS" && "🔀 Merge Red and Black into one traitor faction?"}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn small variant="ghost" onClick={() => setPendingAction(null)}>Cancel</Btn>
            <Btn small variant={pendingAction.type === "MURDER" ? "danger" : "primary"} onClick={confirmAction} disabled={busy}>Confirm</Btn>
          </div>
        </div>
      )}

      {lastAnnouncement && (
        <div style={{ marginBottom: 12 }}>
          <PostToSlack gameId={gameId} icon={lastAnnouncement.icon} label={lastAnnouncement.label} text={lastAnnouncement.text} />
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <Btn small variant="ghost" onClick={() => setShowTea((v) => !v)}>
          {showTea ? "Hide ☕ Afternoon Tea" : "☕ Afternoon Tea Arrivals"}
        </Btn>
        {showTea && (
          <div style={{ marginTop: 8 }}>
            {alive.length > 0 ? (
              <StaggeredSlackPost gameId={gameId} lines={teaLines} label="Afternoon Tea Arrivals" icon="☕" intervalMinutes={5} />
            ) : (
              <p style={{ color: "#706050", fontSize: 12, fontStyle: "italic" }}>No living players to stagger arrivals for.</p>
            )}
          </div>
        )}
      </div>

      {/* Roster overview */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
        {alive.map(badgeRow)}
        {tr.daggerStolen && <Badge color="#c45c3c">🗡️ Dagger Stolen</Badge>}
      </div>

      {/* Assign traitors */}
      {redTraitors.length === 0 && blackTraitors.length === 0 && (
        <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #253550" }}>
          <div style={{ fontSize: 12, color: "#a09080", marginBottom: 6 }}>Assign traitors from {alive.length} living players:</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, color: "#c45c3c" }}>Red: <input type="number" min={0} value={redCount} onChange={(e) => setRedCount(Math.max(0, Number(e.target.value) || 0))} style={{ width: 44, marginLeft: 4, background: "#0a1020", border: "1px solid #253550", borderRadius: 5, color: "#f0e6d3", padding: "2px 6px" }} /></label>
            <label style={{ fontSize: 12, color: "#c9a84c" }}>Black: <input type="number" min={0} value={blackCount} onChange={(e) => setBlackCount(Math.max(0, Number(e.target.value) || 0))} style={{ width: 44, marginLeft: 4, background: "#0a1020", border: "1px solid #253550", borderRadius: 5, color: "#f0e6d3", padding: "2px 6px" }} /></label>
            <Btn small onClick={assignTraitors}>Assign</Btn>
          </div>
        </div>
      )}

      {/* Murder */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#f0e6d3" }}>💀 Murder</span>
          {redTraitors.length > 0 && blackTraitors.length > 0 && (
            <div style={{ display: "flex" }}>
              <button onClick={() => setMurderFaction("traitor-red")} style={{ padding: "3px 10px", borderRadius: "6px 0 0 6px", fontSize: 11, cursor: "pointer", background: murderFaction === "traitor-red" ? "rgba(196,92,60,0.25)" : "#0a1020", border: "1px solid #253550", color: murderFaction === "traitor-red" ? "#c45c3c" : "#706050" }}>Red</button>
              <button onClick={() => setMurderFaction("traitor-black")} style={{ padding: "3px 10px", borderRadius: "0 6px 6px 0", fontSize: 11, cursor: "pointer", background: murderFaction === "traitor-black" ? "rgba(201,168,76,0.25)" : "#0a1020", border: "1px solid #253550", color: murderFaction === "traitor-black" ? "#c9a84c" : "#706050" }}>Black</button>
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {alive.map((p) => {
            const shielded = tr.shielded[p.display_name];
            const faction = redTraitors.length > 0 && blackTraitors.length > 0 ? murderFaction : (redTraitors.length > 0 ? "traitor-red" : blackTraitors.length > 0 ? "traitor-black" : null);
            return (
              <Btn key={p.id} small variant={shielded ? "ghost" : "danger"} disabled={shielded}
                onClick={() => setPendingAction({ type: "MURDER", id: p.id, name: p.display_name, faction })}>
                {p.display_name} {shielded ? "🛡️" : ""}
              </Btn>
            );
          })}
        </div>
      </div>

      {/* Banish / Walk */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f0e6d3", marginBottom: 6 }}>⚖️ Banish</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {alive.map((p) => <Btn key={p.id} small variant="ghost" onClick={() => setPendingAction({ type: "BANISH", id: p.id, name: p.display_name })}>{p.display_name}</Btn>)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f0e6d3", marginBottom: 6 }}>🚪 Walk</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {alive.map((p) => <Btn key={p.id} small variant="ghost" onClick={() => setPendingAction({ type: "WALK", id: p.id, name: p.display_name })}>{p.display_name}</Btn>)}
          </div>
        </div>
      </div>

      {/* Shields / Recruit */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f0e6d3", marginBottom: 6 }}>🛡️ Shields</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {alive.map((p) => (
              <Btn key={p.id} small variant={tr.shielded[p.display_name] ? "success" : "ghost"} onClick={() => toggleShield(p.display_name)}>
                {p.display_name} {tr.shielded[p.display_name] ? "✓" : ""}
              </Btn>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f0e6d3", marginBottom: 6 }}>👁️ Recruit</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {faithfulAlive.map((p) => (
              <div key={p.id} style={{ display: "flex" }}>
                <Btn small style={{ borderRadius: "8px 0 0 8px" }} variant="danger" onClick={() => setPendingAction({ type: "RECRUIT", name: p.display_name, faction: "traitor-red" })}>{p.display_name} →R</Btn>
                <Btn small style={{ borderRadius: "0 8px 8px 0" }} onClick={() => setPendingAction({ type: "RECRUIT", name: p.display_name, faction: "traitor-black" })}>B</Btn>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Merge / Dagger */}
      <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        {redTraitors.length > 0 && blackTraitors.length > 0 && (
          <Btn small variant="danger" onClick={() => setPendingAction({ type: "MERGE_FACTIONS" })}>🔀 Merge Factions</Btn>
        )}
        <Btn small variant={tr.daggerStolen ? "danger" : "ghost"} onClick={toggleDagger}>🗡️ {tr.daggerStolen ? "Return Dagger" : "Mark Dagger Stolen"}</Btn>
      </div>

      {/* Restore eliminated players — brings them back as any role, not just their old one */}
      {eliminated.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f0e6d3", marginBottom: 6 }}>🔁 Restore to the Game</div>
          <div style={{ display: "grid", gap: 5 }}>
            {eliminated.map((p) => (
              <div key={p.id} style={{ display: "flex", gap: 6, alignItems: "center", background: "#0a1020", borderRadius: 6, padding: "4px 8px" }}>
                <span style={{ fontSize: 12, color: "#a09080", flex: 1 }}>{p.display_name} <em style={{ color: "#706050" }}>({roleDisplay(tr.roles[p.display_name])})</em></span>
                <select
                  value={restoreRoles[p.id] ?? (tr.roles[p.display_name] || "faithful")}
                  onChange={(e) => setRestoreRoles({ ...restoreRoles, [p.id]: e.target.value })}
                  style={{ background: "#132038", border: "1px solid #253550", borderRadius: 5, color: "#f0e6d3", fontSize: 11, padding: "2px 4px" }}
                >
                  <option value="faithful">Faithful</option>
                  <option value="traitor-red">Traitor (Red)</option>
                  <option value="traitor-black">Traitor (Black)</option>
                </select>
                <Btn small onClick={() => restore(p.id, p.display_name, restoreRoles[p.id] ?? (tr.roles[p.display_name] || "faithful"))}>Restore</Btn>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
        <Btn small onClick={nextRound}>Next Round →</Btn>
        <Btn small variant="ghost" onClick={() => setShowLog(!showLog)}>{showLog ? "Hide" : "Show"} Log</Btn>
      </div>

      {showLog && (
        <div style={{ marginTop: 10, maxHeight: 160, overflowY: "auto", background: "#0a1020", borderRadius: 8, padding: 8 }}>
          {tr.log.map((l, i) => <div key={i} style={{ fontSize: 11, color: "#a09080", padding: "2px 0" }}>[R{l.round}] {l.text}</div>)}
        </div>
      )}
    </Card>
  );
}
