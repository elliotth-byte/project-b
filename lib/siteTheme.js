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
// color. pageBg's angle and stops are deliberately NOT the lazy 135deg
// diagonal — the day logo image is 768x512 (a 3:2 rectangle, same
// aspect ratio it's displayed at: 300x200), and 135deg is only a true
// corner-to-corner diagonal for a SQUARE box. The real corner-to-corner
// angle for a 768x512 rectangle is 90 + atan(512/768) = 123.69deg (CSS
// angles are measured clockwise from "up"); every color stop below was
// then found by sampling real pixels off the day logo's own background
// (avoiding the wordmark itself) and projecting each sample onto that
// exact 123.69deg axis, so this gradient's direction AND its color-per-
// distance rate now genuinely match the logo rectangle's own diagonal,
// not just an eyeballed approximation of it.
//
// This still isn't a literal pixel-perfect seam against the small
// rendered logo box specifically — that would require knowing exactly
// where on any given page's layout the logo lands on screen (which
// varies with viewport size and how much text/content sits around it)
// and measuring it at runtime; what's here instead makes the WHOLE
// PAGE's ombre geometrically correct for this rectangle's actual shape,
// which is what actually reads as "the same gradient," direction and
// all, rather than a same-family-of-colors approximation.
export const SITE_THEME_DAY = {
  pageBg: "linear-gradient(123.69deg, #04c0b6 0%, #029ebd 20%, #2752b7 40%, #910a9e 60%, #ec1297 80%, #fd1c8a 100%)",
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
