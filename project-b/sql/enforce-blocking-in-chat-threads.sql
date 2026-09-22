-- ============================================================
-- Migration: stop a new chat thread from forming between two people
-- where either has blocked the other
-- Run this in Supabase SQL Editor, AFTER
-- sql/add-chat-reports-and-blocking.sql (needs the blocked_users
-- table it creates).
--
-- create_chat_thread (see sql/add-group-chat.sql) is where every new
-- in-game DM or group actually gets created — enforcing the block
-- check here, inside the function itself, means it can't be bypassed
-- by calling the underlying RPC directly the way a purely client-side
-- check could be. Applies to both 1:1 DMs and groups alike: there's no
-- real reason a block should stop direct messages but not stop being
-- added to a group with the same person.
--
-- Deliberately does NOT retroactively touch any thread that already
-- exists — someone blocking another player mid-conversation stops
-- THEM from being placed in any NEW thread together going forward
-- (see lib/chatData.js's own filtering of already-sent messages from
-- a blocked sender for the other half of this), not an attempt to
-- unwind history.
-- ============================================================

create or replace function public.create_chat_thread(p_game_id uuid, p_member_ids uuid[], p_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_player_id uuid;
  v_thread_id uuid;
  v_is_group boolean;
  v_sorted uuid[];
  v_blocked_count int;
begin
  select id into v_caller_player_id
  from players
  where user_id = auth.uid() and game_id = p_game_id and id = any(p_member_ids);

  if v_caller_player_id is null then
    raise exception 'not authorized to create a thread with these members';
  end if;

  select count(*) into v_blocked_count
  from players p
  where p.id = any(p_member_ids)
    and p.id != v_caller_player_id
    and (
      exists (select 1 from blocked_users b where b.blocker_id = auth.uid() and b.blocked_id = p.user_id)
      or exists (select 1 from blocked_users b where b.blocker_id = p.user_id and b.blocked_id = auth.uid())
    );

  if v_blocked_count > 0 then
    raise exception 'cannot start a thread — blocked';
  end if;

  v_is_group := coalesce(array_length(p_member_ids, 1), 0) > 2;
  select array_agg(x order by x) into v_sorted from unnest(p_member_ids) x;

  -- 1:1 DMs are deduplicated — reopening a conversation with the same
  -- person returns the existing thread instead of creating a new one.
  if not v_is_group then
    select t.id into v_thread_id
    from chat_threads t
    where t.game_id = p_game_id and t.is_group = false
    and (
      select array_agg(m.player_id order by m.player_id)
      from chat_thread_members m
      where m.thread_id = t.id
    ) = v_sorted
    limit 1;
  end if;

  if v_thread_id is not null then
    return v_thread_id;
  end if;

  insert into chat_threads (game_id, name, is_group, created_by)
  values (p_game_id, p_name, v_is_group, v_caller_player_id)
  returning id into v_thread_id;

  insert into chat_thread_members (thread_id, player_id)
  select v_thread_id, unnest(p_member_ids);

  return v_thread_id;
end;
$$;
