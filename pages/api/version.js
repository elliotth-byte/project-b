// ============================================================
// Deliberately tiny and side-effect-free — no auth, no database, just
// echoes back this SERVERLESS FUNCTION's own build version. That's the
// whole trick: an already-open browser tab is running JS from whenever
// it first loaded, but every call to this route runs on whatever's
// CURRENTLY deployed — so a client comparing its own build-time version
// (see next.config.js) against what this returns can tell it's stale
// without needing any reload, cache-bust, or push mechanism of its own.
// See lib/versionCheck.js for the client side of this.
// ============================================================

export default function handler(req, res) {
  const version = (process.env.VERCEL_GIT_COMMIT_SHA || "dev").slice(0, 7);
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ version });
}
