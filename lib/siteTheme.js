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

// The day logo's own ink isn't a simple two-color diagonal — sampled
// straight off its pixels top to bottom: gold at the tail of "Cruel",
// down through hot pink/magenta through the body of "Cruel", into
// cyan/blue through "SUMMER", back through purple/magenta, and out to
// pink-to-gold again through "HOUSE". pageBg's stops are pulled
// directly from that real, already-organic flow (see this repo's own
// session notes for the exact sampling) rather than a straight two-
// color interpolation, which is what actually makes it read as organic
// instead of a mechanical fade — it's echoing a gradient that already
// exists in the artwork, just stretched across the whole page behind
// it. 160deg (mostly top-to-bottom, slight lean) matches the actual
// vertical flow of the logo's own color bands, not an arbitrary corner-
// to-corner diagonal.
export const SITE_THEME_DAY = {
  pageBg: "linear-gradient(160deg, #fed306 0%, #fc0477 16%, #f300bc 32%, #0a72fc 46%, #05defc 56%, #9600c3 70%, #fa01a1 85%, #feb901 100%)",
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
  // Cyan-to-pink — both colors genuinely present in the logo's own ink
  // (the "SUMMER" cyan, the "Cruel"/"HOUSE" pink), not picked from
  // nowhere.
  accentGradient: "linear-gradient(135deg, #05defc, #fd1b89)",
  accentText: "#fff8f0",
  danger: "#ff3860",
  font: "'Playfair Display', Georgia, serif",
};

export const LOGO_SRC_NIGHT = "/brand/cruel-summer-house-logo-night.png";
export const LOGO_SRC_DAY = "/brand/cruel-summer-house-logo-day.png";

// Both logos are the same 1122x1402 canvas now (this is the second
// round of each file — the first day logo was a cropped landscape tile
// off a contact sheet, a completely different shape; this one's the
// same portrait canvas as night, just recolored), so one shared box
// size actually fits both — no more picking dimensions by which logo's
// in use.
export const LOGO_DIMENSIONS = { width: 220, height: 275 };

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
    logoDimensions: LOGO_DIMENSIONS,
  };
}
