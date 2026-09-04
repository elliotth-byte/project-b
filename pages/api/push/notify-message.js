import { createClient } from "@supabase/supabase-js";
import { sendPushToGame, sendPushToPlayers, sendPushToHosts } from "../../../lib/sendPush";

// ============================================================
// Called by the client right after a message successfully sends (see
// ChatPanel.jsx) — chat sending itself stays entirely client-side (see
// lib/chatData.js), this route exists only because the actual push send
// needs the private VAPID key, which must never reach the browser.
//
// kind: "group" (Panopticon) or "thread" (a DM/multi-person thread,
// including the Exile Room). Group notifies everyone in the game who
// opted into public-message pushes; thread notifies only that specific
// thread's OTHER members who opted into private-message pushes — never
// the whole game, and never the sender themselves either way. Hosts get
// a single combined "chat activity" option for either kind (rather than
// their own public/private split like players have) since a host can
// already read every thread in the game — there's no meaningful
// public/private distinction from their side.
// ============================================================

const PREVIEW_LENGTH = 100;

// Only Project B's own group chat is actually branded "Panopticon" — the
// other game types' own UIs just call it "Chat" (see e.g.
// TraitorsPlayerPanels.jsx's "💬 Chat" tab), so their host-side push
// title shouldn't say "Panopticon" either. Explicit three-way check
// (matching this codebase's established convention) rather than just
// special-casing project_b and calling everything else "Chat" via a
// negation.
function groupChatLabel(gameType) {
  if (gameType === "project_b") return "(Panopticon)";
  if (gameType === "traitors") return "(Chat)";
  if (gameType === "stereo_types") return "(Chat)";
  return "(Chat)"; // unknown/future game type — generic fallback, never Project B's own branding
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { gameId, kind, senderId, senderName, body, threadId, isFinalWords } = req.body || {};
  if (!gameId || !kind || !senderId || !body) return res.status(400).json({ error: "Missing required fields." });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Missing auth token." });

  const userClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData?.user) return res.status(401).json({ error: "Invalid session." });

  // Confirms the caller is actually the player they claim senderId is,
  // scoped to this game — prevents spoofing a notification as coming
  // from someone else's message.
  const { data: callerPlayer } = await userClient.from("players").select("id").eq("id", senderId).eq("game_id", gameId).maybeSingle();
  if (!callerPlayer) return res.status(403).json({ error: "Not a player in this game." });

  const preview = body.length > PREVIEW_LENGTH ? body.slice(0, PREVIEW_LENGTH) + "…" : body;

  if (kind === "group") {
    // Looked up fresh per send rather than threaded through from the
    // client — this route already needs to trust nothing the client
    // claims about the game beyond gameId itself.
    const { data: gameRow } = await userClient.from("games").select("game_type").eq("id", gameId).maybeSingle();
    // Final Words (components/FinalWordsPrompt.jsx, via
    // lib/finalWords.js's submitFinalWords) is still an ordinary
    // Panopticon group-chat message underneath — same
    // notify_public_messages preference, same "everyone but the
    // sender" audience — just titled distinctly so it doesn't read
    // like a normal chat ping when it's actually someone's last
    // message before leaving. Matches the in-chat label
    // components/ChatPanel.jsx's own MessageBubble already shows for
    // the exact same flag.
    const title = isFinalWords ? `🎤 ${senderName}'s Final Words` : `💬 ${senderName}`;
    await sendPushToGame(gameId, {
      title, body: preview, url: `/play?game=${gameId}`, tag: "chat-group",
      filterColumn: "notify_public_messages", excludePlayerId: senderId,
    });
    await sendPushToHosts(gameId, {
      title: `${isFinalWords ? "🎤" : "💬"} ${senderName} ${isFinalWords ? "(Final Words)" : groupChatLabel(gameRow?.game_type)}`, body: preview, url: `/host?game=${gameId}`, tag: "chat-group",
      filterColumn: "notify_chat_activity",
    });
    return res.status(200).json({ ok: true });
  }

  if (kind === "thread") {
    if (!threadId) return res.status(400).json({ error: "Missing threadId." });
    // RLS already restricts this to threads the caller belongs to — no
    // service-role needed just to look up the member list.
    const { data: members } = await userClient.from("chat_thread_members").select("player_id").eq("thread_id", threadId);
    const memberIds = (members || []).map((m) => m.player_id);
    await sendPushToPlayers(memberIds, {
      title: `💬 ${senderName}`, body: preview, url: `/play?game=${gameId}`, tag: `chat-thread-${threadId}`,
      filterColumn: "notify_private_messages", excludePlayerId: senderId,
    });
    await sendPushToHosts(gameId, {
      title: `💬 ${senderName} (DM)`, body: preview, url: `/host?game=${gameId}`, tag: `chat-thread-${threadId}`,
      filterColumn: "notify_chat_activity",
    });
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: "Invalid kind." });
}
