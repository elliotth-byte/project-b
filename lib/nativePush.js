import { supabase } from "./supabaseClient";

// ─── Native Push (wrapped iOS/Android app only) ───
// See sql/add-native-push-tokens.sql for the table this reads/writes,
// and lib/pushNotifications.js for the browser Web Push equivalent
// this runs ALONGSIDE, not instead of — a player using the web version
// in a regular browser tab still gets that path; this only ever
// applies inside the actual wrapped app (see isNativeApp below), where
// Web Push either doesn't apply the same way or isn't as reliable as
// a real native registration.
//
// @capacitor/push-notifications is a peer dependency, imported
// dynamically (not at module top level) specifically so this file
// doesn't break anything importing it from a normal browser context —
// there IS no native Push plugin to import outside the wrapped app,
// and a top-level import would throw immediately for every regular
// web player, not just silently no-op the way the dynamic import
// below does.
export function isNativeApp() {
  if (typeof window === "undefined") return false;
  return !!window.Capacitor?.isNativePlatform?.();
}

// Requests permission and registers for a real APNs (iOS) / FCM
// (Android) token, then upserts it here. Call this from the same
// place lib/pushNotifications.js's subscribeToPush already gets
// called from (see components/NotificationSettings.jsx) — gated on
// isNativeApp() so a browser player never hits this path at all.
export async function registerNativePush(playerId, gameId, prefs = {}) {
  if (!isNativeApp()) return { ok: false, error: "Not running in the native app." };
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const { Capacitor } = await import("@capacitor/core");

    const permStatus = await PushNotifications.requestPermissions();
    if (permStatus.receive !== "granted") {
      return { ok: false, error: "Notification permission was denied." };
    }

    await PushNotifications.register();

    // register() resolves once the OS has been asked; the actual token
    // arrives asynchronously via the 'registration' listener below, so
    // this wraps that in a promise the caller can actually await
    // instead of returning before there's a token to save.
    const token = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timed out waiting for a push token.")), 15000);
      PushNotifications.addListener("registration", (t) => {
        clearTimeout(timeout);
        resolve(t.value);
      });
      PushNotifications.addListener("registrationError", (err) => {
        clearTimeout(timeout);
        reject(new Error(err.error || "Registration failed."));
      });
    });

    const platform = Capacitor.getPlatform(); // "ios" | "android"
    const { error } = await supabase.from("native_push_tokens").upsert({
      player_id: playerId,
      game_id: gameId,
      token,
      platform,
      notify_rounds: prefs.notifyRounds ?? true,
      notify_public_messages: prefs.notifyPublicMessages ?? false,
      notify_private_messages: prefs.notifyPrivateMessages ?? true,
    }, { onConflict: "player_id,token" });

    return { ok: !error, error: error?.message };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function unregisterNativePush(playerId) {
  if (!isNativeApp()) return { ok: false };
  const { error } = await supabase.from("native_push_tokens").delete().eq("player_id", playerId);
  return { ok: !error, error: error?.message };
}

export async function updateNativePushPrefs(playerId, prefs) {
  const { error } = await supabase.from("native_push_tokens").update({
    notify_rounds: prefs.notifyRounds,
    notify_public_messages: prefs.notifyPublicMessages,
    notify_private_messages: prefs.notifyPrivateMessages,
  }).eq("player_id", playerId);
  return { ok: !error, error: error?.message };
}

export async function getExistingNativeToken(playerId) {
  const { data, error } = await supabase.from("native_push_tokens").select("*").eq("player_id", playerId).maybeSingle();
  if (error || !data) return null;
  return data;
}
