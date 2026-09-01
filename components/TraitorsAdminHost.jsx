import { useState, useEffect } from "react";
import { Btn, Card } from "./traitorsUi";
import { supabase } from "../lib/supabaseClient";
import { storageDelete, storageGet } from "../lib/gameStorage";
import { hostStorageDelete } from "../lib/hostStorage";
import { declareWinner, subscribeTraitorsFinale, KEY_TRAITORS_FINALE } from "../lib/traitorsFinale";
import { STORAGE_KEY_WORDS } from "../lib/wordGameData";
import { STORAGE_KEY_CASINO } from "../lib/casinoData";
import { STORAGE_KEY_HOT_POTATO } from "../lib/hotPotatoData";
import { STORAGE_KEY_ZOMBIE } from "../lib/zombieData";
import { STORAGE_KEY_PIGGY } from "../lib/piggyData";
import { STORAGE_KEY_MASQUERADE } from "../lib/masqueradeData";
import { STORAGE_KEY_ATTACK_DEFEND } from "../lib/attackDefendData";
import { STORAGE_KEY_VOODOO } from "../lib/voodooData";
import { STORAGE_KEY_MAZE3D } from "../lib/mazeData";
import { STORAGE_KEY_COFFIN } from "../lib/coffinData";
import { STORAGE_KEY_ICEBREAKER } from "../lib/icebreakerData";
import { STORAGE_KEY_PANDORA } from "../lib/pandoraData";
import { STORAGE_KEY_ROUND_INFO, VOTES_KEY_PREFIX, STORAGE_KEY_VOTE_HISTORY } from "../lib/roundtableData";
import { STORAGE_KEY_CHALLENGE_HISTORY } from "../lib/challengeHistory";
import { STORAGE_KEY_TRAITOR_ROLES } from "../lib/traitorData";

// All 12 "mission"/"challenge" keys — this is the one place that list
// needs to be kept in sync when a new mini-game gets added.
const CHALLENGE_KEYS = [
  STORAGE_KEY_WORDS, STORAGE_KEY_CASINO, STORAGE_KEY_HOT_POTATO, STORAGE_KEY_ZOMBIE,
  STORAGE_KEY_PIGGY, STORAGE_KEY_MASQUERADE, STORAGE_KEY_ATTACK_DEFEND, STORAGE_KEY_VOODOO,
  STORAGE_KEY_MAZE3D, STORAGE_KEY_COFFIN, STORAGE_KEY_ICEBREAKER, STORAGE_KEY_PANDORA,
];

