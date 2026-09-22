import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import LogoutButton from "./LogoutButton";
import { useSiteTheme } from "../lib/siteTheme";

// Looks up a game's short code (4 letters, e.g. "FXQR" — see
// sql/generate_join_code's own comment) and redirects to the real
// /play?game=<uuid> link, whether you're joining for the first time or
// coming back to a season you're already in — the actual /play page
// itself already knows the difference (see its own "join the game
// named in the URL, if not already a player" effect). Reachable at
// both /join/[code] (the link a host shares) and /play/[code] (typed
// in directly, or from play.jsx's own "enter your code" fallback) —
// same code, same behavior either way, so both page files just
// re-export this.
export default function JoinByCode() {
  const router = useRouter();
  const { code } = router.query;
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const { theme } = useSiteTheme();
  const pageStyle = {
    minHeight: "100vh", background: theme.pageBg, color: theme.text,
    fontFamily: theme.font, display: "flex",
    alignItems: "center", justifyContent: "center", padding: 24,
  };

  useEffect(() => {
    if (!code) return;
    (async () => {
      // Preview is best-effort and purely cosmetic (name/subtitle only) —
      // if it fails for any reason we still proceed straight to the redirect.
      supabase.rpc("game_preview_by_code", { p_code: code }).then(({ data }) => {
        if (data && data[0]) setPreview(data[0]);
      });

      const { data: gameId, error } = await supabase.rpc("find_game_by_code", { p_code: code });
      if (error || !gameId) {
        setError("That code doesn't match a game. Double check it with the host.");
        return;
      }
      router.replace(`/play?game=${gameId}`);
    })();
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={pageStyle}>
      <div style={{ position: "absolute", top: 20, right: 24 }}><LogoutButton theme={theme} /></div>
      <div style={{ textAlign: "center", maxWidth: 320 }}>
        {preview && !error && (
          <>
            <div style={{ fontFamily: theme.font, fontSize: 18, fontWeight: 700, marginBottom: 2 }}>{preview.name}</div>
            {preview.subtitle && <div style={{ color: theme.textMuted, fontSize: 12.5, fontStyle: "italic", marginBottom: 10 }}>{preview.subtitle}</div>}
          </>
        )}
        <p style={{ color: error ? theme.danger : theme.textMuted, fontSize: 14 }}>
          {error || "Finding your game..."}
        </p>
      </div>
    </div>
  );
}
