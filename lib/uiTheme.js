// ─── Page-chrome theme tokens ───
// Project B and Traitors each already have their own established
// palette — Project B's neon pink/purple is just hardcoded directly
// into pages/host.jsx & pages/play.jsx; Traitors' gold/parchment one
// lives in components/traitorsUi.jsx and is already used throughout
// every Traitors panel (TraitorsAdminHost, MurderVoteHost, etc.).
// This is those same two palettes pulled into one place so the OUTER
// page chrome — the header, season switcher, page background/font —
// can pick the right one by game_type. That chrome lives in
// host.jsx/play.jsx themselves, outside HostPanels/TraitorsHostPanels
// and TraitorsPlayerPanels, so neither of those already themes it.
export const THEMES = {
  project_b: {
    pageBg: "linear-gradient(180deg, #05010f, #1a0a2e)",
    cardBg: "#150a28",
    inputBg: "#0d0618",
    border: "#3d1f5c",
    text: "#f5f0ff",
    textMuted: "#a68fd6",
    textDim: "#6b4f99",
    accent: "#ff2d95",
    accentGradient: "linear-gradient(135deg, #ff2d95, #b829ff)",
    accentText: "#05010f",
    danger: "#ff3860",
    font: "'Orbitron', 'Segoe UI', sans-serif",
  },
  traitors: {
    pageBg: "linear-gradient(180deg, #0c1425, #0f1a30)",
    cardBg: "#0e1830",
    inputBg: "#0a1020",
    border: "#253550",
    text: "#f0e6d3",
    textMuted: "#a09080",
    textDim: "#706050",
    accent: "#c9a84c",
    accentGradient: "linear-gradient(135deg, #c9a84c, #a5822f)",
    accentText: "#0c1425",
    danger: "#c45c3c",
    font: "'Palatino Linotype', Palatino, Georgia, serif",
  },
};

// Defaults to Project B — used for screens before any specific season
// is known yet (login, "no active season", etc.), same as today.
export function themeFor(gameType) {
  return THEMES[gameType === "traitors" ? "traitors" : "project_b"];
}
