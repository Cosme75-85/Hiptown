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
