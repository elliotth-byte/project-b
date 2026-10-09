import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

// ─── Change Password ───
// Self-serve password change for an already-logged-in account (player
// or host — nothing here is game-type-specific, it just themes itself
// off whatever `theme` the caller is already using). Requires the
// CURRENT password before accepting a new one: supabase.auth.updateUser
// would happily change it off of the existing session alone with no
// such check, but that means anyone at an already-unlocked device could
// silently lock the real owner out. Verified instead by re-running
// signInWithPassword against the account's own (possibly fake, see
// lib/auth.js's username@players.projectb.game trick) email — if that
// succeeds, the typed password really is the current one.
export default function ChangePasswordModal({ email, theme, onClose }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setError(null);
    if (next.length < 6) { setError("New password must be at least 6 characters."); return; }
    if (next !== confirm) { setError("New passwords don't match."); return; }

    setSaving(true);
    const reauth = await supabase.auth.signInWithPassword({ email, password: current });
    if (reauth.error) {
      setSaving(false);
      setError("Current password is incorrect.");
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: next });
    setSaving(false);
    if (updateError) { setError(updateError.message || "Couldn't update password — try again."); return; }
    setDone(true);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14,
          padding: 20, maxWidth: 320, width: "100%",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ color: theme.text, margin: 0, fontSize: 16, fontFamily: theme.font }}>🔒 Change Password</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: theme.textMuted, fontSize: 20, cursor: "pointer", lineHeight: 1, padding: 0 }}>×</button>
        </div>

        {done ? (
          <>
            <p style={{ color: theme.accent, fontSize: 13, textAlign: "center", margin: "10px 0 16px" }}>✓ Password updated.</p>
            <button onClick={onClose} style={{
              width: "100%", padding: "10px 0", borderRadius: 8, border: "none",
              background: theme.accentGradient, color: theme.accentText, fontWeight: 700, cursor: "pointer",
            }}>
              Done
            </button>
          </>
        ) : (
          <form onSubmit={submit}>
            <input
              type="password" placeholder="Current password" value={current} autoComplete="current-password"
              onChange={(e) => setCurrent(e.target.value)}
              style={inputStyle(theme)}
            />
            <input
              type="password" placeholder="New password" value={next} autoComplete="new-password"
              onChange={(e) => setNext(e.target.value)}
              style={inputStyle(theme)}
            />
            <input
              type="password" placeholder="Confirm new password" value={confirm} autoComplete="new-password"
              onChange={(e) => setConfirm(e.target.value)}
              style={{ ...inputStyle(theme), marginBottom: 14 }}
            />
            {error && <p style={{ color: theme.danger, fontSize: 12, margin: "0 0 12px" }}>{error}</p>}
            <button type="submit" disabled={saving || !current || !next || !confirm} style={{
              width: "100%", padding: "10px 0", borderRadius: 8, border: "none",
              background: theme.accentGradient, color: theme.accentText, fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer", opacity: saving || !current || !next || !confirm ? 0.6 : 1,
            }}>
              {saving ? "Updating..." : "Update Password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function inputStyle(theme) {
  return {
    width: "100%", boxSizing: "border-box", padding: "10px 12px", marginBottom: 10,
    background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 8,
    color: theme.text, fontSize: 14,
  };
}
