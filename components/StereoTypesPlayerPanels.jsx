import { useEffect, useState } from "react";
import { Card, Btn } from "./ui";
import Boombox from "./Boombox";
import StereoTypesTitleScreen from "./StereoTypesTitleScreen";
import StereoTypesScoreboard from "./StereoTypesScoreboard";
import StereoTypesASidePlayer from "./StereoTypesASidePlayer";
import StereoTypesRemixPlayer from "./StereoTypesRemixPlayer";
import StereoTypesOnBlastPlayer from "./StereoTypesOnBlastPlayer";
import { subscribeStereoTypesNowPlaying } from "../lib/stereoTypesNowPlaying";
import { subscribeStereoTypesRound } from "../lib/stereoTypesASide";
import { supabase } from "../lib/supabaseClient";
import StereoTypesRulesPanel from "./StereoTypesRulesPanel";

const MAX_DISPLAY_NAME_LENGTH = 40;

// ─── Set your display name ───
// A plain rename of this player's OWN row for THIS game only (players
// isn't a cross-game identity — see sql/schema.sql — so this doesn't
// touch the account-level profile display name upsertProfile writes on
// /admin; it's the same "per-season name" every other game type already
// lets a player set at join time, just editable afterward here). Inline
// click-to-edit rather than always-visible input+button, same
// "collapsed until you actually want to change it" instinct
// GameAccessPanel.jsx's own co-hosts/notifications sections already use.
// No local optimistic name swap needed on save — pages/play.jsx's own
// self-player realtime subscription already fires for any change to
// this row and updates `player.name` for every consumer of it,
// including this component's own parent, the instant the write lands.
function DisplayNameEditor({ player }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(player?.name || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const startEditing = () => {
    setDraft(player?.name || "");
    setError("");
    setEditing(true);
  };

  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed) { setError("Name can't be empty."); return; }
    if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) { setError(`Keep it under ${MAX_DISPLAY_NAME_LENGTH} characters.`); return; }
    setSaving(true);
    setError("");
    const { error: dbError } = await supabase.from("players").update({ display_name: trimmed }).eq("id", player.id);
    setSaving(false);
    if (dbError) { setError("Couldn't save: " + dbError.message); return; }
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        onClick={startEditing}
        style={{ background: "none", border: "none", color: "#6b6558", fontSize: 11, cursor: "pointer", padding: 0, textDecoration: "underline" }}
      >
        Set your display name
      </button>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8, maxWidth: 260, margin: "0 auto" }}>
      <input
        type="text" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={MAX_DISPLAY_NAME_LENGTH}
        disabled={saving} autoFocus
        style={{ background: "#0a0e18", border: "1px solid #3d1f5c", borderRadius: 8, padding: "8px 10px", color: "#f5eddc", fontSize: 13, textAlign: "center" }}
      />
      {error && <p style={{ color: "#ff3860", fontSize: 11, margin: 0 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <Btn small onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Btn>
        <button
          onClick={() => setEditing(false)} disabled={saving}
          style={{ background: "none", border: "1px solid #3d1f5c", borderRadius: 6, color: "#a68fd6", fontSize: 12, padding: "6px 14px", cursor: "pointer" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Stereo Types — player view (Phase 2-6) ───
// By the time this mounts, StereoTypesIdentityPicker.jsx (see
// pages/play.jsx's needsStereoTypesIdentity gate) has already run, so
// player.color is always set here — Phase 2 built the boombox that
// step produces; Phase 3 added the same title-screen art direction
// (cityscape + logo) the host console shows, above it, so a player
// gets the same brand moment, not just the host. Phase 4 subscribes to
// stereo_types:now-playing (written by the host's own
// StereoTypesSpotifyWidget.jsx — no player ever connects to Spotify
// themselves) so this player's cityscape lights up in sync with
// whatever the host is actually playing, same as the host's own copy
// does. Phase 5 (StereoTypesASidePlayer below) is Round 1 itself — the
// title screen keeps running unchanged above it, per the original
// spec's own "in-game graphics are the same cityscape" requirement;
// `players` (the full roster, needed so the ranking/guessing UI can
// list every approved player by name) is threaded straight through from
// pages/play.jsx's own `allPlayers`. No roomCode/playerCount here —
// this is one player's own screen, not the shared room view
// StereoTypesHostPanels.jsx is. Phase 6 adds Round 2
// (StereoTypesRemixPlayer below), mounted instead of Round 1's own
// component once currentRound flips to 2 — see the currentRound state
// below and StereoTypesHostPanels.jsx's matching comment for why that
// switch lives here rather than inside either round component.
//
// Two more additions sit above the round switch: StereoTypesScoreboard
// (live running totals, not just the once-at-the-end
// StereoTypesFinalStandings.jsx) and an "everyone's boombox" card — a
// player previously only ever saw their OWN boombox here, never the
// rest of the room's, even though `players` (used today only for
// name lookups inside the round components) already carries everyone's
// color/sticker. Both mirror something StereoTypesHostPanels.jsx's own
// "🎧 Roster" card already does for the host; see that file's matching
// comment.
export default function StereoTypesPlayerPanels({ gameId, player, players }) {
  const [nowPlaying, setNowPlaying] = useState(null);
  // Same "approved" filter StereoTypesHostPanels.jsx's own roster card
  // uses — pending (not-yet-approved) players don't have a real boombox
  // worth showing here either.
  const approvedPlayers = (players || []).filter((p) => p.approved);
  // currentRound is the GLOBAL, real state of the game — which round
  // actually exists right now (StereoTypesASideHost.jsx/
  // StereoTypesRemixHost.jsx's own auto-advance effects flip this the
  // instant a round finishes scoring, with no host click involved).
  // It does NOT by itself decide what THIS player sees, though — see
  // displayRound below.
  const [currentRound, setCurrentRound] = useState(0);
  // This player's OWN "how far have I actually clicked through" —
  // persisted per-player (players.game_prefs, same jsonb column
  // lib/gamePrefs.js's colorBlindMode/swipeControls already live in;
  // sql/add-game-prefs.sql's own comment confirms a player can already
  // freely self-update this column, so no new RLS policy was needed
  // here) rather than kept purely in local component state, so a
  // player who's clicked through to Round 2 and then reloads the page
  // stays on Round 2 instead of getting dropped back to Round 1's
  // now-stale results. Read straight off the raw `players` row rather
  // than threaded through the `player` prop (which pages/play.jsx
  // builds without game_prefs on it for Stereo Types) since `players`
  // already carries every column, this player's own row included.
  const myFullPlayer = (players || []).find((p) => p.id === player?.id);
  const persistedRoundSeen = myFullPlayer?.game_prefs?.stereoTypesRoundSeen || 0;
  // Optimistic local ceiling on top of the persisted value — bumped
  // immediately on a "Continue" click (see handleContinue below) so the
  // transition feels instant rather than waiting on `players` itself to
  // refresh from pages/play.jsx's own poll/subscription cycle. Never
  // needs to go DOWN, so a plain max against whatever's persisted is
  // always correct regardless of which one updates first.
  const [localRoundSeen, setLocalRoundSeen] = useState(0);
  const roundSeen = Math.max(persistedRoundSeen, localRoundSeen);
  // Clamped by currentRound: a player can never be shown a round that
  // hasn't actually started yet, no matter how far ahead their own
  // roundSeen might claim to be (that combination shouldn't be
  // reachable in practice, but the clamp costs nothing and removes any
  // doubt). A brand new player (roundSeen 0) lands on
  // min(currentRound, 1) — Round 1, even if the season's actually
  // further along already; that round's own game_state row still
  // exists and simply renders its final "scored" state read-only for
  // a latecomer, same as it would for anyone who's fallen behind.
  const displayRound = Math.max(1, Math.min(currentRound || 1, roundSeen + 1));

  const handleContinue = async (fromRound) => {
    setLocalRoundSeen((r) => Math.max(r, fromRound));
    if (!player?.id) return;
    const nextPrefs = { ...(myFullPlayer?.game_prefs || {}), stereoTypesRoundSeen: fromRound };
    await supabase.from("players").update({ game_prefs: nextPrefs }).eq("id", player.id);
  };

  useEffect(() => {
    if (!gameId) return;
    const unsubscribe = subscribeStereoTypesNowPlaying(gameId, setNowPlaying);
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;
    return subscribeStereoTypesRound(gameId, setCurrentRound);
  }, [gameId]);

  return (
    // See StereoTypesHostPanels.jsx's identical fix for why
    // gridTemplateColumns is explicit here — without it, the
    // fullscreen title screen's own 100vw width inflates this grid's
    // implicit column (and therefore every sibling stacked in it,
    // like StereoTypesASidePlayer below) out to near-full window
    // width, regardless of the item-level min-width:0 already set on
    // the title screen wrapper itself (that alone isn't enough for
    // grid track sizing, only for flex rows).
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16 }}>
      <StereoTypesTitleScreen fullscreen reactive={!!nowPlaying?.isPlaying} intensity={nowPlaying?.intensity || 0} bpm={nowPlaying?.bpm || null} />

      <StereoTypesRulesPanel />

      <Card style={{ borderColor: "#f4c430", textAlign: "center" }}>
        <div style={{ marginBottom: 12 }}>
          <Boombox color={player?.color} stickerId={player?.equippedSticker} label={player?.name} size={220} />
        </div>
        <div style={{ marginBottom: nowPlaying?.isPlaying && nowPlaying?.trackName ? 10 : 0 }}>
          <DisplayNameEditor player={player} />
        </div>
        {nowPlaying?.isPlaying && nowPlaying?.trackName && (
          <p style={{ color: "#f4c430", fontSize: 12, margin: 0, fontWeight: 700 }}>
            🎵 Now playing: {nowPlaying.trackName}
            {nowPlaying.artistName ? ` — ${nowPlaying.artistName}` : ""}
          </p>
        )}
      </Card>

      {/* Everyone's boombox, not just your own — same roster this
          player's own card above already comes from, just rendered for
          the whole room the way StereoTypesHostPanels.jsx's "🎧 Roster"
          card already does. Sits alongside the player's own boombox
          card above, doesn't replace it. */}
      <Card>
        <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
          🎧 Everyone's boombox
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {approvedPlayers.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#0a0e18", borderRadius: 6, padding: "6px 10px" }}>
              <Boombox color={p.color} stickerId={p.equipped_sticker} size={84} />
              <span style={{ color: "#f5eddc", fontSize: 13 }}>
                {p.display_name}{p.id === player?.id && <span style={{ color: "#6b6558" }}> (you)</span>}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <StereoTypesScoreboard gameId={gameId} players={players} myPlayerId={player?.id} />

      {(!displayRound || displayRound === 1) && (
        <StereoTypesASidePlayer gameId={gameId} player={player} players={players} globalRound={currentRound} onContinue={() => handleContinue(1)} />
      )}
      {displayRound === 2 && (
        <StereoTypesRemixPlayer gameId={gameId} player={player} players={players} globalRound={currentRound} onContinue={() => handleContinue(2)} />
      )}
      {displayRound === 3 && <StereoTypesOnBlastPlayer gameId={gameId} player={player} players={players} />}
    </div>
  );
}
