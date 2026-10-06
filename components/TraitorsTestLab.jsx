import { useState, useEffect } from "react";
import { Btn, Card, Badge } from "./traitorsUi";
import { supabase } from "../lib/supabaseClient";
import {
  TRAITORS_GAME_REGISTRY,
  STORAGE_KEY_WORDS, STORAGE_KEY_CASINO, STORAGE_KEY_HOT_POTATO, STORAGE_KEY_ZOMBIE,
  STORAGE_KEY_PIGGY, STORAGE_KEY_MASQUERADE, STORAGE_KEY_ATTACK_DEFEND, STORAGE_KEY_VOODOO,
  STORAGE_KEY_MAZE3D, STORAGE_KEY_COFFIN, STORAGE_KEY_ICEBREAKER,
  STORAGE_KEY_EYES_VILLA, STORAGE_KEY_PICKPOCKET,
} from "../lib/traitorsMiniGames";
import WordHost from "./WordHost";
import WordPlayer from "./WordPlayer";
import CasinoHost from "./CasinoHost";
import CasinoPlayer from "./CasinoPlayer";
import HotPotatoHost from "./HotPotatoHost";
import HotPotatoPlayer from "./HotPotatoPlayer";
import ZombieHost from "./ZombieHost";
import ZombiePlayer from "./ZombiePlayer";
import PiggyHost from "./PiggyHost";
import PiggyPlayer from "./PiggyPlayer";
import MasqueradeHost from "./MasqueradeHost";
import MasqueradePlayer from "./MasqueradePlayer";
import AttackDefendHost from "./AttackDefendHost";
import AttackDefendPlayer from "./AttackDefendPlayer";
import VoodooHost from "./VoodooHost";
import VoodooPlayer from "./VoodooPlayer";
import Maze3DHost from "./Maze3DHost";
import Maze3DPlayer from "./Maze3DPlayer";
import CoffinHost from "./CoffinHost";
import CoffinPlayer from "./CoffinPlayer";
import IcebreakerHost from "./IcebreakerHost";
import IcebreakerPlayer from "./IcebreakerPlayer";
import EyesVillaHost from "./EyesVillaHost";
import EyesVillaPlayer from "./EyesVillaPlayer";
import PickpocketGraspHost from "./PickpocketGraspHost";
import PickpocketGraspPlayer from "./PickpocketGraspPlayer";

// ─── Traitors Test Lab ───
// Panopticon's own Test Lab (components/ChallengeTestLab.jsx) achieves
// isolation by giving every test run a NEGATIVE round number as part of
// a per-round storage key, under the real gameId — impossible to reuse
// here, since every Traitors mini-game has exactly ONE fixed storage key
// per game (e.g. "traitors:piggy"), not a per-round key. Testing one
// against the REAL gameId would mean actually starting/overwriting that
// live mini-game for the real season.
//
// Instead, this creates a genuinely separate, throwaway `games` row (a
// "sandbox season") and mounts the exact same, completely unmodified
// Host + Player components against ITS id instead of the real one —
// different gameId means different game_state rows entirely (game_state
// is keyed by (game_id, key)), so there's no way for this to touch the
// real season no matter what's clicked here. This works with the normal
// browser Supabase client (no service-role key) because:
//   - RLS on `games` only requires host_id = auth.uid() (see
//     "create your own game" policy) — any logged-in host can insert
//     their own sandbox row the exact same way pages/host.jsx's own
//     createSeason() creates a real one.
//   - None of the 13 mini-game Host/Player components ever query the
//     `players` table directly — they work entirely off the {id, name}
//     props they're handed and read/write only through game_state via
//     lib/gameStorage.js. So purely synthetic, never-inserted {id, name}
//     objects are completely safe to pass in as participants.
//   - RLS on `game_state` is is_game_host(game_id) OR is_game_player
//     (game_id) — the sandbox's host_id is the same real logged-in user,
//     so is_game_host resolves true immediately.
// Created with archived: true so it never clutters the host's normal
// season list (pages/host.jsx's visibleGames filters out archived
// games) — it only shows up at all if someone expands "Archived
// seasons", clearly named so it's obvious it's safe to delete by hand
// if it's ever seen there. Deleting the row cascades game_state and
// every other Traitors table via "on delete cascade", so there's
// nothing left behind — this happens automatically when the test ends
// OR this component unmounts (switching away from the Test Lab tab),
// and manually via the End Test button for belt-and-suspenders.
const HOST_COMPONENTS = {
  [STORAGE_KEY_WORDS]: WordHost,
  [STORAGE_KEY_CASINO]: CasinoHost,
  [STORAGE_KEY_HOT_POTATO]: HotPotatoHost,
  [STORAGE_KEY_ZOMBIE]: ZombieHost,
  [STORAGE_KEY_PIGGY]: PiggyHost,
  [STORAGE_KEY_MASQUERADE]: MasqueradeHost,
  [STORAGE_KEY_ATTACK_DEFEND]: AttackDefendHost,
  [STORAGE_KEY_VOODOO]: VoodooHost,
  [STORAGE_KEY_MAZE3D]: Maze3DHost,
  [STORAGE_KEY_COFFIN]: CoffinHost,
  [STORAGE_KEY_ICEBREAKER]: IcebreakerHost,
  [STORAGE_KEY_EYES_VILLA]: EyesVillaHost,
  [STORAGE_KEY_PICKPOCKET]: PickpocketGraspHost,
};

