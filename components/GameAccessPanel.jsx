import { useState } from "react";

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
  game, players, isPrimaryHost, origin,
  coHosts, inviteEmail, setInviteEmail, inviteStatus, inviteCoHost, removeCoHost,
}) {
  const [showCoHosts, setShowCoHosts] = useState(false);
  const [copied, setCopied] = useState(false);

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
              Co-hosts need an existing host account (see README.md) and get full access to run this season — roster, challenges, announcements. Only the primary host can add/remove co-hosts or archive/delete the season.
            </p>
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
                flex: 1, color: "#f5f0ff", fontSize: 13, wordBreak: "break-all",
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
