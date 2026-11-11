/* Aula Gamificada · service worker: usar las clases sin internet cuando la página se abre por https.
   · Imágenes y fuentes: primero lo guardado (rápido).  · Páginas, scripts y estilos: primero la red
   (así las actualizaciones llegan), y si no hay internet o va muy lenta, lo guardado en el equipo.
   · No toca nada de otros sitios (p. ej. el servidor de Google). */
var CACHE = 'aula-offline-v1';
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
function guarda(r, x) { if (x && x.ok && x.status === 200) { var c = x.clone(); caches.open(CACHE).then(function (ca) { ca.put(r, c); }); } return x; }
function enCache(r) { return caches.match(r, { ignoreSearch: true }); }
function primeroCache(r) { return enCache(r).then(function (m) { return m || fetch(r).then(function (x) { return guarda(r, x); }); }); }
function primeroRed(r) {
  return new Promise(function (ok) {
    var listo = false, fin = function (x) { if (!listo && x) { listo = true; ok(x); } };
    var t = setTimeout(function () { enCache(r).then(fin); }, 4500);          /* red muy lenta → lo guardado */
    fetch(r).then(function (x) { clearTimeout(t); guarda(r, x); fin(x); })
      .catch(function () { clearTimeout(t); enCache(r).then(function (m) { if (!listo) { listo = true; ok(m || Response.error()); } }); });
  });
}
self.addEventListener('fetch', function (e) {
  var r = e.request; if (r.method !== 'GET') return;
  var u = new URL(r.url); if (u.origin !== self.location.origin) return;
  e.respondWith(/\.(png|webp|gif|jpe?g|svg|woff2?|ico)$/i.test(u.pathname) ? primeroCache(r) : primeroRed(r));
});
