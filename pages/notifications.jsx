import { useState, useEffect } from "react";
import HomeLink from "../components/HomeLink";
import NotificationSettings from "../components/NotificationSettings";
import { supabase } from "../lib/supabaseClient";
import { fetchActiveGames } from "../lib/activeGames";

// ─── Notifications ───
// Reachable straight from the home page hub (pages/index.jsx), since
// notification preferences previously only lived inside a specific
// game's own Options tab (components/OptionsPanel.jsx) — meaning
// there was no way to check or change them without first being inside
// a game. NotificationSettings itself is still inherently per-game
// (push subscriptions are stored per player-in-a-game, not as one
// account-wide setting — see that component's own gameId/player
// props), so this page's job is just resolving "which game(s) is this
// account actually in right now" (reusing lib/activeGames.js, the same
// lookup the home page uses for its own Continue-to-Game buttons) and
// rendering one settings block per game, rather than trying to
// flatten per-game push subscriptions into a setting that doesn't
// really exist.
export default function NotificationsPage() {
  const [user, setUser] = useState(undefined);
  const [games, setGames] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const active = await fetchActiveGames(user.id);
      const withPlayerIds = await Promise.all(
        active.map(async (g) => {
          const { data: row } = await supabase
            .from("players")
            .select("id")
            .eq("game_id", g.gameId)
            .eq("user_id", user.id)
            .maybeSingle();
          return row ? { ...g, playerId: row.id } : null;
        })
      );
      setGames(withPlayerIds.filter(Boolean));
    })();
  }, [user]);

  if (!user) return <div style={pageStyle}><p>You need to be logged in. <a href="/login" style={{ color: "#ff2d95" }}>Log in</a></p></div>;

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 480, width: "100%", margin: "0 auto" }}>
        <div style={{ marginBottom: 20 }}><HomeLink /></div>
        <h2 style={{ fontSize: 18, marginBottom: 4, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🔔 Notifications</h2>
        <p style={{ color: "#a68fd6", fontSize: 12, marginBottom: 20 }}>
          Push notification settings for each game you're currently playing.
        </p>

        {games === null ? (
          <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p>
        ) : games.length === 0 ? (
          <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>
            You're not in any active games right now — notification settings will show up here once you join one.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            {games.map((g) => (
              <div key={g.gameId} style={{ background: "#1a0a2e", border: "1px solid #3d1f5c", borderRadius: 12, padding: 14 }}>
                <h3 style={{ fontSize: 14, margin: "0 0 10px", color: "#f5f0ff" }}>{g.name}</h3>
                <NotificationSettings gameId={g.gameId} player={{ id: g.playerId }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #05010f, #1a0a2e)",
  color: "#f5f0ff",
  fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
  padding: 24,
};
