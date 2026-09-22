import { useState, useEffect } from "react";
import {
  subscribeGroupChat, subscribeGroupChatReads,
  fetchMyThreads, fetchThreadReads, subscribeThreadReads,
  fetchLatestMessageTimestamps, subscribeAnyThreadActivity,
} from "./chatData";

// Powers the badge dot on the outer "💬 Chat" tab in pages/play.jsx —
// deliberately just a boolean ("is there anything new anywhere") rather
// than duplicating ChatPanel.jsx's per-room breakdown; opening the tab
// is what shows the detail.
export function useHasUnreadChat(gameId, playerId, enabled) {
  const [groupLatest, setGroupLatest] = useState(null);
  const [groupRead, setGroupRead] = useState(null);
  const [threadLatest, setThreadLatest] = useState({});
  const [threadReads, setThreadReads] = useState({});

  useEffect(() => {
    if (!enabled || !gameId || !playerId) return;
    const unsubMessages = subscribeGroupChat(gameId, (msgs) => setGroupLatest(msgs.length ? msgs[msgs.length - 1].createdAt : null));
    const unsubReads = subscribeGroupChatReads(gameId, (reads) => setGroupRead(reads[playerId] || null));
    return () => { unsubMessages(); unsubReads(); };
  }, [gameId, playerId, enabled]);

  useEffect(() => {
    if (!enabled || !gameId || !playerId) return;
    let active = true;
    const loadReads = () => fetchThreadReads(playerId).then((m) => { if (active) setThreadReads(m); });
    loadReads();
    const unsubscribe = subscribeThreadReads(playerId, loadReads);
    return () => { active = false; unsubscribe(); };
  }, [gameId, playerId, enabled]);

  useEffect(() => {
    if (!enabled || !gameId || !playerId) return;
    let active = true;
    const loadLatest = () => {
      fetchMyThreads(gameId, playerId).then((threads) => {
        if (!active || threads.length === 0) return;
        fetchLatestMessageTimestamps(threads.map((t) => t.id)).then((latest) => { if (active) setThreadLatest(latest); });
      });
    };
    loadLatest();
    const unsubscribe = subscribeAnyThreadActivity(gameId, loadLatest);
    return () => { active = false; unsubscribe(); };
  }, [gameId, playerId, enabled]);

  if (!enabled) return false;

  const groupUnread = groupLatest && (!groupRead || groupLatest > groupRead);
  const threadsUnread = Object.entries(threadLatest).some(([threadId, latestAt]) => {
    const readAt = threadReads[threadId];
    return !readAt || new Date(latestAt).getTime() > new Date(readAt).getTime();
  });

  return !!(groupUnread || threadsUnread);
}
