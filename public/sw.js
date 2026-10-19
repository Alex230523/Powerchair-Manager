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
