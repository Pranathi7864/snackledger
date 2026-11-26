/* Offline layer for the salesman phone: IndexedDB cache + outbox, offline unlock (PBKDF2 verifier, never the password), idempotent sync. */
(function () {
  'use strict';
  const SL = window.SL;
  const DB_NAME = 'snackledger', DB_VER = 1;
  const STORES = { meta: 'key', customers: 'id', products: 'id', customerPrices: 'key', ordersOutbox: 'clientId', myOrders: 'id', visitsOutbox: 'clientId' };
  const ITER = 150000;

  // ---------- tiny promise wrapper over IndexedDB ----------
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded = () => { const db = r.result; for (const [s, k] of Object.entries(STORES)) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: k }); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const store = async (name, mode) => (await open()).transaction(name, mode || 'readonly').objectStore(name);
  const idb = {
    get: async (s, k) => req((await store(s)).get(k)),
    all: async s => req((await store(s)).getAll()),
    put: async (s, v) => req((await store(s, 'readwrite')).put(v)),
    del: async (s, k) => req((await store(s, 'readwrite')).delete(k)),
    replaceAll: async (s, rows) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction(s, 'readwrite'), st = t.objectStore(s); st.clear(); rows.forEach(r => st.put(r)); t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); },
  };
  const meta = { get: async k => { const r = await idb.get('meta', k); return r ? r.value : null; }, set: (k, value) => idb.put('meta', { key: k, value }) };

  // ---------- helpers ----------
  const hex = u8 => [...u8].map(b => b.toString(16).padStart(2, '0')).join('');
  const unhex = s => new Uint8Array(s.match(/../g).map(h => parseInt(h, 16)));
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128; const x = hex(b);
    return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
  }
  const localIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19);
  const lc = s => String(s || '').toLowerCase();
  async function derive(password, salt, iterations) {
    const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, km, 256));
  }
  const sameBytes = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; };
  const emit = () => window.dispatchEvent(new CustomEvent('sl:outbox'));
  const isSales = () => SL.state.user && SL.state.user.role === 'SALES';
  const me = () => lc(SL.state.user && SL.state.user.username);

  // ---------- cached master data ----------
  async function refreshMaster() {
    const b = await SL.get('/api/bootstrap', { quiet: true });
    await idb.replaceAll('customers', b.customers);
    await idb.replaceAll('products', b.products);
    await idb.replaceAll('customerPrices', b.customerPrices.map(p => ({ ...p, key: p.customer_id + ':' + p.product_id })));
    await meta.set('bootstrap', { business: b.business, at: Date.now() });
  }
  async function refreshOrders() {
    const rows = await SL.get('/api/orders', { quiet: true });
    const old = new Map((await idb.all('myOrders')).map(o => [o.id, o]));
    await idb.replaceAll('myOrders', rows.map(r => ({ ...r, detail: (old.get(r.id) || {}).detail || null })));
  }
  async function refreshCaches() {
    if (!navigator.onLine || !isSales()) return false;
    try { await Promise.all([refreshMaster(), refreshOrders()]); return true; } catch (e) { return false; }
  }

  // ---------- session bookkeeping ----------
  async function saveSession(csrf) { await meta.set('session', { username: me(), csrf: csrf || null }); }
  async function adoptOwner() {            // a different salesman on a shared phone must not see the previous one's cached orders
    const owner = await meta.get('owner');
    if (owner && owner !== me()) { await idb.replaceAll('myOrders', []); await meta.set('custSales', null); await meta.set('visits', null); }
    await meta.set('owner', me());
  }
  async function saveVerifier(user, password) {
    if (!(window.crypto && crypto.subtle)) return;          // plain-http LAN address: WebCrypto unavailable, so no offline unlock (documented)
    const salt = crypto.getRandomValues(new Uint8Array(16));
    await meta.set('verifier:' + lc(user.username), { salt: hex(salt), hash: hex(await derive(password, salt, ITER)), iterations: ITER });
    await meta.set('profile:' + lc(user.username), user);
  }

  // ---------- outbox ----------
  const listOrders = async () => (await idb.all('ordersOutbox')).filter(e => lc(e.username) === me()).sort((a, b) => a.createdAt - b.createdAt);
  const listVisits = async () => (await idb.all('visitsOutbox')).filter(e => lc(e.username) === me()).sort((a, b) => a.createdAt - b.createdAt);
  async function pendingCount() {
    if (!SL.state.user) return 0;
    const n = [...(await listOrders()), ...(await listVisits())].filter(e => e.status === 'PENDING' || e.status === 'FAILED').length;
    return n;
  }
  async function updateBadge() { try { SL.setBadge('s-sync', await pendingCount()); } catch (_) {} }
  async function registerBgSync() { try { const reg = await navigator.serviceWorker.ready; if (reg.sync) await reg.sync.register('sl-sync'); } catch (_) {} }
  async function queueOrder(payload, summary) {
    await idb.put('ordersOutbox', { clientId: payload.clientId, username: me(), payload, summary: summary || {}, status: 'PENDING', error: null, createdAt: Date.now() });
    await updateBadge(); emit(); registerBgSync();
  }
  async function queueVisit(v) {
    await idb.put('visitsOutbox', { clientId: v.clientId, username: me(), payload: v, status: 'PENDING', error: null, createdAt: Date.now() });
    await updateBadge(); emit(); registerBgSync();
  }
  const storeOf = kind => (kind === 'visit' ? 'visitsOutbox' : 'ordersOutbox');
  async function discard(kind, clientId) { await idb.del(storeOf(kind), clientId); await updateBadge(); emit(); }
  async function retry(kind, clientId) { const e = await idb.get(storeOf(kind), clientId); if (e) { e.status = 'PENDING'; e.error = null; await idb.put(storeOf(kind), e); } await updateBadge(); emit(); return sync({ interactive: true }); }

  // ---------- sync (single flight; every item is idempotent on the server via clientId) ----------
  let running = null, needsAuth = false;
  const sync = (opts = {}) => running || (running = doSync(opts).finally(() => { running = null; }));
  async function ensureSession(interactive) {
    if (SL.state.csrf && !SL.state.offlineSession) return true;
    try {
      const r = await SL.api('GET', '/api/auth/me', undefined, { quiet: true });
      if (lc(r.user.username) !== me()) return false;
      SL.state.csrf = r.csrf; SL.state.offlineSession = false; needsAuth = false; await saveSession(r.csrf); return true;
    } catch (e) {
      if (e.offline) throw e;
      if (e.status === 401) {
        if (!interactive) { needsAuth = true; return false; }
        try { await SL.reauth(); needsAuth = false; return true; } catch (_) { return false; }
      }
      throw e;
    }
  }
  async function postBatch(path, key, items, interactive) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try { return (await SL.api('POST', path, { [key]: items }, { quiet: true })).results; }
      catch (e) {
        if (e.offline) throw e;
        if ((e.status === 401 || e.status === 403) && attempt === 0) { SL.state.csrf = null; SL.state.offlineSession = true; if (!(await ensureSession(interactive))) return null; continue; }
        throw e;
      }
    }
    return null;
  }
  async function settle(kind, entries, results) {
    let sent = 0, failed = 0;
    const by = new Map((results || []).map(r => [r.clientId, r]));
    for (const e of entries) {
      const r = by.get(e.clientId); if (!r) continue;
      if (r.ok) { await idb.del(storeOf(kind), e.clientId); sent++; }
      else if (r.status && r.status < 500) { e.status = 'FAILED'; e.error = r.error || 'Rejected by server'; await idb.put(storeOf(kind), e); failed++; }
      else { e.error = r.error || null; await idb.put(storeOf(kind), e); }     // 5xx / unknown: stay PENDING, retry later
    }
    return { sent, failed };
  }
  async function doSync(opts) {
    if (!navigator.onLine || !isSales()) return { skipped: 'offline' };
    const orders = (await listOrders()).filter(e => e.status === 'PENDING'), visits = (await listVisits()).filter(e => e.status === 'PENDING');
    let sent = 0, failed = 0;
    if (orders.length || visits.length) {
      try { if (!(await ensureSession(opts.interactive))) { await updateBadge(); emit(); return { skipped: 'auth' }; } } catch (e) { return { skipped: 'network' }; }
      try {
        for (let i = 0; i < orders.length; i += 50) { const part = orders.slice(i, i + 50), res = await postBatch('/api/orders/sync', 'orders', part.map(e => e.payload), opts.interactive); if (!res) { await updateBadge(); return { skipped: 'auth' }; } const s = await settle('order', part, res); sent += s.sent; failed += s.failed; }
        for (let i = 0; i < visits.length; i += 50) { const part = visits.slice(i, i + 50), res = await postBatch('/api/visits/sync', 'visits', part.map(e => e.payload), opts.interactive); if (!res) { await updateBadge(); return { skipped: 'auth' }; } const s = await settle('visit', part, res); sent += s.sent; failed += s.failed; }
      } catch (e) { await updateBadge(); emit(); return { skipped: e.offline ? 'network' : 'error', error: e.message }; }
      await meta.set('lastSync', Date.now());
      if (sent && SL.ui) SL.ui.toast(SL.t('{n} saved item(s) sent to the factory', { n: sent }), 'ok');
      if (failed && SL.ui) SL.ui.toast(SL.t('{n} item(s) were rejected, see Sync', { n: failed }), 'bad');
    }
    await refreshCaches();
    await updateBadge(); emit();
    return { sent, failed };
  }

  // ---------- public API ----------
  let inited = false;
  SL.offline = {
    idb, meta, uuid, localIso, emit,
    async init() {
      if (inited) return; inited = true;
      window.addEventListener('online', () => setTimeout(() => sync({ interactive: true }), 300));
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync({ interactive: false }); });
      setInterval(() => { if (navigator.onLine) sync({ interactive: false }); }, 30000);
      if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', ev => { if (ev.data && ev.data.type === 'sl-synced') { updateBadge(); emit(); refreshCaches().then(emit); } });
      await updateBadge();
      if (isSales()) sync({ interactive: false });
    },
    async onLogin(user, password, csrf) {
      if (user.role !== 'SALES') return;
      await adoptOwner(); await saveVerifier(user, password); await saveSession(csrf);
      await refreshCaches(); await updateBadge(); sync({ interactive: false });
    },
    async onSession(user, csrf) {
      if (user.role !== 'SALES') return;
      await adoptOwner(); await meta.set('profile:' + lc(user.username), user); await saveSession(csrf);
      refreshCaches().then(emit); updateBadge(); sync({ interactive: false });
    },
    async tryOfflineLogin(username, password) {
      try {
        if (!(window.crypto && crypto.subtle)) return null;
        const u = lc(username), ver = await meta.get('verifier:' + u), prof = await meta.get('profile:' + u);
        if (!ver || !prof || prof.role !== 'SALES') return null;
        const h = await derive(password, unhex(ver.salt), ver.iterations);
        if (!sameBytes(h, unhex(ver.hash))) return null;
        setTimeout(updateBadge, 50);
        return prof;
      } catch (_) { return null; }
    },
    async onLogout() { try { await saveSession(null); } catch (_) {} SL.setBadge('s-sync', 0); },

    // data for the views
    customers: async () => (await idb.all('customers')).sort((a, b) => a.name.localeCompare(b.name)),
    products: async () => (await idb.all('products')).sort((a, b) => a.name.localeCompare(b.name)),
    async priceFor(customerId, product) { const p = await idb.get('customerPrices', customerId + ':' + product.id); return p ? p.price : product.price; },
    cachedOrders: async () => (await idb.all('myOrders')).sort((a, b) => b.id - a.id),
    refreshMaster, refreshOrders, refreshCaches,
    async cacheOrderDetail(id, detail) { const o = await idb.get('myOrders', id); if (o) { o.detail = detail; await idb.put('myOrders', o); } },
    listOrders, listVisits, queueOrder, queueVisit, discard, retry, sync, pendingCount, updateBadge,
    lastSync: () => meta.get('lastSync'), needsAuth: () => needsAuth,
    async stats() { return { customers: (await idb.all('customers')).length, products: (await idb.all('products')).length, orders: (await idb.all('myOrders')).length, pending: await pendingCount() }; },
  };
})();
