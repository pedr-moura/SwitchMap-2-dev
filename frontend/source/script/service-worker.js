self.addEventListener('install', event => {
    event.waitUntil(
        caches.open('map-tiles-cache').then(cache => {
            return cache.addAll([
                'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
                'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
                'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'
            ]); // Adicione URLs específicas ou deixe dinâmico
        })
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request).then(fetchResponse => {
                caches.open('map-tiles-cache').then(cache => {
                    cache.put(event.request, fetchResponse.clone());
                });
                return fetchResponse;
            });
        })
    );
});