import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

// ============================================================
// Requires web-push (added to package.json — run npm install after
// pulling this update) and VAPID keys in the environment (see
// .env.local.example). VAPID is the standard identifying key pair every
// Web Push message needs — not a third-party paid service, just a
// public/private key pair your server signs pushes with.
// ============================================================

let configured = false;
function ensureConfigured() {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    console.warn("Missing VAPID keys — check your .env.local file. Push notifications won't send.");
    return false;
  }
  webpush.setVapidDetails("mailto:no-reply@example.com", publicKey, privateKey);
  configured = true;
  return true;
}

// filterColumn: which preference flag a subscription needs set to
// receive this push — "notify_rounds", "notify_public_messages", or
// "notify_private_messages". excludePlayerId: never notify someone
// about their own action (e.g. don't tell someone their own message
// arrived).
export async function sendPushToGame(gameId, { title, body, url, tag, filterColumn, excludePlayerId }) {
  if (!ensureConfigured()) return;

  const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  let query = adminClient.from("push_subscriptions").select("*").eq("game_id", gameId).eq(filterColumn, true);
  if (excludePlayerId) query = query.neq("player_id", excludePlayerId);

  const { data: subs, error } = await query;
  if (error || !subs || subs.length === 0) return;

  const payload = JSON.stringify({ title, body, url, tag });
  const staleIds = [];

  await Promise.all(subs.map(async (sub) => {
    const pushSubscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
    try {
      await webpush.sendNotification(pushSubscription, payload);
    } catch (err) {
      // 404/410 means the subscription is dead (uninstalled, revoked,
      // expired) — clean it up rather than retrying it forever on every
      // future notification.
      if (err.statusCode === 404 || err.statusCode === 410) staleIds.push(sub.id);
      else console.error("Push send failed:", sub.id, err.statusCode, err.body);
    }
  }));

  if (staleIds.length > 0) {
    await adminClient.from("push_subscriptions").delete().in("id", staleIds);
  }
}

// Only sent to a SPECIFIC recipient — used for DMs, where a group-wide
// broadcast would be wrong (only the actual recipients of that specific
// thread should be notified, not everyone in the game).
export async function sendPushToPlayers(playerIds, { title, body, url, tag, filterColumn, excludePlayerId }) {
  if (!ensureConfigured() || playerIds.length === 0) return;

  const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const targets = excludePlayerId ? playerIds.filter((id) => id !== excludePlayerId) : playerIds;
  if (targets.length === 0) return;

  const { data: subs, error } = await adminClient
    .from("push_subscriptions").select("*").in("player_id", targets).eq(filterColumn, true);
  if (error || !subs || subs.length === 0) return;

  const payload = JSON.stringify({ title, body, url, tag });
  const staleIds = [];

  await Promise.all(subs.map(async (sub) => {
    const pushSubscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
    try {
      await webpush.sendNotification(pushSubscription, payload);
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) staleIds.push(sub.id);
      else console.error("Push send failed:", sub.id, err.statusCode, err.body);
    }
  }));

  if (staleIds.length > 0) {
    await adminClient.from("push_subscriptions").delete().in("id", staleIds);
  }
}
