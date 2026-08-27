import { useState, useEffect } from "react";
import HomeLink from "../components/HomeLink";
import { supabase } from "../lib/supabaseClient";
import { fetchProfile, fetchSeasonHistory, upsertProfile } from "../lib/profiles";
import { uploadProfilePhoto, removeProfilePhoto } from "../lib/profilePhotoUpload";

// ─── Profile ───
// The first page in this app that isn't scoped to any one season — no
// gameId anywhere here. See sql/add-profiles.sql for the full design
// reasoning. Season history is read-only by design (it's a factual
// record of what actually happened, not something to edit); display
// name and photo are the only two editable things, and both can also
// be overridden by a platform admin later (see lib/adminModeration.js,
// not built yet — this page itself doesn't need to know that override
// exists, since it's just editing the same profiles row either way).
export default function ProfilePage() {
  const [user, setUser] = useState(undefined); // undefined = not checked yet, null = checked and not logged in
  const [profile, setProfile] = useState(null);
  const [history, setHistory] = useState(null);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchProfile(user.id).then((p) => { setProfile(p); setNameDraft(p?.display_name || ""); });
    fetchSeasonHistory(user.id).then(setHistory);
  }, [user]);

  const saveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) return;
    setSavingName(true);
    const res = await upsertProfile(user.id, { display_name: trimmed });
    setSavingName(false);
    if (res.ok) setProfile(res.profile);
  };

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets choosing the SAME file again re-fire onChange, if they pick, cancel, then pick it again
    if (!file) return;
    setPhotoError("");
    setUploadingPhoto(true);
    const res = await uploadProfilePhoto(user.id, file);
    setUploadingPhoto(false);
    if (!res.ok) { setPhotoError(res.error || "Couldn't upload that photo — try again."); return; }
    setProfile((p) => ({ ...(p || {}), photo_url: res.url }));
  };

  const clearPhoto = async () => {
    setUploadingPhoto(true);
    const res = await removeProfilePhoto(user.id);
    setUploadingPhoto(false);
    if (res.ok) setProfile((p) => ({ ...(p || {}), photo_url: null }));
  };

  if (user === undefined) return <div style={pageStyle}><p>Loading...</p></div>;
  if (!user) return <div style={pageStyle}><p>You need to be logged in to view a profile. <a href="/login" style={{ color: "#ff2d95" }}>Log in</a></p></div>;

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 420, width: "100%", margin: "0 auto" }}>
        <div style={{ marginBottom: 20 }}><HomeLink /></div>

        <div style={cardStyle}>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={{
              width: 96, height: 96, borderRadius: "50%", margin: "0 auto 12px", overflow: "hidden",
              border: "2px solid #ff2d95", background: "#0d0618",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {profile?.photo_url
                ? <img src={profile.photo_url} alt="Your profile photo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ fontSize: 32, color: "#3d1f5c" }}>👤</span>}
            </div>
            {/* The actual saved value, separate from the editable input
                below — makes a Save visibly take effect right here,
                rather than the input just continuing to show whatever
                was last typed whether or not it was ever saved. */}
            <h2 style={{ fontSize: 18, color: "#f5f0ff", margin: "0 0 12px", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
              {profile?.display_name || "No display name set"}
            </h2>
            <label style={{
              display: "inline-block", padding: "6px 14px", borderRadius: 8, border: "1px solid #3d1f5c",
              color: "#a68fd6", fontSize: 12, cursor: uploadingPhoto ? "default" : "pointer",
            }}>
              {uploadingPhoto ? "..." : (profile?.photo_url ? "Change photo" : "Upload a photo")}
              <input type="file" accept="image/*" onChange={handlePhotoChange} disabled={uploadingPhoto} style={{ display: "none" }} />
            </label>
            {profile?.photo_url && !uploadingPhoto && (
              <button onClick={clearPhoto} style={{ background: "none", border: "none", color: "#ff3860", fontSize: 12, marginLeft: 10, cursor: "pointer" }}>
                Remove
              </button>
            )}
            {photoError && <p style={{ color: "#ff3860", fontSize: 12, marginTop: 8 }}>{photoError}</p>}
          </div>

          <label style={{ display: "block", fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            Display Name
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} maxLength={40}
              placeholder="How you want to be known across seasons"
              style={{ flex: 1, background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "10px 12px", color: "#f5f0ff", fontSize: 14 }}
            />
            <button
              onClick={saveName} disabled={savingName || !nameDraft.trim() || nameDraft.trim() === profile?.display_name}
              style={{
                padding: "10px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                background: "linear-gradient(135deg, #ff2d95, #b829ff)", color: "#05010f", fontSize: 13, fontWeight: 700,
              }}
            >
              {savingName ? "..." : "Save"}
            </button>
          </div>
          <p style={{ fontSize: 11, color: "#6b4f99", marginTop: 8, marginBottom: 0, fontStyle: "italic" }}>
            This is separate from whatever alias a specific season gives you — it's how people find and recognize you across every season you've played.
          </p>
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
            🏛 Season History
          </div>
          {history === null ? (
            <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p>
          ) : history.length === 0 ? (
            <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>No completed seasons yet.</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {history.map((s) => (
                <div key={s.gameId} style={{ background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#f5f0ff" }}>{s.seasonName}</span>
                    {s.seasonDate && <span style={{ fontSize: 11, color: "#6b4f99" }}>{new Date(s.seasonDate).toLocaleDateString()}</span>}
                  </div>
                  <div style={{ fontSize: 13, color: "#a68fd6" }}>
                    {s.character ? `Played as ${s.character}` : "Played"} — <span style={{ color: "#ff2d95", fontWeight: 600 }}>{s.placement}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #05010f, #1a0a2e)",
  color: "#f5f0ff",
  fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
  padding: 24,
};

const cardStyle = {
  background: "#1a0a2e",
  border: "1px solid #3d1f5c",
  borderRadius: 12,
  padding: 20,
  marginBottom: 16,
};
