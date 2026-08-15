// ============================================================
// Service worker for push notifications. This is the piece that lets a
// notification actually show up even when the app isn't open — the
// browser wakes this file up in the background when a push arrives,
// completely separately from any open tab.
//
// Deliberately minimal — this app has no offline-caching needs, so this
// file's only job is push + notification click handling, not a full PWA
// asset cache.
// ============================================================

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    payload = { title: "Project B", body: event.data.text() };
  }

  const { title, body, url, tag } = payload;
  // No dedicated app icon exists in this project (no favicon.ico or
  // similar), and using one specific player's avatar as a stand-in for
  // the whole app would be an arbitrary, confusing choice — omitting
  // icon/badge entirely is valid per the Notifications API and just
  // falls back to the browser's own default appearance.
  event.waitUntil(
    self.registration.showNotification(title || "Project B", {
      body: body || "",
      tag: tag || "project-b",
      data: { url: url || "/" },
    })
  );
});

// Clicking the notification focuses an already-open tab for this app if
// one exists, rather than always opening a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(new URL(targetUrl, self.location.origin).pathname) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
