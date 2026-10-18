// Service Worker — تثبيت كتطبيق + Web Push تفاعلي + تخزين ذكي يخلّي الفتح أسرع.
// كل إشعار بيتوجّه للمكان المناسب جوه البرنامج لما حد يدوس عليه (حسب نوعه).
const CACHE_NAME = 'mz-platform-v3';
const META = 'mz-meta';

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== META).map((k) => caches.delete(k)));
    } catch (_) {}
    await self.clients.claim();
  })());
});

/* ================= التخزين المؤقت ================= */
// مكتبات وخطوط من CDN: أول مرة من النت وبعدها فورًا من الجهاز
const STATIC_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

async function putSafe(cache, key, res) { try { if (res && (res.ok || res.type === 'opaque')) await cache.put(key, res.clone()); } catch (_) {} }

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                       // الكتابة (POST...) تروح للنت مباشرة
  let u; try { u = new URL(req.url); } catch (_) { return; }
  if (u.protocol !== 'https:' && u.hostname !== 'localhost') return;
  if (u.hostname.endsWith('.supabase.co')) return;        // بيانات Supabase الحيّة: ما نلمسهاش أبدًا

  // 1) مكتبات/خطوط CDN: من الكاش فورًا + تحديث في الخلفية
  if (STATIC_HOSTS.includes(u.hostname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(req);
      const net = fetch(req).then((r) => { putSafe(cache, req, r); return r; }).catch(() => null);
      if (hit) { event.waitUntil(net); return hit; }
      return (await net) || Response.error();
    })());
    return;
  }

  if (u.origin !== self.location.origin) return;

  // 2) فتح الصفحة: النت الأول (دايمًا أحدث نسخة)، ولو بطيء/مقطوع (3 ثواني) ناخد آخر نسخة محفوظة
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const key = u.origin + u.pathname;                  // ?resume=1 و?go= ما يغيّروش المفتاح
      const net = fetch(req).then((r) => { if (r && r.ok) putSafe(cache, key, r); return r; });
      try {
        return await Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 3000))]);
      } catch (_) {
        const hit = (await cache.match(key)) || (await cache.match(u.origin + '/'));
        if (hit) { event.waitUntil(net.catch(() => {})); return hit; }
        return net.catch(() => Response.error());
      }
    })());
    return;
  }

  // 3) أيقونات وصور وملفات ثابتة من نفس الموقع: من الكاش + تحديث في الخلفية
  if (/\.(png|jpg|jpeg|webp|svg|ico|woff2?|css|json)$/i.test(u.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(req);
      const net = fetch(req).then((r) => { putSafe(cache, req, r); return r; }).catch(() => null);
      if (hit) { event.waitUntil(net); return hit; }
      return (await net) || Response.error();
    })());
  }
});

/* ================= كود المدرس الحالي ================= */
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

/* ================= الإشعارات التفاعلية: كل نوع يفتح مكانه ================= */
// الـtag بيتبعت من السيرفر ببادئة تحدد النوع (notif-12, chat-5, new-student-9 ...)
function goFromTag(tag) {
  tag = String(tag || '');
  if (tag.startsWith('wizard-resume')) return { t: 'wizard' };
  if (tag.startsWith('notif-')) return { t: 'student_notifs' };
  if (tag.startsWith('chat-') || tag.startsWith('report-')) return { t: 'admin_tab', tab: 'gchat' };
  if (tag.startsWith('photo-') || tag.startsWith('name-')) return { t: 'admin_tab', tab: 'reviews' };
  if (tag.startsWith('transfer-') || tag.startsWith('phonechg-') || tag.startsWith('dup-') || tag.startsWith('new-student-')) return { t: 'admin_tab', tab: 'students' };
  if (tag.startsWith('new-teacher-')) return { t: 'owner' };
  if (tag.startsWith('cert-') || tag.startsWith('quiz-') || tag.startsWith('absence-')) return { t: 'parent' };
  return null;
}

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; }
  catch (_) { d = { title: 'إشعار جديد', body: event.data ? event.data.text() : '' }; }
  const tag = d.tag || ('n-' + Date.now());
  event.waitUntil((async () => {
    await self.registration.showNotification(d.title || 'إشعار جديد', {
      body: d.body || '',
      icon: '/icon-192.png',
      badge: '/badge.png',
      tag: tag,
      renotify: true,
      vibrate: [120, 60, 120],
      timestamp: Date.now(),
      dir: 'rtl',
      lang: 'ar',
      data: { url: d.url || '', go: d.go || goFromTag(tag), tag: tag }
    });
    await mzUpdateBadge();
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const nd = event.notification.data || {};
  const given = nd.url || '';
  const go = nd.go || goFromTag(nd.tag);
  event.waitUntil((async () => {
    await mzUpdateBadge();
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // التطبيق مفتوح: نركّز عليه ونوجّهه للمكان من جوه من غير ما نعيد تحميله
    if (list.length) {
      const c = list.find((x) => x.visibilityState === 'visible') || list[0];
      try { if ('focus' in c) await c.focus(); } catch (_) {}
      if (go) { try { c.postMessage({ type: 'mz-go', go: go }); } catch (_) {} }
      return;
    }
    // التطبيق مقفول: نفتحه على منصة المدرس ومعاه المكان المطلوب
    let url = given;
    if (!url || url === './') { const t = await mzTenant(); url = t ? '/' + t : '/'; }
    if (go) {
      try { const x = new URL(url, self.location.origin); x.searchParams.set('go', JSON.stringify(go)); url = x.pathname + x.search; } catch (_) {}
    }
    return self.clients.openWindow(url);
  })());
});

self.addEventListener('notificationclose', (event) => { event.waitUntil(mzUpdateBadge()); });
