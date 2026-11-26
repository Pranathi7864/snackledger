/* SnackLedger service worker: offline app shell + best-effort background sync of the salesman outbox. Never caches /api/*. */
'use strict';
const VERSION = 'sl-shell-v11';
const SHELL = ['/', '/index.html', '/css/app.css', '/css/sales.css', '/css/desk.css', '/css/floor.css',
  '/js/core.js', '/js/i18n-base.js', '/js/offline.js', '/js/views-sales.js', '/js/views-desk.js', '/js/views-floor.js', '/js/boot.js',
  '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => fetch(new Request(u, { cache: 'reload' })).then(r => { if (r.ok) return c.put(u, r); }).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('sl-shell-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const withTimeout = (p, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); }); });

self.addEventListener('fetch', ev => {
  const req = ev.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/s/')) return;       // live data and shared PDFs: network only
  if (req.mode === 'navigate') {                                                        // network first (4 s), then the cached shell: weak signal friendly
    ev.respondWith(withTimeout(fetch(req), 4000).then(r => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put('/index.html', copy)); } return r; })
      .catch(() => caches.match('/index.html').then(r => r || caches.match('/'))));
    return;
  }
  // static assets: network first (3 s) so updates show immediately when online; the cache is used when offline / weak signal
  ev.respondWith(withTimeout(fetch(req), 3000).then(r => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return r; })
    .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req))));
});

// ---------- background sync (Chrome/Android). The page does the same job when it is open. ----------
function idb() {
  return new Promise((res, rej) => { const r = indexedDB.open('snackledger', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onupgradeneeded = () => { r.transaction.abort(); rej(new Error('no db')); }; });
}
const rq = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function pushOutbox(db, storeName, path, key, username, csrf) {
  const all = (await rq(db.transaction(storeName).objectStore(storeName).getAll())).filter(e => e.status === 'PENDING' && String(e.username).toLowerCase() === username);
  if (!all.length) return 0;
  const res = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ [key]: all.slice(0, 50).map(e => e.payload) }) });
  if (!res.ok) throw new Error('sync http ' + res.status);
  const results = (await res.json()).results, by = new Map(results.map(r => [r.clientId, r]));
  const t = db.transaction(storeName, 'readwrite'), st = t.objectStore(storeName); let sent = 0;
  for (const e of all) { const r = by.get(e.clientId); if (!r) continue; if (r.ok) { st.delete(e.clientId); sent++; } else if (r.status && r.status < 500) { e.status = 'FAILED'; e.error = r.error; st.put(e); } }
  await new Promise((ok, no) => { t.oncomplete = ok; t.onerror = () => no(t.error); });
  return sent;
}
self.addEventListener('sync', ev => {
  if (ev.tag !== 'sl-sync') return;
  ev.waitUntil((async () => {
    const db = await idb();
    const s = await rq(db.transaction('meta').objectStore('meta').get('session'));
    if (!s || !s.value || !s.value.csrf) return;                  // needs the page to sign in again; page-based sync takes over
    const u = s.value.username;
    const n = (await pushOutbox(db, 'ordersOutbox', '/api/orders/sync', 'orders', u, s.value.csrf)) + (await pushOutbox(db, 'visitsOutbox', '/api/visits/sync', 'visits', u, s.value.csrf));
    if (n) for (const c of await self.clients.matchAll()) c.postMessage({ type: 'sl-synced', sent: n });
  })());
});
