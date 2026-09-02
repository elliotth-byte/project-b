import StereoTypesCityscape from "./StereoTypesCityscape";
import StereoTypesLogo from "./StereoTypesLogo";

// ─── Stereo Types — the title banner ───
// Cityscape as a full-width background layer, the blocky logo overlaid
// on top. A radial scrim sits behind just the logo (not the whole
// banner) so the moving skyline stays fully visible everywhere else,
// while the logo keeps enough contrast to read clearly against
// whichever mix of dark building silhouette / bright windows happens
// to be behind it at any given scroll position.
export default function StereoTypesTitleScreen({ roomCode, playerCount, height = 200 }) {
  const hasFooter = !!roomCode || playerCount != null;

  return (
    <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", marginBottom: 4 }}>
      <StereoTypesCityscape height={height} />
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
