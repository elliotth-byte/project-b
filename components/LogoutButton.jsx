import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { signOut } from "../lib/auth";

// A small, consistent "Log out" control meant to sit on every
// player-facing screen (see HomeLink, its usual neighbor). It only
// renders once there's an actual session to log out of — a first-time
// visitor with nothing signed in yet sees nothing here, so this is safe
// to drop into any page (index, login, signup, join/[code], play)
// without knowing ahead of time whether the visitor is logged in.
// theme is optional, same reasoning as HomeLink's own — existing call
// sites keep their current look; pages with their own theme pass it
// through so the two controls (this and HomeLink) don't clash.
export default function LogoutButton({ style, theme }) {
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setHasSession(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setHasSession(!!session));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!hasSession) return null;

  return (
    <button
      onClick={signOut}
      style={{
        background: "none", border: "none", color: theme?.textDim || "#6b4f99", fontSize: 12, cursor: "pointer",
        fontFamily: theme?.font || "'Orbitron', 'Segoe UI', sans-serif", ...style,
      }}
    >
      Log out
    </button>
  );
}
