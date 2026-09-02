import { useState, useEffect } from "react";

// ─── Cruel Summer House — the platform's own brand ───
// Distinct from lib/uiTheme.js's THEMES: those are PER-GAME (Project B's
// neon vs Traitors' gold/parchment), only relevant once you're actually
// in a season. Before that — the landing page, login/signup, the
// join-by-code screen, and the post-login hub where you pick a season or
// go to your game-agnostic profile/messages — there's no game_type yet
// to theme by at all, so this is its own fixed brand instead. "Fixed"
// now means "one of two," not "one" — see useSiteTheme below.

// pageBg is a flat color, not a gradient, and deliberately an exact
// match — #00113c is the NIGHT logo PNG's own background color, sampled
// directly from its corner pixels (rgb(0,17,60), consistent across all
// four corners), so the page background and the logo's baked-in
// background disappear into each other with no visible seam.
export const SITE_THEME_NIGHT = {
  pageBg: "#00113c",
  cardBg: "#111a3f",
  inputBg: "#0a1030",
  border: "#2a3568",
  text: "#f2efe4",
  textMuted: "#b9ac82",
  textDim: "#6b6f95",
  accent: "#d4af37",
  accentGradient: "linear-gradient(135deg, #d4af37, #a6883f)",
  accentText: "#0a1030",
  danger: "#e0574f",
  font: "'Playfair Display', Georgia, serif",
};

// Same idea as NIGHT above, just against a gradient instead of a flat
// color — pageBg is a 135deg ombre built from pixels sampled directly
// off the DAY logo's own background (its four corners: teal #05c1b4
// top-left, blue-purple through the middle, hot pink #fd1b89 bottom-
// right — see this repo's own session notes for the exact sampling),
// so the page background continues the same diagonal, same hues, as
// the logo sitting on top of it. Not a literal pixel-perfect seam (the
// logo is a fixed-size rectangle with its own baked-in gradient, not a
// transparent cutout, so there's no way to make its edges truly vanish
// the way NIGHT's flat color could) — but same direction, same stops,
// so it reads as one continuous ombre rather than a mismatched box.
export const SITE_THEME_DAY = {
  pageBg: "linear-gradient(135deg, #05c1b4 0%, #03abba 25%, #5132a8 50%, #f31990 75%, #fd1b89 100%)",
  // Translucent instead of solid — lets the ombre keep showing through
  // behind every card rather than covering it with a flat panel, while
  // still giving text somewhere dark enough to sit on top of.
  cardBg: "rgba(12, 8, 36, 0.55)",
  inputBg: "rgba(12, 8, 36, 0.7)",
  border: "rgba(255, 255, 255, 0.25)",
  text: "#fff8f0",
  textMuted: "#e8d9f5",
  textDim: "#c7b8d9",
  accent: "#fd1b89",
  // Cyan-to-pink — the same two colors bookending the day logo's own
  // wordmark gradient, not a color pulled from nowhere.
  accentGradient: "linear-gradient(135deg, #05c1b4, #fd1b89)",
  accentText: "#fff8f0",
  danger: "#ff3860",
  font: "'Playfair Display', Georgia, serif",
};

export const LOGO_SRC_NIGHT = "/brand/cruel-summer-house-logo.png";
export const LOGO_SRC_DAY = "/brand/cruel-summer-house-logo-day.png";

// The two logo files are genuinely different shapes — NIGHT is a tall
// portrait crop (1122x1402), DAY is a wide landscape crop off a 4-up
// contact sheet (768x512) — so a display box sized for one letterboxes
// badly with the other. Callers should size their <Image> from
// whichever of these matches the logo actually in use, not reuse one
// fixed box for both.
export const LOGO_DIMENSIONS_NIGHT = { width: 220, height: 275 };
export const LOGO_DIMENSIONS_DAY = { width: 300, height: 200 };

// Backwards-compatible aliases — anything not yet updated to pick a
// theme by time of day still gets the original always-night look.
export const SITE_THEME = SITE_THEME_NIGHT;
export const LOGO_SRC = LOGO_SRC_NIGHT;

function isDaytime(date) {
  const h = date.getHours();
  return h >= 6 && h < 18;
}

// Client-only by necessity — "day" has to mean the VIEWER's own local
// time, which the server rendering this page has no way to know. Starts
// every render (server and the very first client paint) on NIGHT, then
// corrects itself in an effect once the browser's own clock is
// available — a deliberate, one-time "wrong theme for an instant on a
// daytime visit" tradeoff rather than a hydration mismatch. Re-checks
// every minute so a tab left open across the 6am/6pm boundary switches
// on its own instead of needing a refresh.
export function useSiteTheme() {
  const [isDay, setIsDay] = useState(false);

  useEffect(() => {
    const check = () => setIsDay(isDaytime(new Date()));
    check();
    const id = setInterval(check, 60000);
    return () => clearInterval(id);
  }, []);

  return {
    isDay,
    theme: isDay ? SITE_THEME_DAY : SITE_THEME_NIGHT,
    logoSrc: isDay ? LOGO_SRC_DAY : LOGO_SRC_NIGHT,
    logoDimensions: isDay ? LOGO_DIMENSIONS_DAY : LOGO_DIMENSIONS_NIGHT,
  };
}
