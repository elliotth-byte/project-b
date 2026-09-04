import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import HomeLink from "../components/HomeLink";
import { supabase } from "../lib/supabaseClient";
import { fetchProfile, fetchSeasonHistory, fetchMostRecentAvatars, upsertProfile, searchSeasons } from "../lib/profiles";
import { searchPeopleToDm } from "../lib/profileDms";
import { uploadProfilePhoto, removeProfilePhoto } from "../lib/profilePhotoUpload";
import { fetchFriendedUserIds, addFriend, removeFriend } from "../lib/friendships";
import RelationshipWeb from "../components/RelationshipWeb";

// ─── Profile ───
// The first page in this app that isn't scoped to any one season — no
// gameId anywhere here. See sql/add-profiles.sql (and v2) for the full
// design reasoning. Doubles as both "my own profile" (default) and
// "someone else's profile" (?userId=X in the URL) — editing controls
// (name, photo, quote) only ever show on your own; someone else's is
// read-only. Season history is always read-only regardless of whose
// profile this is — it's a factual record of what actually happened,
// not something to edit.
export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState(undefined); // undefined = not checked yet, null = checked and not logged in
  const [profile, setProfile] = useState(null);
  const [history, setHistory] = useState(null);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState("");
  const [quoteDraft, setQuoteDraft] = useState("");
  const [savingQuote, setSavingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [searchMode, setSearchMode] = useState("people"); // "people" | "seasons"
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState(null);
  const [friended, setFriended] = useState(null); // null = not checked yet; Set of user_ids once loaded
  const [friendBusy, setFriendBusy] = useState(false);
  const [fallbackAvatarUrl, setFallbackAvatarUrl] = useState(null); // this person's most recent season's own avatar, only fetched if they have no profile photo

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  // router.query isn't populated on the very first render (Next.js
  // fills it in async) — falls back to your own id until it resolves,
  // which for the common case (no ?userId at all) is simply correct
  // immediately rather than a flash of the wrong state.
  const viewingUserId = typeof router.query.userId === "string" ? router.query.userId : user?.id;
  const isOwnProfile = !!user && viewingUserId === user.id;

  useEffect(() => {
    if (!viewingUserId) return;
    setFallbackAvatarUrl(null); // clear any previous person's fallback immediately, don't let it flash while switching profiles
    fetchProfile(viewingUserId).then((p) => {
      setProfile(p);
      setNameDraft(p?.display_name || "");
      setQuoteDraft(p?.quote || "");
      if (!p?.photo_url) {
        fetchMostRecentAvatars([viewingUserId]).then((map) => setFallbackAvatarUrl(map[viewingUserId] || null));
      }
    });
    fetchSeasonHistory(viewingUserId).then(setHistory);
  }, [viewingUserId]);

  // profile.photo_url wins if set; otherwise this person's own most
  // recent season's avatar (see lib/profiles.js's fetchMostRecentAvatars
  // for exactly what "most recent" means — just that one season, no
  // deeper cascade); the 👤 placeholder only shows if both are absent.
  const displayPhotoUrl = profile?.photo_url || fallbackAvatarUrl || null;

  // Only meaningful when viewing someone else — this is what drives the
  // Friend/Unfriend button below, so it always checks the CURRENT
  // (logged-in) user's own outgoing list, never the profile being
  // viewed — fetchFriendedUserIds itself works for any subject (see
  // lib/friendships.js), this call site just always passes user.id.
  useEffect(() => {
    if (!user || isOwnProfile) { setFriended(null); return; }
    fetchFriendedUserIds(user.id).then((ids) => setFriended(new Set(ids)));
  }, [user, isOwnProfile]);

  const toggleFriend = async () => {
    if (!user || !viewingUserId) return;
    setFriendBusy(true);
    const isFriended = friended?.has(viewingUserId);
    const res = isFriended ? await removeFriend(user.id, viewingUserId) : await addFriend(user.id, viewingUserId);
    setFriendBusy(false);
    if (!res.ok) return;
    setFriended((prev) => {
      const next = new Set(prev);
      if (isFriended) next.delete(viewingUserId); else next.add(viewingUserId);
      return next;
    });
  };

  const saveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) return;
    setSavingName(true);
    setNameError("");
    const res = await upsertProfile(user.id, { display_name: trimmed });
    setSavingName(false);
    if (res.ok) { setProfile(res.profile); return; }
    setNameError(res.error || "Couldn't save — try again.");
  };

  const saveQuote = async () => {
    setSavingQuote(true);
    setQuoteError("");
    const res = await upsertProfile(user.id, { quote: quoteDraft.trim() || null });
    setSavingQuote(false);
    if (res.ok) { setProfile(res.profile); return; }
    // A missing `quote` column (sql/add-profiles-v2.sql not yet run on
    // this project — see that migration's own header) is the single
    // most likely real-world cause of this specific save failing when
    // every other profile save works fine, so it's worth calling out
    // by name rather than just surfacing Postgres's own raw wording,
    // which won't mean anything to whoever's looking at this screen.
    if (res.error && /column .*quote.* does not exist/i.test(res.error)) {
      setQuoteError("This project's database hasn't been updated to support quotes yet — an admin needs to run sql/add-profiles-v2.sql.");
      return;
    }
    setQuoteError(res.error || "Couldn't save — try again.");
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

  const runSearch = async (e) => {
    e.preventDefault();
    setSearching(true);
    const res = searchMode === "people" ? await searchPeopleToDm(query) : await searchSeasons(query);
    setSearching(false);
    setSearchResults(res);
  };

  if (user === undefined) return <div style={pageStyle}><p>Loading...</p></div>;
  if (!user) return <div style={pageStyle}><p>You need to be logged in to view a profile. <a href="/login" style={{ color: "#ff2d95" }}>Log in</a></p></div>;

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 420, width: "100%", margin: "0 auto" }}>
        <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <HomeLink />
          {!isOwnProfile && <Link href="/profile" style={{ color: "#a68fd6", fontSize: 12, textDecoration: "none" }}>← My Profile</Link>}
        </div>

        {isOwnProfile && (
          <div style={cardStyle}>
            <div style={{ fontSize: 12, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
              🔍 Find People &amp; Seasons
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <button
                onClick={() => { setSearchMode("people"); setSearchResults(null); }}
                style={{ flex: 1, padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700, background: searchMode === "people" ? "rgba(255,45,149,0.15)" : "#0d0618", border: `1px solid ${searchMode === "people" ? "#ff2d95" : "#3d1f5c"}`, color: searchMode === "people" ? "#ff2d95" : "#a68fd6" }}
              >
                People
              </button>
              <button
                onClick={() => { setSearchMode("seasons"); setSearchResults(null); }}
                style={{ flex: 1, padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700, background: searchMode === "seasons" ? "rgba(255,45,149,0.15)" : "#0d0618", border: `1px solid ${searchMode === "seasons" ? "#ff2d95" : "#3d1f5c"}`, color: searchMode === "seasons" ? "#ff2d95" : "#a68fd6" }}
              >
                Seasons
              </button>
            </div>
            <form onSubmit={runSearch} style={{ display: "flex", gap: 8 }}>
              <input
                type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder={searchMode === "people" ? "Search by name..." : "Search by season name..."}
                style={{ flex: 1, background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "10px 12px", color: "#f5f0ff", fontSize: 14 }}
              />
              <button type="submit" disabled={searching || !query.trim()} style={{
                padding: "10px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                background: "linear-gradient(135deg, #ff2d95, #b829ff)", color: "#05010f", fontSize: 13, fontWeight: 700,
              }}>
                {searching ? "..." : "Search"}
              </button>
            </form>
            {searchResults !== null && (
              <div style={{ marginTop: 10 }}>
                {searchResults.length === 0 ? (
                  <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic", margin: 0 }}>No matches.</p>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {searchMode === "people" ? searchResults.map((p) => (
                      <Link key={p.userId} href={`/profile?userId=${p.userId}`} style={{ display: "flex", alignItems: "center", gap: 10, background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "8px 12px", textDecoration: "none" }}>
                        <PersonAvatar photoUrl={p.photoUrl} />
                        <span style={{ color: "#f5f0ff", fontSize: 13, fontWeight: 600 }}>{p.profileDisplayName || p.matchedName}</span>
                      </Link>
                    )) : searchResults.map((s) => (
                      <Link key={s.gameId} href={`/season?gameId=${s.gameId}`} style={{ display: "block", background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "8px 12px", textDecoration: "none" }}>
                        <span style={{ color: "#f5f0ff", fontSize: 13, fontWeight: 600 }}>{s.seasonName}</span>
                        <span style={{ color: "#6b4f99", fontSize: 11, marginLeft: 8 }}>{s.playerCount} player{s.playerCount === 1 ? "" : "s"}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div style={cardStyle}>
          {!isOwnProfile && friended !== null && (
            <div style={{ textAlign: "center", marginBottom: 12 }}>
              <button
                onClick={toggleFriend} disabled={friendBusy}
                style={{
                  padding: "6px 14px", borderRadius: 8, cursor: friendBusy ? "default" : "pointer", fontSize: 12, fontWeight: 700,
                  background: friended.has(viewingUserId) ? "rgba(46,204,113,0.15)" : "#0d0618",
                  border: `1px solid ${friended.has(viewingUserId) ? "#2ecc71" : "#3d1f5c"}`,
                  color: friended.has(viewingUserId) ? "#2ecc71" : "#a68fd6",
                }}
              >
                {friendBusy ? "..." : friended.has(viewingUserId) ? "💔 Unfriend" : "🤝 Add Friend"}
              </button>
            </div>
          )}
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={{
              width: 96, height: 96, borderRadius: "50%", margin: "0 auto 12px", overflow: "hidden",
              border: "2px solid #ff2d95", background: "#0d0618",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {displayPhotoUrl
                ? <img src={displayPhotoUrl} alt={`${profile?.display_name || "Profile"} photo`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ fontSize: 32, color: "#3d1f5c" }}>👤</span>}
            </div>
            <h2 style={{ fontSize: 18, color: "#f5f0ff", margin: "0 0 6px", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
              {profile?.display_name || "No display name set"}
            </h2>
            {profile?.quote && (
              <p style={{ fontSize: 13, color: "#a68fd6", fontStyle: "italic", margin: "0 0 12px" }}>
                "{profile.quote}"
              </p>
            )}
            {isOwnProfile && (
              <>
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
              </>
            )}
          </div>

          {isOwnProfile && (
            <>
              <label style={{ display: "block", fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                Display Name
              </label>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
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
              {nameError && <p style={{ color: "#ff3860", fontSize: 12, margin: "-10px 0 16px" }}>{nameError}</p>}

              <label style={{ display: "block", fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                Quote
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text" value={quoteDraft} onChange={(e) => setQuoteDraft(e.target.value)} maxLength={140}
                  placeholder="A line under your photo — a catchphrase, a motto, whatever you want"
                  style={{ flex: 1, background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "10px 12px", color: "#f5f0ff", fontSize: 14 }}
                />
                <button
                  onClick={saveQuote} disabled={savingQuote || quoteDraft.trim() === (profile?.quote || "")}
                  style={{
                    padding: "10px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                    background: "linear-gradient(135deg, #ff2d95, #b829ff)", color: "#05010f", fontSize: 13, fontWeight: 700,
                  }}
                >
                  {savingQuote ? "..." : "Save"}
                </button>
              </div>
              {quoteError && <p style={{ color: "#ff3860", fontSize: 12, marginTop: 8, marginBottom: 0 }}>{quoteError}</p>}
              <p style={{ fontSize: 11, color: "#6b4f99", marginTop: 8, marginBottom: 0, fontStyle: "italic" }}>
                This is separate from whatever alias a specific season gives you — it's how people find and recognize you across every season you've played.
              </p>
            </>
          )}
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
            🏛 Season History
          </div>
          {history === null ? (
            <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p>
          ) : history.length === 0 ? (
            <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>No seasons yet.</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {history.map((s) => (
                <Link key={s.gameId} href={`/season?gameId=${s.gameId}`} style={{ display: "block", background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "10px 12px", textDecoration: "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#f5f0ff" }}>{s.seasonName}</span>
                    {s.seasonDate && <span style={{ fontSize: 11, color: "#6b4f99" }}>{new Date(s.seasonDate).toLocaleDateString()}</span>}
                  </div>
                  <div style={{ fontSize: 13, color: "#a68fd6" }}>
                    {s.isHost ? (
                      <span style={{ color: "#ff2d95", fontWeight: 600 }}>{s.placement}</span>
                    ) : (
                      <>{s.character ? `Played as ${s.character}` : "Played"} — <span style={{ color: "#ff2d95", fontWeight: 600 }}>{s.placement}</span></>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {history !== null && history.length > 0 && (
          <div style={cardStyle}>
            <div style={{ fontSize: 12, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12, textAlign: "center" }}>
              🕸 Relationship Web
            </div>
            {/* Not gated on isOwnProfile — an objective view of the
                PROFILE SUBJECT's own network (who THEY friended, who
                THEY had adversarial votes with), same regardless of who's
                looking. Safe to show for anyone: friendships are public
                (sql/add-player-friendships.sql) and adversarial votes
                only ever reflect seasons that have actually ended (see
                lib/relationshipWeb.js's header comment). */}
            <RelationshipWeb userId={viewingUserId} />
          </div>
        )}
      </div>
    </div>
  );
}

function PersonAvatar({ photoUrl }) {
  return (
    <div style={{ width: 32, height: 32, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "#0d0618", border: "1px solid #3d1f5c", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {photoUrl ? <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 14, color: "#3d1f5c" }}>👤</span>}
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
