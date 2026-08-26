const CACHE = "memory-garden-shell-v1";
const SHELL = ["/", "/index.html", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/index.html")));
    return;
  }
  if (["script", "style", "font", "image"].includes(request.destination)) {
    event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
      const copy = response.clone();
      void caches.open(CACHE).then((cache) => cache.put(request, copy));
      return response;
    })));
  }
});
