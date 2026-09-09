// ============================================================
// Kept intentionally minimal — this project has never needed a
// next.config.js before, so the only thing added here is the one thing
// that genuinely requires build-time config: exposing a version
// identifier to the client bundle.
//
// VERCEL_GIT_COMMIT_SHA is set automatically by Vercel on every build,
// no dashboard configuration needed — but it's NOT automatically
// available to browser code the way NEXT_PUBLIC_* env vars are, so it
// has to be explicitly re-exposed here. Falls back to "dev" for local
// development, where that variable doesn't exist at all.
//
// Used by: lib/versionCheck.js (compares this build's version against
// whatever's currently live, to prompt for a refresh when they drift)
// and HelpPanel.jsx (shows it plainly so a player can report exactly
// which version they're on).
// ============================================================

const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || "dev";

module.exports = {
  env: {
    NEXT_PUBLIC_APP_VERSION: commitSha.slice(0, 7),
  },
};
