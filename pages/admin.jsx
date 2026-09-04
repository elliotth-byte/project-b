import { useState, useEffect } from "react";
import HomeLink from "../components/HomeLink";
import { supabase } from "../lib/supabaseClient";
import { checkIsPlatformAdmin, searchPeople, fetchOpenReports, markReportReviewed } from "../lib/adminModeration";
import { fetchPendingSubmissions, approveSubmission, rejectSubmission, fetchApprovedSubmissions, unpublishSubmission } from "../lib/stereoTypesSubmissions";
import { SUPERLATIVES } from "../lib/stereoTypesSuperlatives";
import { upsertProfile, fetchSeasonHistory } from "../lib/profiles";
import { removeProfilePhoto, uploadProfilePhoto } from "../lib/profilePhotoUpload";
import { fetchGloballyDisabledChallenges, setGloballyDisabledChallenges } from "../lib/platformSettings";
import { GAME_REGISTRY } from "../lib/challengeGames";
import { TRAITORS_GAME_REGISTRY } from "../lib/traitorsMiniGames";

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
  const [reports, setReports] = useState(null);
  const [reviewingBusy, setReviewingBusy] = useState(null); // reportId currently being marked reviewed, or null
  const [submissions, setSubmissions] = useState(null); // Stereo Types superlative submissions awaiting moderation
  const [submissionBusy, setSubmissionBusy] = useState(null); // submissionId currently being approved/rejected, or null
  const [approvedSubmissions, setApprovedSubmissions] = useState(null); // player-submitted superlatives currently live in the pool
  const [unpublishBusy, setUnpublishBusy] = useState(null); // submissionId currently being pulled from the pool, or null
  const [showSeedPool, setShowSeedPool] = useState(false); // the static seeded list is long — collapsed by default
  const [globallyDisabled, setGloballyDisabledState] = useState(null); // null = not loaded yet
  const [savingChallengePool, setSavingChallengePool] = useState(false);

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

  useEffect(() => {
    if (isAdmin !== true) return;
    fetchOpenReports().then(setReports);
    fetchGloballyDisabledChallenges().then(setGloballyDisabledState);
    fetchPendingSubmissions().then(setSubmissions);
    fetchApprovedSubmissions().then(setApprovedSubmissions);
  }, [isAdmin]);

  const toggleGlobalChallenge = async (key, enabled) => {
    const current = globallyDisabled || [];
    const next = enabled ? current.filter((k) => k !== key) : [...current, key];
    setGloballyDisabledState(next); // optimistic -- reverted below if the write actually fails
    setSavingChallengePool(true);
    const res = await setGloballyDisabledChallenges(next);
    setSavingChallengePool(false);
    if (!res.ok) setGloballyDisabledState(current); // the write failed (most likely: not actually a platform admin per the DB's own check) -- don't leave the UI showing a change that didn't really save
  };

  const reviewReport = async (reportId) => {
    setReviewingBusy(reportId);
    const res = await markReportReviewed(reportId);
    setReviewingBusy(null);
    if (res.ok) setReports((rs) => rs.filter((r) => r.reportId !== reportId));
  };

  // Same busy-state-per-row, remove-from-list-on-success pattern as
  // reviewReport above — approve/reject just differ in which status they
  // set (see lib/stereoTypesSubmissions.js), not in how the UI reacts.
  const decideSubmission = async (submissionId, approve) => {
    setSubmissionBusy(submissionId);
    const submission = (submissions || []).find((s) => s.submissionId === submissionId);
    const res = await (approve ? approveSubmission(submissionId) : rejectSubmission(submissionId));
    setSubmissionBusy(null);
    if (res.ok) {
      setSubmissions((ss) => ss.filter((s) => s.submissionId !== submissionId));
      // Approving moves it straight into the live pool section below —
      // re-fetching would work too, but this reflects it immediately
      // without a second round trip.
      if (approve && submission) setApprovedSubmissions((as) => [submission, ...(as || [])]);
    }
  };

  // Same busy-state-per-row pattern as decideSubmission above — pulling
  // an approved submission back out of the pool (see
  // lib/stereoTypesSubmissions.js's unpublishSubmission for why this
  // isn't just a second "reject").
  const unpublish = async (submissionId) => {
    setUnpublishBusy(submissionId);
    const res = await unpublishSubmission(submissionId);
    setUnpublishBusy(null);
    if (res.ok) setApprovedSubmissions((as) => (as || []).filter((s) => s.submissionId !== submissionId));
  };

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

        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
            🚩 Open Reports {reports && reports.length > 0 && `(${reports.length})`}
          </div>
          {reports === null ? (
            <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic" }}>Loading...</p>
          ) : reports.length === 0 ? (
            <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic" }}>Nothing open right now.</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {reports.map((r) => (
                <div key={r.reportId} style={{ background: "#0d0618", border: "1px solid #ff3860", borderRadius: 8, padding: "10px 12px" }}>
                  <p style={{ fontSize: 12, color: "#f5f0ff", margin: "0 0 6px" }}>
                    <strong>{r.senderName || "Unknown"}</strong> wrote: "{r.messageBody}"
                  </p>
                  <p style={{ fontSize: 11, color: "#a68fd6", margin: "0 0 8px" }}>
                    Reported by <strong>{r.reporterName || "Unknown"}</strong> — "{r.reason}"
                  </p>
                  <button
                    onClick={() => reviewReport(r.reportId)} disabled={reviewingBusy === r.reportId}
                    style={{ background: "none", border: "1px solid #3d1f5c", borderRadius: 6, color: "#a68fd6", fontSize: 11, padding: "5px 10px", cursor: "pointer" }}
                  >
                    {reviewingBusy === r.reportId ? "..." : "Mark reviewed"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stereo Types' own player-submitted superlatives queue (see
            lib/stereoTypesSubmissions.js and
            sql/add-stereo-types-superlative-submissions.sql) — same
            list-with-action-buttons shape as Open Reports above, just
            with two actions per row instead of one, since a submission
            has a real "yes" as well as a "no." Approving actually feeds
            future games (lib/stereoTypesSuperlatives.js's
            getSuperlativePool); rejecting just discards it, matching how
            a reviewed DM report can't be un-reported either. */}
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
            🎤 Stereo Types superlative submissions {submissions && submissions.length > 0 && `(${submissions.length})`}
          </div>
          {submissions === null ? (
            <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic" }}>Loading...</p>
          ) : submissions.length === 0 ? (
            <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic" }}>Nothing pending review.</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {submissions.map((s) => (
                <div key={s.submissionId} style={{ background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "10px 12px" }}>
                  <p style={{ fontSize: 12, color: "#f5f0ff", margin: "0 0 6px" }}>"{s.body}"</p>
                  <p style={{ fontSize: 11, color: "#a68fd6", margin: "0 0 8px" }}>
                    Suggested by <strong>{s.submitterName || "Unknown"}</strong>
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => decideSubmission(s.submissionId, true)} disabled={submissionBusy === s.submissionId}
                      style={{ background: "#2dd4bf", border: "none", borderRadius: 6, color: "#05010f", fontSize: 11, fontWeight: 700, padding: "5px 10px", cursor: "pointer" }}
                    >
                      {submissionBusy === s.submissionId ? "..." : "Approve"}
                    </button>
                    <button
                      onClick={() => decideSubmission(s.submissionId, false)} disabled={submissionBusy === s.submissionId}
                      style={{ background: "none", border: "1px solid #ff3860", borderRadius: 6, color: "#ff3860", fontSize: 11, padding: "5px 10px", cursor: "pointer" }}
                    >
                      {submissionBusy === s.submissionId ? "..." : "Reject"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* The actual live pool — everything lib/stereoTypesSuperlatives.js's
            getSuperlativePool hands out to a real round right now, not just
            the moderation queue above. Two parts: the static seeded list
            (fixed content shipped with the app, so nothing to moderate —
            collapsed behind a <details> the same way GameAccessPanel.jsx's
            own "Advanced: direct link" hides a long block by default), and
            every currently-approved player submission, each with an
            "Unpublish" escape hatch for a submission an admin reconsiders
            after the fact (see lib/stereoTypesSubmissions.js's
            unpublishSubmission — same status flip a normal reject already
            means to the pool, just reachable after approval too). */}
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
            🎧 Stereo Types superlative pool
          </div>

          <details open={showSeedPool} onToggle={(e) => setShowSeedPool(e.target.open)} style={{ marginBottom: 14 }}>
            <summary style={{ color: "#6b4f99", fontSize: 11, cursor: "pointer" }}>
              Seeded pool ({SUPERLATIVES.length}) — built into the app, nothing to moderate
            </summary>
            <div style={{ marginTop: 8, display: "grid", gap: 4, maxHeight: 220, overflowY: "auto" }}>
              {SUPERLATIVES.map((text) => (
                <p key={text} style={{ fontSize: 11.5, color: "#a68fd6", margin: 0 }}>{text}</p>
              ))}
            </div>
          </details>

          <div style={{ fontSize: 11, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            Player-submitted, live in the pool {approvedSubmissions && approvedSubmissions.length > 0 && `(${approvedSubmissions.length})`}
          </div>
          {approvedSubmissions === null ? (
            <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic" }}>Loading...</p>
          ) : approvedSubmissions.length === 0 ? (
            <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic" }}>No player-submitted superlatives are live yet — approve one above.</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {approvedSubmissions.map((s) => (
                <div key={s.submissionId} style={{ background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div>
                    <p style={{ fontSize: 12, color: "#f5f0ff", margin: "0 0 4px" }}>"{s.body}"</p>
                    <p style={{ fontSize: 11, color: "#a68fd6", margin: 0 }}>
                      Submitted by <strong>{s.submitterName || "Unknown"}</strong>
                    </p>
                  </div>
                  <button
                    onClick={() => unpublish(s.submissionId)} disabled={unpublishBusy === s.submissionId}
                    style={{ background: "none", border: "1px solid #ff3860", borderRadius: 6, color: "#ff3860", fontSize: 11, padding: "5px 10px", cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    {unpublishBusy === s.submissionId ? "..." : "Unpublish"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            🎲 Global Challenge Pool
          </div>
          <p style={{ fontSize: 11, color: "#6b4f99", margin: "0 0 12px", fontStyle: "italic" }}>
            Turning a game off here removes it everywhere, for every season — random selection, Hephaestus's draw, and every host's
            own manual picker. Meant for pulling a game that's turned out broken, before every individual host thinks to disable it
            themselves. Each season can also turn off games just for itself, separately, from its own Setup tab.
          </p>
          {globallyDisabled === null ? (
            <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic" }}>Loading...</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
              {Object.entries(GAME_REGISTRY).filter(([key]) => key !== "manual").map(([key, g]) => {
                const isDisabled = globallyDisabled.includes(key);
                return (
                  <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: isDisabled ? "#6b4f99" : "#f5f0ff", cursor: savingChallengePool ? "default" : "pointer" }}>
                    <input
                      type="checkbox" checked={!isDisabled} disabled={savingChallengePool}
                      onChange={(e) => toggleGlobalChallenge(key, e.target.checked)}
                    />
                    {g.icon} {g.label}
                  </label>
                );
              })}
            </div>
          )}

          {/* Traitors' own mini-games (see lib/traitorsMiniGames.js) —
              a separate list from GAME_REGISTRY above since they're not
              part of Project B's random/manual challenge picker at all,
              but the exact same disabled_challenges list underneath:
              each key here is that game's own game_state storage key,
              namespaced with a "traitors:" prefix so it can't collide
              with GAME_REGISTRY's own un-namespaced keys. */}
          <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, margin: "16px 0 8px" }}>
            🏰 Traitors Mini-Games
          </div>
          {globallyDisabled === null ? (
            <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic" }}>Loading...</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
              {Object.entries(TRAITORS_GAME_REGISTRY).map(([key, g]) => {
                const isDisabled = globallyDisabled.includes(key);
                return (
                  <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: isDisabled ? "#6b4f99" : "#f5f0ff", cursor: savingChallengePool ? "default" : "pointer" }}>
                    <input
                      type="checkbox" checked={!isDisabled} disabled={savingChallengePool}
                      onChange={(e) => toggleGlobalChallenge(key, e.target.checked)}
                    />
                    {g.icon} {g.label}
                  </label>
                );
              })}
            </div>
          )}
        </div>

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
                    <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic" }}>No seasons yet.</p>
                  ) : (
                    <div style={{ display: "grid", gap: 6 }}>
                      {history.map((s) => (
                        <div key={s.gameId} style={{ background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 6, padding: "8px 10px", fontSize: 12 }}>
                          <span style={{ color: "#f5f0ff", fontWeight: 700 }}>{s.seasonName}</span>
                          {s.isHost ? (
                            <span style={{ color: "#a68fd6" }}> — </span>
                          ) : (
                            <span style={{ color: "#a68fd6" }}> — {s.character ? `played as ${s.character}` : "played"} — </span>
                          )}
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
