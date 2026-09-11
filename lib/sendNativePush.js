import admin from "firebase-admin";
import { createClient } from "@supabase/supabase-js";

// ============================================================
// Native push delivery for the wrapped iOS/Android app — the
// counterpart to lib/sendPush.js's Web Push delivery, called
// alongside it (see that file's own sendPushToGame/sendPushToPlayers,
// which now invoke this too) rather than instead of it, since the two
// systems serve genuinely different players: someone using the web
// version in a browser tab needs Web Push, someone using the wrapped
// native app needs this instead, and there's no way to know which
// without just trying both — each targets its own separate table
// (push_subscriptions vs native_push_tokens) and silently sends
// nothing to whichever one has no matching rows.
//
// Uses Firebase Cloud Messaging as a single delivery layer for BOTH
// iOS and Android, rather than talking to APNs directly — this is the
// standard approach for exactly this situation (Capacitor's own docs
// recommend it): FCM forwards to APNs on Apple's behalf once an iOS
// app's own APNs key is uploaded to the Firebase project's settings,
// so this code never needs two separate provider integrations.
//
// Requires a Firebase project's service account credentials in the
// environment (FIREBASE_SERVICE_ACCOUNT_JSON, the full JSON key
// downloaded from Firebase Console -> Project Settings -> Service
// Accounts -> Generate New Private Key, as a single-line env var) —
// gracefully degrades to a no-op with a console warning if missing,
// same pattern as lib/sendPush.js's own VAPID check and
// lib/games/stockMarketData.js's FINNHUB_API_KEY, rather than crashing
// a notification path that already has a working web-push fallback.
// ============================================================

let configured = false;
function ensureConfigured() {
  if (configured) return admin;
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) {
    console.warn("Missing FIREBASE_SERVICE_ACCOUNT_JSON — native push (wrapped app) won't send. Web Push to browser players is unaffected.");
    return null;
  }
  try {
    if (admin.apps.length === 0) {
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json)) });
    }
    configured = true;
    return admin;
  } catch (err) {
    console.error("Failed to initialize Firebase Admin — check FIREBASE_SERVICE_ACCOUNT_JSON's format.", err.message);
    return null;
  }
}

async function deliver(admin, adminClient, subs, { title, body, url, tag }) {
  const staleIds = [];
  await Promise.all(subs.map(async (sub) => {
    try {
      await admin.messaging().send({
        token: sub.token,
        notification: { title, body },
        data: { url: url || "", tag: tag || "" },
        apns: { payload: { aps: { sound: "default" } } },
      });
    } catch (err) {
      // Same dead-token cleanup reasoning as lib/sendPush.js's own
      // 404/410 handling for Web Push — these two specific FCM error
      // codes mean the token is gone for good (app uninstalled, token
      // rotated), not a transient failure worth logging as an error.
      if (err.code === "messaging/registration-token-not-registered" || err.code === "messaging/invalid-registration-token") {
        staleIds.push(sub.id);
      } else {
        console.error("Native push send failed:", sub.id, err.code || err.message);
      }
    }
  }));
  if (staleIds.length > 0) await adminClient.from("native_push_tokens").delete().in("id", staleIds);
}

export async function sendNativePushToGame(gameId, { title, body, url, tag, filterColumn, excludePlayerId }) {
  const admin = ensureConfigured();
  if (!admin) return;

  const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  let query = adminClient.from("native_push_tokens").select("*").eq("game_id", gameId).eq(filterColumn, true);
  if (excludePlayerId) query = query.neq("player_id", excludePlayerId);

  const { data: subs, error } = await query;
  if (error || !subs || subs.length === 0) return;
  await deliver(admin, adminClient, subs, { title, body, url, tag });
}

export async function sendNativePushToPlayers(playerIds, { title, body, url, tag, filterColumn, excludePlayerId }) {
  const admin = ensureConfigured();
  if (!admin || playerIds.length === 0) return;

  const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const targets = excludePlayerId ? playerIds.filter((id) => id !== excludePlayerId) : playerIds;
  if (targets.length === 0) return;

  const { data: subs, error } = await adminClient
    .from("native_push_tokens").select("*").in("player_id", targets).eq(filterColumn, true);
  if (error || !subs || subs.length === 0) return;
  await deliver(admin, adminClient, subs, { title, body, url, tag });
}
