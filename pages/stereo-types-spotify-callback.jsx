import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { completeAuth, decodeState } from "../lib/spotify/auth";

// ─── Spotify OAuth callback — host-only ───
// Spotify redirects here after the host approves (or denies) access on
// accounts.spotify.com — this page's only job is finishing the PKCE
// code exchange (lib/spotify/auth.js's completeAuth) and bouncing
// straight back to the host console it started from. A player never
// lands here: only the host ever calls beginAuth in the first place
// (see StereoTypesSpotifyWidget.jsx), so this route has nothing
// game-type-specific to gate on beyond that.
//
// This exact path — `${origin}/stereo-types-spotify-callback` — is the
// redirect URI that has to be registered in the Spotify app dashboard.
export default function StereoTypesSpotifyCallback() {
  const router = useRouter();
  const [status, setStatus] = useState("Connecting to Spotify…");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!router.isReady) return;
    const { code, state, error: oauthError } = router.query;

    if (oauthError) {
      setError(`Spotify said: ${oauthError}`);
      return;
    }
    if (!code || typeof code !== "string") {
      setError("No authorization code came back from Spotify.");
      return;
    }

    const decoded = typeof state === "string" ? decodeState(state) : null;

    completeAuth(code)
      .then(() => {
        setStatus("Connected — heading back to the host console…");
        // A brief pause just so "Connected" is actually readable
        // before the redirect fires, not because anything async is
        // still pending.
        setTimeout(() => {
          router.replace(decoded?.gameId ? `/host?game=${decoded.gameId}` : "/host");
        }, 600);
      })
      .catch((err) => setError(err.message || "Something went wrong connecting to Spotify."));
    // router.query is only meaningful once router.isReady flips true —
    // re-running this every render would re-trigger the token exchange
    // (which is one-shot: the verifier is deleted after first use).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#05070d",
        color: "#f5eddc",
        fontFamily: "'Poppins', 'Segoe UI', sans-serif",
        textAlign: "center",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 360 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🎵</div>
        {error ? (
          <>
            <p style={{ color: "#ff5a4d", fontWeight: 700, margin: "0 0 8px" }}>{error}</p>
            <p style={{ color: "#c9b98a", fontSize: 13, margin: 0 }}>
              Head back to the host console and try connecting again.
            </p>
          </>
        ) : (
          <p style={{ color: "#c9b98a", margin: 0 }}>{status}</p>
        )}
      </div>
    </div>
  );
}
