import { useState, useEffect } from "react";
import HomeLink from "../components/HomeLink";
import { supabase } from "../lib/supabaseClient";
import { checkIsPlatformAdmin, searchPeople } from "../lib/adminModeration";
import { upsertProfile } from "../lib/profiles";
import { removeProfilePhoto } from "../lib/profilePhotoUpload";

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
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [nameDraft, setNameDraft] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    checkIsPlatformAdmin().then((ok) => setIsAdmin(ok ? true : null));
  }, [user]);

  const runSearch = async (e) => {
    e.preventDefault();
    setSearching(true);
    const res = await searchPeople(query);
    setSearching(false);
    setResults(res);
  };

  const startEditing = (person) => {
    setEditingId(person.userId);
    setNameDraft(person.profileDisplayName || person.matchedName || "");
  };

  const saveOverride = async (userId) => {
    const trimmed = nameDraft.trim();
    if (!trimmed) return;
    setActionBusy(true);
    const res = await upsertProfile(userId, { display_name: trimmed });
    setActionBusy(false);
    if (res.ok) {
      setResults((rs) => rs.map((r) => (r.userId === userId ? { ...r, profileDisplayName: trimmed } : r)));
      setEditingId(null);
    }
  };

  const clearPhoto = async (userId) => {
    setActionBusy(true);
    const res = await removeProfilePhoto(userId);
    setActionBusy(false);
    if (res.ok) setResults((rs) => rs.map((r) => (r.userId === userId ? { ...r, photoUrl: null } : r)));
  };

  if (user === undefined || isAdmin === undefined) return <div style={pageStyle}><p>Loading...</p></div>;
  if (!user) return <div style={pageStyle}><p>You need to be logged in. <a href="/login" style={{ color: "#ff2d95" }}>Log in</a></p></div>;
  if (isAdmin === null) return <div style={pageStyle}><p>You don't have access to this page.</p></div>;

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
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: editingId === person.userId ? 12 : 0 }}>
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
                {editingId !== person.userId && (
                  <button onClick={() => startEditing(person)} style={{ background: "none", border: "1px solid #3d1f5c", borderRadius: 6, padding: "5px 10px", color: "#a68fd6", fontSize: 11, cursor: "pointer" }}>
                    ✎ Edit
                  </button>
                )}
              </div>

              {editingId === person.userId && (
                <div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <input
                      type="text" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} maxLength={40}
                      style={{ flex: 1, background: "#0d0618", border: "1px solid #ff3860", borderRadius: 6, padding: "8px 10px", color: "#f5f0ff", fontSize: 13 }}
                    />
                    <button onClick={() => saveOverride(person.userId)} disabled={actionBusy} style={{ background: "#ff3860", border: "none", borderRadius: 6, color: "#05010f", fontSize: 11, fontWeight: 700, padding: "8px 12px", cursor: "pointer" }}>
                      {actionBusy ? "..." : "Save"}
                    </button>
                    <button onClick={() => setEditingId(null)} style={{ background: "none", border: "1px solid #3d1f5c", borderRadius: 6, color: "#a68fd6", fontSize: 11, padding: "8px 12px", cursor: "pointer" }}>
                      Cancel
                    </button>
                  </div>
                  {person.photoUrl && (
                    <button onClick={() => clearPhoto(person.userId)} disabled={actionBusy} style={{ background: "none", border: "1px solid #ff3860", borderRadius: 6, color: "#ff3860", fontSize: 11, padding: "6px 10px", cursor: "pointer" }}>
                      {actionBusy ? "..." : "Remove their photo"}
                    </button>
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
