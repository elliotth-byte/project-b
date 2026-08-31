import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import HomeLink from "../components/HomeLink";
import { supabase } from "../lib/supabaseClient";
import { fetchSeasonRoster } from "../lib/profiles";

// ─── Season Roster ───
// The other half of "click a season, see who was in it" — the
// counterpart to pages/profile.jsx's season history list, which links
// here. Uses public_season_roster (see sql/add-profiles-v2.sql), a
// narrow security-definer function specifically for this: games' own
// RLS (sql/schema.sql) only lets you read a season you actually host or
// played in, which would make browsing someone else's season history
// impossible to follow through on otherwise.
export default function SeasonPage() {
  const router = useRouter();
  const [user, setUser] = useState(undefined);
  const [roster, setRoster] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const gameId = typeof router.query.gameId === "string" ? router.query.gameId : null;

  useEffect(() => {
    if (!gameId) return;
    fetchSeasonRoster(gameId).then(setRoster);
  }, [gameId]);

  if (user === undefined) return <div style={pageStyle}><p>Loading...</p></div>;
  if (!user) return <div style={pageStyle}><p>You need to be logged in. <a href="/login" style={{ color: "#ff2d95" }}>Log in</a></p></div>;

  // Splits the host out from the player list — shown as its own line up
  // top rather than mixed into the roster grid, since "who ran this"
  // and "who played in it" are different questions a viewer is likely
  // asking. A host who ALSO played still shows in the player grid below
  // too — both roles are real and worth seeing separately, not merged
  // away.
  const host = (roster || []).find((p) => p.isHost);
  const playerRows = (roster || []).filter((p) => !p.isHost);

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 420, width: "100%", margin: "0 auto" }}>
        <div style={{ marginBottom: 20 }}><HomeLink /></div>

        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
            🏛 Season Roster
          </div>
          {roster === null ? (
            <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p>
          ) : roster.length === 0 ? (
            <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Nothing to show for this season.</p>
          ) : (
            <>
              {host && (
                <Link href={`/profile?userId=${host.userId}`} style={{ display: "flex", alignItems: "center", gap: 8, background: "#0d0618", border: "1px solid #ff2d95", borderRadius: 8, padding: "10px 12px", marginBottom: 12, textDecoration: "none" }}>
                  <span style={{ fontSize: 16 }}>🎙</span>
                  <span style={{ color: "#f5f0ff", fontSize: 14, fontWeight: 700 }}>{host.displayName}</span>
                  <span style={{ color: "#ff2d95", fontSize: 11, fontWeight: 700, marginLeft: "auto" }}>HOST</span>
                </Link>
              )}
              <div style={{ display: "grid", gap: 8 }}>
                {playerRows.map((p) => (
                  <Link key={p.userId} href={`/profile?userId=${p.userId}`} style={{ display: "flex", alignItems: "center", gap: 10, background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "8px 12px", textDecoration: "none" }}>
                    <span style={{ color: "#f5f0ff", fontSize: 13, fontWeight: 600, flex: 1 }}>
                      {p.displayName}{p.character && <span style={{ color: "#6b4f99", fontWeight: 400 }}> — {p.character}</span>}
                    </span>
                    <span style={{ color: "#ff2d95", fontSize: 11, fontWeight: 700 }}>{p.placement}</span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
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

const cardStyle = {
  background: "#1a0a2e",
  border: "1px solid #3d1f5c",
  borderRadius: 12,
  padding: 20,
  marginBottom: 16,
};
