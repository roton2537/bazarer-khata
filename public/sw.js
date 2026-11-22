// Keep only the public app shell/assets offline. Never cache Supabase data or Auth requests.
const SHELL = 'khai-khai-shell-v1';
const SHELL_PREFIX = 'khai-khai-shell-';
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    try {
      const page = await fetch('/', { cache: 'no-store' });
      if (page.ok) {
        const markup = await page.clone().text();
        await cache.put('/', page);
        const files = [...markup.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(m => m[1]);
        await Promise.allSettled([...new Set(['/manifest.webmanifest', '/icon.svg', ...files])].map(url => cache.add(url)));
      }
    } catch { /* Previous version can remain active if installation occurs offline. */ }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith(SHELL_PREFIX) && name !== SHELL) await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(async () => (await caches.match('/')) || Response.error()));
  } else if (url.pathname.startsWith('/assets/') || ['/manifest.webmanifest', '/icon.svg'].includes(url.pathname)) {
    event.respondWith(caches.match(req).then(async cached => {
      if (cached) return cached;
      const response = await fetch(req);
      if (response.ok) {
        const cache = await caches.open(SHELL);
        await cache.put(req, response.clone());
      }
      return response;
    }));
  }
});
// Push notifications remain independent of optional VAPID configuration.
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* malformed push */ }
  event.waitUntil(self.registration.showNotification(data.title || 'KHAI KHAI', {
    body: data.body || '', icon: '/icon.svg', badge: '/icon.svg', data: {url: data.url || '/'}, tag: data.tag,
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(self.clients.matchAll({ type: 'window' }).then(async clients => {
    for (const client of clients) if ('focus' in client) { await client.navigate(url); return client.focus(); }
    return self.clients.openWindow(url);
  }));
});
