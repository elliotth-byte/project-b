import { useState, useEffect } from "react";

// ─── Cruel Summer House — the platform's own brand ───
// Distinct from lib/uiTheme.js's THEMES: those are PER-GAME (Project B's
// neon vs Traitors' gold/parchment), only relevant once you're actually
// in a season. Before that — the landing page, login/signup, the
// join-by-code screen, and the post-login hub where you pick a season or
// go to your game-agnostic profile/messages — there's no game_type yet
// to theme by at all, so this is its own fixed brand instead. "Fixed"
// now means "one of two," not "one" — see useSiteTheme below.
//
// Both logo files (see LOGO_SRC_NIGHT/DAY) are transparent PNGs now —
// no baked-in background rectangle to seam-match against at all, unlike
// the earlier round of each (a flat navy card for night, a cropped
// contact-sheet tile for day). That's what actually makes "blends
// perfectly" possible: the wordmark just sits on whatever pageBg is
// underneath, so there's nothing to line up — pageBg is free to be
// whatever's most true to each logo's own palette, not constrained to
// match one specific rectangle's exact pixels.

// Navy/gold stays the color SCHEME, but no longer needs to be one dead-
// flat hex — the gold logo's own ink has real depth to it (bright near-
// white highlights down to near-black bronze shadow, sampled directly
// off its pixels), so pageBg is now a subtle near-navy-to-navy gradient
// echoing that same light/dark range instead of a single flat color.
// Restrained on purpose — this should still read as "the navy
// background," just less inert than one uniform hex.
export const SITE_THEME_NIGHT = {
  pageBg: "linear-gradient(160deg, #050b24 0%, #00113c 55%, #0a1a4a 100%)",
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

// Third round of the day logo — dropped the gold bookends entirely for
// a tighter, more cohesive neon pink/purple/cyan palette, matching what
// this specific piece of art actually is: hot pink/magenta at the top
// of "Cruel", through purple, into bright cyan at the peak of "SUMMER",
// back through purple, out to pink/magenta again through "HOUSE" —
// sampled directly off its pixels, same approach as night's gold depth
// and the previous day logo's own flow, just a different (and simpler,
// more consistent) real color journey this time. 160deg again matches
// the artwork's own mostly-top-to-bottom flow.
export const SITE_THEME_DAY = {
  pageBg: "linear-gradient(160deg, #ff4da9 0%, #b411e4 16%, #3501cb 32%, #03edff 50%, #0337fe 68%, #bd00f8 84%, #fe2cc7 100%)",
  // Translucent instead of solid — lets the ombre keep showing through
  // behind every card rather than covering it with a flat panel, while
  // still giving text somewhere dark enough to sit on top of.
  cardBg: "rgba(12, 8, 36, 0.55)",
  inputBg: "rgba(12, 8, 36, 0.7)",
  border: "rgba(255, 255, 255, 0.25)",
  text: "#fff8f0",
  textMuted: "#e8d9f5",
  textDim: "#c7b8d9",
  accent: "#ff4da9",
  // Cyan-to-pink — both colors genuinely present in the logo's own ink
  // ("SUMMER"'s cyan, "Cruel"/"HOUSE"'s pink), not picked from nowhere.
  accentGradient: "linear-gradient(135deg, #03edff, #ff4da9)",
  accentText: "#fff8f0",
  danger: "#ff3860",
  font: "'Playfair Display', Georgia, serif",
};

export const LOGO_SRC_NIGHT = "/brand/cruel-summer-house-logo-night.png";
export const LOGO_SRC_DAY = "/brand/cruel-summer-house-logo-day.png";

// Night's canvas is 1122x1402 (4:5); this round of the day logo is a
// different canvas, 1086x1448 (~3:4) — close, but not the same shape,
// so back to picking dimensions per logo rather than one shared box
// (matches night's own 275 height, width scaled to this logo's real
// ratio so nothing letterboxes).
export const LOGO_DIMENSIONS_NIGHT = { width: 220, height: 275 };
export const LOGO_DIMENSIONS_DAY = { width: 206, height: 275 };

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
