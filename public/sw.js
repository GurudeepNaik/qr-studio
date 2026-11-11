// QR Studio's service worker: the whole app runs in the browser, so once opened it keeps working offline.
// Bump VERSION to drop old caches after a change to this file.
const VERSION = "qr-v1";
const SHELL = ["/", "/icon-192.png", "/icon-512.png", "/icon.svg"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin || url.pathname.startsWith("/_vercel/")) return;

  // Build files have content hashes in their names, so a cached copy is always right.
  if (url.pathname.startsWith("/_next/static/") || /^\/icon[-.\w]*\.(png|svg)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(hit => hit || fetch(request).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(cache => cache.put(request, copy)); }
        return res;
      })),
    );
    return;
  }

  // Pages: the network first for the latest version, the saved copy when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok && url.pathname === "/") { const copy = res.clone(); caches.open(VERSION).then(cache => cache.put("/", copy)); }
          return res;
        })
        .catch(() => caches.match("/")),
    );
  }
});
