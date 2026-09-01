import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import LogoutButton from "../../components/LogoutButton";
import { SITE_THEME } from "../../lib/siteTheme";

// Visiting /join/FX8213 looks up that code and redirects to the real
// /play?game=<uuid> link — this is just a friendlier front door so you don't
// have to text people a raw UUID.
export default function JoinByCode() {
  const router = useRouter();
  const { code } = router.query;
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);

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
      <div style={{ position: "absolute", top: 20, right: 24 }}><LogoutButton theme={SITE_THEME} /></div>
      <div style={{ textAlign: "center", maxWidth: 320 }}>
        {preview && !error && (
          <>
            <div style={{ fontFamily: SITE_THEME.font, fontSize: 18, fontWeight: 700, marginBottom: 2 }}>{preview.name}</div>
            {preview.subtitle && <div style={{ color: SITE_THEME.textMuted, fontSize: 12.5, fontStyle: "italic", marginBottom: 10 }}>{preview.subtitle}</div>}
          </>
        )}
        <p style={{ color: error ? SITE_THEME.danger : SITE_THEME.textMuted, fontSize: 14 }}>
          {error || "Finding your game..."}
        </p>
      </div>
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh", background: SITE_THEME.pageBg, color: SITE_THEME.text,
  fontFamily: SITE_THEME.font, display: "flex",
  alignItems: "center", justifyContent: "center", padding: 24,
};
