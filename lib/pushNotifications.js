import { supabase } from "./supabaseClient";

// ============================================================
// Handles the browser-side half of push notifications: registering the
// service worker, requesting permission, subscribing, and saving that
// subscription (with the player's chosen preferences) to
// push_subscriptions. Subscribe/unsubscribe/update-prefs all go straight
// through the Supabase client rather than a server API route — RLS
// already lets a player manage their own subscriptions directly (see
// sql/add-push-subscriptions.sql), same pattern as game_prefs or avatar
// uploads. Only the actual SENDING of a push needs a server route, since
// that requires the private VAPID key.
//
// iOS note (Safari): Web Push only works for a PWA that's been added to
// the home screen and launched from that icon — not from a regular
// Safari tab — and requires iOS 16.4+. Android/Chrome has no such
// restriction. isPushSupported() below reflects browser API support, not
// this iOS-specific installation requirement, which is surfaced as a UI
// note instead (see HelpPanel.jsx).
// ============================================================

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function isPushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

export async function getExistingSubscription(playerId) {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  const pushSub = await registration?.pushManager.getSubscription();
  if (!pushSub) return null;
  const { data } = await supabase.from("push_subscriptions").select("*").eq("player_id", playerId).eq("endpoint", pushSub.endpoint).maybeSingle();
  return data;
}

// Registers the service worker (idempotent — safe to call repeatedly),
// requests notification permission if not already granted, subscribes
// via the browser's push manager, and upserts the row with the given
// preferences. Returns { ok, error }.
export async function subscribeToPush(playerId, gameId, prefs) {
  if (!isPushSupported()) return { ok: false, error: "Push notifications aren't supported in this browser." };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, error: "Notification permission wasn't granted." };

  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    let pushSub = await registration.pushManager.getSubscription();
    if (!pushSub) {
      pushSub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
      });
    }

    const json = pushSub.toJSON();
    const { error } = await supabase.from("push_subscriptions").upsert({
      player_id: playerId,
      game_id: gameId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      notify_rounds: !!prefs.notifyRounds,
      notify_public_messages: !!prefs.notifyPublicMessages,
      notify_private_messages: !!prefs.notifyPrivateMessages,
    }, { onConflict: "player_id,endpoint" });

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || "Couldn't set up notifications." };
  }
}

export async function updatePushPrefs(playerId, prefs) {
  const registration = await navigator.serviceWorker.getRegistration();
  const pushSub = await registration?.pushManager.getSubscription();
  if (!pushSub) return { ok: false, error: "Not currently subscribed." };

  const { error } = await supabase.from("push_subscriptions")
    .update({
      notify_rounds: !!prefs.notifyRounds,
      notify_public_messages: !!prefs.notifyPublicMessages,
      notify_private_messages: !!prefs.notifyPrivateMessages,
    })
    .eq("player_id", playerId).eq("endpoint", pushSub.endpoint);

  return { ok: !error, error: error?.message };
}

export async function unsubscribeFromPush(playerId) {
  const registration = await navigator.serviceWorker.getRegistration();
  const pushSub = await registration?.pushManager.getSubscription();
  if (pushSub) {
    await supabase.from("push_subscriptions").delete().eq("player_id", playerId).eq("endpoint", pushSub.endpoint);
    await pushSub.unsubscribe();
  }
  return { ok: true };
}
