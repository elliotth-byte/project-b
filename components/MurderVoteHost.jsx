import { useState, useEffect } from "react";
import { Btn, Card, Badge } from "./traitorsUi";
import { supabase } from "../lib/supabaseClient";
import { traitorStorageSet, traitorStorageUpdate, traitorStorageDelete, subscribeTraitorState } from "../lib/traitorStorage";
import { hostStorageUpdate } from "../lib/hostStorage";
import { STORAGE_KEY_TRAITOR_ROLES, factionLabel } from "../lib/traitorData";
import { murderVoteKey, calculateMurderVoteResult, defaultEligibleTargets } from "../lib/murderVoteData";
import { murderScript } from "../lib/slackScripts";
import PostToSlack from "./PostToSlack";

// ─── Traitors' Murder Vote: Host Control ───
// Reworked to run per-faction: if both Red and Black Traitors are alive,
// this renders TWO fully independent panels below, each with its own
// storage key, its own eligible-target list (which now includes the
// OTHER faction — cross-faction murder is allowed), and its own apply
// button. If only one faction currently exists (no merge, or already
// merged into one alliance), you just get the one panel.
export default function MurderVoteHost({ gameId, players, tr }) {
  if (!tr) return <Card><p style={{ color: "#706050", fontSize: 12, fontStyle: "italic" }}>Start tracking roles first (above) before opening a murder vote.</p></Card>;

  const alive = players.filter((p) => p.alive);
  const redTraitors = alive.filter((p) => tr.roles?.[p.display_name] === "traitor-red");
  const blackTraitors = alive.filter((p) => tr.roles?.[p.display_name] === "traitor-black");

  if (redTraitors.length === 0 && blackTraitors.length === 0) {
    return <Card><p style={{ color: "#706050", fontSize: 12, fontStyle: "italic" }}>No living Traitors yet — assign roles above first.</p></Card>;
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {redTraitors.length > 0 && (
        <FactionPanel gameId={gameId} players={players} tr={tr} faction="traitor-red" factionTraitors={redTraitors} />
      )}
      {blackTraitors.length > 0 && (
        <FactionPanel gameId={gameId} players={players} tr={tr} faction="traitor-black" factionTraitors={blackTraitors} />
      )}
    </div>
  );
}

