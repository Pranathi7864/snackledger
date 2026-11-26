/* SnackLedger front-end core: DOM helper, API client (CSRF), i18n, UI kit, shell + hash router. No frameworks, no CDN: works on an air-gapped LAN. */
(function () {
  'use strict';
  const SL = (window.SL = { state: { user: null, csrf: null, lang: 'en', online: navigator.onLine }, views: {}, badges: {}, i18n: { ta: {} }, offline: null });
  try { SL.state.lang = localStorage.getItem('sl.lang') || 'en'; } catch (_) {}

  // ---------- DOM helper: text is always escaped (children are text nodes, never HTML) ----------
  // Never print the word "null"/"undefined"/"false": DOM append helpers ignore empty values.
  for (const m of ['append', 'prepend', 'replaceChildren']) {
    for (const P of [Element.prototype, DocumentFragment.prototype]) {
      const orig = P[m]; P[m] = function (...a) { return orig.apply(this, a.filter(x => x !== null && x !== undefined && x !== false)); };
    }
  }
  SL.h = function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'required' || k === 'multiple') el[k] = !!v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    const add = k => { if (k === null || k === undefined || k === false) return; if (Array.isArray(k)) return k.forEach(add); el.append(k.nodeType ? k : document.createTextNode(String(k))); };
    kids.forEach(add);
    return el;
  };
  const h = SL.h;

  // ---------- i18n: English text is the key; Tamil in SL.i18n.ta (other files extend it) ----------
  SL.t = (s, vars) => { let out = (SL.state.lang === 'ta' && SL.i18n.ta[s]) || s; if (vars) for (const [k, v] of Object.entries(vars)) out = out.replace('{' + k + '}', v); return out; };
  const t = SL.t;
  SL.setLang = l => { SL.state.lang = l; try { localStorage.setItem('sl.lang', l); } catch (_) {} document.documentElement.lang = l === 'ta' ? 'ta' : 'en'; if (SL.state.user) SL.render(); else SL.showLogin(); };

  // ---------- formatting (display only; the server does all money maths with exact decimals) ----------
  SL.fmt = {
    money: v => '₹' + Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    num: (v, dp = 3) => { const n = Number(v || 0); return n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: dp }); },
    date: s => (s ? String(s).slice(0, 10).split('-').reverse().join('-') : ''),
    dt: s => (s ? String(s).slice(0, 16).replace('T', ' ').split(' ').map((p, i) => (i === 0 ? p.split('-').reverse().join('-') : p)).join(' ') : ''),
    pct: v => (v === null || v === undefined || v === '' ? '' : (Number(v) > 0 ? '+' : '') + Number(v).toFixed(1) + '%'),
    today: () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10),
    monthStart: () => SL.fmt.today().slice(0, 8) + '01',
  };

  // ---------- API ----------
  SL.api = async function api(method, path, body, opts = {}) {
    let res;
    try {
      res = await fetch(path, { method, credentials: 'same-origin', headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(SL.state.csrf ? { 'X-CSRF-Token': SL.state.csrf } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch (e) { const err = new Error(t('You are offline or the server is unreachable')); err.offline = true; throw err; }
    if (opts.raw) return res;
    const text = await res.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`); err.status = res.status; err.details = data && data.details;
      if (res.status === 401 && !opts.quiet && SL.state.user) { SL.state.user = null; SL.showLogin(t('Your session expired. Please sign in again.')); }
      throw err;
    }
    return data;
  };
  SL.get = (p, o) => SL.api('GET', p, undefined, o); SL.post = (p, b, o) => SL.api('POST', p, b === undefined ? {} : b, o); SL.put = (p, b) => SL.api('PUT', p, b); SL.patch = (p, b) => SL.api('PATCH', p, b); SL.del = p => SL.api('DELETE', p);
  SL.qs = o => { const p = Object.entries(o || {}).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`); return p.length ? '?' + p.join('&') : ''; };
  SL.open = url => window.open(url, '_blank', 'noopener');     // same-origin GET: session cookie authenticates PDFs/CSV/XLSX downloads

  // ---------- UI kit ----------
  const ui = (SL.ui = {});
  ui.toast = (msg, kind) => { let box = document.getElementById('toasts'); if (!box) { box = h('div', { id: 'toasts' }); document.body.append(box); } const el = h('div', { class: 'toast ' + (kind || '') }, msg); box.append(el); setTimeout(() => el.remove(), kind === 'bad' ? 6000 : 3200); };
  ui.err = e => ui.toast(e.message || String(e), 'bad');
  ui.modal = (title, body, opts = {}) => {
    const close = () => ov.remove();
    const ov = h('div', { class: 'overlay', onclick: ev => { if (ev.target === ov && !opts.sticky) close(); } }, h('div', { class: 'modal', style: opts.width ? { maxWidth: opts.width } : null, role: 'dialog', 'aria-label': title }, h('header', {}, h('h2', { style: { margin: 0 } }, title), h('button', { class: 'btn small', onclick: close, 'aria-label': 'Close' }, '✕')), body));
    document.body.append(ov); return { close, el: ov };
  };
  ui.confirm = msg => new Promise(res => { const m = ui.modal(t('Please confirm'), h('div', {}, h('p', {}, msg), h('div', { class: 'row mt', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn', onclick: () => { m.close(); res(false); } }, t('Cancel')), h('button', { class: 'btn primary', onclick: () => { m.close(); res(true); } }, t('Yes, continue')))), { width: '420px', sticky: true }); });
  ui.ask = (label, opts = {}) => new Promise(res => {   // text prompt (e.g. mandatory reason)
    const inp = h(opts.multiline ? 'textarea' : 'input', { placeholder: opts.placeholder || '', value: opts.value || '' }); const err = h('div', { class: 'err' });
    const ok = () => { const v = inp.value.trim(); if (opts.required !== false && !v) { err.textContent = t('This is required'); return; } m.close(); res(v); };
    const m = ui.modal(opts.title || label, h('div', {}, h('label', { class: 'f' }, label, inp), err, h('div', { class: 'row mt', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn', onclick: () => { m.close(); res(null); } }, t('Cancel')), h('button', { class: 'btn primary', onclick: ok }, opts.okLabel || t('OK')))), { width: '460px', sticky: true });
    setTimeout(() => inp.focus(), 30);
  });
  const STATUS = { SUBMITTED: ['warn', 'Waiting for approval', 'Salesman sent it. Admin must approve or reject.'], APPROVED: ['ok', 'Approved - make invoice', 'Stock is reserved. Next: create the GST invoice.'], INVOICED: ['info', 'Invoiced - ready to send', 'Invoice made. Next: dispatch the goods.'], PARTIALLY_DISPATCHED: ['warn', 'Partly sent', 'Some packets sent, the rest is still pending.'], DISPATCHED: ['ok', 'Sent to customer', 'All goods dispatched.'], REJECTED: ['bad', 'Rejected', 'Admin said no. Nothing was reserved or sent.'], CANCELLED: ['bad', 'Cancelled', 'Cancelled after invoicing (credit note).'], POSTED: ['ok', 'Active', ''], STARTED: ['warn', 'In progress', 'Materials taken from stock; output not yet entered.'], COMPLETED: ['ok', 'Completed', 'Output entered and costed.'], VOIDED: ['bad', 'Cancelled batch', 'Cancelled; stock was put back.'], PENDING: ['warn', 'Waiting to sync', ''], SYNCED: ['ok', 'Synced', ''], FAILED: ['bad', 'Failed', ''] };
  ui.statusHelp = s => (STATUS[s] ? STATUS[s][2] : '');
  ui.profit = (amount, pct, label) => { const n = Number(amount), up = n >= 0; return h('span', { class: 'pl ' + (up ? 'up' : 'down') }, up ? '▲' : '▼', ' ', (up ? t('Profit') : t('Loss')) + ' ' + SL.fmt.money(Math.abs(n).toFixed(2)), pct !== undefined && pct !== null ? ` (${pct}%)` : '', label ? h('span', { class: 'muted', style: { fontWeight: 400 } }, ' ' + label) : null); };
  ui.statusText = s => (STATUS[s] ? STATUS[s][1] : String(s));
  ui.badge = s => { const m = STATUS[s]; if (m) return h('span', { class: 'pill ' + m[0], title: m[2] }, h('i', { class: 'dot' }), t(m[1])); const label = String(s).toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); return h('span', { class: 'pill' }, t(label)); };
  ui.field = (label, input, hint) => h('label', { class: 'f' }, label, input, hint ? h('span', { class: 'muted', style: { fontWeight: 400 } }, hint) : null);
  ui.card = (title, ...kids) => h('div', { class: 'card' }, title ? h('h2', {}, title) : null, ...kids);
  ui.stat = (label, value, sub, cls) => h('div', { class: 'card stat' }, h('span', { class: 'l' }, label), h('span', { class: 'v ' + (cls || '') }, value), sub ? h('span', { class: 'muted' }, sub) : null);
  ui.empty = msg => h('div', { class: 'empty' }, msg || t('Nothing here yet.'));
  // columns: [{label, key | render(row,i), cls:'num', foot}]; opts: {onRow(row), rowClass(row), foot:true}
  ui.table = (cols, rows, opts = {}) => {
    if (!rows || !rows.length) return h('div', { class: 'tw' }, ui.empty(opts.empty));
    const cell = (c, r, i) => { const v = c.render ? c.render(r, i) : r[c.key]; return h('td', { class: c.cls || '' }, v === null || v === undefined ? '' : v); };
    return h('div', { class: 'tw' }, h('table', {}, h('thead', {}, h('tr', {}, cols.map(c => h('th', { class: c.cls || '' }, c.label)))),
      h('tbody', {}, rows.map((r, i) => h('tr', { class: (opts.onRow ? 'clickable ' : '') + ((opts.rowClass && opts.rowClass(r)) || ''), onclick: opts.onRow ? () => opts.onRow(r) : null }, cols.map(c => cell(c, r, i))))),
      opts.foot ? h('tfoot', {}, h('tr', {}, cols.map((c, i) => h('td', { class: c.cls || '' }, i === 0 ? t('Total') : (c.foot ? (typeof c.foot === 'function' ? c.foot(rows) : c.foot) : ''))))) : null));
  };
  ui.tabs = (items, initial, onChange) => { const bar = h('div', { class: 'tabs', role: 'tablist' }); const set = id => { [...bar.children].forEach(b => b.classList.toggle('on', b.dataset.id === id)); onChange(id); }; items.forEach(([id, label]) => bar.append(h('button', { dataset: { id }, role: 'tab', onclick: () => set(id) }, label))); setTimeout(() => set(initial || items[0][0]), 0); return bar; };
  ui.pagehead = (title, sub, ...actions) => h('div', { class: 'pagehead' }, h('div', {}, h('h1', {}, title), sub ? h('p', { class: 'muted' }, sub) : null), h('div', { class: 'row' }, ...actions));
  ui.dateRange = (state, onChange) => h('div', { class: 'row' }, ui.field(t('From'), h('input', { type: 'date', value: state.from, onchange: e => { state.from = e.target.value; onChange(); } })), ui.field(t('To'), h('input', { type: 'date', value: state.to, onchange: e => { state.to = e.target.value; onChange(); } })));
  ui.select = (options, value, attrs) => h('select', attrs || {}, options.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value) }, l)));
  ui.loading = () => h('div', { class: 'empty' }, t('Loading…'));
  // guard an async action behind a disabled button (prevents double submits)
  ui.busy = (btn, fn) => async (...a) => { btn = btn || a[0]?.currentTarget; if (btn) btn.disabled = true; try { return await fn(...a); } catch (e) { ui.err(e); } finally { if (btn) btn.disabled = false; } };

  // ---------- shell ----------
  // Global nav order; each view declares {roles, label, icon, render(el)} via SL.view().
  const SECONDARY = ['planning', 'masters', 'audit', 'settings'];
  const ORDER = ['dashboard', 's-new', 's-orders', 's-customers', 's-visits', 's-sync', 'orders', 'invoices', 'payments', 'production', 'inventory', 'purchases', 'planning', 'masters', 'reports', 'audit', 'settings'];
  SL.view = (id, def) => { SL.views[id] = { id, ...def }; };
  SL.setBadge = (id, n) => { SL.badges[id] = n; document.querySelectorAll(`[data-badge="${id}"]`).forEach(el => { el.textContent = n || ''; el.classList.toggle('hide', !n); }); };
  const allowed = () => ORDER.filter(id => SL.views[id] && SL.views[id].roles.includes(SL.state.user.role));
  const current = () => { const id = (location.hash.replace(/^#\//, '') || '').split('?')[0]; const ok = allowed(); return ok.includes(id) ? id : ok[0]; };
  SL.go = id => { if (location.hash === '#/' + id) SL.route(); else location.hash = '#/' + id; };

  SL.render = function render() {
    const u = SL.state.user, ids = allowed(), cur = current();
    document.documentElement.lang = SL.state.lang === 'ta' ? 'ta' : 'en';
    const link = (id, cls) => h('a', { href: '#/' + id, class: id === cur ? 'on' : '' }, h('span', { class: 'ic' }, SL.views[id].icon || '•'), h('span', {}, t(SL.views[id].label)), h('span', { class: 'badge-n' + (SL.badges[id] ? '' : ' hide'), dataset: { badge: id } }, SL.badges[id] || ''));
    const net = h('span', { class: 'net' + (SL.state.online ? '' : ' off'), id: 'net' }, h('i'), h('span', {}, SL.state.online ? t('Online') : t('Offline')));
    const lang = h('button', { class: 'btn small', onclick: () => SL.setLang(SL.state.lang === 'ta' ? 'en' : 'ta'), title: 'Language' }, SL.state.lang === 'ta' ? 'English' : 'தமிழ்');
    const out = h('button', { class: 'btn small', onclick: SL.logout }, t('Sign out'));
    const content = h('div', { class: 'content', id: 'content' });
    const mobileIds = u.role === 'SALES' ? ids : ids.slice(0, 5);
    const root = document.getElementById('root'); root.replaceChildren(h('div', { class: 'app' },
      h('aside', { class: 'side' }, h('div', { class: 'brand' }, h('span', { class: 'logo' }, 'S'), 'SnackLedger'), h('nav', { class: 'nav' }, (() => { const more = u.role === 'SALES' ? [] : ids.filter(id => SECONDARY.includes(id)); return [...ids.filter(id => !more.includes(id)).map(id => link(id)), more.length ? h('details', { class: 'navmore', ...(more.includes(cur) ? { open: '' } : {}) }, h('summary', {}, '⋯ ' + t('More')), more.map(id => link(id))) : null]; })()),
        h('div', { class: 'muted', style: { marginTop: 'auto', padding: '.6rem' } }, h('div', {}, u.fullName), h('div', { style: { fontSize: '.75rem' } }, u.role), h('div', { style: { fontSize: '.7rem', opacity: .7 }, id: 'buildid' }, 'build v1.3 · 26 Nov'))),
      h('div', { class: 'main' }, h('div', { class: 'top' }, h('button', { class: 'btn small hide-m', id: 'sidetoggle', title: 'Show / hide menu', 'aria-label': 'Show or hide menu', onclick: () => { const a = document.querySelector('.app'); const c = a.classList.toggle('collapsed'); try { localStorage.setItem('sl.side', c ? '1' : '0'); } catch (e) {} } }, '☰'), h('strong', { class: 'hide-m' }, t(SL.views[cur].label)), h('strong', { class: 'show-m', style: { display: 'none' } }), h('span', { class: 'grow' }), net, lang, out), content),
      h('nav', { class: 'bottom' }, mobileIds.map(id => link(id)))));
    try { if (localStorage.getItem('sl.side') === '1') document.querySelector('.app').classList.add('collapsed'); } catch (e) {}
    SL.route();
  };
  SL.route = async function route() {
    if (!SL.state.user) return;
    const el = document.getElementById('content'); if (!el) return; const cur = current(), v = SL.views[cur];
    document.querySelectorAll('.nav a, .bottom a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#/' + cur));
    const ttl = document.querySelector('.top strong'); if (ttl) ttl.textContent = t(v.label);
    el.replaceChildren(ui.loading());
    const token = (SL._rt = (SL._rt || 0) + 1);
    try { const out = document.createElement('div'); await v.render(out); if (token === SL._rt) el.replaceChildren(...out.childNodes); }
    catch (e) { if (token === SL._rt) el.replaceChildren(h('div', { class: 'banner bad' }, e.offline ? t('This screen needs a connection to the server.') : e.message)); }
  };
  window.addEventListener('hashchange', () => SL.route());
  const setNet = on => { SL.state.online = on; const n = document.getElementById('net'); if (n) { n.className = 'net' + (on ? '' : ' off'); n.lastChild.textContent = on ? t('Online') : t('Offline'); } window.dispatchEvent(new CustomEvent('sl:net', { detail: on })); };
  window.addEventListener('online', () => setNet(true)); window.addEventListener('offline', () => setNet(false));

  // ---------- login / logout ----------
  SL.showLogin = function showLogin(msg) {
    const user = h('input', { name: 'username', autocomplete: 'username', autocapitalize: 'none', required: true, autofocus: true }), pass = h('input', { name: 'password', type: 'password', autocomplete: 'current-password', required: true });
    const err = h('div', { class: 'err', role: 'alert' }, msg || ''), btn = h('button', { class: 'btn primary big', type: 'submit' }, t('Sign in'));
    const off = h('div', { class: 'banner warn' + (SL.state.online ? ' hide' : ''), id: 'loginOff' }, t('You are offline. Salesmen who signed in on this phone before can still sign in and take orders.'));
    const form = h('form', { onsubmit: async e => {
      e.preventDefault(); err.textContent = ''; btn.disabled = true;
      try { await SL.login(user.value.trim(), pass.value); } catch (x) { err.textContent = x.message; } finally { btn.disabled = false; }
    } }, ui.field(t('Username'), user), ui.field(t('Password'), pass), err, btn);
    document.getElementById('root').replaceChildren(h('div', { class: 'login' }, h('div', { class: 'card stack' }, h('div', { class: 'brand' }, h('span', { class: 'logo' }, 'S'), 'SnackLedger'), h('p', { class: 'muted', style: { textAlign: 'center' } }, t('Order to audit, in one place')), off, form,
      h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('button', { class: 'btn small', onclick: () => SL.setLang(SL.state.lang === 'ta' ? 'en' : 'ta') }, SL.state.lang === 'ta' ? 'English' : 'தமிழ்')),
      h('div', { class: 'demo' }, h('strong', {}, t('Demo logins')), ' (password ', h('code', {}, 'demo1234'), '): ', ['admin', 'salesa', 'salesb', 'production', 'auditor', 'owner'].map(u => [h('code', {}, u), ' ']), h('br'), t('Prototype with dummy data only.')))));
  };
  // The browser keeps ONE login cookie for all tabs of the same browser (that is how every website works).
  // So: a new tab asks "continue as <user>?", and login/logout in one tab refreshes the other tabs.
  SL.markTab = () => { try { sessionStorage.setItem('sl.tab', '1'); } catch (_) {} };
  SL.tabMarked = () => { try { return sessionStorage.getItem('sl.tab') === '1'; } catch (_) { return true; } };
  let bc = null; try { bc = new BroadcastChannel('snackledger-auth'); bc.onmessage = () => { SL.markTab(); location.reload(); }; } catch (_) {}
  SL.tell = kind => { try { bc && bc.postMessage(kind); } catch (_) {} };
  SL.login = async function (username, password) {
    let res;
    try { res = await SL.api('POST', '/api/auth/login', { username, password }, { quiet: true }); }
    catch (e) {
      if (e.offline && SL.offline && SL.offline.tryOfflineLogin) {         // salesman unlock on a previously-used phone
        const u = await SL.offline.tryOfflineLogin(username, password);
        if (u) { SL.state.user = u; SL.state.csrf = null; SL.state.offlineSession = true; location.hash = ''; SL.render(); return; }
        throw new Error(t('Offline sign-in works only for a salesman who has signed in on this phone before, with the same password.'));
      }
      throw e;
    }
    SL.state.user = res.user; SL.state.csrf = res.csrf; SL.state.offlineSession = false;
    if (SL.offline && SL.offline.onLogin) await SL.offline.onLogin(res.user, password, res.csrf).catch(() => {});
    SL.markTab(); SL.tell('login');
    location.hash = ''; SL.render();
  };
  SL.logout = async () => { SL.tell('logout'); try { await SL.api('POST', '/api/auth/logout', {}, { quiet: true }); } catch (_) {} SL.state.user = null; SL.state.csrf = null; if (SL.offline && SL.offline.onLogout) SL.offline.onLogout(); location.hash = ''; SL.showLogin(); };
  // after a server session expiry while offline-unlocked: ask for the password again to resume syncing
  SL.reauth = () => new Promise((res, rej) => {
    const u = SL.state.user; const pass = h('input', { type: 'password', autocomplete: 'current-password' }), err = h('div', { class: 'err' });
    const m = SL.ui.modal(t('Sign in to sync'), h('div', {}, h('p', {}, t('Your server session has ended. Enter your password to send saved orders.')), ui.field(t('Password'), pass), err,
      h('div', { class: 'row mt', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn', onclick: () => { m.close(); rej(new Error('cancelled')); } }, t('Later')),
        h('button', { class: 'btn primary', onclick: async () => { try { const r = await SL.api('POST', '/api/auth/login', { username: u.username, password: pass.value }, { quiet: true }); SL.state.user = r.user; SL.state.csrf = r.csrf; SL.state.offlineSession = false; if (SL.offline && SL.offline.onLogin) await SL.offline.onLogin(r.user, pass.value, r.csrf); m.close(); res(); } catch (e) { err.textContent = e.message; } } }, t('Sign in')))), { width: '420px', sticky: true });
    setTimeout(() => pass.focus(), 30);
  });
})();
