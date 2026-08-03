import { useState, useEffect } from "react";
import { Btn, Card } from "./ui";
import { supabase } from "../lib/supabaseClient";
import { storageDelete, storageGet } from "../lib/gameStorage";
import {
  KEY_ROUND, KEY_CHALLENGE, KEY_FATES, KEY_EXILE, KEY_EXILE_HISTORY, KEY_REENTRY,
  KEY_FINALE, KEY_CHALLENGE_HISTORY, DEFAULT_SETTINGS, getSettings, setSettings, subscribeSettings,
  initRound,
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
    const { error } = await supabase.from("players").delete().eq("id", p.id);
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
        <Card style={{ borderColor: "rgba(201,168,76,0.5)" }}>
          <h3 style={{ color: "#c9a84c", margin: "0 0 6px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>
            ⏳ Pending Approval ({pending.length})
          </h3>
          <p style={{ color: "#a09080", fontSize: 12, margin: "0 0 12px", fontStyle: "italic" }}>
            These players have joined but can't do anything until you approve them.
          </p>
          <div style={{ display: "grid", gap: 6 }}>
            {pending.map((p) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0a1020", borderRadius: 6, padding: "8px 12px" }}>
                <span style={{ fontSize: 13, color: "#f0e6d3" }}>{p.display_name}</span>
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
        <h3 style={{ color: "#f0e6d3", margin: "0 0 6px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>⏱ Round Lengths</h3>
        <p style={{ color: "#a09080", fontSize: 12, margin: "0 0 12px", fontStyle: "italic" }}>
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
            <div key={row.key} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ width: 190, fontSize: 12.5, color: "#f0e6d3", flexShrink: 0 }}>{row.label}</span>
              <input
                type="number" min={1}
                value={Math.round(settings[row.key] / 60)}
                onChange={(e) => saveSettings({ [row.key]: (Number(e.target.value) || 1) * 60 })}
                style={{ width: 70, background: "#0a1020", border: "1px solid #253550", borderRadius: 6, padding: "5px 8px", color: "#f0e6d3", fontSize: 13 }}
              />
              <span style={{ fontSize: 12, color: "#a09080" }}>minutes</span>
            </div>
          ))}
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#a09080", cursor: "pointer" }}>
            <input type="checkbox" checked={settings.autoAdvance} onChange={(e) => saveSettings({ autoAdvance: e.target.checked })} />
            Automatically advance phases when the timer runs out (uncheck to require a manual "Advance Now" click every time)
          </label>
          {savingSettings && <span style={{ fontSize: 11, color: "#7a9a5c" }}>Saved.</span>}
        </div>
      </Card>

      <Card>
        <h3 style={{ color: "#f0e6d3", margin: "0 0 6px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🛠 Player Names</h3>
        <p style={{ color: "#a09080", fontSize: 12, margin: "0 0 12px", fontStyle: "italic" }}>
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
                style={{ flex: 1, background: "#0a1020", border: "1px solid #253550", borderRadius: 6, padding: "6px 10px", color: "#f0e6d3", fontSize: 13 }}
              />
              <Btn small onClick={() => saveName(p)} disabled={saving[p.id] || nameFor(p) === p.display_name}>
                {saving[p.id] ? "Saving..." : "Save"}
              </Btn>
              {!p.alive && <span style={{ fontSize: 11, color: "#706050" }}>(exiled)</span>}
            </div>
          ))}
          {players.length === 0 && <p style={{ color: "#706050", fontSize: 12, fontStyle: "italic" }}>No players have joined yet.</p>}
        </div>
      </Card>

      <Card style={{ borderColor: "rgba(196,92,60,0.3)" }}>
        <h3 style={{ color: "#f0e6d3", margin: "0 0 6px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>♻️ Reset Season</h3>
        {status && <p style={{ fontSize: 12, color: "#7a9a5c", margin: "0 0 10px" }}>{status}</p>}
        <p style={{ fontSize: 12, color: "#c45c3c", margin: "0 0 8px", fontWeight: 600 }}>
          Wipes every challenge, nomination, vote, exile, and re-entry attempt, and brings everyone back to alive at Round 1. This
          cannot be undone. The roster (who's signed up) and any renames survive.
        </p>
        {confirmReset ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: "#c45c3c", fontSize: 12, fontWeight: 700 }}>Really reset the whole season?</span>
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
