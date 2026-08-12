self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('ppt-viewer-pwa').then((cache) => {
      return cache.addAll([
        '/controller.html',
        '/css/styles.css',
        '/js/controller.js'
      ]);
    })
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});
