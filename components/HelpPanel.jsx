import { useState, useEffect } from "react";
import { Card } from "./ui";
import { setGamePrefs } from "../lib/gamePrefs";
import {
  isPushSupported, getExistingSubscription, subscribeToPush, updatePushPrefs, unsubscribeFromPush,
} from "../lib/pushNotifications";
import { RULES_SECTIONS, battleList } from "../lib/rulesContent";

// ─── Player help ───
// The full rules, in-app (see lib/rulesContent.js — kept as data
// specifically so it can stay synced with the game as mechanics change,
// rather than an external doc that quietly drifts out of date), how to
// get this page onto an iPhone/iPad home screen as an app-like icon,
// Game Preferences — player-level settings (see lib/gamePrefs.js) that
// every game respects — and Notifications, opt-in only (see
// lib/pushNotifications.js).
export default function HelpPanel({ gameId, player, onPrefsChanged, onReplayTour, onQuit, quitBusy, readOnly = false }) {
  const [prefs, setPrefs] = useState(player?.gamePrefs || {});
  const [saving, setSaving] = useState(false);
  const [openSections, setOpenSections] = useState(new Set());

  const toggleSection = (i) => setOpenSections((prev) => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

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

  const toggle = async (key) => {
    if (!player) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaving(true);
    const res = await setGamePrefs(player.id, { [key]: next[key] });
    setSaving(false);
    if (res.ok) onPrefsChanged?.(res.prefs);
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Card>
        <div style={{ fontSize: 12, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
          📖 Rules
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {RULES_SECTIONS.map((section, i) => {
            const isOpen = openSections.has(i);
            const isBattleList = section.body === null;
            return (
              <div key={section.title}>
                <button
                  onClick={() => toggleSection(i)}
                  style={{
                    width: "100%", textAlign: "left", background: isOpen ? "rgba(255,45,149,0.08)" : "#0d0618",
                    border: `1px solid ${isOpen ? "rgba(255,45,149,0.3)" : "#3d1f5c"}`, borderRadius: 8,
                    padding: "10px 12px", color: isOpen ? "#ff2d95" : "#f5f0ff", fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  {isOpen ? "▾" : "▸"} {section.title}
                </button>
                {isOpen && (
                  <div style={{ padding: "10px 4px 4px 12px" }}>
                    {isBattleList ? (
                      <div style={{ display: "grid", gap: 10 }}>
                        {battleList().map((g) => (
                          <div key={g.label}>
                            <div style={{ fontSize: 13, color: "#f5f0ff", fontWeight: 700, marginBottom: 2 }}>{g.icon} {g.label}</div>
                            <div style={{ fontSize: 12, color: "#a68fd6", lineHeight: 1.5 }}>{g.blurb}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize: 12, color: "#a68fd6", lineHeight: 1.6, margin: 0, whiteSpace: "pre-line" }}>{section.body}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {onQuit && !readOnly && (
        <Card style={{ borderColor: "rgba(255,56,96,0.4)", textAlign: "center" }}>
          <div style={{ fontSize: 12, color: "#ff3860", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            ⚠️ Leave the Game
          </div>
          <p style={{ fontSize: 12, color: "#a68fd6", margin: "0 0 12px" }}>
            This removes you from the season entirely — it can't be undone, and you can't rejoin.
          </p>
          <button
            onClick={onQuit}
            disabled={quitBusy}
            style={{
              background: "none", border: "1px solid #ff3860", borderRadius: 8, padding: "8px 16px",
              color: "#ff3860", fontSize: 13, fontWeight: 700, cursor: quitBusy ? "default" : "pointer",
            }}
          >
            {quitBusy ? "Leaving..." : "🚪 Permanently Quit"}
          </button>
        </Card>
      )}

      {onReplayTour && !readOnly && (
        <Card style={{ textAlign: "center" }}>
          <button
            onClick={onReplayTour}
            style={{
              background: "none", border: "1px solid #3d1f5c", borderRadius: 8, padding: "8px 16px",
              color: "#a68fd6", fontSize: 13, cursor: "pointer",
            }}
          >
            🧭 Replay Navigation Tour
          </button>
        </Card>
      )}

      {player && (
        <Card>
          <div style={{ fontSize: 12, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            🎮 Game Preferences
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#f5f0ff", cursor: readOnly ? "default" : "pointer" }}>
              <input type="checkbox" checked={!!prefs.colorBlindMode} onChange={() => toggle("colorBlindMode")} disabled={saving || readOnly} />
              Colorblind-friendly colors — swaps to a colorblind-safe palette in every game that uses color as a signal
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#f5f0ff", cursor: readOnly ? "default" : "pointer" }}>
              <input type="checkbox" checked={!!prefs.swipeControls} onChange={() => toggle("swipeControls")} disabled={saving || readOnly} />
              Swipe controls — adds swipe-to-move alongside tap/arrows in any game with directional movement
            </label>
          </div>
          <p style={{ fontSize: 11, color: "#6b4f99", marginTop: 10, marginBottom: 0, fontStyle: "italic" }}>
            {readOnly ? "Shown for reference only — not editable from this preview." : "Saved to your player, not just this device — applies wherever you're logged in."}
          </p>
        </Card>
      )}

      <Card>
        <div style={{ fontSize: 12, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
          🔔 Notifications
        </div>
        {readOnly ? (
          <p style={{ fontSize: 12, color: "#6b4f99", margin: 0, fontStyle: "italic" }}>
            Notification settings are tied to each player's own device and can't be previewed from here.
          </p>
        ) : !pushSupported ? (
          <p style={{ fontSize: 12, color: "#6b4f99", margin: 0, fontStyle: "italic" }}>
            Not supported in this browser. On iPhone/iPad, this needs Safari and the app added to your Home Screen first (see below) — it won't work from a regular Safari tab.
          </p>
        ) : pushLoading ? (
          <p style={{ fontSize: 12, color: "#6b4f99", margin: 0, fontStyle: "italic" }}>Loading...</p>
        ) : !pushSub ? (
          <div>
            <p style={{ fontSize: 12, color: "#6b4f99", margin: "0 0 10px" }}>
              Get notified even when the app's closed. On iPhone/iPad, this only works after adding the app to your Home Screen (see below) and opening it from that icon — not from a regular Safari tab.
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
        ) : (
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
        )}
      </Card>

      <Card>
        <div style={{ fontSize: 12, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
          📱 Add to Home Screen (iPhone/iPad)
        </div>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#f5f0ff", lineHeight: 1.8 }}>
          <li>Open this page in <strong>Safari</strong> (not another app's built-in browser).</li>
          <li>Tap the <strong>Share</strong> icon (square with an arrow pointing up) in the toolbar.</li>
          <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
          <li>Tap <strong>Add</strong> in the top corner.</li>
        </ol>
        <p style={{ fontSize: 12, color: "#6b4f99", marginTop: 10, marginBottom: 0, fontStyle: "italic" }}>
          You'll get an icon that opens straight to the game — no need to keep finding the link. This step is also required before Notifications above will work on iPhone/iPad.
        </p>
      </Card>

      <Card>
        <div style={{ fontSize: 12, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
          📱 Add to Home Screen (Android)
        </div>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#f5f0ff", lineHeight: 1.8 }}>
          <li>Open this page in <strong>Chrome</strong>.</li>
          <li>Tap the <strong>⋮</strong> menu icon in the top-right corner.</li>
          <li>Tap <strong>Add to Home screen</strong> (sometimes shown as <strong>Install app</strong>).</li>
          <li>Tap <strong>Add</strong> (or <strong>Install</strong>) to confirm.</li>
        </ol>
        <p style={{ fontSize: 12, color: "#6b4f99", marginTop: 10, marginBottom: 0, fontStyle: "italic" }}>
          Same convenience as above — an icon that opens straight to the game. Unlike iPhone/iPad, this step is optional on Android: Notifications above already work from a regular Chrome tab without it.
        </p>
      </Card>
    </div>
  );
}
