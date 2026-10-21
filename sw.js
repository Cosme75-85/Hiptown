// Service worker de l'application téléphone (PWA).
// Stratégie « réseau d'abord » : on charge toujours la dernière version du site,
// et on ne sert la copie gardée en cache que si le téléphone est hors ligne.
// Ainsi, chaque mise à jour du portail arrive immédiatement dans l'app.
// Seuls les fichiers du portail lui-même sont concernés : Firebase, Apps Script
// et les autres sites passent directement, sans jamais être mis en cache.

const CACHE = "hiptown-v1";

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;

  event.respondWith(
    fetch(req, { cache: "no-cache" })
      .then(function (res) {
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      })
      .catch(function () {
        return caches.match(req, { ignoreSearch: req.mode === "navigate" }).then(function (hit) {
          if (hit) return hit;
          if (req.mode === "navigate") {
            return caches.match(new URL("./", self.registration.scope).href).then(function (home) {
              return home || new Response(
                "<!doctype html><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
                + "<body style='font-family:-apple-system,sans-serif;text-align:center;padding:48px 24px;color:#1e1847'>"
                + "<h2>Pas de connexion</h2><p>Vérifiez votre connexion internet, puis rouvrez l'application.</p></body>",
                { headers: { "Content-Type": "text/html; charset=utf-8" } }
              );
            });
          }
          return Response.error();
        });
      })
  );
});

// ── Notifications de la messagerie (envoyées par reservation/Messagerie.gs) ──
// Le nombre affiché sur l'icône de l'application est gardé dans le cache : la page
// l'écrit (messagerie.js), et chaque notification reçue l'augmente de 1.
const BADGE_KEY = "./__badge";

async function readBadge() {
  try {
    const hit = await (await caches.open(CACHE)).match(BADGE_KEY);
    return hit ? (Number(await hit.text()) || 0) : 0;
  } catch (err) { return 0; }
}

async function writeBadge(n) {
  try { await (await caches.open(CACHE)).put(BADGE_KEY, new Response(String(n))); } catch (err) { /* rien */ }
  try {
    if (n > 0 && self.navigator.setAppBadge) await self.navigator.setAppBadge(n);
    else if (self.navigator.clearAppBadge) await self.navigator.clearAppBadge();
  } catch (err) { /* non pris en charge */ }
}

self.addEventListener("push", function (event) {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (err) { payload = {}; }
  const d = payload.data || payload; // format de Firebase Cloud Messaging : { data: {...} }
  event.waitUntil((async function () {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const visible = windows.some(function (w) { return w.visibilityState === "visible"; });
    // Portail ouvert à l'écran : il met déjà à jour la pastille et la discussion
    if (!visible) await writeBadge((await readBadge()) + 1);
    // L'iPhone exige une notification à chaque envoi ; ailleurs, inutile si le portail est à l'écran
    const isIOS = /iPad|iPhone|iPod|Macintosh/.test(self.navigator.userAgent || "");
    if (visible && !isIOS) return;
    await self.registration.showNotification(d.title || "Hiptown", {
      body: d.body || "Nouveau message",
      tag: d.tag || "messagerie",
      renotify: true,
      icon: "icons/icon-192.png",
      badge: "icons/favicon-32.png",
      data: { url: d.url || "./#messagerie" }
    });
  })());
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "./#messagerie", self.registration.scope).href;
  event.waitUntil((async function () {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = windows.find(function (w) { return w.url.indexOf(self.registration.scope) === 0; });
    if (open) {
      await open.focus();
      open.postMessage({ hiptown: "open-messagerie" });
      return;
    }
    await self.clients.openWindow(url);
  })());
});
