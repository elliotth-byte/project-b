import { isNativeApp } from "./nativePush";

// ─── Native app bootstrapping (wrapped iOS/Android app only) ───
// Called once from pages/_app.jsx. Does nothing in a regular browser.
//
// 1. Links with target="_blank" (Terms, What's New, the host's Big Screen
//    link): inside the app, iOS would otherwise throw these out to the
//    Safari app, leaving the player outside the game. Instead they open
//    in an in-app browser sheet with a Done button
//    (@capacitor/browser → SFSafariViewController / Chrome Custom Tabs).
//    Plain links to other websites are already handed to the system
//    browser by Capacitor itself, so they're left alone here.
//
// 2. Tapping a push notification: the notification carries a `url`
//    (e.g. /play?game=…, see pages/api/push/*). The browser version
//    handles this in public/sw.js's notificationclick; this is the
//    native equivalent.
//
// 3. FCM token refresh: Firebase occasionally rotates a device's token.
//    When it does, any rows saved under the old token are updated so
//    pushes keep arriving.

let initialized = false;

export async function initNativeApp(router) {
  if (initialized || !isNativeApp()) return;
  initialized = true;

  document.addEventListener("click", onLinkClick, true);

  try {
    const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");

    await FirebaseMessaging.addListener("notificationActionPerformed", (event) => {
      const url = event?.notification?.data?.url;
      if (!url) return;
      openInApp(url, router);
    });

    await FirebaseMessaging.addListener("tokenReceived", async ({ token }) => {
      if (!token) return;
      const previous = safeGet("nativePushToken");
      safeSet("nativePushToken", token);
      if (previous && previous !== token) {
        const { supabase } = await import("./supabaseClient");
        await supabase.from("native_push_tokens").update({ token }).eq("token", previous);
      }
    });
  } catch (err) {
    console.warn("Native push listeners not set up:", err?.message);
  }
}

function onLinkClick(event) {
  if (event.defaultPrevented || event.button !== 0) return;
  const anchor = event.target?.closest?.("a[href]");
  if (!anchor || anchor.target !== "_blank") return;
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) return;

  event.preventDefault();
  const url = new URL(href, window.location.href).toString();
  import("@capacitor/browser")
    .then(({ Browser }) => Browser.open({ url, presentationStyle: "popover" }))
    .catch(() => { window.location.href = url; });
}

function openInApp(url, router) {
  try {
    const target = new URL(url, window.location.origin);
    if (target.origin === window.location.origin) {
      const path = target.pathname + target.search + target.hash;
      if (router) router.push(path);
      else window.location.assign(path);
    }
  } catch {
    // Malformed URL in the payload — ignore rather than navigate somewhere odd.
  }
}

function safeGet(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function safeSet(key, value) {
  try { window.localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}
