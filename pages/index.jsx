import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { signOut, isHost, displayNameFromUser } from "../lib/auth";
import { checkIsPlatformAdmin } from "../lib/adminModeration";
import { useSiteTheme } from "../lib/siteTheme";

// ─── Cruel Summer House — the front door ───
// This used to always show every entry point at once (signup, login,
// profile, messages, host) regardless of whether you were logged in —
// and always as "Project B", when that's just one of the game types
// this platform now runs (see README.md's "Game types" section; Project
// B and Traitors today, more later). Now it's session-gated: logged out,
// you get the branded splash and nothing else (nothing past that point
// works without an account anyway); logged in, you get the actual hub —
// your game-agnostic profile/messages, plus a host console link if
// you're a host. Which specific SEASON's colors take over from here is
// still entirely lib/uiTheme.js's job, once you're actually in one.
//
// The splash itself now swaps between a "day" and "night" brand look
// (see lib/siteTheme.js's useSiteTheme) based on the viewer's own local
// clock — everything past login stays exactly as themed as it always
// was, this only touches the pre-login/no-game-yet screens.
export default function Home() {
  const router = useRouter();
  const game = router.query.game;
  const withGame = (path) => (game ? `${path}?game=${game}` : path);
  const [user, setUser] = useState(undefined); // undefined = still checking, null = logged out
  // undefined = not checked yet, true/false once known. This is the
  // platform-admin role (see pages/admin.jsx) — a separate, narrower
  // tier from isHost(user) below, which is about running your OWN
  // season, not moderating the whole platform. Checked here (not just
  // left as a bare URL) specifically because nothing else in normal
  // navigation ever links to /admin — a real host who's also a
  // platform admin had no way to find it short of typing the URL.
  const [isAdmin, setIsAdmin] = useState(false);
  const { theme, logoSrc, logoDimensions } = useSiteTheme();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    checkIsPlatformAdmin().then(({ isAdmin: ok }) => setIsAdmin(!!ok));
  }, [user]);

  const pageStyle = {
    minHeight: "100vh",
    background: theme.pageBg,
    color: theme.text,
    fontFamily: theme.font,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  };
  const linkBtn = {
    display: "block",
    padding: "12px 18px",
    borderRadius: 10,
    border: `1px solid ${theme.border}`,
    background: theme.cardBg,
    color: theme.text,
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 700,
    width: "100%",
  };

  return (
    <div style={pageStyle}>
      <div style={{ textAlign: "center", maxWidth: 420, width: "100%" }}>
        <div style={{ position: "relative", width: logoDimensions.width, height: logoDimensions.height, margin: "0 auto 8px" }}>
          <Image src={logoSrc} alt="Cruel Summer House" fill style={{ objectFit: "contain" }} priority />
        </div>

        {user === undefined ? (
          <p style={{ color: theme.textMuted, fontSize: 14, fontStyle: "italic" }}>Loading...</p>
        ) : user === null ? (
          <>
            <p style={{ color: theme.textMuted, fontSize: 14, marginBottom: 28, fontStyle: "italic" }}>
              Be someone. More.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Link href={withGame("/signup")} style={linkBtn}>👤 New player — Create account</Link>
              <Link href={withGame("/login")} style={linkBtn}>🔑 Returning player — Log in</Link>
              <Link href="/host" style={{ ...linkBtn, borderColor: theme.accent, color: theme.accent }}>👑 I'm the Host</Link>
            </div>
          </>
        ) : (
          <>
            <p style={{ color: theme.textMuted, fontSize: 14, marginBottom: 28, fontStyle: "italic" }}>
              Welcome back, {displayNameFromUser(user)}.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {game && <Link href={`/play?game=${game}`} style={{ ...linkBtn, borderColor: theme.accent, color: theme.accent }}>▶️ Continue to Game</Link>}
              <Link href="/profile" style={linkBtn}>🪪 My Profile</Link>
              <Link href="/messages" style={linkBtn}>💬 Messages</Link>
              {isHost(user) && <Link href="/host" style={{ ...linkBtn, borderColor: theme.accent, color: theme.accent }}>👑 Host Console</Link>}
              {isAdmin && <Link href="/admin" style={linkBtn}>🛠 Platform Admin</Link>}
              <button onClick={signOut} style={{ ...linkBtn, background: "none", cursor: "pointer", color: theme.textDim }}>Log out</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
