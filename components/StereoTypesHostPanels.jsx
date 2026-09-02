import { useEffect, useState } from "react";
import { Card, Btn } from "./ui";
import { supabase } from "../lib/supabaseClient";
import Boombox from "./Boombox";
import StereoTypesTitleScreen from "./StereoTypesTitleScreen";
import StereoTypesSpotifyWidget from "./StereoTypesSpotifyWidget";
import StereoTypesScoreboard from "./StereoTypesScoreboard";
import StereoTypesASideHost from "./StereoTypesASideHost";
import StereoTypesRemixHost from "./StereoTypesRemixHost";
import StereoTypesOnBlastHost from "./StereoTypesOnBlastHost";
import { subscribeStereoTypesRound } from "../lib/stereoTypesASide";

// ─── Stereo Types — host console (Phase 2-6) ───
// Phase 2 added the real boombox graphic per roster row instead of a
// bare name/status line; Phase 3 swapped the old plain-text banner for
// the actual title screen (scrolling cityscape + blocky logo). Phase 4
// (StereoTypesSpotifyWidget below) is what actually plays music through
// the host's own Spotify — nowPlaying here is that widget's own state,
// lifted up just far enough to feed the host's own title screen's
// reactive/intensity props; the widget separately broadcasts the same
// thing into game_state for every other player's copy of the title
// screen to react to. Phase 5 (StereoTypesASideHost below) is Round 1,
// "A Side" — the title screen and Spotify widget both keep running
// exactly as before, per the original spec ("in-game graphics are the
// same cityscape... responsive to a built-in spotify widget"); the
// round itself is purely additive content stacked below them. A player
// who hasn't gone through StereoTypesIdentityPicker.jsx yet has no
// color set (p.color is null), which Boombox.jsx already renders as a
// real-looking boombox in the theme's own yellow rather than a
// broken/blank state — nothing special needed here for that case.
// approvePlayer is the same plain players-table update
// AdminHost.jsx/TraitorsAdminHost.jsx each already do — nothing shared
// to reuse there, just the same one-liner a third time.
//
// Phase 6 adds Round 2 ("The Remix"): currentRound (subscribed here via
// subscribeStereoTypesRound — the SAME KEY_STEREO_TYPES_ROUND key
// lib/stereoTypesASide.js's startASide and lib/stereoTypesRemix.js's
// startRemix each set on their own round's start) decides which round's
// host component mounts below. It's read here, once, rather than inside
// either round's own component, specifically so mounting is a single
// switch in one place instead of each round component having to guess
// whether it's the "current" one from its own round's status alone —
// round.status only exists once that round's own game_state row exists,
// which is exactly the ambiguity this avoids. currentRound defaults to
// 0 (falsy) before Round 1 has ever started; StereoTypesASideHost.jsx
// covers that "not started yet" case itself (its own `!round` branch
// renders the "Start A Side" button), so 0/1 share the same branch below.
//
// Phase 7 adds Round 3 ("On Blast", StereoTypesOnBlastHost below) and
// the game's actual end — same currentRound switch, third branch.
//
// StereoTypesScoreboard (below, right above the currentRound switch)
// is a live running total across whichever rounds have actually
// finished so far — unlike StereoTypesFinalStandings.jsx, which only
// ever mounts once Round 3 itself is fully scored, this is visible the
// whole game through, on both this console and StereoTypesPlayerPanels.jsx's
// matching mount.
export default function StereoTypesHostPanels({ gameId, roomCode, players, adminExtra }) {
  const [busyId, setBusyId] = useState(null);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [currentRound, setCurrentRound] = useState(0);
  const approvedPlayers = players.filter((p) => p.approved);
  const pendingPlayers = players.filter((p) => !p.approved);

  useEffect(() => {
    if (!gameId) return;
    return subscribeStereoTypesRound(gameId, setCurrentRound);
  }, [gameId]);

  const approvePlayer = async (p) => {
    setBusyId(p.id);
    await supabase.from("players").update({ approved: true }).eq("id", p.id);
    setBusyId(null);
  };

  return (
    // gridTemplateColumns explicitly set (rather than left as the
    // implicit default) matters here specifically because of the
    // fullscreen title screen below: CSS Grid's default "auto" column
    // sizing takes an item's own SPECIFIED width (100vw, from
    // StereoTypesTitleScreen's fullscreen breakout) as that column's
    // max-content contribution regardless of the item's own min-width
    // — a min-width:0 fix on the item itself (already applied in
    // StereoTypesTitleScreen.jsx) only helps flex rows, not grid track
    // sizing. minmax(0, 1fr) caps the track at the container's actual
    // available width, so the 100vw item just paints outside its own
    // track (the intended full-bleed effect) instead of inflating the
    // track — and every sibling stacked in this column (Spotify
    // widget, A Side round cards, roster) — to near-full window width.
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16 }}>
      <StereoTypesTitleScreen
        roomCode={roomCode}
        playerCount={approvedPlayers.length}
        fullscreen
        reactive={!!nowPlaying?.isPlaying}
        intensity={nowPlaying?.intensity || 0}
        bpm={nowPlaying?.bpm || null}
      />

      <StereoTypesSpotifyWidget gameId={gameId} onStateChange={setNowPlaying} />

      <StereoTypesScoreboard gameId={gameId} players={players} />

      {(!currentRound || currentRound === 1) && <StereoTypesASideHost gameId={gameId} players={players} />}
      {currentRound === 2 && <StereoTypesRemixHost gameId={gameId} players={players} />}
      {currentRound === 3 && <StereoTypesOnBlastHost gameId={gameId} players={players} />}

      <Card>
        <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
          🎧 Roster ({approvedPlayers.length} approved{pendingPlayers.length > 0 ? `, ${pendingPlayers.length} pending` : ""})
        </div>
        {players.length === 0 ? (
          <p style={{ color: "#6b6558", fontSize: 12, fontStyle: "italic", margin: 0 }}>Nobody's joined yet — share the join code.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {players.map((p) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0a0e18", borderRadius: 6, padding: "6px 10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Boombox color={p.color} stickerId={p.equipped_sticker} size={56} />
                  <span style={{ color: "#f5eddc", fontSize: 13 }}>{p.display_name}</span>
                </div>
                {p.approved ? (
                  <span style={{ color: "#f4c430", fontSize: 11, fontWeight: 700 }}>✓ Approved</span>
                ) : (
                  <Btn small onClick={() => approvePlayer(p)} disabled={busyId === p.id}>
                    {busyId === p.id ? "..." : "Approve"}
                  </Btn>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {adminExtra}
    </div>
  );
}
