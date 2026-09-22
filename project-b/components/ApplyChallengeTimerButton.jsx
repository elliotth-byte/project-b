import { useState, useEffect } from "react";
import { subscribeSettings } from "../lib/gameState";
import { supabase } from "../lib/supabaseClient";

// ─── Apply Timer Now ───
// See lib/roundEngine.js's applyTimerToRunningChallenge for the full
// reasoning: a challenge's timer is fixed the moment it starts and
// never recomputed, so a battle that was already running when a timer
// fix shipped (torched and masquerade both went from "runs forever" to
// "runs for the season's normal duration" in a recent update) stays
// stuck with no timer regardless. This button is the one-time catch-up
// for whichever battle happens to be running right when that kind of
// fix ships — it's a no-op (and hides itself) for a battle that
// already has a real timer, so there's nothing to worry about leaving
// this visible in general.
export default function ApplyChallengeTimerButton({ gameId, round }) {
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!gameId) return;
    return subscribeSettings(gameId, setSettings);
  }, [gameId]);

  const shouldShow = round?.phase === "challenge" && round?.phaseEndsAt == null && settings && !settings.infiniteTime;
  if (!shouldShow) return null;

  const apply = async () => {
    setBusy(true);
    setMessage("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      const res = await fetch("/api/apply-challenge-timer", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ gameId }),
      });
      const json = await res.json();
      setMessage(json.ok ? "Timer applied." : (json.error || json.reason || "Nothing to apply."));
    } catch (e) {
      setMessage("Couldn't apply the timer — try again.");
    }
    setBusy(false);
  };

  return (
    <div style={{ textAlign: "center", marginBottom: 12 }}>
      <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 6px" }}>
        This battle started before the timer fix shipped, so it's still unlimited. Apply the season's normal duration to it now?
      </p>
      <button onClick={apply} disabled={busy} style={{
        background: "none", border: "1px solid #ff2d95", borderRadius: 6, color: "#ff2d95",
        fontSize: 12, padding: "6px 14px", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
      }}>
        {busy ? "Applying..." : "⏱ Apply Timer Now"}
      </button>
      {message && <p style={{ color: "#a68fd6", fontSize: 11, margin: "6px 0 0" }}>{message}</p>}
    </div>
  );
}