const PLAYER_COMPONENTS = {
  [STORAGE_KEY_WORDS]: WordPlayer,
  [STORAGE_KEY_CASINO]: CasinoPlayer,
  [STORAGE_KEY_HOT_POTATO]: HotPotatoPlayer,
  [STORAGE_KEY_ZOMBIE]: ZombiePlayer,
  [STORAGE_KEY_PIGGY]: PiggyPlayer,
  [STORAGE_KEY_MASQUERADE]: MasqueradePlayer,
  [STORAGE_KEY_ATTACK_DEFEND]: AttackDefendPlayer,
  [STORAGE_KEY_VOODOO]: VoodooPlayer,
  [STORAGE_KEY_MAZE3D]: Maze3DPlayer,
  [STORAGE_KEY_COFFIN]: CoffinPlayer,
  [STORAGE_KEY_ICEBREAKER]: IcebreakerPlayer,
  [STORAGE_KEY_EYES_VILLA]: EyesVillaPlayer,
  [STORAGE_KEY_PICKPOCKET]: PickpocketGraspPlayer,
};

// Same synthetic-id convention ChallengeTestLab.jsx uses (a recognizable
// all-zeros-plus-index uuid) — purely cosmetic here since nothing ever
// looks these IDs up anywhere, but keeps the convention consistent app-
// wide for "this is obviously a fake test id" at a glance.
function makeSynthPlayers(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `00000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`,
    name: `Test Player ${i + 1}`,
  }));
}

