import StereoTypesCityscape from "./StereoTypesCityscape";
import StereoTypesLogo from "./StereoTypesLogo";

// ─── Stereo Types — the title banner ───
// Cityscape as a full-width background layer, the blocky logo overlaid
// on top. A radial scrim sits behind just the logo (not the whole
// banner) so the moving skyline stays fully visible everywhere else,
// while the logo keeps enough contrast to read clearly against
// whichever mix of dark building silhouette / bright windows happens
// to be behind it at any given scroll position.
//
// fullscreen: "make the city take up the entire screen" — the skyline
// itself already measures the real viewport height (see
// StereoTypesCityscape's own fullscreen prop), but that alone isn't
// enough: every page this mounts on (host.jsx/play.jsx) wraps its
// content in a centered, ~400px-max-width column, same as everywhere
// else in this app. The `left: 50%; transform: translateX(-50%);
// width: 100vw` trick below is what actually breaks OUT of that column
// for just this one element, regardless of how deep it's nested,
// without touching the column itself (which every other Stereo Types
// panel still wants to keep, for the roster/admin controls that scroll
// in below this).
export default function StereoTypesTitleScreen({ roomCode, playerCount, fullscreen = false }) {
  const hasFooter = !!roomCode || playerCount != null;

  return (
    <div
      style={
        fullscreen
          ? { position: "relative", left: "50%", width: "100vw", transform: "translateX(-50%)", marginBottom: 4, overflow: "hidden" }
          : { position: "relative", borderRadius: 12, overflow: "hidden", marginBottom: 4 }
      }
    >
      <StereoTypesCityscape height={200} fullscreen={fullscreen} />
      <div
        style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          background: "radial-gradient(ellipse at center, rgba(5,7,13,0.55) 0%, rgba(5,7,13,0.15) 60%, rgba(5,7,13,0) 100%)",
        }}
      >
        <StereoTypesLogo size="large" />
      </div>
      {hasFooter && (
        <div
          style={{
            position: "absolute", bottom: 8, right: 12,
            color: "#c9b98a", fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
            textShadow: "0 1px 2px rgba(0,0,0,0.8)",
          }}
        >
          {roomCode ? `Code: ${roomCode}` : null}
          {roomCode && playerCount != null ? " · " : null}
          {playerCount != null ? `${playerCount} in the room` : null}
        </div>
      )}
    </div>
  );
}
