import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { displayNameFromUser } from "../lib/auth";

// ─── Host: also play in your own game ───
// Nothing in the data model or RLS ever actually stopped a host from
// also having a players row in their own game (sql/schema.sql's own
// "join a game as yourself" insert policy just checks
// user_id = auth.uid(), same as any player) — the real gap was that
// there was no PATH to it: joining meant going to /join/<code> with
// the SAME account, then getting approved from the very roster you're
// hosting. This is that path collapsed into one click, for the common
// case of "I'm running this season but also want to be in it."
//
// Auto-approved on insert (approved: true) rather than landing pending
// like a normal join — the host approving their own join immediately
// after inserting it would be a redundant extra click for something
// they've already implicitly decided by clicking this button at all.
//
// Once joined, this renders a plain link to /play?game=<id> instead of
// trying to embed the actual player experience inline here — the host
// console and player view are genuinely two different pages/layouts
// (StereoTypesHostPanels.jsx vs StereoTypesPlayerPanels.jsx), and nothing
// stops a host from just keeping both open in two tabs, which is the
// actual point of this feature.
export default function StereoTypesHostJoinAsPlayer({ gameId, players }) {
  const [userId, setUserId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data?.user?.id || null));
  }, []);

  if (!userId) return null; // still loading — avoids a flash of the "Join" button for someone who's actually already in

  const myPlayerRow = (players || []).find((p) => p.user_id === userId);

  if (myPlayerRow) {
    return (
      <p style={{ fontSize: 12, color: "#c9b98a", margin: 0 }}>
        🎮 You're also playing as <strong style={{ color: "#f4c430" }}>{myPlayerRow.display_name}</strong> — <a href={`/play?game=${gameId}`} style={{ color: "#f4c430" }}>go to your player view →</a>
      </p>
    );
  }

  const joinAsPlayer = async () => {
    setBusy(true);
    setError("");
    const { data: userData } = await supabase.auth.getUser();
    const { error: insertError } = await supabase.from("players").insert({
      game_id: gameId, user_id: userId, display_name: displayNameFromUser(userData?.user), approved: true,
    });
    setBusy(false);
    if (insertError) setError("Couldn't join: " + insertError.message);
    // No local state update needed beyond the error — the host's own
    // realtime players subscription (already driving the `players` prop
    // this component reads) picks up the new row and re-renders this
    // into the "already joined" branch above on its own.
  };

  return (
    <div>
      <button
        onClick={joinAsPlayer}
        disabled={busy}
        style={{ background: "none", border: "1px solid #3d1f5c", borderRadius: 6, color: "#c9b98a", fontSize: 12, cursor: "pointer", padding: "5px 10px" }}
      >
        {busy ? "..." : "🎮 Join as a player too"}
      </button>
      {error && <p style={{ color: "#ff5a4d", fontSize: 11, marginTop: 6 }}>{error}</p>}
    </div>
  );
}
