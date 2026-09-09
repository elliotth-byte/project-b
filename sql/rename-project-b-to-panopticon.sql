-- ============================================================
-- Migration: rename existing "Project B" seasons to "Panopticon"
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- Code-side, "Project B" was always just the default name a host got
-- if they left the season-name field blank (see pages/host.jsx's
-- createSeason/saveEditing) — not a hardcoded label anywhere player-
-- facing. This is the other half: any season that ACTUALLY got named
-- literally "Project B" that way, before this rename, is just data,
-- and needs updating separately from the code that generates new
-- names going forward.
--
-- Scoped to an exact, case-sensitive match on the default name only —
-- a host who typed something else (or already renamed their own
-- season to "Panopticon 2 — Rise of the Olympians", for instance)
-- is left alone either way.
-- ============================================================

update games set name = 'Panopticon' where name = 'Project B' and game_type = 'project_b';
