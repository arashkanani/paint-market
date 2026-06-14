/* PAINTIK — minimal service worker for installable PWA (standalone / no URL bar) */
const CACHE = "paintik-shell-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(["/paint/", "/paint/manifest.webmanifest", "/paint/img/brand/paintik-icon.png"])
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/paint/api/")) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
