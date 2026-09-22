import { supabase } from "./supabaseClient";

// ─── Stereo Types — player-submitted superlatives (moderation) ───
// See sql/add-stereo-types-superlative-submissions.sql for the table,
// its RLS, and every judgment call baked into this (the 140-char limit,
// one-pending-submission-per-person, no de-duplication, no edit-after-
// submit). This module deliberately mirrors lib/adminModeration.js's
// fetchOpenReports/markReportReviewed shape — same "existing pattern for
// user-submitted content a platform admin reviews," just with a
// three-state status instead of a boolean reviewed flag, since
// "approved" here has to actually feed the game's pool (see
// lib/stereoTypesSuperlatives.js's getSuperlativePool) while dm_reports'
// reviewed flag never had anywhere further to go.

const MAX_SUBMISSION_LENGTH = 140;

// A player suggesting new superlative text, from anywhere in the app
// (see components/StereoTypesFinalStandings.jsx for the one built-in
// prompt). Basic client-side validation only — this is a text
// suggestion, not sensitive data, so it doesn't need anything beyond
// "non-empty" and "fits the same length limit the DB itself enforces"
// (see that migration's own comment on why 140). The one-pending-at-a-
// time rule is NOT re-checked here — it's enforced by a real unique
// index at the database level (see the migration), so a caller that
// already has a pending submission just gets back a normal insert error
// rather than this function trying to pre-empt it with its own query.
export async function submitSuperlative(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return { ok: false, error: "Enter a superlative before submitting." };
  if (trimmed.length > MAX_SUBMISSION_LENGTH) {
    return { ok: false, error: `Keep it under ${MAX_SUBMISSION_LENGTH} characters.` };
  }

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return { ok: false, error: "You need to be logged in to submit a superlative." };

  const { error } = await supabase.from("stereo_types_superlative_submissions").insert({ user_id: userId, body: trimmed });
  if (error) {
    // The unique partial index (one pending submission per person) is
    // the most likely real-world cause of a failed insert here — surface
    // that as a normal, expected "no" rather than a generic failure,
    // same "collapse an expected case into a clear message" instinct as
    // the rest of this codebase's {ok, error} functions.
    if (error.code === "23505") {
      return { ok: false, error: "You already have a suggestion waiting for review — try again once that one's been decided." };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// Admin-only (RLS returns zero rows to anyone who isn't a platform
// admin, same as fetchOpenReports) — mirrors that function's own shape:
// join back to profiles for a display name, newest first so a growing
// backlog doesn't bury what just came in.
export async function fetchPendingSubmissions() {
  const { data: submissions, error } = await supabase
    .from("stereo_types_superlative_submissions")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error || !submissions) return [];

  const userIds = [...new Set(submissions.map((s) => s.user_id))];
  const { data: profs } = await supabase.from("profiles").select("*").in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
  const profsById = {};
  (profs || []).forEach((p) => { profsById[p.user_id] = p; });

  return submissions.map((s) => ({
    submissionId: s.id,
    body: s.body,
    createdAt: s.created_at,
    userId: s.user_id,
    submitterName: profsById[s.user_id]?.display_name || null,
  }));
}

// Admin-only, same shape/RLS as fetchPendingSubmissions above — the
// counterpart view for the global admin panel's superlative POOL
// section (as opposed to that function's own pending-queue section):
// every approved submission actually feeding
// lib/stereoTypesSuperlatives.js's getSuperlativePool right now, newest-
// approved first, with submitter name attached the same way.
export async function fetchApprovedSubmissions() {
  const { data: submissions, error } = await supabase
    .from("stereo_types_superlative_submissions")
    .select("*")
    .eq("status", "approved")
    .order("reviewed_at", { ascending: false });
  if (error || !submissions) return [];

  const userIds = [...new Set(submissions.map((s) => s.user_id))];
  const { data: profs } = await supabase.from("profiles").select("*").in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
  const profsById = {};
  (profs || []).forEach((p) => { profsById[p.user_id] = p; });

  return submissions.map((s) => ({
    submissionId: s.id,
    body: s.body,
    createdAt: s.created_at,
    userId: s.user_id,
    submitterName: profsById[s.user_id]?.display_name || null,
  }));
}

async function setSubmissionStatus(submissionId, status) {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("stereo_types_superlative_submissions")
    .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: userData?.user?.id || null })
    .eq("id", submissionId);
  return { ok: !error, error: error?.message };
}

// Mirrors markReportReviewed's shape — approving actually matters
// downstream (lib/stereoTypesSuperlatives.js's getSuperlativePool reads
// status = 'approved' rows into the live pool), rejecting is a dead end
// by design, matching how a DM report can't be un-reported either.
export async function approveSubmission(submissionId) {
  return setSubmissionStatus(submissionId, "approved");
}

export async function rejectSubmission(submissionId) {
  return setSubmissionStatus(submissionId, "rejected");
}

// Pulling an already-approved submission back OUT of the live pool —
// the seeded SUPERLATIVES list has no equivalent (it's static, hardcoded
// content, nothing to "unpublish"), but a player submission an admin
// approved and later reconsiders needs a way back out. Reuses the exact
// same "rejected" status a normal reject already means to
// getSuperlativePool (only status = 'approved' rows ever get read into
// the pool) — there's no fourth state here, just approving having been
// the wrong call after the fact.
export async function unpublishSubmission(submissionId) {
  return setSubmissionStatus(submissionId, "rejected");
}
