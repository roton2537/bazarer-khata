// পুশ নোটিফিকেশন গ্রহণ। অ্যাপ-শেল ক্যাশ করা হয় না (সবসময় সর্বশেষ হিসাব দেখাতে)।
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* ignore */ }
  event.waitUntil(self.registration.showNotification(data.title || 'বাজারের খাতা', {
    body: data.body || '', icon: '/icon.svg', badge: '/icon.svg', data: { url: data.url || '/' }, tag: data.tag,
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => {
    for (const c of cs) { if ('focus' in c) { c.navigate(url); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