function FactionPanel({ gameId, players, tr, faction, factionTraitors }) {
  const storageKey = murderVoteKey(faction);
  const [mv, setMv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedTargets, setSelectedTargets] = useState(null);
  const [excludeShielded, setExcludeShielded] = useState(true);
  const [allowVoteChanges, setAllowVoteChanges] = useState(true);
  const [votingRule, setVotingRule] = useState("plurality");
  const [manualTarget, setManualTarget] = useState("");
  const [announcement, setAnnouncement] = useState(null);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeTraitorState(gameId, storageKey, (v) => { setMv(v); setLoading(false); });
    return unsubscribe;
  }, [gameId, storageKey]);

  if (loading) return <Card><p style={{ color: "#706050", fontStyle: "italic" }}>Loading...</p></Card>;

  const alive = players.filter((p) => p.alive);
  const defaultTargets = defaultEligibleTargets(players, tr.roles, tr.shielded, faction, { excludeShielded });
  const targets = selectedTargets ?? defaultTargets;
  const label = factionLabel(faction);
  const color = faction === "traitor-red" ? "#c45c3c" : "#c9a84c";

  const toggleTarget = (name) => setSelectedTargets((prev) => {
    const base = prev ?? defaultTargets;
    return base.includes(name) ? base.filter((n) => n !== name) : [...base, name];
  });

  const openVote = async () => {
    if (targets.length === 0) { alert("No eligible targets selected."); return; }
    if (mv?.status === "open") { if (!confirm("A vote is already open. Reopen with new settings?")) return; }
    const state = {
      active: true, status: "open", round: tr.round, openedAt: Date.now(), closedAt: null,
      faction, eligibleVoters: factionTraitors.map((p) => p.display_name), eligibleTargets: targets,
      excludeShielded, allowVoteChanges, revealVotesToTraitors: false, revealTallyToTraitors: false,
      votingRule, majorityBasis: "eligible_voters",
      votes: {}, result: { targetName: null, ruleSatisfied: false, tied: false, tiedTargets: [], voteCounts: {}, appliedAt: null },
      history: mv?.history || [],
    };
    await traitorStorageSet(gameId, storageKey, state);
    setMv(state);
    await hostStorageUpdate(gameId, STORAGE_KEY_TRAITOR_ROLES, (fresh) => {
      if (!fresh) return null;
      fresh.log = [{ text: `🗡️ ${label} Traitors' murder vote opened.`, round: fresh.round, time: new Date().toLocaleTimeString() }, ...fresh.log];
      return fresh;
    });
  };

  const closeVote = async () => {
    const res = await traitorStorageUpdate(gameId, storageKey, (fresh) => {
      if (!fresh) return null;
      fresh.status = "closed";
      fresh.closedAt = Date.now();
      fresh.result = calculateMurderVoteResult(fresh);
      return fresh;
    });
    if (res.ok) setMv(res.value);
  };

  const resetVote = async () => {
    if (!confirm(`Reset the ${label} murder vote? All votes will be cleared.`)) return;
    await traitorStorageDelete(gameId, storageKey);
    setMv(null);
    setSelectedTargets(null);
    setAnnouncement(null);
  };

  const applyMurder = async (targetName) => {
    if (!targetName) return;
    const shieldedNow = tr.shielded?.[targetName];
    if (shieldedNow && !confirm(`${targetName} is currently shielded. Murder anyway?`)) return;
    if (!confirm(`Apply murder: ${targetName}?`)) return;

    const target = players.find((p) => p.display_name === targetName);
    const res = await hostStorageUpdate(gameId, STORAGE_KEY_TRAITOR_ROLES, (fresh) => {
      if (!fresh) return null;
      const placement = alive.length;
      fresh.eliminations = [...fresh.eliminations, { name: targetName, role: fresh.roles[targetName], type: "Murdered", round: fresh.round, placement, killedBy: faction }];
      fresh.shielded[targetName] = false;
      fresh.log = [{ text: `💀 ${targetName} was murdered by the ${label} Traitors`, round: fresh.round, time: new Date().toLocaleTimeString() }, ...fresh.log];
      return fresh;
    });
    if (res.ok && target) {
      await supabase.from("players").update({ alive: false, elimination_type: "murdered" }).eq("id", target.id);
      const shieldedNames = Object.keys(res.value.shielded).filter((n) => res.value.shielded[n]);
      setAnnouncement(murderScript(targetName, shieldedNames));
    }

    const mvRes = await traitorStorageUpdate(gameId, storageKey, (fresh) => {
      if (!fresh) return null;
      fresh.status = "applied";
      fresh.result = { ...fresh.result, targetName, appliedAt: Date.now() };
      fresh.history = [...(fresh.history || []), { round: fresh.round, openedAt: fresh.openedAt, closedAt: fresh.closedAt, votes: fresh.votes, result: fresh.result, appliedAt: Date.now() }];
      return fresh;
    });
    if (mvRes.ok) setMv(mvRes.value);
  };

  const archiveVote = async () => {
    const res = await traitorStorageUpdate(gameId, storageKey, (fresh) => {
      if (!fresh) return null;
      fresh.status = "archived";
      return fresh;
    });
    if (res.ok) setMv(res.value);
  };

  const voted = mv ? factionTraitors.filter((p) => mv.votes?.[p.display_name]) : [];
  const result = mv?.result;

  return (
    <Card style={{ borderColor: `${color}55` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#f0e6d3", margin: 0, fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🗡️ {label} Traitors' Murder Vote</h3>
        <Badge color={color}>{factionTraitors.map((p) => p.display_name).join(", ")}</Badge>
      </div>

      {(!mv || mv.status === "inactive" || mv.status === "archived") && (
        <div>
          <p style={{ fontSize: 12, color: "#a09080", margin: "0 0 10px", fontStyle: "italic" }}>
            Private to the {label} faction only — the other faction can't see this vote, even if they're also Traitors.
          </p>

          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "#a09080", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Eligible targets</div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#a09080", marginBottom: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={excludeShielded} onChange={(e) => { setExcludeShielded(e.target.checked); setSelectedTargets(null); }} />
              Exclude shielded players by default
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {alive.map((p) => {
                const isOtherTraitor = tr.roles?.[p.display_name] && tr.roles[p.display_name] !== faction && ["traitor-red", "traitor-black"].includes(tr.roles[p.display_name]);
                const on = targets.includes(p.display_name);
                return (
                  <button key={p.id} onClick={() => toggleTarget(p.display_name)} style={{
                    fontSize: 11, padding: "4px 10px", borderRadius: 12, cursor: "pointer",
                    background: on ? `${color}22` : "#0a1020",
                    border: `1px solid ${on ? color : "#253550"}`, color: on ? color : "#a09080",
                  }}>
                    {p.display_name}{isOtherTraitor ? " 🗡️" : ""}{tr.shielded?.[p.display_name] ? " 🛡️" : ""}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#a09080", cursor: "pointer" }}>
              <input type="checkbox" checked={allowVoteChanges} onChange={(e) => setAllowVoteChanges(e.target.checked)} /> Allow vote changes
            </label>
            <label style={{ fontSize: 12, color: "#a09080" }}>
              Rule:{" "}
              <select value={votingRule} onChange={(e) => setVotingRule(e.target.value)} style={{ background: "#0a1020", border: "1px solid #253550", borderRadius: 6, color: "#f0e6d3", fontSize: 12, padding: "3px 6px" }}>
                <option value="plurality">Plurality</option>
                <option value="majority">Majority</option>
                <option value="unanimous">Unanimous</option>
                <option value="host_decides">Host decides</option>
              </select>
            </label>
          </div>

          <Btn onClick={openVote} disabled={targets.length === 0}>Open {label} Murder Vote</Btn>
        </div>
      )}

      {mv && (mv.status === "open" || mv.status === "closed" || mv.status === "applied") && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Badge color={mv.status === "open" ? "#7a9a5c" : mv.status === "applied" ? "#c9a84c" : "#c45c3c"}>{mv.status}</Badge>
            <span style={{ fontSize: 11, color: "#706050" }}>Rule: {mv.votingRule}</span>
          </div>

          <p style={{ fontSize: 12, color: "#a09080", margin: "0 0 8px" }}>Votes submitted: {voted.length}/{factionTraitors.length}</p>

          <div style={{ display: "grid", gap: 3, marginBottom: 10 }}>
            {factionTraitors.map((p) => {
              const v = mv.votes?.[p.display_name];
              return (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 8px", background: "#0a1020", borderRadius: 6 }}>
                  <span style={{ color: "#f0e6d3" }}>{p.display_name}</span>
                  <span style={{ color: v ? color : "#706050" }}>{v ? `${v.targetName} · ${new Date(v.submittedAt).toLocaleTimeString()}` : "Not submitted"}</span>
                </div>
              );
            })}
          </div>

          {result && Object.keys(result.voteCounts).length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: "#a09080", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Tally</div>
              {Object.entries(result.voteCounts).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
                <div key={name} style={{ fontSize: 12, color: result.tiedTargets.includes(name) ? "#c45c3c" : "#a09080" }}>{name} — {count}</div>
              ))}
            </div>
          )}

          {mv.status === "closed" && (
            <div style={{ background: "#0a1020", borderRadius: 8, padding: 10, marginBottom: 10 }}>
              {result?.tied ? (
                <p style={{ fontSize: 12, color: "#c45c3c", margin: 0 }}>Tie between {result.tiedTargets.join(", ")}. Host decision required.</p>
              ) : result?.ruleSatisfied ? (
                <p style={{ fontSize: 12, color: "#7a9a5c", margin: 0 }}>Current result: <strong>{result.targetName}</strong> ({mv.votingRule}, satisfied)</p>
              ) : (
                <p style={{ fontSize: 12, color: "#706050", margin: 0 }}>No automatic result under this rule — host must choose manually.</p>
              )}
              {voted.length < factionTraitors.length && <p style={{ fontSize: 11, color: "#c45c3c", margin: "4px 0 0" }}>⚠️ Not all {label} Traitors have voted.</p>}

              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                {result?.targetName && !result?.tied && <Btn small variant="danger" onClick={() => applyMurder(result.targetName)}>Apply Murder: {result.targetName}</Btn>}
                <select value={manualTarget} onChange={(e) => setManualTarget(e.target.value)} style={{ background: "#132038", border: "1px solid #253550", borderRadius: 6, color: "#f0e6d3", fontSize: 12, padding: "5px 8px" }}>
                  <option value="">Choose manually...</option>
                  {mv.eligibleTargets.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                {manualTarget && <Btn small variant="danger" onClick={() => applyMurder(manualTarget)}>Apply: {manualTarget}</Btn>}
              </div>
            </div>
          )}

          {mv.status === "applied" && announcement && (
            <div style={{ marginBottom: 10 }}>
              <PostToSlack gameId={gameId} icon="💀" label={`${label} Murder Announcement`} text={announcement} />
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {mv.status === "open" && <Btn variant="danger" small onClick={closeVote}>Close Vote</Btn>}
            {mv.status === "applied" && <Btn small variant="ghost" onClick={archiveVote}>Archive</Btn>}
            <Btn small variant="ghost" onClick={resetVote}>Reset Vote</Btn>
          </div>
        </div>
      )}
    </Card>
  );
}
