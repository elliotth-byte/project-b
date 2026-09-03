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
//
// minWidth: 0 here matters more than it looks like it should: both
// StereoTypesHostPanels.jsx and StereoTypesPlayerPanels.jsx mount this
// inside a `display: grid` wrapper with no explicit column width, and
// grid items default to `min-width: auto` — which lets an item's own
// specified width (100vw, right above) inflate the whole grid track to
// match it, dragging every sibling in that column (the Spotify widget,
// the roster card, etc.) out to near-full window width instead of
// staying in the intended ~640px column. Overriding min-width back to
// 0 stops the track from following this element's size; the visual
// full-bleed effect itself still works exactly the same, since that
// comes entirely from left/width/transform above, not from the grid.
//
// zIndex: 0 on this wrapper (both variants) establishes its own real
// stacking context, the same fix StereoTypesCityscape.jsx's own outer
// div applies to itself and for the identical reason: without it, the
// logo overlay's zIndex: 1 below and StereoTypesCityscape's own
// internal zIndex: 1 (its buildings-above-stars ordering) would both
// be resolved relative to whatever ELSE this component ends up
// composited against wherever it's mounted, rather than being fully
// self-contained — exactly the class of bug that once let the
// buildings' internal z-index leak out and paint over this file's own
// logo overlay. Containing everything in here means nothing about how
// this component stacks internally can ever again depend on what some
// future sibling elsewhere happens to do.
export default function StereoTypesTitleScreen({ roomCode, playerCount, fullscreen = false, reactive = false, intensity = 0, bpm = null }) {
  const hasFooter = !!roomCode || playerCount != null;

  return (
    <div
      style={
        fullscreen
          ? { position: "relative", zIndex: 0, left: "50%", width: "100vw", minWidth: 0, transform: "translateX(-50%)", marginBottom: 4, overflow: "hidden" }
          : { position: "relative", zIndex: 0, borderRadius: 12, overflow: "hidden", marginBottom: 4 }
      }
    >
      <StereoTypesCityscape height={200} fullscreen={fullscreen} reactive={reactive} intensity={intensity} bpm={bpm} />
      <div
        style={{
          position: "absolute", inset: 0, zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          background: "radial-gradient(ellipse at center, rgba(5,7,13,0.55) 0%, rgba(5,7,13,0.15) 60%, rgba(5,7,13,0) 100%)",
        }}
      >
        <StereoTypesLogo size="large" />
      </div>
      {hasFooter && (
        <div
          style={{
            position: "absolute", bottom: 8, right: 12, zIndex: 1,
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
