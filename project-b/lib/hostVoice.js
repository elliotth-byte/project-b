import { useState, useEffect } from "react";

// ─── The host's chosen "voice" for chat and confessional replies ───
// Both components/ChatHostPanel.jsx's own group-chat posts and
// components/ConfessionalsHost.jsx's own confessional replies used to
// always show as a flat, generic "Host" — no way to tell players THEY
// were replying to something, versus a different host, versus an
// in-universe persona a season might want to post as (a narrator
// character, a specific producer, etc.). This is the one shared bit of
// state behind the small "Posting as" field both of those components
// now show — same name remembered across both, in the SAME browser,
// since it's the same person typing either way.
//
// Plain localStorage rather than a real game_state/host_state row:
// this is a per-BROWSER convenience default, not something that needs
// to sync across a host's multiple devices or be visible to anyone
// else — the actual sender name gets written into the real message/
// reply the moment it's sent (players.js's players table for chat,
// confessionals.host_reply_sender_name for replies), which IS properly
// persisted and shared; this hook only remembers what to pre-fill the
// input with next time.
const STORAGE_PREFIX = "hostVoiceName:";

export function usePostAsName(gameId) {
  const [name, setName] = useState("Host");

  useEffect(() => {
    if (!gameId || typeof window === "undefined") return;
    const saved = window.localStorage.getItem(STORAGE_PREFIX + gameId);
    if (saved) setName(saved);
  }, [gameId]);

  const updateName = (next) => {
    setName(next);
    if (gameId && typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_PREFIX + gameId, next);
    }
  };

  return [name, updateName];
}
