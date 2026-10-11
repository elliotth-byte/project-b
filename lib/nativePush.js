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

// Requests permission and gets a Firebase Cloud Messaging token, then
// upserts it here. Call this from the same place
// lib/pushNotifications.js's subscribeToPush already gets called from
// (see components/NotificationSettings.jsx) — gated on isNativeApp() so
// a browser player never hits this path at all.
//
// Uses @capacitor-firebase/messaging rather than
// @capacitor/push-notifications: on iOS the latter returns a raw APNs
// device token, which lib/sendNativePush.js (firebase-admin) can't send
// to. This plugin returns an FCM token on BOTH platforms, so the server
// side stays a single Firebase integration. On iOS it relies on the
// forwarding methods in ios/App/App/AppDelegate.swift.
export async function registerNativePush(playerId, gameId, prefs = {}) {
  if (!isNativeApp()) return { ok: false, error: "Not running in the native app." };
  try {
    const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");
    const { Capacitor } = await import("@capacitor/core");

    const permStatus = await FirebaseMessaging.requestPermissions();
    if (permStatus.receive !== "granted") {
      return { ok: false, error: "Notification permission was denied. You can turn it on in your phone's Settings app." };
    }

    const { token } = await FirebaseMessaging.getToken();
    if (!token) return { ok: false, error: "Couldn't get a push token from the device." };
    try { window.localStorage.setItem("nativePushToken", token); } catch { /* see lib/nativeApp.js */ }

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
  const { data, error } = await supabase.from("native_push_tokens").select("*").eq("player_id", playerId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  return data;
}
