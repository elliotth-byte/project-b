import { useMemo, useState, useEffect } from "react";

// ─── Stereo Types — the scrolling night skyline ───
// "The title page should be a slowly scrolling cityscape at night, with
// windows in yellow." Procedurally generated (not a static image) —
// mulberry32 below is a tiny seeded PRNG so the layout is deterministic
// (same buildings, same lit windows, every render, server or client).
// A real Math.random() here would hydration-mismatch between Next's
// server-rendered HTML and the client's first paint; a fixed seed
// sidesteps that entirely rather than papering over it with a
// client-only guard.
//
// buildSkyline is exported (not kept private) — Phase 4's reactive
// music visualizer reuses this exact same geometry to decide which
// windows to pulse, rather than generating a second, different-looking
// skyline for gameplay than the one shown at the title screen.
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Three shades of the theme's own yellow (lib/uiTheme.js's stereo_types
// palette) — depth/variety in the lit windows without introducing any
// color outside that palette.
const YELLOWS = ["#f4c430", "#ffdf6b", "#c99a1e"];
const LIT_RATIO = 0.68; // ~60-75% of windows lit, per spec
const SKY_TOP = "#05070d";
const SKY_BOTTOM = "#0d1220";
const BUILDING_FILL = "#0a0e18";

const SEED = 90210;
const BUILDING_COUNT = 36;
const WIN_W = 8;
const WIN_H = 10;
const WIN_PAD = 8;
const WIN_PITCH_X = 14;
const WIN_PITCH_Y = 18;

// count buildings, each with a random width/height (a real varied
// silhouette, not a flat row) and its own deterministic window grid.
export function buildSkyline(seed = SEED, count = BUILDING_COUNT, maxHeight = 200) {
  const rand = mulberry32(seed);
  const buildings = [];
  let x = 0;
  for (let i = 0; i < count; i++) {
    const width = 50 + Math.floor(rand() * 60); // 50-110
    const height = Math.min(maxHeight - 10, 70 + Math.floor(rand() * 120)); // 70-190, capped to leave sky room
    const gap = 4 + Math.floor(rand() * 10);
    const cols = Math.max(1, Math.floor((width - WIN_PAD * 2) / WIN_PITCH_X));
    const rows = Math.max(1, Math.floor((height - WIN_PAD * 2) / WIN_PITCH_Y));
    const windows = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lit = rand() < LIT_RATIO;
        windows.push({
          x: WIN_PAD + c * WIN_PITCH_X,
          y: WIN_PAD + r * WIN_PITCH_Y,
          lit,
          color: lit ? YELLOWS[Math.floor(rand() * YELLOWS.length)] : null,
          // Only meaningful for lit windows — a deterministic 0-1 draw
          // used as this window's own animation-delay offset when
          // reactive mode pulses the skyline, so every lit window
          // twinkles slightly out of phase with its neighbors instead
          // of the whole city flashing in lockstep.
          phase: lit ? rand() : 0,
        });
      }
    }
    buildings.push({ x, width, height, windows });
    x += width + gap;
  }
  return { buildings, totalWidth: x };
}

