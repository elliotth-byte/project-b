-- ============================================================
-- Migration: remove leftover GroupMe integration
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- All game announcements are in-app now (see lib/announcements.js,
-- components/AnnouncementsFeed.jsx) or copied out by the host to paste
-- wherever they want (components/CopyMessage.jsx) — there's no longer
-- any server-side GroupMe posting at all. This table (from
-- sql/add-scheduled-groupme-posts.sql) was for a scheduled-posting
-- feature whose API routes were already removed; nothing in the app
-- reads or writes it anymore, so it's safe to drop.
-- ============================================================

drop table if exists scheduled_groupme_posts;
