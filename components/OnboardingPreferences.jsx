import { useState } from "react";
import { Card, Btn } from "./ui";
import { setGamePrefs } from "../lib/gamePrefs";
import NotificationSettings from "./NotificationSettings";
import GamePreferencesToggles from "./GamePreferencesToggles";

// ─── Onboarding: Preferences ───
// Shown once, right after a player picks their color/alias and before
// the "waiting for host approval" screen — previously, notification
// prompting and every other preference here only ever surfaced on the
// Help tab, well after a player had already joined and been approved,
// which meant most people never saw it until well into actually
// playing (if at all). Reuses NotificationSettings and
// GamePreferencesToggles exactly as the Options tab does, rather than
// a separate copy of this logic.
//
// "Completed onboarding" is tracked as a flag inside the SAME
// game_prefs JSONB blob every other preference here already lives in
// (see lib/gamePrefs.js) — deliberately not a new column, since this
// is genuinely just another per-player preference, and reusing the
// existing column means no new migration is needed for this feature.
//
// No local gamePrefs tracking here — GamePreferencesToggles keeps its
// own display state internally after mount, and setGamePrefs itself
// re-fetches the player's CURRENT saved prefs before merging in a
// patch (see lib/gamePrefs.js), so the "Continue" write below can't
// accidentally clobber a toggle the player just changed with stale
// local state.
export default function OnboardingPreferences({ gameId, player, onComplete }) {
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    setBusy(true);
    const res = await setGamePrefs(player.id, { onboardingComplete: true });
    setBusy(false);
    if (res.ok) onComplete?.(res.prefs);
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>⚙️</div>
        <h2 style={{ color: "#f5f0ff", fontFamily: "'Orbitron', 'Segoe UI', sans-serif", marginBottom: 4 }}>Before You Get Started</h2>
        <p style={{ color: "#a68fd6", fontSize: 13 }}>
          A couple of quick settings — you can always change these later from the Options tab.
        </p>
      </div>

      <Card style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
          🔔 Notifications
        </div>
        <NotificationSettings gameId={gameId} player={player} compact />
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
          🎮 Game Preferences
        </div>
        <GamePreferencesToggles player={player} compact />
      </Card>

      <Btn onClick={finish} disabled={busy} style={{ width: "100%" }}>
        {busy ? "..." : "Continue"}
      </Btn>
    </div>
  );
}
