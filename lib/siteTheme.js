// ─── Cruel Summer House — the platform's own brand ───
// Distinct from lib/uiTheme.js's THEMES: those are PER-GAME (Project B's
// neon vs Traitors' gold/parchment), only relevant once you're actually
// in a season. Before that — the landing page, login/signup, the
// join-by-code screen, and the post-login hub where you pick a season or
// go to your game-agnostic profile/messages — there's no game_type yet
// to theme by at all, so this is its own fixed palette instead, keyed to
// the navy/gold Cruel Summer House logo (public/brand/cruel-summer-house-logo.png).
// pageBg is a flat color, not a gradient, and deliberately an exact
// match — #00113c is the logo PNG's own background color, sampled
// directly from its corner pixels (rgb(0,17,60), consistent across all
// four corners), so the page background and the logo's baked-in
// background disappear into each other with no visible seam.
export const SITE_THEME = {
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

export const LOGO_SRC = "/brand/cruel-summer-house-logo.png";
