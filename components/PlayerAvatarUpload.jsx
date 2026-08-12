import { useState, useRef } from "react";
import { Card, Btn } from "./ui";
import { uploadAvatar, removeAvatar } from "../lib/avatarUpload";

// ─── Player Avatar ───
// Only rendered at all when settings.avatarMode === "player_upload" (see
// pages/play.jsx) — a small, always-accessible card rather than a one-
// time onboarding step, since avatar mode can be turned on any time
// during a season (unlike alias mode), so a player needs a way to add
// one whenever it becomes relevant to them, not just at first join.
export default function PlayerAvatarUpload({ player, avatarUrl, onChanged }) {
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
    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {avatarUrl ? (
          <img src={avatarUrl} alt="" style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", border: "2px solid #3d1f5c", flexShrink: 0 }} />
        ) : (
          <div style={{
            width: 56, height: 56, borderRadius: "50%", background: "#0d0618", border: "2px dashed #3d1f5c",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0,
          }}>
            📷
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: "#f5f0ff", fontWeight: 700, marginBottom: 4 }}>Your Avatar</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn small onClick={() => inputRef.current?.click()} disabled={uploading}>
              {uploading ? "Uploading..." : avatarUrl ? "Change Photo" : "Upload Photo"}
            </Btn>
            {avatarUrl && <Btn small variant="ghost" onClick={remove} disabled={uploading}>Remove</Btn>}
          </div>
        </div>
      </div>
      {error && <p style={{ color: "#ff3860", fontSize: 11, marginTop: 8, marginBottom: 0 }}>{error}</p>}
      <input ref={inputRef} type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
    </Card>
  );
}
