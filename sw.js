/* Kitobim — offline ishlash. Yangi versiya chiqarganda VERSION ni o'zgartiring. */
const VERSION = "kitobim-v22";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/maskable-512.png", "./icons/apple-touch-icon.png", "./icons/favicon-32.png", "./icons/icon.svg"];
self.addEventListener("install", e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== VERSION).map(x => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const r = e.request; if (r.method !== "GET") return;
  const u = new URL(r.url); if (/script\.google|drive\.google|docs\.google|googleusercontent|cdn\.jsdelivr/.test(u.hostname) || r.headers.has("range")) return;   // audio/PDF va server so'rovlari keshlanmaydi
  if (r.mode === "navigate") { e.respondWith(fetch(r).then(x => { const c = x.clone(); caches.open(VERSION).then(k => k.put("./index.html", c)); return x; }).catch(() => caches.match("./index.html"))); return; }
  e.respondWith(caches.match(r).then(h => h || fetch(r).then(x => { if (x.ok || x.type === "opaque") { const c = x.clone(); caches.open(VERSION).then(k => k.put(r, c)); } return x; }).catch(() => h)));
});
