// ─── Big Screen — "Now Playing" corner overlay ───
// Purely presentational, and deliberately NOT a copy of
// StereoTypesSpotifyWidget.jsx's host-control logic (play/pause/skip,
// SDK device management, etc.) — this component only ever reads the
// shared now-playing broadcast (lib/stereoTypesNowPlaying.js) and shows
// it. It's the small, corner-sized counterpart to the fullscreen
// StereoTypesCityscape takeover pages/display.jsx uses when no Battle
// is active: while a Battle (or the Exile reveal) already owns the
// whole screen, a fullscreen music visual would fight with it for
// attention, so this stays a compact card that never covers anything a
// host actually needs to read.
//
// Renders nothing if there's no now-playing state yet, or nothing's
// currently loaded/playing — pages/display.jsx itself already gates
// mounting this on Spotify being configured at all, but this is
// defensive on its own too, since the now-playing key can also simply
// never have been published yet for a given season.
export default function NowPlayingCorner({ nowPlaying }) {
  if (!nowPlaying || (!nowPlaying.trackName && !nowPlaying.isPlaying)) return null;

  const { isPlaying, trackName, artistName, albumArt, intensity = 0 } = nowPlaying;

  return (
    <div
      style={{
        position: "fixed", bottom: 20, right: 20, zIndex: 500,
        display: "flex", alignItems: "center", gap: 10,
        background: "rgba(10,6,20,0.82)", backdropFilter: "blur(6px)",
        border: "1px solid rgba(244,196,48,0.5)", borderRadius: 12,
        padding: "8px 14px 8px 8px", maxWidth: 280,
        boxShadow: isPlaying ? `0 0 ${12 + intensity * 16}px rgba(244,196,48,${0.25 + intensity * 0.35})` : "none",
        transition: "box-shadow 0.4s ease",
      }}
    >
      {albumArt ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={albumArt} alt="" width={40} height={40} style={{ borderRadius: 6, flexShrink: 0 }} />
      ) : (
        <div style={{
          width: 40, height: 40, borderRadius: 6, background: "#150a28", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
        }}>
          🎵
        </div>
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: 700, color: "#f5f0ff", whiteSpace: "nowrap",
          overflow: "hidden", textOverflow: "ellipsis", maxWidth: 190,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          {isPlaying && (
            <span style={{
              display: "inline-block", width: 7, height: 7, borderRadius: "50%",
              background: "#00ff9d", boxShadow: "0 0 6px #00ff9d", flexShrink: 0,
              animation: "nowPlayingPulse 1.1s ease-in-out infinite",
            }} />
          )}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {trackName || "Nothing playing"}
          </span>
        </div>
        {artistName && (
          <div style={{
            fontSize: 10.5, color: "#a68fd6", whiteSpace: "nowrap",
            overflow: "hidden", textOverflow: "ellipsis", maxWidth: 190, marginTop: 1,
          }}>
            {artistName}
          </div>
        )}
      </div>
      <style jsx>{`
        @keyframes nowPlayingPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }
      `}</style>
    </div>
  );
}