// reactive/intensity: driven by whatever's actually playing on the
// host's Spotify (StereoTypesSpotifyWidget.jsx broadcasts it, either
// straight to the host's own title screen or via the
// stereo_types:now-playing game_state key for every other player).
// reactive=true speeds the ambient auto-scroll up and starts the lit
// windows pulsing; intensity (0-1) controls how far both of those go.
//
// This is deliberately isPlaying-only, not tempo/energy-driven: Spotify
// gates real per-track audio data (the /v1/audio-features endpoint)
// behind extended API access that a newly created app can't be assumed
// to have (see StereoTypesSpotifyWidget.jsx's own comment on this), so
// intensity here is just "is music playing right now," not "how
// energetic is this specific song." Honest baseline over a guess.
//
// fullscreen: ignores `height` and measures the real viewport instead
// (window.innerHeight, kept live via a resize listener) — "make the
// city take up the entire screen" needs the actual screen, not a fixed
// guess at one. Starts at a sane SSR-safe fallback (800) before the
// client's first measurement lands, same one-render "slightly wrong
// then corrects itself" tradeoff this app's own useSiteTheme already
// makes for the same reason (no window object on the server).
export default function StereoTypesCityscape({ height = 200, fullscreen = false, reactive = false, intensity = 0 }) {
  const [viewportHeight, setViewportHeight] = useState(800);

  useEffect(() => {
    if (!fullscreen) return;
    const measure = () => setViewportHeight(window.innerHeight);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [fullscreen]);

  const effectiveHeight = fullscreen ? viewportHeight : height;
  const { buildings, totalWidth } = useMemo(() => buildSkyline(SEED, BUILDING_COUNT, effectiveHeight), [effectiveHeight]);

  const clampedIntensity = Math.max(0, Math.min(1, intensity));
  // Ambient default is 80s either way. Reactive mode ramps that down
  // as intensity climbs — 50s at intensity 0 (still visibly livelier
  // than pure ambient, since reactive=true already implies "something
  // is playing") down to 18s at full intensity, floored so it never
  // scrolls fast enough to look broken rather than lively.
  const scrollSeconds = reactive ? Math.max(18, 50 - clampedIntensity * 32) : 80;
  // How far lit windows dim on each pulse, and how fast — both scale
  // with intensity. Only ever applied when reactive; non-reactive
  // windows stay exactly as before (opacity 1, no animation at all).
  const pulseMinOpacity = Math.max(0.15, 0.55 - clampedIntensity * 0.4);
  const pulseSeconds = Math.max(0.6, 1.6 - clampedIntensity * 1.0);

  const skyline = (copyKey) => (
    <svg key={copyKey} width={totalWidth} height={effectiveHeight} viewBox={`0 0 ${totalWidth} ${effectiveHeight}`} style={{ display: "block", flexShrink: 0 }}>
      {buildings.map((b, i) => {
        const by = effectiveHeight - b.height;
        return (
          <g key={i} transform={`translate(${b.x}, ${by})`}>
            <rect width={b.width} height={b.height} fill={BUILDING_FILL} />
            {b.windows.map((w, wi) =>
              w.lit ? (
                <rect
                  key={wi}
                  x={w.x}
                  y={w.y}
                  width={WIN_W}
                  height={WIN_H}
                  fill={w.color}
                  className={reactive ? "stereo-window" : undefined}
                  style={reactive ? { animationDelay: `${(w.phase * pulseSeconds).toFixed(2)}s` } : undefined}
                />
              ) : null
            )}
          </g>
        );
      })}
    </svg>
  );

  return (
    <div style={{ position: "relative", width: "100%", height: effectiveHeight, overflow: "hidden", background: `linear-gradient(180deg, ${SKY_TOP} 0%, ${SKY_BOTTOM} 100%)` }}>
      {/* Rendered twice, side by side, in a track exactly double the
          artwork's own width — animating that track to -50% (half of
          ITS width, i.e. exactly one skyline-width) is what makes the
          loop seamless: by the time copy A has scrolled fully off,
          copy B is sitting in exactly the position A started in. */}
      <div
        className="stereo-cityscape-track"
        style={{
          display: "flex",
          width: totalWidth * 2,
          height: effectiveHeight,
          "--stereo-scroll-seconds": `${scrollSeconds}s`,
          "--stereo-pulse-seconds": `${pulseSeconds}s`,
          "--stereo-pulse-min-opacity": pulseMinOpacity,
        }}
      >
        {skyline("a")}
        {skyline("b")}
      </div>
      <style jsx>{`
        .stereo-cityscape-track {
          animation: stereo-cityscape-scroll var(--stereo-scroll-seconds, 80s) linear infinite;
        }
        @keyframes stereo-cityscape-scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .stereo-window {
          animation: stereo-window-pulse var(--stereo-pulse-seconds, 1.2s) ease-in-out infinite;
        }
        @keyframes stereo-window-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: var(--stereo-pulse-min-opacity, 0.4); }
        }
      `}</style>
    </div>
  );
}
