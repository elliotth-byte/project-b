import { useState, useEffect } from "react";
import { Btn, Card, DurationInput } from "./ui";
import { supabase } from "../lib/supabaseClient";
import { storageDelete, storageGet, storageSet, storageUpdate } from "../lib/gameStorage";
import { removePendingPlayer, quitOrRemoveApprovedPlayer } from "../lib/playerRemoval";
import {
  KEY_ROUND, KEY_CHALLENGE, KEY_FATES, KEY_EXILE, KEY_EXILE_HISTORY, KEY_REENTRY,
  KEY_FINALE, KEY_CHALLENGE_HISTORY, DEFAULT_SETTINGS, getSettings, setSettings, subscribeSettings,
  initRound, PHASES,
} from "../lib/gameState";

export default function AdminHost({ gameId, players, round }) {
  const [names, setNames] = useState({});
  const [saving, setSaving] = useState({});
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [settings, setLocalSettings] = useState(DEFAULT_SETTINGS);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeSettings(gameId, setLocalSettings);
    return unsubscribe;
  }, [gameId]);

  const pending = players.filter((p) => !p.approved);

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
      storageUpdate(gameId, KEY_CHALLENGE_HISTORY, (fresh) => (fresh || []).filter((c) => c.round !== roundNum)),
      storageUpdate(gameId, KEY_EXILE_HISTORY, (fresh) => (fresh || []).filter((e) => e.round !== roundNum)),
    ]);

    await storageUpdate(gameId, KEY_ROUND, (fresh) => ({
      ...(fresh || {}), round: roundNum, phase: PHASES.CHALLENGE, phaseStartedAt: null, phaseEndsAt: null,
      finalFour: false, doubleElimination: false,
    }));

    setRoundResetBusy(false);
    setConfirmRoundReset(false);
    setRoundResetStatus(`Round ${roundNum} reset. Start the challenge again whenever you're ready.`);
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
    ];
    for (let r = 1; r <= maxRound; r++) {
      deletes.push(storageDelete(gameId, `pb:exile-votes:${r}`));
      deletes.push(storageDelete(gameId, `pb:challenge-scores:${r}`));
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
        <h3 style={{ color: "#f5f0ff", margin: "0 0 6px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>⏱ Round Lengths</h3>
        <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 12px", fontStyle: "italic" }}>
          Default timer for each phase. The Challenge phase's duration can still be overridden per-round when the host starts that
          round's challenge. When a phase's timer runs out, the game automatically moves to the next phase and posts an update to
          GroupMe — as long as the host has finished entering whatever that phase needed (results, nominations, etc.).
        </p>
        <div style={{ display: "grid", gap: 10 }}>
          {[
            { key: "challengeDurationSec", label: "Challenge" },
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
            Automatically advance phases when the timer runs out (uncheck to require a manual "Advance Now" click every time)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#ff2d95", cursor: "pointer", fontWeight: 700 }}>
            <input type="checkbox" checked={settings.infiniteTime} onChange={(e) => saveSettings({ infiniteTime: e.target.checked })} />
            ∞ Infinite time — no phase gets an automatic timer at all; every Challenge/Fates Ceremony/Exile Vote/Finale runs until the host ends it
          </label>
          {savingSettings && <span style={{ fontSize: 11, color: "#00ff9d" }}>Saved.</span>}
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
            <div key={p.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                value={nameFor(p)}
                onChange={(e) => setNames({ ...names, [p.id]: e.target.value })}
                style={{ flex: 1, background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 6, padding: "6px 10px", color: "#f5f0ff", fontSize: 13 }}
              />
              <Btn small onClick={() => saveName(p)} disabled={saving[p.id] || nameFor(p) === p.display_name}>
                {saving[p.id] ? "Saving..." : "Save"}
              </Btn>
              {p.alive ? (
                <Btn small variant="ghost" onClick={() => removeApprovedPlayer(p)}>Remove</Btn>
              ) : (
                <span style={{ fontSize: 11, color: "#6b4f99" }}>({p.elimination_type === "quit" ? "left" : "exiled"})</span>
              )}
            </div>
          ))}
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
          Puts this round's Challenge, Fates Ceremony, and Exile Vote back to "hasn't happened yet" — for when nobody actually
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
    </div>
  );
}
