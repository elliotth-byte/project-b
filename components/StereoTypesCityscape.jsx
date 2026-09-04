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

// A wider mix of window colors than just the theme's own yellow — real
// skylines (and music visualizers) read as more alive with variety in
// the light color, not a single hue repeated everywhere. Still leads
// with the theme's gold/pale-yellow so the skyline doesn't stop feeling
// like "this app's" city, but rounds it out with warmer ambers/corals
// and a few cooler tones for contrast.
const WINDOW_COLORS = ["#f4c430", "#ffdf6b", "#c99a1e", "#ff9a3d", "#ff5f6d", "#ff6ec7", "#4dd9ff", "#7dffb0"];
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

// A different fixed seed than the skyline's own SEED — deliberately, so
// star placement doesn't accidentally correlate with window placement
// (e.g. every building happening to line up with a gap in the stars).
// Same mulberry32 determinism reasoning as buildSkyline above: fixed
// seed avoids an SSR/client hydration mismatch a real Math.random()
// would cause.
const STAR_SEED = 40404;
const STAR_COUNT = 140;
const STAR_COLORS = ["#ffffff", "#dfe8ff", "#fff6d8"];

// Stars only ever occupy the upper ~78% of the canvas — leaving a clear
// band just above the tallest buildings keeps the skyline's own
// silhouette reading as the clear foreground rather than stars peeking
// out between windows. Scattered across a canvas exactly as wide as the
// scrolling track's own single skyline copy (totalWidth) so the starfield
// tiles seamlessly the same way the two skyline copies do — it's
// rendered ONCE and reused directly as CSS background-position-repeated
// art rather than duplicated like the skyline SVGs, since (unlike the
// skyline) the sky is intentionally static, not scrolling: real night
// skies don't visibly drift the way a foreground skyline does at this
// scale, so stars stay put while the city moves past them — a small
// parallax-like touch for free.
function buildStars(seed, count, width, height) {
  const rand = mulberry32(seed);
  const stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: rand() * width,
      y: rand() * height * 0.78,
      r: 0.6 + rand() * 1.3,
      color: STAR_COLORS[Math.floor(rand() * STAR_COLORS.length)],
      // Twinkle timing offset, same "out of phase with its neighbors"
      // trick the skyline's own lit windows use (see `phase` above).
      phase: rand(),
      duration: 2.2 + rand() * 2.6,
    });
  }
  return stars;
}

