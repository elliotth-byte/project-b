import { useState, useRef } from "react";
import { Card, Btn } from "./traitorsUi";
import { uploadAvatar, removeAvatar } from "../lib/avatarUpload";

// ─── Traitors: Player Avatar ───
// Traitors-styled reskin of components/PlayerAvatarUpload.jsx (same
// lib/avatarUpload.js upload/remove calls — that lib is game-mode-
// agnostic, it just writes players.avatar_url) — a separate component
// rather than reusing that one directly so this renders with traitorsUi's
// gold/navy look instead of Panopticon's neon pink/purple, matching
// every other Traitors-side screen. Only ever mounted when
// settings.avatarMode === "player_upload" (see TraitorsPlayerPanels.jsx's
// own "photo" tab gate) — same convention as the Panopticon original.
export default function TraitorsAvatarUpload({ player, avatarUrl, onChanged }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    const res = await uploadAvatar(player.id, file);
    setUploading(false);
    if (!res.ok) { setError(res.error || "Couldn't upload — try again."); return; }
    onChanged?.(res.url);
  };

  const remove = async () => {
    setUploading(true);
    setError(null);
    const res = await removeAvatar(player.id);
    setUploading(false);
    if (res.ok) onChanged?.(null);
    else setError(res.error || "Couldn't remove — try again.");
  };

  return (
    <Card style={{ marginBottom: 20, borderColor: "rgba(201,168,76,0.3)" }}>
      <h3 style={{ color: "#c9a84c", margin: "0 0 12px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>📷 Your Photo</h3>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {avatarUrl ? (
          <img src={avatarUrl} alt="" style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", border: "2px solid #253550", flexShrink: 0 }} />
        ) : (
          <div style={{
            width: 56, height: 56, borderRadius: "50%", background: "#0a1020", border: "2px dashed #253550",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0,
          }}>
            📷
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: "#f0e6d3", fontWeight: 700, marginBottom: 4 }}>Shown on your portrait around the game</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn small onClick={() => inputRef.current?.click()} disabled={uploading}>
              {uploading ? "Uploading..." : avatarUrl ? "Change Photo" : "Upload Photo"}
            </Btn>
            {avatarUrl && <Btn small variant="ghost" onClick={remove} disabled={uploading}>Remove</Btn>}
          </div>
        </div>
      </div>
      {error && <p style={{ color: "#c45c3c", fontSize: 11, marginTop: 8, marginBottom: 0 }}>{error}</p>}
      <input ref={inputRef} type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
    </Card>
  );
}
