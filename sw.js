// Service Worker — يخلي الموقع قابل للتثبيت كتطبيق + يستقبل إشعارات Web Push حتى لو التطبيق مقفول.
// نفس منطق الإشعارات القديم، مع إضافة: يفتكر منصة المدرس (/كود) عشان الضغط على الإشعار يفتح منصته.
const CACHE_NAME = 'mz-platform-v2';
const META = 'mz-meta';

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });

// نمرر كل طلب زي ما هو من الإنترنت (من غير تخزين مؤقت) عشان منعملش مشاكل مع بيانات Supabase الحيّة.
self.addEventListener('fetch', (event) => { event.respondWith(fetch(event.request)); });

// الصفحة بتبعتلنا كود المدرس الحالي
self.addEventListener('message', (event) => {
  const d = event.data || {};
  if (d.type === 'tenant' && typeof d.slug === 'string' && /^[a-z][a-z0-9-]{2,29}$/i.test(d.slug)) {
    event.waitUntil(caches.open(META).then((c) => c.put('/__tenant', new Response(d.slug))));
  }
});
async function mzTenant() {
  try { const r = await (await caches.open(META)).match('/__tenant'); return r ? (await r.text()) : ''; }
  catch (_) { return ''; }
}

// الرقم على أيقونة التطبيق = عدد الإشعارات الظاهرة حاليًا
async function mzUpdateBadge() {
  try {
    const list = await self.registration.getNotifications();
    if (list.length > 0) {
      if (self.navigator && self.navigator.setAppBadge) await self.navigator.setAppBadge(list.length);
    } else if (self.navigator && self.navigator.clearAppBadge) {
      await self.navigator.clearAppBadge();
    }
  } catch (_) {}
}

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; }
  catch (_) { d = { title: 'إشعار جديد', body: event.data ? event.data.text() : '' }; }
  event.waitUntil((async () => {
    await self.registration.showNotification(d.title || 'إشعار جديد', {
      body: d.body || '',
      icon: '/icon-192.png',
      badge: '/badge.png',
      tag: d.tag || ('n-' + Date.now()),
      renotify: true,
      vibrate: [120, 60, 120],
      timestamp: Date.now(),
      dir: 'rtl',
      lang: 'ar',
      data: { url: d.url || '' }
    });
    await mzUpdateBadge();
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const given = (event.notification.data && event.notification.data.url) || '';
  event.waitUntil((async () => {
    await mzUpdateBadge();
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) { if ('focus' in c) return c.focus(); }
    let url = given;
    if (!url || url === './') { const t = await mzTenant(); url = t ? '/' + t : '/'; }
    return self.clients.openWindow(url);
  })());
});

self.addEventListener('notificationclose', (event) => { event.waitUntil(mzUpdateBadge()); });
