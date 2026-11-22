// Cuadra · service worker mínimo
// Solo hace dos cosas, a propósito:
//   1. Guarda una página «Sin conexión» para mostrarla si se cae la señal al abrir la app.
//   2. Guarda los íconos y archivos estáticos (con hash en el nombre) para que la app abra rápido.
// Los pedidos y montos NUNCA se guardan en caché: siempre se piden a la base, para no
// mostrar cifras viejas como si fueran actuales.
const VERSION = 'cuadra-v1';
const PRECARGA = ['/sin-conexion.html', '/logo.svg', '/iconos/icono-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECARGA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Navegación: siempre a la red; si no hay señal, la página «Sin conexión»
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/sin-conexion.html')));
    return;
  }

  // Estáticos propios con nombre inmutable: primero caché
  if (url.origin === self.location.origin &&
      (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/iconos/'))) {
    e.respondWith(
      caches.match(req).then(
        (r) => r || fetch(req).then((res) => {
          const copia = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copia));
          return res;
        }),
      ),
    );
  }
});
