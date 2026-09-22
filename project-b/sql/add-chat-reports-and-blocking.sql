-- ============================================================
-- Migration: report + block for in-game chat, part of App Store
-- Guideline 1.2 (User-Generated Content) compliance
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- Two real gaps this closes:
--
-- 1. Reporting only ever existed for the cross-season profile DM
--    system (dm_reports, see sql/add-profile-dms.sql) — the actual
--    primary chat surface, in-game group chat and in-game DMs (both
--    live in chat_messages/chat_threads, see lib/chatData.js), had no
--    reporting at all. This table mirrors dm_reports' exact shape and
--    RLS pattern (report a message you can actually see; only
--    platform admins can read or resolve the queue) so
--    lib/adminModeration.js's existing review flow can be extended to
--    cover both without inventing a second pattern.
--
-- 2. Blocking didn't exist anywhere — neither system had it. This is
--    the one truly new capability: a global, not per-game, block list
--    (blocking someone is about not wanting to hear from a specific
--    real person, which doesn't reset just because a new season
--    starts), enforced client-side by filtering a blocked sender's
--    messages out of what you see, and at the database level for
--    starting new in-game DM threads (see
--    lib/blockedUsers.js/lib/chatData.js).
-- ============================================================

create table if not exists chat_message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references chat_messages(id) on delete cascade not null,
  reporter_id uuid references auth.users(id) on delete cascade not null,
  reason text not null,
  created_at timestamptz not null default now(),
  reviewed boolean not null default false,
  reviewed_at timestamptz
);

alter table chat_message_reports enable row level security;

-- Same "no read-your-own-reports policy" reasoning as dm_reports — a
-- report is a message TO platform admins, not something the reporter
-- needs to look back at.
create policy "report a chat message you can actually see"
on chat_message_reports for insert
with check (
  reporter_id = auth.uid()
  and exists (
    select 1 from chat_messages m
    join chat_threads t on t.id = m.thread_id
    where m.id = chat_message_reports.message_id
    and (is_game_player(t.game_id) or is_game_host(t.game_id))
  )
);

create policy "platform admins review chat reports"
on chat_message_reports for select
using (is_platform_admin());

create policy "platform admins mark chat reports reviewed"
on chat_message_reports for update
using (is_platform_admin())
with check (is_platform_admin());

create table if not exists blocked_users (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid references auth.users(id) on delete cascade not null,
  blocked_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  constraint blocked_users_not_self check (blocker_id != blocked_id),
  unique (blocker_id, blocked_id)
);

create index if not exists blocked_users_blocker_idx on blocked_users(blocker_id);

alter table blocked_users enable row level security;

-- A block is entirely personal — you manage your own list, you can
-- see your own list, nobody else (including a platform admin) has any
-- reason to read or write it. Deliberately no admin-visibility policy,
-- unlike every other moderation table in this app: this isn't a
-- moderation action requiring oversight, it's closer to a personal
-- notification preference.
create policy "manage your own block list"
on blocked_users for all
using (blocker_id = auth.uid())
with check (blocker_id = auth.uid());

-- Lets any authenticated user check whether THEY specifically have
-- blocked someone, or been blocked by them — needed at DM-thread-
-- creation time (see lib/chatData.js's createOrGetThread) to stop a
-- new thread from starting between two people where either side has
-- blocked the other, without exposing anyone's full block list to the
-- other party (this only ever answers "does a block exist between us
-- two", never "who else have you blocked").
create or replace function public.is_blocked_either_way(p_other_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from blocked_users
    where (blocker_id = auth.uid() and blocked_id = p_other_user_id)
       or (blocker_id = p_other_user_id and blocked_id = auth.uid())
  );
$$;
