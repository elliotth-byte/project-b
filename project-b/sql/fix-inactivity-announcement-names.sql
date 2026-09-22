-- ─── One-off data fix: rewrite already-stored inactivity-removal ───
-- ─── announcements/chat messages to use aliases, not real names   ───
--
-- Context: lib/roundEngine.js's checkInstantInactivityRemoval used to
-- build its "removed for inactivity" message with
-- `p.display_name || playersById[p.id]` — real name checked FIRST, so
-- it always won even when a season has aliases turned on. Every other
-- announcement in that file did it the other way around, using the
-- already alias-aware playersById first. That's fixed going forward
-- (see roundEngine.js) — this script is only for messages that were
-- already written to the database before that fix.
--
-- This only rewrites messages matching that EXACT template, only where
-- a game currently has aliasEnabled on and the named player currently
-- has an alias set. Nothing else is touched — no other announcement
-- text, no real chat messages, nothing host-authored — since every
-- other automated announcement already used the correct alias-aware
-- name.
--
-- HOW TO RUN: paste this whole file into the Supabase SQL Editor for
-- your project and run it. Step 1 (the SELECT) is a preview — it makes
-- no changes and just shows you which games/messages the fix would
-- touch. Step 2 (the DO block) is the actual fix. Run them in order,
-- in the same session, and read the "Messages" panel after step 2 —
-- it logs exactly what it rewrote (or that a game had nothing to fix).

-- ═══ Step 1: preview — what would this touch? (read-only) ═══
select
  g.id as game_id,
  gs.key,
  elem ->> 'text' as announcement_text,
  elem ->> 'body' as chat_text
from games g
join game_state gs on gs.game_id = g.id and gs.key in ('pb:announcements', 'pb:group-chat')
join game_state settings on settings.game_id = g.id and settings.key = 'pb:settings'
cross join lateral jsonb_array_elements(gs.value) as elem
where coalesce((settings.value->>'aliasEnabled')::boolean, false) = true
  and (
    (elem ->> 'text') ~ '^🚫 .+ didn''t vote, play in the Battle, or send any message this round — removed for inactivity\.$'
    or (elem ->> 'body') ~ '^🚫 .+ didn''t vote, play in the Battle, or send any message this round — removed for inactivity\.$'
  );

-- ═══ Step 2: the actual fix ═══
do $$
declare
  g record;
  alias_enabled boolean;
  name_alias jsonb;
  ann_val jsonb;
  chat_val jsonb;
  new_ann jsonb;
  new_chat jsonb;
  elem jsonb;
  new_elem jsonb;
  txt text;
  new_text text;
  names text[];
  new_names text[];
  nm text;
  mapped text;
  changed boolean;
  any_ann_changed boolean;
  any_chat_changed boolean;
  m text[];
  removal_pattern text := '^🚫 (.+?) didn''t vote, play in the Battle, or send any message this round — removed for inactivity\.$';
begin
  for g in select id from games loop
    select value into ann_val from game_state where game_id = g.id and key = 'pb:settings';
    alias_enabled := coalesce((ann_val->>'aliasEnabled')::boolean, false);
    if not alias_enabled then
      continue;
    end if;

    select coalesce(jsonb_object_agg(display_name, alias), '{}'::jsonb)
      into name_alias
      from players
      where game_id = g.id and alias is not null and alias <> '' and display_name is not null;

    if name_alias = '{}'::jsonb then
      continue;
    end if;

    -- ─── Announcements ───
    select value into ann_val from game_state where game_id = g.id and key = 'pb:announcements';
    if ann_val is not null then
      new_ann := '[]'::jsonb;
      any_ann_changed := false;
      for elem in select * from jsonb_array_elements(ann_val) loop
        new_elem := elem;
        if (elem->>'from') = 'system' and (elem->>'text') is not null then
          txt := elem->>'text';
          m := regexp_match(txt, removal_pattern);
          if m is not null then
            names := string_to_array(m[1], ', ');
            new_names := array[]::text[];
            changed := false;
            foreach nm in array names loop
              mapped := name_alias->>nm;
              if mapped is not null and mapped <> nm then
                new_names := array_append(new_names, mapped);
                changed := true;
              else
                new_names := array_append(new_names, nm);
              end if;
            end loop;
            if changed then
              new_text := '🚫 ' || array_to_string(new_names, ', ') || ' didn''t vote, play in the Battle, or send any message this round — removed for inactivity.';
              new_elem := jsonb_set(elem, '{text}', to_jsonb(new_text));
              any_ann_changed := true;
              raise notice 'Game %: announcement rewritten: "%" -> "%"', g.id, txt, new_text;
            end if;
          end if;
        end if;
        new_ann := new_ann || jsonb_build_array(new_elem);
      end loop;

      if any_ann_changed then
        update game_state
          set value = new_ann, version = coalesce(version, 0) + 1, updated_at = now()
          where game_id = g.id and key = 'pb:announcements';
      end if;
    end if;

    -- ─── Group chat ───
    select value into chat_val from game_state where game_id = g.id and key = 'pb:group-chat';
    if chat_val is not null then
      new_chat := '[]'::jsonb;
      any_chat_changed := false;
      for elem in select * from jsonb_array_elements(chat_val) loop
        new_elem := elem;
        if (elem->>'senderId') = 'system' and (elem->>'body') is not null then
          txt := elem->>'body';
          m := regexp_match(txt, removal_pattern);
          if m is not null then
            names := string_to_array(m[1], ', ');
            new_names := array[]::text[];
            changed := false;
            foreach nm in array names loop
              mapped := name_alias->>nm;
              if mapped is not null and mapped <> nm then
                new_names := array_append(new_names, mapped);
                changed := true;
              else
                new_names := array_append(new_names, nm);
              end if;
            end loop;
            if changed then
              new_text := '🚫 ' || array_to_string(new_names, ', ') || ' didn''t vote, play in the Battle, or send any message this round — removed for inactivity.';
              new_elem := jsonb_set(elem, '{body}', to_jsonb(new_text));
              any_chat_changed := true;
              raise notice 'Game %: chat message rewritten: "%" -> "%"', g.id, txt, new_text;
            end if;
          end if;
        end if;
        new_chat := new_chat || jsonb_build_array(new_elem);
      end loop;

      if any_chat_changed then
        update game_state
          set value = new_chat, version = coalesce(version, 0) + 1, updated_at = now()
          where game_id = g.id and key = 'pb:group-chat';
      end if;
    end if;
  end loop;

  raise notice 'Done.';
end $$;
