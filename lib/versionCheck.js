import { useState, useEffect } from "react";

// ============================================================
// See next.config.js and pages/api/version.js for the two halves this
// depends on. CURRENT_VERSION is baked into the JS bundle at build
// time — whatever it was when THIS tab first loaded — so it never
// changes for the lifetime of an open tab, which is exactly what makes
// comparing it against the live /api/version response useful.
//
// Checks on mount, on a 5-minute interval, and whenever the tab
// becomes visible again (someone switching back after a while is
// exactly when they're likely to have missed a deploy) — not on every
// possible event, since this only needs to catch drift eventually, not
// instantly.
// ============================================================

const CURRENT_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "dev";
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    // "dev" means this build has no real commit SHA (local dev, or the
    // env var genuinely wasn't set) — nothing meaningful to compare
    // against, and checking would just create false positives.
    if (CURRENT_VERSION === "dev") return;

    let active = true;
    const check = async () => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        const { version } = await res.json();
        if (active && version && version !== CURRENT_VERSION) setUpdateAvailable(true);
      } catch (e) {
        // A network hiccup here isn't worth surfacing to the player —
        // the next interval or visibility check will just try again.
      }
    };

    check();
    const intervalId = setInterval(check, CHECK_INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      active = false;
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return { updateAvailable, currentVersion: CURRENT_VERSION };
}
