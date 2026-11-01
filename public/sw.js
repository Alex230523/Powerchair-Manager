/* Powerchair Football Manager: keeps the application shell available without network.
 * Only same-origin GET requests for pages and build assets are cached; API answers
 * (personal data) are never stored by the service worker. */
const CACHE = "pfm-shell-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/_next/static/") || /\.(svg|png|webmanifest)$/.test(url.pathname)) {
    // Build assets never change under the same name: cache first.
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }
  if (request.mode === "navigate") {
    // Pages: network first, the last copy when offline.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit || Response.error())),
    );
  }
});

/* B4: push notifications. The message carries no sensitive detail (the club,
 * the kind of news, a child's first name); « Présent » / « Absent » answer an
 * invitation through the same checks as the attendance page. */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const invitation = data.invitation || null;
  event.waitUntil(
    self.registration.showNotification(data.title || "Powerchair Football Manager", {
      body: data.body || "",
      tag: data.tag || undefined,
      renotify: !!data.urgent,
      requireInteraction: !!data.urgent,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url || "/", invitation },
      actions: invitation
        ? [
            { action: "present", title: invitation.present },
            { action: "absent", title: invitation.absent },
          ]
        : [],
    }),
  );
});
function openApp(href) {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list)
      if (new URL(c.url).origin === self.location.origin && "focus" in c) return c.navigate(href).then((w) => (w || c).focus());
    return self.clients.openWindow(href);
  });
}
self.addEventListener("notificationclick", (event) => {
  const n = event.notification;
  const d = n.data || {};
  n.close();
  const url = new URL(d.url || "/", self.location.origin);
  // Only pages of the application are opened.
  const href = url.origin === self.location.origin ? url.href : self.location.origin + "/";
  const invitation = d.invitation;
  if ((event.action === "present" || event.action === "absent") && invitation) {
    event.waitUntil(
      fetch("/api/push/respond", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitationId: invitation.id, organizationId: invitation.organizationId, response: event.action }),
      })
        .then((r) =>
          r.ok
            ? self.registration.showNotification(n.title, { body: invitation.answered, tag: n.tag, icon: "/icon-192.png" })
            : self.registration.showNotification(n.title, { body: invitation.closed, tag: n.tag, icon: "/icon-192.png" }).then(() => openApp(href)),
        )
        .catch(() => openApp(href)),
    );
    return;
  }
  event.waitUntil(openApp(href));
});
