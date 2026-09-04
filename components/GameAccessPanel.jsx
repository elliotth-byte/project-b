import { useState, useEffect } from "react";
import {
  isPushSupported, getExistingHostSubscription, subscribeHostToPush, updateHostPushPrefs, unsubscribeHostFromPush,
} from "../lib/hostPushNotifications";

const inputStyle = {
  display: "block", width: "100%", background: "#0d0618", border: "1px solid #3d1f5c",
  borderRadius: 8, padding: "10px 14px", color: "#f5f0ff", fontSize: 14, outline: "none", marginBottom: 10,
  boxSizing: "border-box",
};
const btnStyle = {
  width: "100%", background: "linear-gradient(135deg, #ff2d95, #b829ff)", color: "#05010f",
  border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer",
};

// ─── Admin: game access ───
// Co-hosts and the shareable join link/code — pulled out of pages/host.jsx's
// always-visible header into here, since neither is something a host needs
// staring at once the season's actually underway; Admin is where the rest
// of the setup/roster tools already live.
export default function GameAccessPanel({
  game, players, isPrimaryHost, origin, userId,
  coHosts, inviteEmail, setInviteEmail, inviteStatus, inviteCoHost, removeCoHost,
}) {
  const [showCoHosts, setShowCoHosts] = useState(false);
  const [copied, setCopied] = useState(false);

  // This component is otherwise identical across every game type — the
  // one place that isn't is the notification-prefs copy below, which
  // namedrops Project B's own phase names (Battle/Exile Vote/Fates
  // Ceremony/Finale) and its "Panopticon" chat branding. Stereo Types has
  // neither, so this is the explicit three-way check this build already
  // uses elsewhere once Stereo Types existed, rather than just negating
  // isTraitors.
  const isStereoTypes = game?.game_type === "stereo_types";

  const [showNotifications, setShowNotifications] = useState(false);
  const [pushSupported] = useState(() => isPushSupported());
  const [pushLoading, setPushLoading] = useState(true);
  const [pushSub, setPushSub] = useState(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState("");

  // Only checked once the section is actually opened — no point
  // registering a service worker / querying a subscription for a host
  // who never looks at this section this session.
  useEffect(() => {
    if (!showNotifications || !userId || !pushSupported) { setPushLoading(false); return; }
    setPushLoading(true);
    getExistingHostSubscription(userId).then((sub) => { setPushSub(sub); setPushLoading(false); });
  }, [showNotifications, userId, pushSupported]);

  const enablePush = async () => {
    setPushBusy(true);
    setPushMessage("");
    const res = await subscribeHostToPush(userId, game.id, {
      notifyNewConfessional: true, notifyPendingPlayer: true, notifyRoundChanges: true, notifyChatActivity: false,
    });
    setPushBusy(false);
    if (!res.ok) { setPushMessage(res.error || "Couldn't turn on notifications."); return; }
    const sub = await getExistingHostSubscription(userId);
    setPushSub(sub);
  };

  const togglePushPref = async (dbColumn) => {
    if (!pushSub) return;
    const newValue = !pushSub[dbColumn];
    setPushSub((s) => ({ ...s, [dbColumn]: newValue }));
    await updateHostPushPrefs(userId, {
      notifyNewConfessional: dbColumn === "notify_new_confessional" ? newValue : pushSub.notify_new_confessional,
      notifyPendingPlayer: dbColumn === "notify_pending_player" ? newValue : pushSub.notify_pending_player,
      notifyRoundChanges: dbColumn === "notify_round_changes" ? newValue : pushSub.notify_round_changes,
      notifyChatActivity: dbColumn === "notify_chat_activity" ? newValue : pushSub.notify_chat_activity,
    });
  };

  const disablePush = async () => {
    setPushBusy(true);
    await unsubscribeHostFromPush(userId);
    setPushBusy(false);
    setPushSub(null);
  };

  const joinUrl = game?.join_code ? `${origin}/join/${game.join_code}` : "";
  const copyLink = () => {
    if (!joinUrl) return;
    navigator.clipboard.writeText(joinUrl).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    });
  };

  if (!game) return null;

  return (
    <div style={{ background: "#150a28", border: "1px solid #3d1f5c", borderRadius: 10, padding: 14, marginBottom: 16 }}>
      {/* ---------------- Co-hosts ---------------- */}
      <div style={{ marginBottom: 14 }}>
        <button onClick={() => setShowCoHosts((v) => !v)} style={{ background: "none", border: "none", color: "#6b4f99", fontSize: 12, cursor: "pointer", padding: 0 }}>
          {showCoHosts ? "▾" : "▸"} 👥 Co-hosts ({coHosts.length}){!isPrimaryHost && " — you're a co-host"}
        </button>
        {showCoHosts && (
          <div style={{ marginTop: 8 }}>
            {coHosts.length === 0 ? (
              <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic", margin: 0 }}>No co-hosts yet — just you.</p>
            ) : (
              <div style={{ display: "grid", gap: 6, marginBottom: isPrimaryHost ? 10 : 0 }}>
                {coHosts.map((c) => (
                  <div key={c.user_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "6px 10px" }}>
                    <span style={{ fontSize: 12, color: "#a68fd6" }}>{c.email}</span>
                    {isPrimaryHost && (
                      <button onClick={() => removeCoHost(c.user_id)} style={{ background: "none", border: "1px solid #ff386055", borderRadius: 6, color: "#ff3860", fontSize: 11, cursor: "pointer", padding: "3px 8px" }}>Remove</button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {isPrimaryHost && (
              <form onSubmit={inviteCoHost} style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input
                  type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="Co-host's host account email"
                  style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
                />
                <button type="submit" style={{ ...btnStyle, width: "auto", whiteSpace: "nowrap", padding: "10px 16px" }}>Add</button>
              </form>
            )}
            {inviteStatus && inviteStatus !== "sending" && (
              <p style={{ fontSize: 11.5, color: inviteStatus.startsWith("✅") ? "#00ff9d" : "#ff3860", marginTop: 6 }}>{inviteStatus}</p>
            )}
            <p style={{ fontSize: 11, color: "#6b4f99", marginTop: 8, fontStyle: "italic" }}>
              Co-hosts need an existing host account (see README.md) and get full access to run this season — roster, battles, announcements. Only the primary host can add/remove co-hosts or archive/delete the season.
            </p>
          </div>
        )}
      </div>

      {/* ---------------- Notifications ---------------- */}
      <div style={{ marginBottom: 14 }}>
        <button onClick={() => setShowNotifications((v) => !v)} style={{ background: "none", border: "none", color: "#6b4f99", fontSize: 12, cursor: "pointer", padding: 0 }}>
          {showNotifications ? "▾" : "▸"} 🔔 Notifications {pushSub ? "(on)" : ""}
        </button>
        {showNotifications && (
          <div style={{ marginTop: 8 }}>
            <p style={{ fontSize: 11, color: "#6b4f99", margin: "0 0 8px", fontStyle: "italic" }}>
              Personal to you — each host (primary or co-) on this season sets their own, on their own device. If you're running this season with a co-host, they'll need to turn these on separately from their own account.
            </p>
            {!pushSupported ? (
              <p style={{ fontSize: 12, color: "#6b4f99", margin: 0, fontStyle: "italic" }}>Not supported in this browser.</p>
            ) : pushLoading ? (
              <p style={{ fontSize: 12, color: "#6b4f99", margin: 0, fontStyle: "italic" }}>Loading...</p>
            ) : !pushSub ? (
              <div>
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
                    <input type="checkbox" checked={!!pushSub.notify_new_confessional} onChange={() => togglePushPref("notify_new_confessional")} />
                    New confessional — a player just submitted one
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#f5f0ff", cursor: "pointer" }}>
                    <input type="checkbox" checked={!!pushSub.notify_pending_player} onChange={() => togglePushPref("notify_pending_player")} />
                    New player waiting — someone's requested to join and needs approval
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#f5f0ff", cursor: "pointer" }}>
                    <input type="checkbox" checked={!!pushSub.notify_round_changes} onChange={() => togglePushPref("notify_round_changes")} />
                    {isStereoTypes
                      ? "Round updates — a new A Side, The Remix, or On Blast round starting (including ones the cron job auto-advances without you)"
                      : "Round updates — a new Battle, Exile Vote, Fates Ceremony, or Finale starting (including ones the cron job auto-advances without you)"}
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#f5f0ff", cursor: "pointer" }}>
                    <input type="checkbox" checked={!!pushSub.notify_chat_activity} onChange={() => togglePushPref("notify_chat_activity")} />
                    {isStereoTypes
                      ? "Chat activity — any new message, group chat or DM. Off by default — you can already read every thread, so this is the noisiest option here."
                      : "Chat activity — any new message, Panopticon or DM. Off by default — you can already read every thread, so this is the noisiest option here."}
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
          </div>
        )}
      </div>

      {/* ---------------- Shareable link ---------------- */}
      <div style={{ fontSize: 13 }}>
        <div style={{ color: "#a68fd6", marginBottom: 6 }}>Share this with players so they can join:</div>
        {game.join_code ? (
          <>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: 2, color: "#ff2d95", marginBottom: 8 }}>
              {game.join_code}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
              <code style={{
                flex: 1, minWidth: 0, color: "#f5f0ff", fontSize: 13, wordBreak: "break-all",
                background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8,
                padding: "10px 12px", display: "flex", alignItems: "center",
              }}>
                {joinUrl}
              </code>
              <button onClick={copyLink} style={{ ...btnStyle, width: "auto", whiteSpace: "nowrap", padding: "10px 16px" }}>
                {copied ? "Copied ✓" : "Copy link"}
              </button>
            </div>
          </>
        ) : (
          <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic" }}>
            Generating a join code... (refresh if this doesn't update in a few seconds)
          </p>
        )}
        <details style={{ marginTop: 10 }}>
          <summary style={{ color: "#6b4f99", fontSize: 11, cursor: "pointer" }}>Advanced: direct link</summary>
          <code style={{ color: "#6b4f99", fontSize: 11, wordBreak: "break-all", display: "block", marginTop: 4 }}>
            {origin}/play?game={game.id}
          </code>
        </details>
      </div>

      <div style={{ marginTop: 12, color: "#a68fd6", fontSize: 13 }}>
        Players in game: {players.length === 0 ? "none yet" : players.map((p) => {
          const label = p.alias ? `${p.display_name} (${p.alias})` : p.display_name;
          return !p.approved ? `${label} (pending)` : p.alive ? label : `${label} (exiled)`;
        }).join(", ")}
      </div>
    </div>
  );
}
