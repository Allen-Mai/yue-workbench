/* ==========================================================================
   sw.js · Service Worker：离线缓存 + 系统级推送（push 事件）
   ========================================================================== */

const VERSION = 'ywb-v10.0.0';
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

/** 预缓存：应用外壳（构建产物文件名带 hash，只预缓存稳定入口） */
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon-180.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await Promise.allSettled(PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)),
      );
      if (self.registration.navigationPreload) {
        try { await self.registration.navigationPreload.disable(); } catch { /* ignore */ }
      }
      await self.clients.claim();
    })(),
  );
});

/** 缓存优先（静态资源）/ 网络优先（导航与接口） */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;      // 跨域（Supabase/图片）不缓存
  if (url.pathname.startsWith('/api/')) return;          // 接口实时

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put('./index.html', fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match('./index.html');
          return cached ?? new Response('离线中，请联网后重试 🌿', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) {
        // 后台静默更新
        fetch(req)
          .then((res) => { if (res.ok) caches.open(RUNTIME_CACHE).then((c) => c.put(req, res.clone())); })
          .catch(() => undefined);
        return cached;
      }
      try {
        const res = await fetch(req);
        if (res.ok && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/'))) {
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(req, res.clone());
        }
        return res;
      } catch (err) {
        return new Response('', { status: 504 });
      }
    })(),
  );
});

/* ------------------------------ 系统级推送 ------------------------------ */
self.addEventListener('push', (event) => {
  let payload = { title: '月月的工作台', body: '有一件事需要你处理 🌿', url: './index.html#/hub', tag: 'ywb' };
  try {
    if (event.data) {
      const data = event.data.json();
      payload = { ...payload, ...data };
    }
  } catch {
    try { payload.body = event.data ? event.data.text() : payload.body; } catch { /* ignore */ }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      image: payload.image,
      tag: payload.tag || 'ywb',
      renotify: true,
      requireInteraction: !!payload.requireInteraction,
      lang: 'zh-CN',
      vibrate: [90, 40, 90],
      data: { url: payload.url || './index.html#/hub' },
      actions: payload.actions || [{ action: 'open', title: '去处理' }],
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './index.html#/hub';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if ('focus' in client) {
          client.postMessage({ type: 'navigate', url: target });
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});

self.addEventListener('notificationclose', () => { /* 忽略 */ });

/** 页面主动要求显示通知（兜底：某些浏览器后台时会走这里） */
self.addEventListener('message', (event) => {
  const data = event.data;
  if (data && data.type === 'notify') {
    self.registration.showNotification(data.title || '月月的工作台', {
      body: data.body || '',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: data.tag || 'ywb',
      lang: 'zh-CN',
      data: { url: data.url || './index.html#/hub' },
    });
  }
  if (data && data.type === 'skip-waiting') self.skipWaiting();
});