// count buildings, each with a random width/height (a real varied
// silhouette, not a flat row) and its own deterministic window grid.
export function buildSkyline(seed = SEED, count = BUILDING_COUNT, maxHeight = 200) {
  const rand = mulberry32(seed);
  const buildings = [];
  let x = 0;
  for (let i = 0; i < count; i++) {
    const width = 50 + Math.floor(rand() * 60); // 50-110
    // Scales with the actual canvas height instead of a flat 70-190
    // range — that flat range looked fine against the old fixed 200px
    // banner, but capped every building at the same modest height even
    // in fullscreen mode, where the canvas can be 800px+ tall. Floor is
    // proportional (12% of the available height, min 50px) so shorter
    // buildings still read as short relative to the skyline, while the
    // ceiling reaches almost all the way up — a genuinely dramatic,
    // varied silhouette rather than a uniform short row.
    const minHeight = Math.max(50, Math.floor(maxHeight * 0.12));
    const maxHeightForBuilding = maxHeight - 10;
    const height = Math.min(maxHeightForBuilding, minHeight + Math.floor(rand() * (maxHeightForBuilding - minHeight)));
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
          color: lit ? WINDOW_COLORS[Math.floor(rand() * WINDOW_COLORS.length)] : null,
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

// reactive/intensity/bpm: driven by whatever's actually playing on the
// host's Spotify (StereoTypesSpotifyWidget.jsx broadcasts it, either
// straight to the host's own title screen or via the
// stereo_types:now-playing game_state key for every other player).
// reactive=true speeds the ambient auto-scroll up and starts the lit
// windows pulsing; intensity (0-1) controls how far both of those go
// when real tempo isn't available; bpm (nullable) is the track's real
// tempo when Spotify's Audio Features endpoint answered it.
//
// intensity is the isPlaying-only fallback signal, not tempo/energy-
// driven: that endpoint is gated behind extended API access that a
// newly created app can't be assumed to have (see
// StereoTypesSpotifyWidget.jsx's own comment on this), so this
// component can't assume bpm will ever actually arrive. When it does,
// scroll speed locks to the real beat instead of the flat isPlaying
// heuristic; when it doesn't (bpm is null — restricted access, no
// track playing, or the fetch just failed), scroll speed falls back to
// the exact same intensity-based formula this always used. Window
// pulse timing still comes from intensity/pulseSeconds either way —
// syncing THAT to the literal beat as well risked looking frantic at
// fast tempos rather than lively, so only scroll speed (what was
// actually asked for) takes bpm directly.
//
// fullscreen: ignores `height` and measures the real viewport instead
// (window.innerHeight, kept live via a resize listener) — "make the
// city take up the entire screen" needs the actual screen, not a fixed
// guess at one. Starts at a sane SSR-safe fallback (800) before the
// client's first measurement lands, same one-render "slightly wrong
// then corrects itself" tradeoff this app's own useSiteTheme already
// makes for the same reason (no window object on the server).
export default function StereoTypesCityscape({ height = 200, fullscreen = false, reactive = false, intensity = 0, bpm = null }) {
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
  // One skyline-copy's worth of stars, tiled by repeating the same
  // background image every totalWidth px (see the style block below) —
  // matches the scrolling track's own two-copies-of-totalWidth loop
  // exactly, so the starfield's seam lines up with the skyline's own.
  const stars = useMemo(() => buildStars(STAR_SEED, STAR_COUNT, totalWidth, effectiveHeight), [totalWidth, effectiveHeight]);

  const clampedIntensity = Math.max(0, Math.min(1, intensity));
  // Ambient default is 80s either way. Reactive mode ramps that down
  // as intensity climbs — 50s at intensity 0 (still visibly livelier
  // than pure ambient, since reactive=true already implies "something
  // is playing") down to 18s at full intensity, floored so it never
  // scrolls fast enough to look broken rather than lively. This is the
  // fallback used whenever bpm isn't available.
  const fallbackScrollSeconds = reactive ? Math.max(18, 50 - clampedIntensity * 32) : 80;
  // Real-tempo path: 120 BPM (a common mid-tempo reference) maps to
  // the same 30s scroll this formula already lands near at moderate
  // intensity, and everything else scales inversely from there — a
  // 180 BPM track scrolls noticeably faster, a 60 BPM ballad noticeably
  // slower. Clamped on both ends so a very slow or very fast outlier
  // track can't make the loop look frozen or turn into a blur.
  const BPM_REFERENCE = 120;
  const BPM_REFERENCE_SCROLL_SECONDS = 30;
  const scrollSeconds =
    reactive && bpm
      ? Math.max(12, Math.min(60, BPM_REFERENCE_SCROLL_SECONDS * (BPM_REFERENCE / bpm)))
      : fallbackScrollSeconds;
  // How far lit windows dim (and now also shrink) on each pulse, and
  // how fast — both scale with intensity. Only ever applied when
  // reactive; non-reactive windows stay exactly as before (opacity 1,
  // scale 1, no animation at all). Deeper dip and a scale "pop" than
  // the original pass — the opacity-only version read as too subtle
  // to register as a beat rather than as a wobble.
  const pulseMinOpacity = Math.max(0.05, 0.6 - clampedIntensity * 0.55);
  const pulseScale = Math.max(1.08, 1 + clampedIntensity * 0.4);
  const pulseSeconds = Math.max(0.6, 1.6 - clampedIntensity * 1.0);

  const starsLayer = (copyKey) => (
    <svg key={copyKey} width={totalWidth} height={effectiveHeight} viewBox={`0 0 ${totalWidth} ${effectiveHeight}`} style={{ display: "block", flexShrink: 0 }}>
      {stars.map((s, i) => (
        <circle
          key={i}
          cx={s.x}
          cy={s.y}
          r={s.r}
          fill={s.color}
          className="stereo-star"
          style={{ animationDuration: `${s.duration.toFixed(2)}s`, animationDelay: `${(s.phase * s.duration).toFixed(2)}s` }}
        />
      ))}
    </svg>
  );

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
    // zIndex: 0 here (not just position: relative) matters more than it
    // looks like it should: the buildings track below has its own
    // explicit zIndex: 1 (to guarantee it paints above the static
    // starfield behind it — see that div's own comment), and
    // position:relative WITHOUT a z-index does NOT establish a real
    // stacking context. Without this, that inner z-index:1 has nothing
    // local to be contained by, so it bubbles up and gets compared
    // against whatever this whole component is composited with
    // upstream — which is exactly what broke
    // StereoTypesTitleScreen.jsx's logo overlay (a plain
    // position:absolute sibling with no z-index of its own, rendered
    // AFTER this component in the DOM): the buildings' stray z-index:1
    // was outranking it and painting on top, despite coming earlier in
    // the DOM. Setting zIndex here turns THIS div into a genuine
    // stacking context, so the star/building ordering stays fully
    // self-contained and can never again leak out to out-rank whatever
    // any caller layers on top of this component.
    <div style={{ position: "relative", zIndex: 0, width: "100%", height: effectiveHeight, overflow: "hidden", background: `linear-gradient(180deg, ${SKY_TOP} 0%, ${SKY_BOTTOM} 100%)` }}>
      {/* Static starfield, sat behind the scrolling skyline and never
          itself animated — real stars don't visibly drift alongside a
          foreground skyline at this scale, so leaving them put (while
          the city scrolls past) reads as a real depth cue for free
          instead of just "more scrolling stuff." Same two-copies-of-
          totalWidth tiling as the skyline below so its own seam lines
          up cleanly, but position: absolute + no scroll animation, and
          explicit z-index on the skyline track below to guarantee the
          buildings paint on top regardless of DOM/positioning order. */}
      <div style={{ position: "absolute", inset: 0, display: "flex", width: totalWidth * 2, height: effectiveHeight }}>
        {starsLayer("stars-a")}
        {starsLayer("stars-b")}
      </div>

      {/* Rendered twice, side by side, in a track exactly double the
          artwork's own width — animating that track to -50% (half of
          ITS width, i.e. exactly one skyline-width) is what makes the
          loop seamless: by the time copy A has scrolled fully off,
          copy B is sitting in exactly the position A started in. */}
      <div
        className="stereo-cityscape-track"
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          width: totalWidth * 2,
          height: effectiveHeight,
          "--stereo-scroll-seconds": `${scrollSeconds}s`,
          "--stereo-pulse-seconds": `${pulseSeconds}s`,
          "--stereo-pulse-min-opacity": pulseMinOpacity,
          "--stereo-pulse-scale": pulseScale,
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
          /* Rects scale from their top-left corner by default — fine
             for opacity alone, but scaling a window from its corner
             instead of its center reads as it sliding sideways rather
             than pulsing in place. transform-box/transform-origin here
             fix that. */
          transform-box: fill-box;
          transform-origin: center;
        }
        @keyframes stereo-window-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: var(--stereo-pulse-min-opacity, 0.4); transform: scale(var(--stereo-pulse-scale, 1.15)); }
        }
        .stereo-star {
          animation-name: stereo-star-twinkle;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
        }
        @keyframes stereo-star-twinkle {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
