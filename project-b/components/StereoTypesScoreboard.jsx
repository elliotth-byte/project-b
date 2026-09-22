import { useEffect, useState } from "react";
import { Card } from "./ui";
import { supabase } from "../lib/supabaseClient";

function nameFor(players, id) {
  const p = (players || []).find((pl) => pl.id === id);
  return p?.display_name || "Unknown player";
}

// ─── Stereo Types — the live, always-on scoreboard ───
// Everything here reads the SAME durable, cross-round-summable ledger
// StereoTypesFinalStandings.jsx already sums once at the very end of
// Round 3 (see lib/stereoTypesFinale.js's fetchStereoTypesFinalStandings
// — this is that exact query shape, `select player_id, points ... eq
// game_id`, reduced into per-player totals the same way), just kept
// running the whole game instead of fetched once at the finale. Ties
// aren't broken here either, same reasoning as that file's own comment
// — this is a running total, not a final result, so there's nothing to
// declare a winner over yet.
//
// stereo_types_round_scores is already in the Supabase realtime
// publication (sql/add-stereo-types-a-side.sql's own `alter publication
// supabase_realtime add table stereo_types_round_scores`), so this
// subscribes to it directly rather than polling. The shape below —
// fetch once, subscribe to postgres_changes for the rest, plus a
// low-frequency poll as a backstop for a dropped/missed event — matches
// pages/play.jsx's own players-table subscription, NOT
// lib/gameStorage.js's subscribeGameState: that helper is purpose-built
// for game_state's single-row-per-key shape (see its own header
// comment), whereas stereo_types_round_scores is a plain multi-row table
// accumulating across all three rounds — a plain postgres_changes
// subscription on the whole game_id-filtered table fits that shape more
// directly than bending subscribeGameState to a table it wasn't written
// for.
//
// Mounted persistently by BOTH StereoTypesHostPanels.jsx and
// StereoTypesPlayerPanels.jsx, right below the title screen and above
// whichever round is currently active, so — unlike
// StereoTypesFinalStandings.jsx, which only ever mounts once Round 3
// itself is fully scored — this is visible for the entire game, updating
// live as each round finishes and persists its own rows.
//
// myPlayerId is optional, same convention as StereoTypesFinalStandings.jsx
// (the host passes nothing and gets a plain list; a player passes their
// own id purely so their own row gets picked out visually — this
// component makes no other distinction between "you" and anyone else).
export default function StereoTypesScoreboard({ gameId, players, myPlayerId }) {
  const [totals, setTotals] = useState(null);

  useEffect(() => {
    if (!gameId) return;
    let active = true;

    const load = async () => {
      const { data, error } = await supabase
        .from("stereo_types_round_scores")
        .select("player_id, points")
        .eq("game_id", gameId);
      if (!active || error || !data) return;
      const sums = {};
      data.forEach((row) => { sums[row.player_id] = (sums[row.player_id] || 0) + row.points; });
      setTotals(sums);
    };

    load();
    // Random channel-name suffix — same reasoning as every other
    // realtime subscription in this codebase (Supabase requires unique
    // channel names, and more than one mounted copy of this component
    // can exist at once, e.g. host + a player, both watching this game).
    const channel = supabase
      .channel(`stereo-types-scoreboard:${gameId}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stereo_types_round_scores", filter: `game_id=eq.${gameId}` },
        load
      )
      .subscribe();
    // Same "realtime is the primary path; this poll only guards a missed
    // event" reasoning as pages/play.jsx's own players-table subscription
    // and lib/gameStorage.js's subscribeGameState — 45s is plenty for a
    // scoreboard that isn't the primary way any round actually advances.
    const pollInterval = window.setInterval(load, 45000);

    return () => {
      active = false;
      window.clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  // Nothing scored yet this game (Round 1 hasn't finished) — nothing
  // worth showing over an empty/zeroed card before there's a real number
  // to report.
  if (!totals || Object.keys(totals).length === 0) return null;

  const standings = Object.entries(totals)
    .map(([playerId, totalPoints]) => ({ playerId, totalPoints }))
    .sort((a, b) => b.totalPoints - a.totalPoints);

  return (
    <Card>
      <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
        🏆 Scoreboard so far
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {standings.map((s, i) => {
          const mine = s.playerId === myPlayerId;
          return (
            <div
              key={s.playerId}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: mine ? "#1a1608" : "#0a0e18", borderRadius: 6, padding: "6px 10px",
                border: mine ? "1px solid #f4c430" : "1px solid transparent",
              }}
            >
              <span style={{ color: "#f5eddc", fontSize: 13 }}>
                {i + 1}. {nameFor(players, s.playerId)}
                {mine && <span style={{ color: "#6b6558" }}> (you)</span>}
              </span>
              <span style={{ color: s.totalPoints < 0 ? "#ff6b6b" : "#f4c430", fontSize: 13, fontWeight: 800 }}>
                {s.totalPoints > 0 ? `+${s.totalPoints}` : s.totalPoints}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
