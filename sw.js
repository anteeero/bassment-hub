/* Bassment Hub — service worker.
   La pagina arriva dalla rete se risponde entro 2,5 s (così gli aggiornamenti arrivano subito),
   altrimenti dalla copia salvata: l'app si apre anche offline.
   Notifiche: il server manda una "spinta" vuota; qui si chiede all'API cosa c'è di nuovo e lo si mostra. */
const VERSION = "hub-v2";
const KEEP = ["hub-config"];
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/badge-96.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && !KEEP.includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function networkFirst(req, timeoutMs) {
  return new Promise(resolve => {
    let done = false;
    const fromCache = () => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("./index.html"));
    const t = setTimeout(() => { if (!done) fromCache().then(r => { if (r && !done) { done = true; resolve(r); } }); }, timeoutMs);
    fetch(req).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      if (!done) { done = true; clearTimeout(t); resolve(res); }
    }).catch(() => fromCache().then(r => { if (!done) { done = true; clearTimeout(t); resolve(r || Response.error()); } }));
  });
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) { e.respondWith(networkFirst(req, 2500)); return; }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res; })));
  }
});

/* ---------- notifiche ---------- */
async function readCfg() { const c = await caches.open("hub-config"); const r = await c.match("config"); return r ? r.json() : {}; }
async function writeCfg(cfg) { const c = await caches.open("hub-config"); await c.put("config", new Response(JSON.stringify(cfg), { headers: { "Content-Type": "application/json" } })); }
const ICON = "icons/icon-192.png", BADGE = "icons/badge-96.png";

async function onPush() {
  const cfg = await readCfg();
  let items = [];
  try {
    if (!cfg.api) throw new Error("no api");
    const r = await fetch(cfg.api, { method: "POST", body: JSON.stringify({ fn: "pushInbox", args: [cfg.since || Date.now() - 36e5] }), redirect: "follow", cache: "no-store" });
    const j = JSON.parse(await r.text());
    if (!j.ok) throw new Error(j.error);
    items = j.data.items || [];
    if (items.length) { cfg.since = Math.max(...items.map(i => i.t)); await writeCfg(cfg); }
  } catch (e) {
    return self.registration.showNotification("Bassment Hub", { body: "Ci sono novità: apri l'app per vederle.", icon: ICON, badge: BADGE, tag: "hub-generic", data: { view: "oggi" } });
  }
  if (!items.length) return self.registration.showNotification("Bassment Hub", { body: "Tutto aggiornato.", icon: ICON, badge: BADGE, tag: "hub-generic", silent: true, data: { view: "oggi" } });
  for (const it of items) await self.registration.showNotification(it.title, { body: it.body, icon: ICON, badge: BADGE, tag: "hub-" + it.id, timestamp: it.t, data: { view: it.view || "oggi" } });
}
self.addEventListener("push", e => { e.waitUntil(onPush()); });

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const view = (e.notification.data && e.notification.data.view) || "oggi";
  const target = new URL("./#" + view, self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const w = list.find(c => c.url.startsWith(self.registration.scope));
    if (w) return w.focus().then(c => (c && c.navigate ? c.navigate(target) : null)).catch(() => self.clients.openWindow(target));
    return self.clients.openWindow(target);
  }));
});
