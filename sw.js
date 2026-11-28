// Speichert die App und die letzten Meldungen, damit sie auch ohne Netz öffnet.
const LAGER = "newsradar-11";
const HUELLE = ["./", "index.html", "app.css", "app.js", "modus.js", "manifest.webmanifest", "icon-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(LAGER).then(c => c.addAll(HUELLE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== LAGER).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  // Videos sind groß: nicht im Gerät ablegen, immer frisch aus dem Netz
  if (u.pathname.endsWith(".film")) return;
  const schluessel = u.origin + u.pathname;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const k = r.clone(); caches.open(LAGER).then(c => c.put(schluessel, k)); }
    return r;
  }).catch(async () => {
    const r = await caches.match(schluessel);
    if (!r) return Response.error();
    const h = new Headers(r.headers); h.set("X-Offline", "1");
    return new Response(r.body, { status: 200, headers: h });
  }));
});