export default function AdminHost({ gameId, players }) {
  const [names, setNames] = useState({});
  const [saving, setSaving] = useState({});
  const [confirmChallenges, setConfirmChallenges] = useState(false);
  const [confirmSeason, setConfirmSeason] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [finale, setFinale] = useState(undefined); // undefined = loading, null = not declared yet
  const [selectedWinnerId, setSelectedWinnerId] = useState("");
  const [declaring, setDeclaring] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeTraitorsFinale(gameId, setFinale);
    return unsubscribe;
  }, [gameId]);

  // Optimistic-approval overlay — see AdminHost.jsx's identical comment
  // on why (players is a prop fed by host.jsx's own realtime
  // subscription + 45s poll fallback; without this, the pending list
  // only updates once that round trip lands).
  const [optimisticallyApproved, setOptimisticallyApproved] = useState(new Set());
  const pending = players.filter((p) => !p.approved && !optimisticallyApproved.has(p.id));
  // Whoever's still standing when the host declares a winner — see
  // this card below and lib/traitorsFinale.js. Everyone else is
  // already alive: false with their own elimination_order recorded
  // (see lib/seasonPlacement.js), same as any other exit.
  const stillIn = players.filter((p) => p.approved && p.alive);

  const declare = async () => {
    const winner = stillIn.find((p) => p.id === selectedWinnerId);
    if (!winner) return;
    if (!confirm(`Declare ${winner.display_name} the winner? Everyone else still standing (${stillIn.filter((p) => p.id !== winner.id).map((p) => p.display_name).join(", ") || "no one else"}) will be recorded as a finalist. This can be re-declared later if needed, but there's no automatic vote or reveal behind this — it's just the record for season history.`)) return;
    setDeclaring(true);
    const ok = await declareWinner(gameId, winner, stillIn);
    setDeclaring(false);
    if (!ok) { alert("Couldn't declare a winner — try again."); return; }
    setSelectedWinnerId("");
  };

  const clearFinale = async () => {
    if (!confirm("Clear the declared winner? You can declare a new one afterward.")) return;
    await storageDelete(gameId, KEY_TRAITORS_FINALE);
  };

  const approvePlayer = async (p) => {
    setOptimisticallyApproved((prev) => new Set(prev).add(p.id));
    const { error } = await supabase.from("players").update({ approved: true }).eq("id", p.id);
    if (error) {
      alert("Couldn't approve: " + error.message);
      setOptimisticallyApproved((prev) => { const next = new Set(prev); next.delete(p.id); return next; });
    }
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

  // Deletes every mission/challenge's saved state but leaves the roster,
  // roles, and roundtable/vote history untouched — for re-running
  // challenges without restarting the whole season.
  const resetChallenges = async () => {
    setBusy(true);
    await Promise.all(CHALLENGE_KEYS.map((key) => storageDelete(gameId, key)));
    setBusy(false);
    setConfirmChallenges(false);
    setStatus("All challenges reset. Roster, roles, and roundtable history are untouched.");
  };

  // A full restart: every challenge, the roundtable (including archived
  // vote history), the entire traitor-roles system (roles, eliminations,
  // shields, log — all of it), and every player's alive status. The
  // roster itself (who's signed up) and any renames are NOT touched.
  const resetSeason = async () => {
    setBusy(true);
    await Promise.all(CHALLENGE_KEYS.map((key) => storageDelete(gameId, key)));

    const roundInfo = await storageGet(gameId, STORAGE_KEY_ROUND_INFO);
    const maxRound = roundInfo?.round || 1;
    const voteDeletes = [];
    for (let r = 1; r <= maxRound; r++) voteDeletes.push(storageDelete(gameId, VOTES_KEY_PREFIX + r));
    await Promise.all(voteDeletes);

    await storageDelete(gameId, STORAGE_KEY_ROUND_INFO);
    await storageDelete(gameId, STORAGE_KEY_VOTE_HISTORY);
    await storageDelete(gameId, STORAGE_KEY_CHALLENGE_HISTORY);
    await hostStorageDelete(gameId, STORAGE_KEY_TRAITOR_ROLES);
    // Clears the declared winner too — see lib/traitorsFinale.js. A
    // season reset with the old winner still on record would leave
    // season history (and this same card, immediately below) showing a
    // stale result for a game that's now starting over.
    await storageDelete(gameId, KEY_TRAITORS_FINALE);

    // elimination_order reset alongside elimination_type/alive — see
    // lib/seasonPlacement.js; leaving it set would show everyone at
    // their OLD placement even after every role/history/challenge got
    // wiped and the game restarted from scratch.
    const { error } = await supabase.from("players").update({ alive: true, elimination_type: null, elimination_order: null }).eq("game_id", gameId);
    if (error) console.error("Failed to reset player alive status:", error);

    setBusy(false);
    setConfirmSeason(false);
    setStatus("Season reset. Everyone is alive again, roles cleared, all history wiped. Roster and any renames are untouched.");
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
        <h3 style={{ color: "#f0e6d3", margin: "0 0 6px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🛠 Player Names</h3>
        <p style={{ color: "#a09080", fontSize: 12, margin: "0 0 12px", fontStyle: "italic" }}>
          Renaming here updates the name everywhere — the host console, every mini-game, and the player's own
          screen. One real limitation worth knowing: any game already in progress that recorded data under
          the OLD name (a vote already cast, a Voodoo doll's eulogy, a Zombie status) keeps referencing the
          old name — it won't retroactively relink to the new one. Renaming before a season starts, or between
          missions, avoids that entirely.
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
              {!p.alive && <span style={{ fontSize: 11, color: "#706050" }}>({p.elimination_type || "out"})</span>}
            </div>
          ))}
          {players.length === 0 && <p style={{ color: "#706050", fontSize: 12, fontStyle: "italic" }}>No players have joined yet.</p>}
        </div>
      </Card>

      {/* Traitors never had a jury vote or finale mechanic at all (see
          lib/traitorsFinale.js) — this is just the host directly
          recording the outcome, so season history (profile.jsx,
          admin.jsx, season.jsx) has something to show beyond "still
          playing" once the game's actually over. */}
      <Card style={{ borderColor: "rgba(201,168,76,0.3)" }}>
        <h3 style={{ color: "#f0e6d3", margin: "0 0 6px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🏆 Declare Winner</h3>
        {finale === undefined ? (
          <p style={{ color: "#706050", fontSize: 12, fontStyle: "italic" }}>Loading...</p>
        ) : finale ? (
          <div>
            <p style={{ color: "#c9a84c", fontSize: 13, margin: "0 0 6px", fontWeight: 700 }}>🏆 {finale.winnerName} won!</p>
            {finale.finalistNames?.length > 1 && (
              <p style={{ color: "#a09080", fontSize: 12, margin: "0 0 10px" }}>
                Finalists: {finale.finalistNames.join(", ")}
              </p>
            )}
            <Btn small variant="ghost" onClick={clearFinale}>Clear declared winner</Btn>
          </div>
        ) : (
          <div>
            <p style={{ color: "#a09080", fontSize: 12, margin: "0 0 10px", fontStyle: "italic" }}>
              Pick the winner from whoever's still standing. Everyone else still alive right now gets recorded as
              a finalist — anyone already murdered or banished already has their own placement from that (see
              season history), nothing here changes for them.
            </p>
            {stillIn.length === 0 ? (
              <p style={{ color: "#706050", fontSize: 12, fontStyle: "italic" }}>No one's still standing.</p>
            ) : (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <select
                  value={selectedWinnerId} onChange={(e) => setSelectedWinnerId(e.target.value)}
                  style={{ background: "#0a1020", border: "1px solid #253550", borderRadius: 6, color: "#f0e6d3", fontSize: 13, padding: "6px 8px" }}
                >
                  <option value="">Choose the winner...</option>
                  {stillIn.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                </select>
                <Btn small onClick={declare} disabled={!selectedWinnerId || declaring}>
                  {declaring ? "Declaring..." : "Declare Winner"}
                </Btn>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card style={{ borderColor: "rgba(196,92,60,0.3)" }}>
        <h3 style={{ color: "#f0e6d3", margin: "0 0 6px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>♻️ Reset</h3>
        {status && <p style={{ fontSize: 12, color: "#7a9a5c", margin: "0 0 10px" }}>{status}</p>}

        <div style={{ marginBottom: 14 }}>
          <p style={{ fontSize: 12, color: "#a09080", margin: "0 0 8px" }}>
            Clear every mini-game's saved progress. Roster, roles, and roundtable/vote history are untouched.
          </p>
          {confirmChallenges ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: "#c45c3c", fontSize: 12 }}>Reset all 12 challenges?</span>
              <Btn small variant="danger" onClick={resetChallenges} disabled={busy}>Yes, reset</Btn>
              <Btn small variant="ghost" onClick={() => setConfirmChallenges(false)}>Cancel</Btn>
            </div>
          ) : (
            <Btn small onClick={() => setConfirmChallenges(true)}>Reset All Challenges</Btn>
          )}
        </div>

        <div style={{ borderTop: "1px solid #253550", paddingTop: 14 }}>
          <p style={{ fontSize: 12, color: "#c45c3c", margin: "0 0 8px", fontWeight: 600 }}>
            Reset the entire season — every challenge, all roles, every elimination, the full vote history, and
            everyone's alive status. This cannot be undone. The roster (who's signed up) and any renames survive.
          </p>
          {confirmSeason ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ color: "#c45c3c", fontSize: 12, fontWeight: 700 }}>Really reset the whole season?</span>
              <Btn small variant="danger" onClick={resetSeason} disabled={busy}>Yes, reset everything</Btn>
              <Btn small variant="ghost" onClick={() => setConfirmSeason(false)}>Cancel</Btn>
            </div>
          ) : (
            <Btn small variant="danger" onClick={() => setConfirmSeason(true)}>Reset Entire Season</Btn>
          )}
        </div>
      </Card>
    </div>
  );
}
