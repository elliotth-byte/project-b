import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchProfile } from "../lib/profiles";

// ─── Nudge: set a profile photo before the season ends ───
// Prompted by the same feature that made this worth telling people
// about in the first place — CeremonyCards.jsx's FinaleCard now pulls
// in each finalist's cross-season profile photo (see lib/profiles.js's
// fetchProfilePhotos) for the finale reveal tiles, so a player who
// never set one just shows up as a bare initial there instead. This is
// the "tell people, while there's still time to do something about it"
// half of that — shown throughout the ACTIVE season (see the gameEnded
// check at this component's own call site in pages/play.jsx), since a
// prompt to add a photo after the finale's already happened would be
// pointless for THIS season.
//
// Dismissible for the session only (plain local state, not persisted
// anywhere) — reappears on a fresh page load if they still haven't set
// one, same lightweight nagging-without-nagging-forever this app
// already does for e.g. NavTourOverlay's own replay-tour affordance,
// rather than a permanent per-account "don't show this again" flag for
// what's a pretty low-stakes reminder.
export default function ProfilePhotoPrompt({ userId }) {
  const [photoUrl, setPhotoUrl] = useState(undefined); // undefined = not checked yet
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!userId) return;
    fetchProfile(userId).then((p) => setPhotoUrl(p?.photo_url || null));
  }, [userId]);

  if (!userId || photoUrl === undefined || photoUrl || dismissed) return null;

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
      background: "rgba(184,41,255,0.1)", border: "1px solid rgba(184,41,255,0.35)",
      borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 12,
    }}>
      <span style={{ color: "#f5f0ff" }}>
        📸 Add a profile photo — it'll show up on the finale reveal tiles at the end of the season.
      </span>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
        <Link href="/profile" style={{
          background: "linear-gradient(135deg, #ff2d95, #b829ff)", color: "#05010f",
          borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 700, textDecoration: "none",
        }}>
          Add photo
        </Link>
        <button
          onClick={() => setDismissed(true)}
          style={{ background: "none", border: "none", color: "#a68fd6", fontSize: 12, cursor: "pointer", padding: 0 }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
