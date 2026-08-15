import { supabase } from "./supabaseClient";

// ============================================================
// Host-side counterpart to lib/pushNotifications.js — same shape and
// same reasoning throughout (see that file's comments for the fuller
// explanation of the browser-side push mechanics and the iOS caveat),
// just keyed by user_id/host_push_subscriptions instead of player_id/
// push_subscriptions, since a host isn't a player and has no players
// row to key off of. Every host on a season (primary or co-) manages
// their own subscription independently, recognizing they're different
// people with different devices and different preferences.
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

export async function getExistingHostSubscription(userId) {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  const pushSub = await registration?.pushManager.getSubscription();
  if (!pushSub) return null;
  const { data } = await supabase.from("host_push_subscriptions").select("*").eq("user_id", userId).eq("endpoint", pushSub.endpoint).maybeSingle();
  return data;
}

export async function subscribeHostToPush(userId, gameId, prefs) {
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
    const { error } = await supabase.from("host_push_subscriptions").upsert({
      user_id: userId,
      game_id: gameId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      notify_new_confessional: !!prefs.notifyNewConfessional,
      notify_pending_player: !!prefs.notifyPendingPlayer,
    }, { onConflict: "user_id,endpoint" });

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || "Couldn't set up notifications." };
  }
}

export async function updateHostPushPrefs(userId, prefs) {
  const registration = await navigator.serviceWorker.getRegistration();
  const pushSub = await registration?.pushManager.getSubscription();
  if (!pushSub) return { ok: false, error: "Not currently subscribed." };

  const { error } = await supabase.from("host_push_subscriptions")
    .update({
      notify_new_confessional: !!prefs.notifyNewConfessional,
      notify_pending_player: !!prefs.notifyPendingPlayer,
    })
    .eq("user_id", userId).eq("endpoint", pushSub.endpoint);

  return { ok: !error, error: error?.message };
}

export async function unsubscribeHostFromPush(userId) {
  const registration = await navigator.serviceWorker.getRegistration();
  const pushSub = await registration?.pushManager.getSubscription();
  if (pushSub) {
    await supabase.from("host_push_subscriptions").delete().eq("user_id", userId).eq("endpoint", pushSub.endpoint);
    await pushSub.unsubscribe();
  }
  return { ok: true };
}
