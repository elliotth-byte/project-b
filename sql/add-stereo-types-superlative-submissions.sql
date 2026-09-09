-- ============================================================
-- Migration: Stereo Types — player-submitted superlatives (moderated)
-- Run this in Supabase SQL Editor (New query -> paste -> Run), AFTER
-- sql/add-profile-dms.sql and sql/add-profiles-admin.sql (this reuses
-- is_platform_admin() defined there, doesn't redefine it). Safe to run
-- once on your existing project — additive only.
--
-- The original spec's own wording: "Player's should also be prompted to
-- submit a superlative for future games (this will be sent to the
-- global admin panel for moderation)." This is that moderation queue.
--
-- This deliberately mirrors dm_reports (sql/add-profile-dms.sql) —
-- that's the exact existing pattern in this codebase for "a player
-- submits something, a platform admin reviews it on /admin,
-- is_platform_admin() gates the review" — with ONE structural
-- difference: a DM report only ever has a boolean reviewed/not-reviewed
-- state (a report doesn't get "approved," it just gets looked at), while
-- a submitted superlative genuinely needs three states, because
-- "approved" has to actually do something (feed
-- lib/stereoTypesSuperlatives.js's getSuperlativePool()) that "rejected"
-- must not. Hence `status` instead of a plain boolean, with a check
-- constraint standing in for a real enum type — matching how this
-- schema handles every other small fixed vocabulary (see e.g. players'
-- own elimination_type check constraint) rather than reaching for
-- `create type`.
--
-- Judgment calls, documented here rather than left implicit:
--
-- 1. Text length: `char_length(body) between 1 and 140`, enforced BOTH
--    here and client-side (lib/stereoTypesSubmissions.js). 140 keeps a
--    submission roughly the same length as the seeded pool's own
--    longest entries (see lib/stereoTypesSuperlatives.js) — long enough
--    for a real superlative, short enough that Round 2's shared-list
--    display and Round 3's candidate/decoy option lists (both of which
--    may now render a user submission alongside the seeded pool) don't
--    have to handle a wall of text they were never designed to lay out.
--
-- 2. One pending submission per person at a time, enforced with a
--    partial unique index rather than just a client-side check (a
--    client-side-only check can't stop two rapid double-submits from the
--    same tab from both landing) — a person can always submit again
--    once their existing pending one is approved or rejected. This is a
--    deliberate anti-spam floor, not a claim that one lifetime
--    suggestion is the "right" number — it was the simplest rule that
--    still stops someone from flooding the queue, matching this file's
--    own instruction to keep this simple rather than build a rate
--    limiter for a low-stakes text suggestion.
--
-- 3. No de-duplication against the existing seeded pool, or against
--    other pending/approved submissions, at insert time OR at approval
--    time. A real superlative catalog (see
--    lib/stereoTypesSuperlatives.js's own intentionally colloquial,
--    overlapping-in-theme entries — "most likely to..." X and Y are
--    often near-duplicates of each other on purpose) doesn't actually
--    need hard uniqueness to work, and a same-text guess appearing twice
--    in a shared list (Round 2) or a candidate/decoy set (Round 3) isn't
--    a correctness bug the way a duplicate player ID in a permutation
--    would be — it's just a coincidence, no worse than two seeded
--    entries already reading similarly. The admin reviewing on /admin
--    can already see the exact text and is the intended place to catch
--    and reject a genuine duplicate by eye; automating that check would
--    be real complexity spent on a cosmetic, not a correctness, problem.
--
-- 4. No "edit after submit," and no "read your own past submissions"
--    policy — both mirror dm_reports exactly (see that migration's own
--    comment: a report is a message TO admins, not a record its author
--    needs to look back at inside the app; a submitted superlative is
--    the same kind of one-way, fire-and-forget message). A submitter who
--    typo'd can just submit again (subject to judgment call #2 above,
--    once their existing pending row is resolved) rather than this
--    needing an update path for the submitting user at all.
-- ============================================================

create table if not exists stereo_types_superlative_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  body text not null check (char_length(body) between 1 and 140),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);

-- Judgment call #2 above, made structurally impossible to violate rather
-- than merely discouraged: a partial index only covers rows that are
-- STILL pending, so once a submission is approved or rejected, the same
-- person is free to submit a brand new one.
create unique index if not exists stereo_types_superlative_submissions_one_pending_per_user
on stereo_types_superlative_submissions (user_id)
where status = 'pending';

alter table stereo_types_superlative_submissions enable row level security;

-- A person can submit their own suggestion. Same shape as dm_reports'
-- own insert policy: the row's user_id must actually be the caller, no
-- submitting on someone else's behalf.
create policy "submit your own superlative suggestion"
on stereo_types_superlative_submissions for insert
with check (user_id = auth.uid());

-- Deliberately no "read your own submissions" policy — see judgment
-- call #4 above. Only a platform admin can ever read this table.
create policy "platform admins review superlative submissions"
on stereo_types_superlative_submissions for select
using (is_platform_admin());

-- Only a platform admin can approve/reject — never the submitter, and
-- never any other player. Matches dm_reports' "platform admins mark
-- reports reviewed" policy exactly, just with a three-state `status`
-- instead of a boolean `reviewed` to actually set.
create policy "platform admins moderate superlative submissions"
on stereo_types_superlative_submissions for update
using (is_platform_admin())
with check (is_platform_admin());
