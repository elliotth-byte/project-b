import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

// ─── Delete my account ───
// Shown at the bottom of your own profile (pages/profile.jsx, anchor
// #delete-account — HelpPanel links here too). Required for App Store
// approval: guideline 5.1.1(v) says an app that lets people create
// accounts must let them delete one from inside the app.
//
// Two-step on purpose: a collapsed button first, then an explanation of
// exactly what goes plus a typed DELETE, since this can't be undone.
// The actual work happens in pages/api/delete-account.js.

export default function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // Linked to as /profile#delete-account (HelpPanel, privacy policy).
  // The profile loads in stages, so the browser's own jump-to-anchor can
  // land before this exists; nudge it once mounted.
  useEffect(() => {
    if (window.location.hash === "#delete-account") {
      setTimeout(() => document.getElementById("delete-account")?.scrollIntoView({ behavior: "smooth" }), 300);
    }
  }, []);

  const confirmed = typed.trim().toUpperCase() === "DELETE";

  const submit = async (e) => {
    e.preventDefault();
    if (!confirmed || busy) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Your session expired — log in again and retry.");
      const res = await fetch("/api/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't delete your account. Try again.");
      setDone(true);
      await supabase.auth.signOut().catch(() => {});
      setTimeout(() => { window.location.href = "/"; }, 2500);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div id="delete-account" style={cardStyle}>
        <p style={{ margin: 0, color: "#f5f0ff", fontSize: 14, lineHeight: 1.5 }}>
          Your account has been deleted. Taking you back to the start…
        </p>
      </div>
    );
  }

  return (
    <div id="delete-account" style={cardStyle}>
      <div style={{ fontSize: 12, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
        Account
      </div>

      {!open ? (
        <button type="button" onClick={() => setOpen(true)} style={outlineBtn}>
          Delete my account
        </button>
      ) : (
        <form onSubmit={submit}>
          <p style={textStyle}>This permanently deletes:</p>
          <ul style={{ ...textStyle, paddingLeft: 18, marginTop: 0 }}>
            <li>your login and profile</li>
            <li>your player in every season you've joined, including your chat messages, DMs and confessionals</li>
            <li>your photos, achievements and friends list</li>
          </ul>
          <p style={textStyle}>
            If you host a season, it's handed to your co-host. Archived seasons stay up for the other players,
            without you as host. If you're the only host of an active season, archive it or add a co-host first.
          </p>
          <p style={{ ...textStyle, color: "#ff6b9d", fontWeight: 600 }}>This can't be undone.</p>

          <label style={{ ...textStyle, display: "block", marginBottom: 6 }} htmlFor="delete-confirm">
            Type <strong>DELETE</strong> to confirm
          </label>
          <input
            id="delete-confirm" type="text" value={typed} onChange={(e) => setTyped(e.target.value)}
            autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false}
            style={{ width: "100%", background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "10px 12px", color: "#f5f0ff", fontSize: 16, marginBottom: 12 }}
          />

          {error && <p style={{ ...textStyle, color: "#ff6b9d" }}>{error}</p>}

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button" disabled={busy}
              onClick={() => { setOpen(false); setTyped(""); setError(""); }}
              style={{ ...outlineBtn, flex: 1, borderColor: "#3d1f5c", color: "#a68fd6" }}
            >
              Cancel
            </button>
            <button
              type="submit" disabled={!confirmed || busy}
              style={{
                flex: 1, padding: "10px 14px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 700,
                cursor: confirmed && !busy ? "pointer" : "default",
                background: confirmed ? "#e0245e" : "#3d1f5c", color: confirmed ? "#fff" : "#6b4f99",
              }}
            >
              {busy ? "Deleting…" : "Delete forever"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

const cardStyle = {
  background: "#1a0a2e",
  border: "1px solid #3d1f5c",
  borderRadius: 12,
  padding: 20,
  marginBottom: 16,
};

const textStyle = { color: "#d9ccf2", fontSize: 13, lineHeight: 1.5, margin: "0 0 10px", fontFamily: "'Poppins', 'Segoe UI', sans-serif" };

const outlineBtn = {
  padding: "10px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700,
  background: "transparent", border: "1px solid #e0245e", color: "#ff6b9d",
};
