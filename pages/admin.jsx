import { useState, useEffect } from "react";
import HomeLink from "../components/HomeLink";
import { supabase } from "../lib/supabaseClient";
import { checkIsPlatformAdmin, searchPeople } from "../lib/adminModeration";
import { upsertProfile, fetchSeasonHistory } from "../lib/profiles";
import { removeProfilePhoto, uploadProfilePhoto } from "../lib/profilePhotoUpload";

// ─── Platform Admin ───
// A genuinely new privilege tier, separate from any individual
// season's host — see sql/add-profiles.sql for the full reasoning.
// This page is deliberately narrow for now: search for a person, then
// override their display name or remove their photo. DM report review
// (see sql/add-profiles.sql's own note on cross-season DMs needing
// this exact role for moderation) lands here too once that feature
// exists — this isn't a dead end, just built one working piece at a
// time rather than the whole surface at once.
export default function AdminPage() {
  const [user, setUser] = useState(undefined);
  const [isAdmin, setIsAdmin] = useState(undefined); // undefined = not checked, null = checked and NOT an admin
  const [adminCheckError, setAdminCheckError] = useState(null); // non-null means the CHECK ITSELF failed — a real bug, distinct from a legitimate "you're not an admin"
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [nameDraft, setNameDraft] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [history, setHistory] = useState(null); // season history for whichever person is currently open, null = not loaded yet

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    checkIsPlatformAdmin().then(({ isAdmin: ok, error }) => {
      setIsAdmin(ok ? true : null);
      setAdminCheckError(error);
    });
  }, [user]);

  const runSearch = async (e) => {
    e.preventDefault();
    setSearching(true);
    const res = await searchPeople(query);
    setSearching(false);
    setResults(res);
  };

  const startEditing = (person) => {
    // Same person clicked again -- collapse it, matching how a normal
    // disclosure toggle behaves, rather than re-fetching for no reason.
    if (editingId === person.userId) { setEditingId(null); return; }
    setEditingId(person.userId);
    setNameDraft(person.profileDisplayName || person.matchedName || "");
    setHistory(null);
    setPhotoError("");
    fetchSeasonHistory(person.userId).then(setHistory);
  };

  const saveOverride = async (userId) => {
    const trimmed = nameDraft.trim();
    if (!trimmed) return;
    setActionBusy(true);
    const res = await upsertProfile(userId, { display_name: trimmed });
    setActionBusy(false);
    if (res.ok) {
      setResults((rs) => rs.map((r) => (r.userId === userId ? { ...r, profileDisplayName: trimmed } : r)));
    }
  };

  const clearPhoto = async (userId) => {
    setActionBusy(true);
    const res = await removeProfilePhoto(userId);
    setActionBusy(false);
    if (res.ok) setResults((rs) => rs.map((r) => (r.userId === userId ? { ...r, photoUrl: null } : r)));
  };

  const handleAdminPhotoUpload = async (userId, e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets choosing the SAME file again re-fire onChange
    if (!file) return;
    setPhotoError("");
    setUploadingPhoto(true);
    const res = await uploadProfilePhoto(userId, file);
    setUploadingPhoto(false);
    if (!res.ok) { setPhotoError(res.error || "Couldn't upload that photo — try again."); return; }
    setResults((rs) => rs.map((r) => (r.userId === userId ? { ...r, photoUrl: res.url } : r)));
  };

  if (user === undefined || isAdmin === undefined) return <div style={pageStyle}><p>Loading...</p></div>;
  if (!user) return <div style={pageStyle}><p>You need to be logged in. <a href="/login" style={{ color: "#ff2d95" }}>Log in</a></p></div>;
  if (isAdmin === null) {
    return (
      <div style={pageStyle}>
        <p>You don't have access to this page.</p>
        {adminCheckError && (
          <p style={{ color: "#ff3860", fontSize: 12, marginTop: 8 }}>
            The access check itself failed, which is different from a real "no" — this usually means sql/add-profiles.sql or sql/add-profiles-admin.sql hasn't been run yet: {adminCheckError}
          </p>
        )}
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 480, width: "100%", margin: "0 auto" }}>
        <div style={{ marginBottom: 20 }}><HomeLink /></div>
        <h1 style={{ fontSize: 20, marginBottom: 16 }}>🛡 Platform Admin</h1>

        <form onSubmit={runSearch} style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <input
            type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name..."
            style={{ flex: 1, background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "10px 12px", color: "#f5f0ff", fontSize: 14 }}
          />
          <button type="submit" disabled={searching || !query.trim()} style={{
            padding: "10px 16px", borderRadius: 8, border: "none", cursor: "pointer",
            background: "linear-gradient(135deg, #ff2d95, #b829ff)", color: "#05010f", fontSize: 13, fontWeight: 700,
          }}>
            {searching ? "..." : "Search"}
          </button>
        </form>

        {results !== null && results.length === 0 && (
          <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>No matches.</p>
        )}

        <div style={{ display: "grid", gap: 12 }}>
          {(results || []).map((person) => (
            <div key={person.userId} style={cardStyle}>
              <div
                onClick={() => startEditing(person)}
                style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: editingId === person.userId ? 12 : 0, cursor: "pointer" }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
                  background: "#0d0618", border: "1px solid #3d1f5c",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {person.photoUrl
                    ? <img src={person.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <span style={{ fontSize: 18, color: "#3d1f5c" }}>👤</span>}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#f5f0ff" }}>{person.profileDisplayName || person.matchedName}</div>
                  {person.profileDisplayName && person.profileDisplayName !== person.matchedName && (
                    <div style={{ fontSize: 11, color: "#6b4f99" }}>Played most recently as: {person.matchedName}</div>
                  )}
                </div>
                <span style={{ color: "#6b4f99", fontSize: 12 }}>{editingId === person.userId ? "▾" : "▸"}</span>
              </div>

              {editingId === person.userId && (
                <div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <input
                      type="text" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} maxLength={40}
                      style={{ flex: 1, background: "#0d0618", border: "1px solid #ff3860", borderRadius: 6, padding: "8px 10px", color: "#f5f0ff", fontSize: 13 }}
                    />
                    <button onClick={() => saveOverride(person.userId)} disabled={actionBusy} style={{ background: "#ff3860", border: "none", borderRadius: 6, color: "#05010f", fontSize: 11, fontWeight: 700, padding: "8px 12px", cursor: "pointer" }}>
                      {actionBusy ? "..." : "Save name"}
                    </button>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <label style={{
                      display: "inline-block", padding: "6px 12px", borderRadius: 6, border: "1px solid #3d1f5c",
                      color: "#a68fd6", fontSize: 11, cursor: uploadingPhoto ? "default" : "pointer",
                    }}>
                      {uploadingPhoto ? "..." : (person.photoUrl ? "Replace their photo" : "Upload a photo for them")}
                      <input type="file" accept="image/*" onChange={(e) => handleAdminPhotoUpload(person.userId, e)} disabled={uploadingPhoto} style={{ display: "none" }} />
                    </label>
                    {person.photoUrl && (
                      <button onClick={() => clearPhoto(person.userId)} disabled={actionBusy} style={{ background: "none", border: "1px solid #ff3860", borderRadius: 6, color: "#ff3860", fontSize: 11, padding: "6px 12px", cursor: "pointer" }}>
                        {actionBusy ? "..." : "Remove"}
                      </button>
                    )}
                  </div>
                  {photoError && <p style={{ color: "#ff3860", fontSize: 11, marginBottom: 12 }}>{photoError}</p>}

                  <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                    🏛 Season History
                  </div>
                  {history === null ? (
                    <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic" }}>Loading...</p>
                  ) : history.length === 0 ? (
                    <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic" }}>No completed seasons.</p>
                  ) : (
                    <div style={{ display: "grid", gap: 6 }}>
                      {history.map((s) => (
                        <div key={s.gameId} style={{ background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 6, padding: "8px 10px", fontSize: 12 }}>
                          <span style={{ color: "#f5f0ff", fontWeight: 700 }}>{s.seasonName}</span>
                          <span style={{ color: "#a68fd6" }}> — {s.character ? `played as ${s.character}` : "played"} — </span>
                          <span style={{ color: "#ff2d95", fontWeight: 600 }}>{s.placement}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
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
  padding: 14,
};