export default function TraitorsTestLab() {
  const [selectedKey, setSelectedKey] = useState(null);
  const [sandboxGameId, setSandboxGameId] = useState(null);
  const [playerCount, setPlayerCount] = useState(6);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  // Belt-and-suspenders cleanup: if the host switches to another tab
  // without clicking "End Test" (TraitorsHostPanels.jsx unmounts this
  // whole component on tab switch), the sandbox row is deleted anyway
  // rather than leaking silently. A hard browser close/refresh can still
  // skip this (React cleanup doesn't run then) — the archived:true flag
  // plus the obvious name is the fallback for that rare case.
  useEffect(() => {
    return () => {
      if (sandboxGameId) supabase.from("games").delete().eq("id", sandboxGameId).then(() => {});
    };
  }, [sandboxGameId]);

  const startTest = async (key) => {
    setCreating(true);
    setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setCreating(false); setError("Not signed in."); return; }
    const { data, error: err } = await supabase
      .from("games")
      .insert({ host_id: user.id, game_type: "traitors", name: "🧪 Traitors Test Lab Sandbox", archived: true })
      .select()
      .single();
    setCreating(false);
    if (err || !data) { setError("Couldn't create a sandbox: " + (err?.message || "unknown error")); return; }
    setSandboxGameId(data.id);
    setSelectedKey(key);
  };

  const endTest = async () => {
    const id = sandboxGameId;
    setSelectedKey(null);
    setSandboxGameId(null);
    if (id) await supabase.from("games").delete().eq("id", id);
  };

  if (selectedKey && sandboxGameId) {
    const entry = TRAITORS_GAME_REGISTRY[selectedKey];
    const HostComponent = HOST_COMPONENTS[selectedKey];
    const PlayerComponent = PLAYER_COMPONENTS[selectedKey];
    const synth = makeSynthPlayers(playerCount);
    return (
      <div>
        <Card style={{ marginBottom: 12, background: "rgba(201,168,76,0.08)", borderColor: "#c9a84c" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
            <div>
              <Badge>🧪 Test Mode</Badge>
              <span style={{ marginLeft: 8, fontSize: 13, color: "#f0e6d3", fontWeight: 700 }}>{entry.icon} {entry.label}</span>
            </div>
            <Btn small variant="ghost" onClick={endTest}>✕ End Test</Btn>
          </div>
          <p style={{ fontSize: 11, color: "#c9a84c", margin: "6px 0 0" }}>
            Fully isolated — this runs in a throwaway sandbox season, not your real one. Nothing here is seen by real players or touches real game state. Ending the test deletes the sandbox.
          </p>
        </Card>
        <Card style={{ marginBottom: 12 }}>
          <h4 style={{ color: "#a09080", margin: "0 0 8px", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>Host Control (sandbox)</h4>
          <HostComponent gameId={sandboxGameId} alive={synth} allPlayers={synth} shieldedNames={[]} returnedNames={[]} />
        </Card>
        <h4 style={{ color: "#a09080", margin: "0 0 8px", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>Simulated Players</h4>
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
          {synth.map((p) => (
            <div key={p.id} style={{ flex: "0 0 300px", width: 300, border: "1px solid #253550", borderRadius: 12, background: "#0a1020", padding: 10, maxHeight: "80vh", overflowY: "auto" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#c9a84c", marginBottom: 8, textAlign: "center" }}>
                {p.name}
              </div>
              <PlayerComponent gameId={sandboxGameId} playerName={p.name} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <h3 style={{ color: "#f0e6d3", margin: "0 0 6px", fontSize: 14, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🧪 Traitors Test Lab</h3>
      <p style={{ color: "#a09080", fontSize: 12, margin: "0 0 12px" }}>
        Preview any Traitors mini-game in a throwaway sandbox season — start it from the real Host panel below, then act as each simulated player side by side. Nothing here touches your real season.
      </p>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: "#a09080" }}>Simulated players:</span>
        <button onClick={() => setPlayerCount(Math.max(2, playerCount - 1))} disabled={playerCount <= 2} style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid #253550", background: "#0a1020", color: "#a09080", cursor: "pointer" }}>−</button>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#c9a84c", minWidth: 18, textAlign: "center" }}>{playerCount}</span>
        <button onClick={() => setPlayerCount(Math.min(10, playerCount + 1))} disabled={playerCount >= 10} style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid #253550", background: "#0a1020", color: "#a09080", cursor: "pointer" }}>+</button>
      </div>
      {error && <p style={{ fontSize: 12, color: "#c45c3c", marginBottom: 10 }}>{error}</p>}
      <div style={{ display: "grid", gap: 6 }}>
        {Object.entries(TRAITORS_GAME_REGISTRY).map(([key, entry]) => (
          <button
            key={key} onClick={() => startTest(key)} disabled={creating}
            style={{
              display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", textAlign: "left",
              background: "#0a1020", border: "1px solid #253550", borderRadius: 8, padding: "10px 12px",
              color: "#f0e6d3", cursor: creating ? "default" : "pointer", opacity: creating ? 0.6 : 1,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600 }}>{entry.icon} {entry.label}</span>
            <span style={{ fontSize: 10, color: "#706050" }}>{creating ? "Starting..." : "Test →"}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}
