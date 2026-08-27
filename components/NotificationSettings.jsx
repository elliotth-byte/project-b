import { useState, useEffect } from "react";
import {
  isPushSupported, getExistingSubscription, subscribeToPush, updatePushPrefs, unsubscribeFromPush,
} from "../lib/pushNotifications";

// ─── Notifications ───
// Extracted out of HelpPanel.jsx so the exact same enable/toggle logic
// can also run during onboarding (see OnboardingPreferences.jsx) —
// before this, notification prompting only ever happened once a player
// reached the Options tab, well after they'd already joined and been
// approved. compact=true trims the copy for the tighter onboarding
// context; the full version (with the "why aren't the toggles showing
// up" explanation) is what the Options tab still uses.
export default function NotificationSettings({ gameId, player, readOnly = false, compact = false }) {
  const [pushSupported] = useState(() => isPushSupported());
  const [pushLoading, setPushLoading] = useState(true);
  const [pushSub, setPushSub] = useState(null); // existing subscription row, or null if not subscribed
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState("");

  useEffect(() => {
    // A push subscription is tied to a specific browser/device (see
    // lib/pushNotifications.js) — checked here via THIS browser's own
    // service worker registration. In a read-only "View as Player"
    // preview, that's the HOST's browser, which has nothing to do with
    // the player being previewed — checking it would show the host's own
    // subscription status mislabeled as that player's. Skipped entirely
    // rather than shown inaccurately; see the static note in the render
    // below instead.
    if (readOnly || !player || !pushSupported) { setPushLoading(false); return; }
    getExistingSubscription(player.id).then((sub) => { setPushSub(sub); setPushLoading(false); });
  }, [player, pushSupported, readOnly]);

  const enablePush = async () => {
    setPushBusy(true);
    setPushMessage("");
    const res = await subscribeToPush(player.id, gameId, {
      notifyRounds: true, notifyPublicMessages: false, notifyPrivateMessages: true,
    });
    setPushBusy(false);
    if (!res.ok) { setPushMessage(res.error || "Couldn't turn on notifications."); return; }
    const sub = await getExistingSubscription(player.id);
    setPushSub(sub);
  };

  const togglePushPref = async (dbColumn) => {
    if (!pushSub) return;
    const newValue = !pushSub[dbColumn];
    setPushSub((s) => ({ ...s, [dbColumn]: newValue }));
    await updatePushPrefs(player.id, {
      notifyRounds: dbColumn === "notify_rounds" ? newValue : pushSub.notify_rounds,
      notifyPublicMessages: dbColumn === "notify_public_messages" ? newValue : pushSub.notify_public_messages,
      notifyPrivateMessages: dbColumn === "notify_private_messages" ? newValue : pushSub.notify_private_messages,
    });
  };

  const disablePush = async () => {
    setPushBusy(true);
    await unsubscribeFromPush(player.id);
    setPushBusy(false);
    setPushSub(null);
  };

  if (readOnly) {
    return (
      <p style={{ fontSize: 12, color: "#6b4f99", margin: 0, fontStyle: "italic" }}>
        Notification settings are tied to each player's own device and can't be previewed from here.
      </p>
    );
  }

  if (!pushSupported) {
    return (
      <p style={{ fontSize: 12, color: "#6b4f99", margin: 0, fontStyle: "italic" }}>
        Not supported in this browser.{!compact && " On iPhone/iPad, this needs Safari and the app added to your Home Screen first (see below) — it won't work from a regular Safari tab."}
      </p>
    );
  }

  if (pushLoading) {
    return <p style={{ fontSize: 12, color: "#6b4f99", margin: 0, fontStyle: "italic" }}>Loading...</p>;
  }

  if (!pushSub) {
    return (
      <div>
        <p style={{ fontSize: 12, color: "#6b4f99", margin: "0 0 10px" }}>
          Get notified even when the app's closed.{!compact && " On iPhone/iPad, this only works after adding the app to your Home Screen (see below) and opening it from that icon — not from a regular Safari tab."}
        </p>
        <button
          onClick={enablePush}
          disabled={pushBusy}
          style={{
            padding: "8px 16px", borderRadius: 6, border: "none", cursor: pushBusy ? "default" : "pointer",
            background: "linear-gradient(135deg, #ff2d95, #b829ff)", color: "#05010f", fontSize: 13, fontWeight: 700,
          }}
        >
          {pushBusy ? "..." : "Enable Notifications"}
        </button>
        {pushMessage && <p style={{ fontSize: 12, color: "#ff3860", marginTop: 8, marginBottom: 0 }}>{pushMessage}</p>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "grid", gap: 10, marginBottom: 10 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#f5f0ff", cursor: "pointer" }}>
          <input type="checkbox" checked={!!pushSub.notify_rounds} onChange={() => togglePushPref("notify_rounds")} />
          Round changes — a new Battle, Exile Vote, or Fates Ceremony starting
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#f5f0ff", cursor: "pointer" }}>
          <input type="checkbox" checked={!!pushSub.notify_public_messages} onChange={() => togglePushPref("notify_public_messages")} />
          Public messages — new activity in Panopticon (group chat)
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#f5f0ff", cursor: "pointer" }}>
          <input type="checkbox" checked={!!pushSub.notify_private_messages} onChange={() => togglePushPref("notify_private_messages")} />
          Private messages — new DMs sent to you
        </label>
      </div>
      <button
        onClick={disablePush}
        disabled={pushBusy}
        style={{ background: "none", border: "1px solid #3d1f5c", borderRadius: 6, padding: "6px 14px", color: "#a68fd6", fontSize: 12, cursor: pushBusy ? "default" : "pointer" }}
      >
        {pushBusy ? "..." : "Turn Off Notifications"}
      </button>
    </div>
  );
}
