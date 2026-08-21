import { useState, useEffect, useRef } from "react";
import { Btn, Card, DurationInput } from "./ui";
import { supabase } from "../lib/supabaseClient";
import { storageDelete, storageGet, storageSet, storageUpdate } from "../lib/gameStorage";
import { removePendingPlayer, quitOrRemoveApprovedPlayer } from "../lib/playerRemoval";
import {
  KEY_ROUND, KEY_CHALLENGE, KEY_FATES, KEY_EXILE, KEY_EXILE_HISTORY, KEY_REENTRY,
  KEY_FINALE, KEY_CHALLENGE_HISTORY, DEFAULT_SETTINGS, getSettings, setSettings, subscribeSettings,
  initRound, PHASES,
} from "../lib/gameState";
import { REENTRY_STATUS } from "../lib/reentryLogic";
import { exileDrawContext, chaosPicksKey, FINALE_DRAW_CONTEXT } from "../lib/chaosDraw";
import { AVATAR_COLLECTIONS } from "../lib/avatarCollections";
import { uploadAvatar, removeAvatar } from "../lib/avatarUpload";
import { CHARACTER_POWERS, powerFor, assignRandomPowers } from "../lib/characterPowers";

export default function AdminHost({ gameId, players, round }) {
  const [names, setNames] = useState({});
  const [saving, setSaving] = useState({});
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [settings, setLocalSettings] = useState(DEFAULT_SETTINGS);
  const [savingSettings, setSavingSettings] = useState(false);
  const [assigningPowers, setAssigningPowers] = useState(false);
  const [adminSubTab, setAdminSubTab] = useState("roster"); // "roster" | "setup"
  const [resettingId, setResettingId] = useState(null);
  const [resetResult, setResetResult] = useState(null); // { playerId, username, newPassword } | null
  const [resetError, setResetError] = useState("");
  const [notifiedPlayerIds, setNotifiedPlayerIds] = useState(new Set());

  // A player can have multiple subscription rows (one per device — see
  // sql/add-push-subscriptions.sql), so this only needs to know WHICH
  // player_ids appear at all, not the individual rows or their specific
  // preferences. select() is scoped to just player_id deliberately —
  // the host read policy (sql/add-host-reads-push-subscriptions.sql)
  // grants row access, but there's no reason to also pull each device's
  // actual push endpoint/keys over the network for a view that only
  // needs a yes/no per player.
  useEffect(() => {
    if (!gameId) return;
    let active = true;
    const load = async () => {
      const { data } = await supabase.from("push_subscriptions").select("player_id").eq("game_id", gameId);
      if (active) setNotifiedPlayerIds(new Set((data || []).map((r) => r.player_id)));
    };
    load();
    const channel = supabase
      .channel(`push-subs-roster:${gameId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "push_subscriptions", filter: `game_id=eq.${gameId}` }, load)
      .subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, [gameId]);

  const resetPassword = async (player) => {
    if (!window.confirm(`Reset ${player.display_name}'s password? Their old password stops working immediately.`)) return;
    setResettingId(player.id);
    setResetError("");
    setResetResult(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) { setResetError("You're not logged in — try refreshing the page."); setResettingId(null); return; }
    try {
      const res = await fetch("/api/host-reset-player-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ gameId, playerId: player.id }),
      });
      const body = await res.json();
      if (!res.ok) { setResetError(body.error || "Something went wrong."); setResettingId(null); return; }
      setResetResult({ playerId: player.id, username: body.username, newPassword: body.newPassword });
    } catch (e) {
      setResetError("Something went wrong — try again.");
    }
    setResettingId(null);
  };

  useEffect(() => {
    const unsubscribe = subscribeSettings(gameId, setLocalSettings);
    return unsubscribe;
  }, [gameId]);

  const pending = players.filter((p) => !p.approved);
  const seasonStarted = !!round && round.phase !== PHASES.LOBBY;

  const approvePlayer = async (p) => {
    const { error } = await supabase.from("players").update({ approved: true }).eq("id", p.id);
    if (error) alert("Couldn't approve: " + error.message);
  };

  const rejectPlayer = async (p) => {
    if (!confirm(`Remove ${p.display_name} from this game? They'll need a new join link to try again.`)) return;
    const { error } = await removePendingPlayer(p.id);
    if (error) alert("Couldn't remove: " + error.message);
  };

  // For a player who's already approved (and possibly mid-game) — unlike
  // rejectPlayer above, this doesn't delete their row (see
  // lib/playerRemoval.js for why): it marks them out with
  // elimination_type "quit", the same as a self-serve quit.
  const removeApprovedPlayer = async (p) => {
    if (!confirm(`Remove ${p.display_name} from this game? They'll be marked out (like an exile, but with no re-entry attempt) rather than deleted, so past rounds still show their name correctly.`)) return;
    const { error } = await quitOrRemoveApprovedPlayer(p.id);
    if (error) alert("Couldn't remove: " + error.message);
  };

  // The manual undo for the above (or a genuine exile) — brings someone
  // back to alive without needing to win a challenge for it. Also
  // resolves any lingering re-entry record so they don't ALSO keep
  // showing up as "eligible to opt into re-entry" once they're just a
  // regular alive player again.
  const restorePlayer = async (p) => {
    if (!confirm(`Restore ${p.display_name}? They'll be alive again, as if never exiled.`)) return;
    const { error } = await supabase.from("players").update({ alive: true, elimination_type: null }).eq("id", p.id);
    if (error) { alert("Couldn't restore: " + error.message); return; }
    await storageUpdate(gameId, KEY_REENTRY, (fresh) => {
      const list = fresh || [];
      const idx = list.findIndex((r) => r.playerId === p.id);
      if (idx < 0) return list;
      list[idx] = { ...list[idx], status: REENTRY_STATUS.RETURNED };
      return list;
    });
  };

  const nameFor = (p) => names[p.id] ?? p.display_name;

  const saveName = async (p) => {
    const newName = (names[p.id] ?? "").trim();
    if (!newName || newName === p.display_name) return;
    setSaving({ ...saving, [p.id]: true });
    const { error } = await supabase.from("players").update({ display_name: newName }).eq("id", p.id);
    setSaving({ ...saving, [p.id]: false });
    if (error) alert("Couldn't rename: " + error.message);
  };

  const saveSettings = async (patch) => {
    setSavingSettings(true);
    await setSettings(gameId, patch);
    setSavingSettings(false);
  };

  // Random-mode power assignment — one-time (well, re-triggerable, but
  // doing so mid-season would reshuffle everyone's power out from under
  // them, so this is only ever offered before Round 1 — see
  // seasonStarted gating below). No bulk "different value per row"
  // update in the Supabase JS client without an RPC, so this loops over
  // players individually — the player count here is small enough
  // (typically well under 20) that this is fine.
  const assignRandomPowersNow = async () => {
    setAssigningPowers(true);
    const assignments = assignRandomPowers(players);
    for (const p of players) {
      await supabase.from("players").update({ power_state: { ...(p.power_state || {}), assignedPower: assignments[p.id] } }).eq("id", p.id);
    }
    setAssigningPowers(false);
  };

  // Avatar moderation — available regardless of mode, since a photo set
  // under one mode doesn't disappear just because the host later
  // switches modes (see the grid below, always visible once any upload
  // mode has ever been used). hostUploadFileInputs lets each player's
  // row have its own hidden <input type=file>, referenced by player id.
  const hostUploadFileInputs = useRef({});
  const [avatarBusyId, setAvatarBusyId] = useState(null);
  const [avatarError, setAvatarError] = useState("");

  const hostUploadAvatar = async (playerId, file) => {
    setAvatarBusyId(playerId);
    setAvatarError("");
    const res = await uploadAvatar(playerId, file);
    setAvatarBusyId(null);
    if (!res.ok) setAvatarError(res.error || "Couldn't upload — try again.");
  };

  const hostRemoveAvatar = async (playerId, playerName) => {
    if (!confirm(`Remove ${playerName}'s avatar photo?`)) return;
    setAvatarBusyId(playerId);
    setAvatarError("");
    const res = await removeAvatar(playerId);
    setAvatarBusyId(null);
    if (!res.ok) setAvatarError(res.error || "Couldn't remove — try again.");
  };

  const [confirmRoundReset, setConfirmRoundReset] = useState(false);
  const [roundResetBusy, setRoundResetBusy] = useState(false);
  const [roundResetStatus, setRoundResetStatus] = useState("");

  const roundResetBlockedReason =
    !round || round.phase === PHASES.LOBBY || round.phase === PHASES.ENDED
      ? "There's no active round to reset."
      : round.phase === PHASES.FINALE
        ? "Can't reset during the Finale — use Reset Season instead if you need to undo this far."
        : null;

  // Puts THIS round's Challenge, Fates Ceremony, and Exile Vote back to
  // "hasn't happened yet" — for when something went wrong before anyone
  // meaningfully competed (nobody actually got to play, a mini-game broke,
  // etc). Unlike Reset Season, this leaves every EARLIER round's results,
  // and everyone's alive/exiled status, untouched. As a safety rail, it
  // refuses once this round's Exile Vote has actually been revealed —
  // undoing a real elimination needs Reset Season (or manual correction),
  // not this.
  const resetCurrentRound = async () => {
    setRoundResetBusy(true);
    setRoundResetStatus("");
    const roundNum = round.round;

    const exile = await storageGet(gameId, KEY_EXILE);
    if (exile && exile.round === roundNum && exile.revealed) {
      setRoundResetBusy(false);
      setRoundResetStatus("Can't reset — this round's Exile Vote has already been revealed and someone's been eliminated. Use Reset Season if you need to undo that.");
      return;
    }
    // The check above only protects THIS round's own exile data. It used
    // to be possible for a PREVIOUS round's exile to still be sitting in
    // this same slot — un-recorded into history, because of a separate
    // bug (see lib/roundEngine.js's recordExileHistoryIfMissing) — and
    // get silently deleted by the blanket storageDelete below the moment
    // a host reset a LATER round, permanently destroying that earlier
    // round's ceremony data with no warning. Block outright instead of
    // guessing at an auto-recovery here; better to make the host go
    // check what's going on than risk deleting it a second time.
    if (exile && exile.round !== roundNum) {
      setRoundResetBusy(false);
      setRoundResetStatus(`Can't reset — there's still Exile Vote data left over from round ${exile.round} sitting here, unresolved. Resetting could permanently destroy it. Check that round's voting history first (it may need manual recovery) before trying this again.`);
      return;
    }
    const fates = await storageGet(gameId, KEY_FATES);
    if (fates && fates.round !== roundNum) {
      setRoundResetBusy(false);
      setRoundResetStatus(`Can't reset — there's still Fates Ceremony data left over from round ${fates.round} sitting here, unresolved. Resetting could permanently destroy it. Check that round's voting history first before trying this again.`);
      return;
    }

    await Promise.all([
      storageSet(gameId, KEY_CHALLENGE, {
        round: roundNum, active: false, startedAt: null, endsAt: null,
        participantIds: [], reentryAttemptIds: [], placements: [], finalized: false, forfeitedIds: [],
      }),
      storageDelete(gameId, `pb:challenge-scores:${roundNum}`),
      storageDelete(gameId, `pb:challenge-session:${roundNum}`),
      storageDelete(gameId, KEY_FATES),
      storageDelete(gameId, KEY_EXILE),
      storageDelete(gameId, `pb:exile-votes:${roundNum}`),
      // Power of Khaos state for this specific round's Exile Vote — was
      // previously left behind by a round reset entirely, meaning a
      // holder's already-locked-in nullify pick (or an in-progress draw)
      // could still be sitting there the next time this same round
      // number played the Exile Vote again. pb:chaos-picks tracks each
      // player's draw button pick (game_state); chaos_secrets holds the
      // holder's actual nullify target (its own table, not game_state —
      // see lib/chaosSecrets.js for why: RLS there restricts reads to
      // the host or the current holder specifically).
      storageDelete(gameId, chaosPicksKey(exileDrawContext(roundNum))),
      supabase.from("chaos_secrets").delete().eq("game_id", gameId).eq("context", exileDrawContext(roundNum)),
      storageUpdate(gameId, KEY_CHALLENGE_HISTORY, (fresh) => (fresh || []).filter((c) => c.round !== roundNum)),
      storageUpdate(gameId, KEY_EXILE_HISTORY, (fresh) => (fresh || []).filter((e) => e.round !== roundNum)),
      // Every still-exiled player competes in every challenge automatically
      // now, so anyone flipped from PENDING to COMPETING when the host
      // started the (now-reset) challenge needs to go back to PENDING —
      // otherwise they'd be stuck in COMPETING forever with no challenge
      // left to resolve it, unable to compete again until that clears.
      storageUpdate(gameId, KEY_REENTRY, (fresh) => {
        const list = fresh || [];
        return list.map((r) => (r.status === REENTRY_STATUS.COMPETING) ? { ...r, status: REENTRY_STATUS.PENDING } : r);
      }),
    ]);

    await storageUpdate(gameId, KEY_ROUND, (fresh) => ({
      ...(fresh || {}), round: roundNum, phase: PHASES.CHALLENGE, phaseStartedAt: null, phaseEndsAt: null,
      finalFour: false, doubleElimination: false,
    }));

    setRoundResetBusy(false);
    setConfirmRoundReset(false);
    setRoundResetStatus(`Round ${roundNum} reset. Start the battle again whenever you're ready.`);
  };

  // Full restart: every challenge/fates/exile/finale/reentry state, every
  // round-numbered vote key up to however far the game got, and every
  // player's alive status. The roster itself (who's signed up) and any
  // renames are NOT touched — same behavior as the original project.
  const resetSeason = async () => {
    setBusy(true);
    const maxRound = round?.round || 1;
    const deletes = [
      storageDelete(gameId, KEY_CHALLENGE), storageDelete(gameId, KEY_FATES), storageDelete(gameId, KEY_EXILE),
      storageDelete(gameId, KEY_FINALE), storageDelete(gameId, KEY_REENTRY),
      storageDelete(gameId, KEY_EXILE_HISTORY), storageDelete(gameId, KEY_CHALLENGE_HISTORY),
      storageDelete(gameId, "pb:finale-votes"),
      // Same Power of Khaos cleanup as resetCurrentRound, but for every
      // round this season ever reached (the per-round loop below) plus
      // the finale's own context, and via a single game-wide delete for
      // chaos_secrets rather than one call per round/context.
      storageDelete(gameId, chaosPicksKey(FINALE_DRAW_CONTEXT)),
      supabase.from("chaos_secrets").delete().eq("game_id", gameId),
    ];
    for (let r = 1; r <= maxRound; r++) {
      deletes.push(storageDelete(gameId, `pb:exile-votes:${r}`));
      deletes.push(storageDelete(gameId, `pb:challenge-scores:${r}`));
      deletes.push(storageDelete(gameId, chaosPicksKey(exileDrawContext(r))));
    }
    await Promise.all(deletes);
    await initRound(gameId);

    const { error } = await supabase.from("players").update({ alive: true, elimination_type: null }).eq("game_id", gameId);
    if (error) console.error("Failed to reset player alive status:", error);

    setBusy(false);
    setConfirmReset(false);
    setStatus("Season reset. Everyone is alive again, all round history wiped. Roster and any renames are untouched.");
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #3d1f5c" }}>
        {[{ key: "roster", label: "👥 Roster & Resets" }, { key: "setup", label: "⚙️ Season Setup" }].map((t) => (
          <button key={t.key} onClick={() => setAdminSubTab(t.key)} style={{
            background: adminSubTab === t.key ? "rgba(255,45,149,0.13)" : "transparent",
            color: adminSubTab === t.key ? "#ff2d95" : "#a68fd6",
            border: "none", borderRadius: "8px 8px 0 0", padding: "8px 14px",
            fontSize: 12.5, fontWeight: 600, cursor: "pointer",
            borderBottom: adminSubTab === t.key ? "2px solid #ff2d95" : "2px solid transparent",
          }}>
            {t.label}{t.key === "roster" && pending.length > 0 ? ` (${pending.length})` : ""}
          </button>
        ))}
      </div>

      {adminSubTab === "roster" && (
        <>
          {pending.length > 0 && (
            <Card style={{ borderColor: "rgba(255,45,149,0.5)" }}>
              <h3 style={{ color: "#ff2d95", margin: "0 0 6px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
                ⏳ Pending Approval ({pending.length})
              </h3>
              <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 12px", fontStyle: "italic" }}>
                These players have joined but can't do anything until you approve them.
              </p>
              <div style={{ display: "grid", gap: 6 }}>
                {pending.map((p) => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0d0618", borderRadius: 6, padding: "8px 12px" }}>
                    <span style={{ fontSize: 13, color: "#f5f0ff" }}>{p.display_name}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Btn small onClick={() => approvePlayer(p)}>Approve</Btn>
                      <Btn small variant="ghost" onClick={() => rejectPlayer(p)}>Remove</Btn>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <h3 style={{ color: "#f5f0ff", margin: "0 0 6px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
              🔔 Notifications
            </h3>
            <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 12px", fontStyle: "italic" }}>
              {notifiedPlayerIds.size} of {players.filter((p) => p.approved).length} approved players have notifications enabled on at least one device.
            </p>
            <div style={{ display: "grid", gap: 6 }}>
              {players.filter((p) => p.approved).map((p) => {
                const notified = notifiedPlayerIds.has(p.id);
                return (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0d0618", borderRadius: 6, padding: "6px 12px" }}>
                    <span style={{ fontSize: 13, color: "#f5f0ff" }}>{p.display_name}</span>
                    <span style={{ fontSize: 11, color: notified ? "#00ff9d" : "#6b4f99", fontWeight: 600 }}>
                      {notified ? "🔔 On" : "🔕 Off"}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <h3 style={{ color: "#f5f0ff", margin: "0 0 6px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🛠 Player Names</h3>
            <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 12px", fontStyle: "italic" }}>
              Renaming here updates the name everywhere. One real limitation worth knowing: anything already recorded under the OLD
              name (a vote already cast, a nomination) keeps referencing the old name. Renaming before a round starts, or between
              rounds, avoids that entirely.
            </p>
            <div style={{ display: "grid", gap: 6 }}>
              {players.filter((p) => p.approved).map((p) => (
                <div key={p.id}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      value={nameFor(p)}
                      onChange={(e) => setNames({ ...names, [p.id]: e.target.value })}
                      style={{ flex: 1, background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 6, padding: "6px 10px", color: "#f5f0ff", fontSize: 13 }}
                    />
                    {p.alias && <span style={{ fontSize: 11, color: "#a68fd6", whiteSpace: "nowrap" }} title="Their alias — only you see both">🏛 {p.alias}</span>}
                    <Btn small onClick={() => saveName(p)} disabled={saving[p.id] || nameFor(p) === p.display_name}>
                      {saving[p.id] ? "Saving..." : "Save"}
                    </Btn>
                    <Btn small variant="ghost" onClick={() => resetPassword(p)} disabled={resettingId === p.id}>
                      {resettingId === p.id ? "..." : "🔑 Reset PW"}
                    </Btn>
                    {p.alive ? (
                      <Btn small variant="ghost" onClick={() => removeApprovedPlayer(p)}>Remove</Btn>
                    ) : (
                      <>
                        <span style={{ fontSize: 11, color: "#6b4f99" }}>({p.elimination_type === "quit" ? "left" : "exiled"})</span>
                        <Btn small variant="ghost" onClick={() => restorePlayer(p)}>Restore</Btn>
                      </>
                    )}
                  </div>
                  {resetResult?.playerId === p.id && (
                    <div style={{ background: "rgba(0,255,157,0.08)", border: "1px solid rgba(0,255,157,0.3)", borderRadius: 6, padding: "8px 10px", marginTop: 4, fontSize: 12 }}>
                      <p style={{ margin: "0 0 4px", color: "#00ff9d" }}>
                        Password reset — relay these to {p.display_name} however you like (chat, verbally, etc.):
                      </p>
                      <p style={{ margin: 0, color: "#f5f0ff", fontFamily: "monospace" }}>
                        Username: <strong>{resetResult.username}</strong> · New password: <strong>{resetResult.newPassword}</strong>
                      </p>
                      <button onClick={() => setResetResult(null)} style={{ background: "none", border: "none", color: "#6b4f99", fontSize: 11, cursor: "pointer", padding: 0, marginTop: 4 }}>Dismiss</button>
                    </div>
                  )}
                </div>
              ))}
              {resetError && (
                <p style={{ color: "#ff3860", fontSize: 12, margin: "4px 0 0" }}>{resetError}</p>
              )}
              {players.length === 0 && <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic" }}>No players have joined yet.</p>}
            </div>
          </Card>

          <Card style={{ borderColor: "rgba(255,45,149,0.3)" }}>
            <h3 style={{ color: "#f5f0ff", margin: "0 0 6px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
              ♻️ Reset Round {round?.round || ""}
            </h3>
            {roundResetStatus && (
              <p style={{ fontSize: 12, color: roundResetStatus.startsWith("Can't") ? "#ff3860" : "#00ff9d", margin: "0 0 10px" }}>{roundResetStatus}</p>
            )}
            <p style={{ fontSize: 12, color: "#a68fd6", margin: "0 0 8px" }}>
              Puts this round's Battle, Fates Ceremony, and Exile Vote back to "hasn't happened yet" — for when nobody actually
              got to compete. Earlier rounds and everyone's current alive/exiled status are untouched. Only available before this
              round's Exile Vote has been revealed.
            </p>
            {roundResetBlockedReason ? (
              <p style={{ fontSize: 12, color: "#6b4f99", fontStyle: "italic", margin: 0 }}>{roundResetBlockedReason}</p>
            ) : confirmRoundReset ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ color: "#ff3860", fontSize: 12, fontWeight: 700 }}>Really reset Round {round.round}?</span>
                <Btn small variant="danger" onClick={resetCurrentRound} disabled={roundResetBusy}>
                  {roundResetBusy ? "Resetting..." : "Yes, reset this round"}
                </Btn>
                <Btn small variant="ghost" onClick={() => setConfirmRoundReset(false)}>Cancel</Btn>
              </div>
            ) : (
              <Btn small variant="danger" onClick={() => setConfirmRoundReset(true)}>Reset This Round</Btn>
            )}
          </Card>

          <Card style={{ borderColor: "rgba(255,56,96,0.3)" }}>
            <h3 style={{ color: "#f5f0ff", margin: "0 0 6px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>♻️ Reset Season</h3>
            {status && <p style={{ fontSize: 12, color: "#00ff9d", margin: "0 0 10px" }}>{status}</p>}
            <p style={{ fontSize: 12, color: "#ff3860", margin: "0 0 8px", fontWeight: 600 }}>
              Wipes every challenge, nomination, vote, exile, and re-entry attempt, and brings everyone back to alive at Round 1. This
              cannot be undone. The roster (who's signed up) and any renames survive.
            </p>
            {confirmReset ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ color: "#ff3860", fontSize: 12, fontWeight: 700 }}>Really reset the whole season?</span>
                <Btn small variant="danger" onClick={resetSeason} disabled={busy}>Yes, reset everything</Btn>
                <Btn small variant="ghost" onClick={() => setConfirmReset(false)}>Cancel</Btn>
              </div>
            ) : (
              <Btn small variant="danger" onClick={() => setConfirmReset(true)}>Reset Entire Season</Btn>
            )}
          </Card>
        </>
      )}

      {adminSubTab === "setup" && (
        <>
          <Card>
            <h3 style={{ color: "#f5f0ff", margin: "0 0 6px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>⏱ Round Lengths</h3>
            <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 12px", fontStyle: "italic" }}>
              Default timer for each phase. When a phase's timer runs out, the game automatically moves to the next phase and posts
              an update in-app — as long as the host has finished entering whatever that phase needed (results, nominations, etc.).
            </p>
            <div style={{ display: "grid", gap: 10 }}>
              {[
                { key: "challengeDurationSec", label: "Battle" },
                { key: "fatesDurationSec", label: "Fates Ceremony" },
                { key: "voteDurationSec", label: "Exile Vote (discussion + voting)" },
              ].map((row) => (
                <div key={row.key} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ width: 190, fontSize: 12.5, color: "#f5f0ff", flexShrink: 0 }}>{row.label}</span>
                  <DurationInput valueSec={settings[row.key]} onChange={(sec) => saveSettings({ [row.key]: sec })} />
                </div>
              ))}
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#a68fd6", cursor: "pointer" }}>
                <input type="checkbox" checked={settings.autoAdvance} onChange={(e) => saveSettings({ autoAdvance: e.target.checked })} />
                Automatically move on once a phase's timer runs out, OR the moment everyone's actually finished (every competitor done with
                the challenge, all 3 Fates nominations in, every eligible vote cast) — whichever comes first. This is the setting that makes
                async play work with nobody needing to be watching. Voting itself always closes automatically once everyone's voted
                regardless of this setting — turning it off only means the round then WAITS for your "Finalize Exile & Continue" click
                instead of finishing on its own, which is worth doing if you'd rather run a live, unhurried reveal ceremony for the Exile
                Vote or Finale.
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#ff2d95", cursor: "pointer", fontWeight: 700 }}>
                <input type="checkbox" checked={settings.infiniteTime} onChange={(e) => saveSettings({ infiniteTime: e.target.checked })} />
                ∞ Infinite time — no phase gets an automatic timer at all; every Battle/Fates Ceremony/Exile Vote/Finale runs until the host ends it
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#a68fd6", cursor: "pointer" }}>
                <input type="checkbox" checked={settings.chatEnabled} onChange={(e) => saveSettings({ chatEnabled: e.target.checked })} />
                💬 Chat — adds a Chat tab for players (group chat + DMs with each other) and one for you. Off by default so it doesn't
                suddenly show up mid-season for a game already underway; you can safely leave it off for an existing season and only turn
                it on for a fresh one. DMs are readable by you, same as confessionals — players see a note saying so.
              </label>
              <label style={{
                display: "flex", alignItems: "center", gap: 6, fontSize: 12.5,
                color: seasonStarted ? "#3d1f5c" : "#a68fd6", cursor: seasonStarted ? "not-allowed" : "pointer",
              }}>
                <input
                  type="checkbox" checked={settings.aliasEnabled} disabled={seasonStarted}
                  onChange={(e) => saveSettings({ aliasEnabled: e.target.checked })}
                />
                🏛 Alias mode — players pick a mythological codename (14 options) alongside their color, and it completely replaces
                their real name everywhere in the game for everyone but you — leaderboards, votes, chat, all of it. You always see real
                names; players see aliases. Real identities are automatically revealed to everyone once the game ends.{" "}
                <strong>{seasonStarted ? "Locked — can only be changed before Round 1 starts." : "Only changeable now, before Round 1 starts."}</strong>
              </label>
              {savingSettings && <span style={{ fontSize: 11, color: "#00ff9d" }}>Saved.</span>}
            </div>
          </Card>

          <Card>
            <h3 style={{ color: "#f5f0ff", margin: "0 0 6px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🏛 Character Powers</h3>
            <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 12px", fontStyle: "italic" }}>
              Optional variant/advanced play — each of the 14 gods carries its own special, ongoing ability. Locked once Round 1 starts, same as Alias mode, since reshuffling who has which power mid-season would undercut whatever anyone's already built around theirs.
            </p>
            <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
              {[
                { value: "off", label: "Off", blurb: "No character powers this season." },
                {
                  value: "by_character", label: "Assigned by character", blurb: "Your power is simply whichever alias you are — Zeus the alias gets Zeus's power.",
                  disabled: !settings.aliasEnabled, disabledNote: "Requires Alias mode to be on — this mode IS the alias.",
                },
                { value: "random", label: "Assigned at random", blurb: "Every player gets a random power, independent of their alias (or color, if alias mode is off)." },
              ].map((opt) => (
                <label
                  key={opt.value}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5,
                    color: (opt.disabled || seasonStarted) ? "#3d1f5c" : "#a68fd6", cursor: (opt.disabled || seasonStarted) ? "not-allowed" : "pointer",
                  }}
                >
                  <input
                    type="radio" name="characterPowersMode" checked={settings.characterPowersMode === opt.value} disabled={opt.disabled || seasonStarted}
                    onChange={() => saveSettings({ characterPowersMode: opt.value })}
                    style={{ marginTop: 2 }}
                  />
                  <span>
                    <strong style={{ color: (opt.disabled || seasonStarted) ? "#3d1f5c" : "#f5f0ff" }}>{opt.label}</strong> — {opt.blurb}
                    {opt.disabled && <span style={{ display: "block", fontStyle: "italic" }}>{opt.disabledNote}</span>}
                  </span>
                </label>
              ))}
            </div>

            {settings.characterPowersMode === "random" && !seasonStarted && (
              <div style={{ marginBottom: 14 }}>
                <Btn small onClick={assignRandomPowersNow} disabled={assigningPowers || players.length === 0}>
                  {assigningPowers ? "Assigning..." : "🎲 Assign Random Powers"}
                </Btn>
                <p style={{ fontSize: 11, color: "#6b4f99", marginTop: 6, fontStyle: "italic" }}>
                  Re-running this reshuffles everyone — fine to use again right up until Round 1 starts if the roster changes, but there's no undo once players are relying on what they've got.
                </p>
              </div>
            )}

            {settings.characterPowersMode !== "off" && (
              <div style={{ background: "#0d0618", borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                  Who has which power
                </div>
                {players.length === 0 ? (
                  <p style={{ fontSize: 12, color: "#6b4f99", margin: 0, fontStyle: "italic" }}>No players yet.</p>
                ) : (
                  <div style={{ display: "grid", gap: 4 }}>
                    {players.map((p) => {
                      const power = powerFor(p, settings);
                      const meta = power ? CHARACTER_POWERS.find((c) => c.name === power) : null;
                      return (
                        <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                          <span style={{ color: "#f5f0ff" }}>{p.display_name}</span>
                          <span style={{ color: power ? "#f5f0ff" : "#6b4f99" }}>
                            {power ? `${meta?.icon || ""} ${power}${meta && !meta.implemented ? " (not yet active)" : ""}` : "— none"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card>
            <h3 style={{ color: "#f5f0ff", margin: "0 0 6px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🎲 Challenge Selection</h3>
            <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 12px", fontStyle: "italic" }}>
              How the challenge gets picked each round. Switching modes mid-season is fine — this doesn't touch any identity or history, unlike Alias/Character Powers.
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              {[
                { value: "manual", label: "Host picks", blurb: "You choose the game type each round, same as always." },
                {
                  value: "random", label: "Random", blurb: "The app picks for you, weighted so no subcategory (Arcade, Maze, Puzzle, ...) plays more than twice all season.",
                },
              ].map((opt) => (
                <label key={opt.value} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, color: "#a68fd6", cursor: "pointer" }}>
                  <input
                    type="radio" name="challengeSelectionMode" checked={settings.challengeSelectionMode === opt.value}
                    onChange={() => saveSettings({ challengeSelectionMode: opt.value })}
                    style={{ marginTop: 2 }}
                  />
                  <span>
                    <strong style={{ color: "#f5f0ff" }}>{opt.label}</strong> — {opt.blurb}
                  </span>
                </label>
              ))}
            </div>
          </Card>

          <Card>
            <h3 style={{ color: "#f5f0ff", margin: "0 0 6px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🖼 Avatars</h3>
            <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 12px", fontStyle: "italic" }}>
              Changeable any time, unlike Alias mode above — switching this mid-season is safe. Shows up on the MemoryWall vote
              tiles and in Chat; nowhere else, to keep the rest of the UI uncluttered.
            </p>
            <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
              {[
                { value: "none", label: "None", blurb: "Just the color swatch, like today." },
                { value: "player_upload", label: "Player uploads their own", blurb: "Each player sets their own photo from the Game tab, any time." },
                { value: "host_upload", label: "You upload for each player", blurb: "Set a photo for each player yourself, below." },
                {
                  value: "collection", label: "Pick from a theme", blurb: "Every player's avatar is set at once from a pre-built collection, keyed to their alias.",
                  disabled: !settings.aliasEnabled, disabledNote: "Requires Alias mode to be on — a theme is keyed to alias names.",
                },
              ].map((opt) => (
                <label
                  key={opt.value}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5,
                    color: opt.disabled ? "#3d1f5c" : "#a68fd6", cursor: opt.disabled ? "not-allowed" : "pointer",
                  }}
                >
                  <input
                    type="radio" name="avatarMode" checked={settings.avatarMode === opt.value} disabled={opt.disabled}
                    onChange={() => saveSettings({ avatarMode: opt.value })}
                    style={{ marginTop: 2 }}
                  />
                  <span>
                    <strong style={{ color: opt.disabled ? "#3d1f5c" : "#f5f0ff" }}>{opt.label}</strong> — {opt.blurb}
                    {opt.disabled && <span style={{ display: "block", fontStyle: "italic" }}>{opt.disabledNote}</span>}
                  </span>
                </label>
              ))}
            </div>

            {settings.avatarMode === "collection" && (
              <div style={{ marginBottom: 14 }}>
                {AVATAR_COLLECTIONS.length === 0 ? (
                  <p style={{ fontSize: 12, color: "#6b4f99", fontStyle: "italic" }}>
                    No theme collections built yet — hand off images (see lib/avatarCollections.js) to add one.
                  </p>
                ) : (
                  <select
                    value={settings.avatarCollectionId || ""}
                    onChange={(e) => saveSettings({ avatarCollectionId: e.target.value || null })}
                    style={{ background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 6, padding: "6px 10px", color: "#f5f0ff", fontSize: 13 }}
                  >
                    <option value="">— choose a theme —</option>
                    {AVATAR_COLLECTIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                )}
              </div>
            )}

            {avatarError && <p style={{ fontSize: 11.5, color: "#ff3860", margin: "0 0 10px" }}>{avatarError}</p>}

            {(settings.avatarMode === "player_upload" || settings.avatarMode === "host_upload") && (
              <div>
                <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                  Uploaded photos {settings.avatarMode === "host_upload" ? "— set one for anyone below" : "— moderation"}
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  {players.filter((p) => p.approved).map((p) => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#0d0618", borderRadius: 6, padding: "6px 10px" }}>
                      {p.avatar_url ? (
                        <img src={p.avatar_url} alt="" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#1a0a2e", border: "1px dashed #3d1f5c", flexShrink: 0 }} />
                      )}
                      <span style={{ flex: 1, fontSize: 13, color: "#f5f0ff" }}>{p.display_name}</span>
                      {settings.avatarMode === "host_upload" && (
                        <>
                          <input
                            type="file" accept="image/*" style={{ display: "none" }}
                            ref={(el) => { if (el) hostUploadFileInputs.current[p.id] = el; }}
                            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) hostUploadAvatar(p.id, f); }}
                          />
                          <Btn small onClick={() => hostUploadFileInputs.current[p.id]?.click()} disabled={avatarBusyId === p.id}>
                            {avatarBusyId === p.id ? "..." : p.avatar_url ? "Change" : "Upload"}
                          </Btn>
                        </>
                      )}
                      {p.avatar_url && (
                        <Btn small variant="ghost" onClick={() => hostRemoveAvatar(p.id, p.display_name)} disabled={avatarBusyId === p.id}>
                          Remove
                        </Btn>
                      )}
                    </div>
                  ))}
                  {players.filter((p) => p.approved).length === 0 && (
                    <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic" }}>No approved players yet.</p>
                  )}
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
