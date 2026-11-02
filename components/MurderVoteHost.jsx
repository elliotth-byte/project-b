import { useState, useEffect } from "react";
import { Btn, Card, Badge } from "./traitorsUi";
import { traitorStorageSet, traitorStorageUpdate, traitorStorageDelete, subscribeTraitorState } from "../lib/traitorStorage";
import { hostStorageUpdate } from "../lib/hostStorage";
import { hidePendingVictims } from "../lib/pendingMurders";
import { STORAGE_KEY_TRAITOR_ROLES, factionLabel } from "../lib/traitorData";
import {
  murderVoteKey, calculateMurderVoteResult, calculateScarletDaggerResult, defaultEligibleTargets,
  withdrawScarletDagger, reconcileEligibleTargets, reconcileOpenMurderVote, sameNameSet,
} from "../lib/murderVoteData";
import { murderScript, doubleMurderScript } from "../lib/slackScripts";
import { notifyPlayersRoundChange } from "../lib/pushNotifications";
import PostToSlack from "./PostToSlack";

const SCARLET = "#d6334a";

// ─── Traitors' Murder Vote: Host Control ───
// Reworked to run per-faction: if both Red and Black Traitors are alive,
// this renders TWO fully independent panels below, each with its own
// storage key, its own eligible-target list (which now includes the
// OTHER faction — cross-faction murder is allowed), and its own apply
// button. If only one faction currently exists (no merge, or already
// merged into one alliance), you just get the one panel.
export default function MurderVoteHost({ gameId, players: rawPlayers, tr }) {
  // Murders waiting on the Afternoon Tea reveal count as dead here, even
  // though players still see them alive — see lib/pendingMurders.js.
  const players = hidePendingVictims(rawPlayers, tr);
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
  const [manualSecond, setManualSecond] = useState("");
  const [offerScarletDagger, setOfferScarletDagger] = useState(true);
  const [announcement, setAnnouncement] = useState(null);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeTraitorState(gameId, storageKey, (v) => { setMv(v); setLoading(false); });
    return unsubscribe;
  }, [gameId, storageKey]);

  // Keep an OPEN vote's target list true to the live roster. The list is a
  // snapshot taken when the vote opened, so a murder, banish, walk, restore,
  // recruit, merge or shield change since then would otherwise leave Traitors
  // looking at dead players, or missing/including the wrong people. Runs on
  // every roster/role/shield change this panel sees — including ones made
  // from other tabs (e.g. a Roundtable banish) — and only writes when the
  // list actually differs, so it settles after one write. See
  // reconcileEligibleTargets in lib/murderVoteData.js.
  useEffect(() => {
    if (!mv || mv.status !== "open") return;
    const wanted = reconcileEligibleTargets(mv, players, tr.roles, tr.shielded, faction);
    if (sameNameSet(wanted, mv.eligibleTargets)) return;
    reconcileOpenMurderVote(gameId, faction, players, tr, traitorStorageUpdate);
  }, [mv, players, tr, faction, gameId]);

  if (loading) return <Card><p style={{ color: "#706050", fontStyle: "italic" }}>Loading...</p></Card>;

  const alive = players.filter((p) => p.alive);
  // Everyone who could be a target at all right now: living, and not on the
  // acting faction's own side (shielded or not).
  const pool = defaultEligibleTargets(players, tr.roles, tr.shielded, faction, { excludeShielded: false });
  const defaultTargets = defaultEligibleTargets(players, tr.roles, tr.shielded, faction, { excludeShielded });
  // A hand-picked list is only a set of names, so it can outlive the people in
  // it — filter it against the live pool so a player who has since died (and
  // has no chip left to untoggle) can never be carried into a vote.
  const targets = (selectedTargets ?? defaultTargets).filter((n) => pool.includes(n));
  const label = factionLabel(faction);
  const color = faction === "traitor-red" ? "#c45c3c" : "#c9a84c";

  const toggleTarget = (name) => setSelectedTargets((prev) => {
    const base = (prev ?? defaultTargets).filter((n) => pool.includes(n));
    return base.includes(name) ? base.filter((n) => n !== name) : [...base, name];
  });

  const openVote = async () => {
    if (targets.length === 0) { alert("No eligible targets selected."); return; }
    if (mv?.status === "open") { if (!confirm("A vote is already open. Reopen with new settings?")) return; }
    const state = {
      active: true, status: "open", round: tr.round, openedAt: Date.now(), closedAt: null,
      faction, eligibleVoters: factionTraitors.map((p) => p.display_name), eligibleTargets: targets,
      // True when the host hand-picked targets; reconcileEligibleTargets then
      // keeps their choices and only drops people who are no longer valid.
      customTargets: selectedTargets !== null,
      // The Scarlet Dagger is offered only if the host wants it this vote AND
      // it hasn't been spent — the spent flag lives in host-only state.
      scarletDaggerAvailable: offerScarletDagger && !tr.scarletDaggerUsed,
      excludeShielded, allowVoteChanges, revealVotesToTraitors: false, revealTallyToTraitors: false,
      votingRule, majorityBasis: "eligible_voters",
      votes: {}, result: { targetName: null, ruleSatisfied: false, tied: false, tiedTargets: [], voteCounts: {}, appliedAt: null },
      history: mv?.history || [],
    };
    await traitorStorageSet(gameId, storageKey, state);
    setMv(state);
    // Each vote starts from the defaults — hand-picks were for THIS vote only.
    setSelectedTargets(null);
    await hostStorageUpdate(gameId, STORAGE_KEY_TRAITOR_ROLES, (fresh) => {
      if (!fresh) return null;
      fresh.log = [{ text: `🗡️ ${label} Traitors' murder vote opened${state.scarletDaggerAvailable ? " (Scarlet Dagger offered)" : ""}.`, round: fresh.round, time: new Date().toLocaleTimeString() }, ...fresh.log];
      return fresh;
    });
    // Targeted at just this faction's own traitors — see
    // lib/pushNotifications.js's notifyPlayersRoundChange and that API
    // route's own comment on why a murder vote is never broadcast to
    // the whole game (it'd hand non-Traitor players meta-information
    // they aren't supposed to have).
    notifyPlayersRoundChange(gameId, `🗡️ ${label} Murder Vote`, "The murder vote is open — head in to cast your vote.", "round-change", factionTraitors.map((p) => p.id));
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
    setManualTarget("");
    setManualSecond("");
    setAnnouncement(null);
  };

  const applyMurder = async (targetName) => {
    if (!targetName) return;
    const shieldedNow = tr.shielded?.[targetName];
    if (shieldedNow && !confirm(`${targetName} is currently shielded. Murder anyway?`)) return;
    if (!confirm(`Apply murder: ${targetName}?`)) return;

    const target = players.find((p) => p.display_name === targetName);
    // Black Traitor kills get their own elimination_type — see
    // components/TraitorsEliminatedScreen.jsx's banner map and pages/
    // play.jsx's TRAITORS_ELIMINATION_MESSAGES for the vaguer, "no
    // named faction" message this feeds into.
    const elimType = faction === "traitor-black" ? "murdered_black" : "murdered";
    // Recorded as a PENDING murder only — players.alive isn't touched
    // until the Afternoon Tea arrivals have gone out (see
    // lib/pendingMurders.js), so the victim can't find out in-app first.
    // Placement (lib/seasonPlacement.js) is recorded at reveal time.
    const res = await hostStorageUpdate(gameId, STORAGE_KEY_TRAITOR_ROLES, (fresh) => {
      if (!fresh) return null;
      const placement = alive.length;
      fresh.eliminations = [...fresh.eliminations, { name: targetName, role: fresh.roles[targetName], type: "Murdered", round: fresh.round, placement, killedBy: faction }];
      fresh.shielded[targetName] = false;
      if (target && !(fresh.pendingMurders || []).some((m) => m.name === targetName)) {
        fresh.pendingMurders = [...(fresh.pendingMurders || []), { id: target.id, name: targetName, elimType, recordPlacement: true, at: Date.now() }];
      }
      fresh.log = [{ text: `💀 ${targetName} was murdered by the ${label} Traitors (hidden until Afternoon Tea)`, round: fresh.round, time: new Date().toLocaleTimeString() }, ...fresh.log];
      return fresh;
    });
    if (res.ok && target) {
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

  // ─── Scarlet Dagger: apply a double murder ───
  // Same pending-murder pipeline as a normal murder (both victims stay hidden
  // until Afternoon Tea; placement is recorded one after the other at reveal),
  // plus marking the dagger spent. The spent check and the write happen in ONE
  // hostStorageUpdate, so two open votes can never both use it.
  const applyDoubleMurder = async (firstName, secondName, voteCarried) => {
    if (!firstName || !secondName || firstName === secondName) return;
    if (tr.scarletDaggerUsed) { alert("The Scarlet Dagger has already been used."); return; }
    const shieldedHit = [firstName, secondName].filter((n) => tr.shielded?.[n]);
    if (shieldedHit.length > 0 && !confirm(`${shieldedHit.join(" and ")} ${shieldedHit.length === 1 ? "is" : "are"} currently shielded. Murder anyway?`)) return;
    if (!voteCarried && !confirm("The Traitors did not vote to draw the Scarlet Dagger. Use it anyway as host?")) return;
    if (!confirm(`🩸 Draw the Scarlet Dagger: ${firstName} + ${secondName}?\n\nThe dagger is single-use — it is gone after this.`)) return;

    const elimType = faction === "traitor-black" ? "murdered_black" : "murdered";
    let alreadySpent = false;
    const res = await hostStorageUpdate(gameId, STORAGE_KEY_TRAITOR_ROLES, (fresh) => {
      if (!fresh) return null;
      if (fresh.scarletDaggerUsed) { alreadySpent = true; return null; }
      [firstName, secondName].forEach((name, i) => {
        const target = players.find((p) => p.display_name === name);
        fresh.eliminations = [...fresh.eliminations, { name, role: fresh.roles[name], type: "Murdered", round: fresh.round, placement: alive.length - i, killedBy: faction, scarletDagger: true }];
        fresh.shielded[name] = false;
        if (target && !(fresh.pendingMurders || []).some((m) => m.name === name)) {
          fresh.pendingMurders = [...(fresh.pendingMurders || []), { id: target.id, name, elimType, recordPlacement: true, at: Date.now() }];
        }
      });
      fresh.scarletDaggerUsed = true;
      fresh.scarletDaggerUsedRound = fresh.round;
      fresh.log = [{ text: `🩸 The Scarlet Dagger was drawn — ${firstName} and ${secondName} were murdered by the ${label} Traitors (hidden until Afternoon Tea)`, round: fresh.round, time: new Date().toLocaleTimeString() }, ...fresh.log];
      return fresh;
    });
    if (!res.ok) {
      alert(alreadySpent
        ? "The Scarlet Dagger was already used — no murders were applied."
        : "Couldn't apply the double murder. Nothing was changed — try again.");
      return;
    }

    const shieldedNames = Object.keys(res.value.shielded).filter((n) => res.value.shielded[n]);
    setAnnouncement(doubleMurderScript([firstName, secondName], shieldedNames));

    const mvRes = await traitorStorageUpdate(gameId, storageKey, (fresh) => {
      if (!fresh) return null;
      fresh.status = "applied";
      fresh.result = { ...fresh.result, targetName: firstName, secondTargetName: secondName, doubleMurder: true, appliedAt: Date.now() };
      fresh.history = [...(fresh.history || []), { round: fresh.round, openedAt: fresh.openedAt, closedAt: fresh.closedAt, votes: fresh.votes, result: fresh.result, appliedAt: Date.now() }];
      return fresh;
    });
    if (mvRes.ok) setMv(mvRes.value);
    // The dagger is gone — stop offering it on any other vote still open.
    await withdrawScarletDagger(gameId, traitorStorageUpdate);
  };

  // Escape hatch for host mistakes (e.g. the wrong pair was applied). The
  // dagger is meant to be single-use, so this asks first and logs it.
  const restoreScarletDagger = async () => {
    if (!confirm("Restore the Scarlet Dagger?\n\nOnly do this to undo a mistake — it is meant to be single-use.")) return;
    await hostStorageUpdate(gameId, STORAGE_KEY_TRAITOR_ROLES, (fresh) => {
      if (!fresh) return null;
      fresh.scarletDaggerUsed = false;
      fresh.scarletDaggerUsedRound = null;
      fresh.log = [{ text: "🩸 The Scarlet Dagger was restored by the host.", round: fresh.round, time: new Date().toLocaleTimeString() }, ...fresh.log];
      return fresh;
    });
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

  // Scarlet Dagger, derived live from the votes. firstPick is whoever the
  // normal vote chose (or the host picked by hand); the dagger's second
  // victim can't be that same player.
  const firstPick = manualTarget || (result?.targetName && !result?.tied ? result.targetName : "");
  const dagger = mv?.scarletDaggerAvailable && !tr.scarletDaggerUsed ? calculateScarletDaggerResult(mv, firstPick || null) : null;
  const secondPick = (manualSecond && manualSecond !== firstPick ? manualSecond : "") || dagger?.secondTarget || "";

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

          <div style={{ marginBottom: 10 }}>
            {tr.scarletDaggerUsed ? (
              <p style={{ fontSize: 12, color: SCARLET, margin: 0 }}>
                🩸 The Scarlet Dagger has been spent{tr.scarletDaggerUsedRound ? ` (Round ${tr.scarletDaggerUsedRound})` : ""}.{" "}
                <button onClick={restoreScarletDagger} style={{ background: "none", border: "none", padding: 0, color: "#a09080", fontSize: 11, textDecoration: "underline", cursor: "pointer" }}>Restore</button>
              </p>
            ) : (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: SCARLET, cursor: "pointer" }}>
                <input type="checkbox" checked={offerScarletDagger} onChange={(e) => setOfferScarletDagger(e.target.checked)} />
                🩸 Offer the Scarlet Dagger this vote (single use — a double murder)
              </label>
            )}
          </div>

          <Btn onClick={openVote} disabled={targets.length === 0}>Open {label} Murder Vote</Btn>
        </div>
      )}

      {mv && (mv.status === "open" || mv.status === "closed" || mv.status === "applied") && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Badge color={mv.status === "open" ? "#7a9a5c" : mv.status === "applied" ? "#c9a84c" : "#c45c3c"}>{mv.status}</Badge>
            <span style={{ fontSize: 11, color: "#706050" }}>
              Rule: {mv.votingRule}{mv.scarletDaggerAvailable ? <span style={{ color: SCARLET }}> · 🩸 dagger offered</span> : null}
            </span>
          </div>

          <p style={{ fontSize: 12, color: "#a09080", margin: "0 0 8px" }}>Votes submitted: {voted.length}/{factionTraitors.length}</p>

          <div style={{ display: "grid", gap: 3, marginBottom: 10 }}>
            {factionTraitors.map((p) => {
              const v = mv.votes?.[p.display_name];
              return (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 8px", background: "#0a1020", borderRadius: 6 }}>
                  <span style={{ color: "#f0e6d3" }}>{p.display_name}</span>
                  <span style={{ color: v ? color : "#706050" }}>
                    {v ? (
                      <>
                        {v.targetName}
                        {v.useDagger ? <span style={{ color: SCARLET }}> + 🩸 {v.secondTargetName}</span> : null}
                        {` · ${new Date(v.submittedAt).toLocaleTimeString()}`}
                      </>
                    ) : "Not submitted"}
                  </span>
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

              {dagger && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #253550" }}>
                  <p style={{ fontSize: 12, fontWeight: 600, margin: "0 0 6px", color: dagger.passed ? SCARLET : "#706050" }}>
                    🩸 Scarlet Dagger — {dagger.yes}/{dagger.eligibleCount} voted to draw it (need {dagger.required})
                    {dagger.passed ? " · ACTIVATED" : mv.votingRule === "host_decides" ? " · host decides" : " · not activated"}
                  </p>
                  {Object.keys(dagger.secondCounts).length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 11, color: "#a09080", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>Second victim</div>
                      {Object.entries(dagger.secondCounts).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
                        <div key={name} style={{ fontSize: 12, color: dagger.secondTiedTargets.includes(name) && dagger.secondTied ? "#c45c3c" : "#a09080" }}>{name} — {count}</div>
                      ))}
                    </div>
                  )}
                  {dagger.secondTied && <p style={{ fontSize: 11, color: "#c45c3c", margin: "0 0 6px" }}>Tie for second victim between {dagger.secondTiedTargets.join(", ")} — choose below.</p>}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <select value={manualSecond} onChange={(e) => setManualSecond(e.target.value)} style={{ background: "#132038", border: "1px solid #253550", borderRadius: 6, color: "#f0e6d3", fontSize: 12, padding: "5px 8px" }}>
                      <option value="">{dagger.secondTarget ? `Second victim: ${dagger.secondTarget}` : "Choose second victim..."}</option>
                      {mv.eligibleTargets.filter((n) => n !== firstPick).map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    {firstPick && secondPick && (
                      <Btn small variant="danger" onClick={() => applyDoubleMurder(firstPick, secondPick, dagger.passed)}>
                        🩸 Apply Double Murder: {firstPick} + {secondPick}
                      </Btn>
                    )}
                  </div>
                  {!firstPick && <p style={{ fontSize: 11, color: "#706050", margin: "6px 0 0" }}>Settle the first victim above (or resolve the tie) to enable the double murder.</p>}
                </div>
              )}
            </div>
          )}

          {mv.status === "applied" && mv.result?.doubleMurder && (
            <p style={{ fontSize: 12, color: SCARLET, margin: "0 0 8px" }}>
              🩸 Scarlet Dagger drawn: <strong>{mv.result.targetName}</strong> + <strong>{mv.result.secondTargetName}</strong>
            </p>
          )}

          {mv.status === "applied" && announcement && (
            <div style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 12, color: "#c9a84c", margin: "0 0 6px", fontStyle: "italic" }}>
                🤫 Hidden from players until the ☕ Afternoon Tea arrivals finish (Traitor Roles panel). Post this announcement after tea, or it'll spoil the reveal.
              </p>
              <PostToSlack gameId={gameId} icon={mv.result?.doubleMurder ? "🩸" : "💀"} label={mv.result?.doubleMurder ? `${label} Double Murder Announcement` : `${label} Murder Announcement`} text={announcement} />
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
