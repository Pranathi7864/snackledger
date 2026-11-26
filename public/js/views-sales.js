/* Salesman screens (mobile first, offline capable): new order, my orders, customers, visits, sync. */
(function () {
  'use strict';
  const SL = window.SL, h = SL.h, t = SL.t, ui = SL.ui, fmt = SL.fmt, O = () => SL.offline;
  Object.assign(SL.i18n.ta, {
    'Customer': 'வாடிக்கையாளர்', 'Search customer': 'வாடிக்கையாளரைத் தேடு', 'Change': 'மாற்று', 'Choose a customer': 'வாடிக்கையாளரைத் தேர்ந்தெடுக்கவும்', 'No customer matches': 'பொருந்தும் வாடிக்கையாளர் இல்லை',
    'Packet': 'பாக்கெட்', 'Carton': 'அட்டைப்பெட்டி', 'Taxable value': 'வரிக்கு முந்தைய தொகை', 'GST (estimate)': 'GST (மதிப்பீடு)', 'Total (estimate)': 'மொத்தம் (மதிப்பீடு)', 'estimate (server confirms price)': 'மதிப்பீடு (இறுதி விலையை சர்வர் உறுதிசெய்யும்)',
    'Note for the factory (optional)': 'தொழிற்சாலைக்கான குறிப்பு (விருப்பம்)', 'Submit order': 'ஆர்டரை அனுப்பு', 'Add at least one product': 'குறைந்தது ஒரு பொருளைச் சேர்க்கவும்', 'Order {no} submitted': 'ஆர்டர் {no} அனுப்பப்பட்டது',
    'Saved on this phone, will send when online': 'இந்த தொலைபேசியில் சேமிக்கப்பட்டது, இணைப்பு வந்ததும் அனுப்பப்படும்', 'Saved on phone': 'தொலைபேசியில் சேமிக்கப்பட்டது', 'Not sent': 'அனுப்பப்படவில்லை', 'Edit': 'திருத்து', 'Discard': 'நீக்கு', 'Discard this saved order?': 'சேமித்த இந்த ஆர்டரை நீக்கவா?',
    'No data on this phone yet. Connect once to download customers and prices.': 'தொலைபேசியில் தரவு இல்லை. வாடிக்கையாளர், விலைகளைப் பதிவிறக்க ஒருமுறை இணையத்தில் இணையவும்.', 'Prices and stock are confirmed by the factory when the order arrives.': 'ஆர்டர் வந்ததும் விலை மற்றும் இருப்பை தொழிற்சாலை உறுதிசெய்யும்.',
    'Order': 'ஆர்டர்', 'Placed': 'பதிவு நேரம்', 'Packets': 'பாக்கெட்டுகள்', 'Invoice': 'விலைப்பட்டியல்', 'Reason': 'காரணம்', 'Showing saved copy (offline)': 'சேமித்த நகலைக் காட்டுகிறது (இணைப்பு இல்லை)', 'No orders yet': 'இன்னும் ஆர்டர்கள் இல்லை',
    'Customer-wise sales': 'வாடிக்கையாளர்வாரி விற்பனை', 'Orders count': 'ஆர்டர்கள்', 'Sales (before tax)': 'விற்பனை (வரிக்கு முன்)', 'Tap a customer to take a new order': 'புதிய ஆர்டருக்கு வாடிக்கையாளரைத் தொடவும்', 'Showing saved figures (offline)': 'சேமித்த புள்ளிவிவரங்களைக் காட்டுகிறது (இணைப்பு இல்லை)',
    'Check in': 'வருகையைப் பதிவு செய்', 'Check in here': 'இங்கே வருகையைப் பதிவு செய்', 'Note (optional)': 'குறிப்பு (விருப்பம்)', 'Getting location…': 'இருப்பிடத்தைப் பெறுகிறது…', 'No GPS fix. Check in without location?': 'GPS கிடைக்கவில்லை. இருப்பிடம் இல்லாமல் பதிவு செய்யவா?',
    'Visit recorded': 'வருகை பதிவு செய்யப்பட்டது', 'Recent visits': 'சமீபத்திய வருகைகள்', 'No visits yet': 'இன்னும் வருகைகள் இல்லை', 'No location': 'இருப்பிடம் இல்லை',
    'Connection': 'இணைப்பு', 'Waiting to send': 'அனுப்ப காத்திருப்பவை', 'Rejected': 'நிராகரிக்கப்பட்டவை', 'Last sync': 'கடைசி ஒத்திசைவு', 'Never': 'இதுவரை இல்லை', 'Sync now': 'இப்போது ஒத்திசை', 'Refresh customers and prices': 'வாடிக்கையாளர், விலைகளைப் புதுப்பி', 'Data refreshed': 'தரவு புதுப்பிக்கப்பட்டது',
    'Nothing is waiting. All orders are with the factory.': 'எதுவும் நிலுவையில் இல்லை. எல்லா ஆர்டர்களும் தொழிற்சாலையில் உள்ளன.', 'Retry': 'மீண்டும் முயற்சி', 'Order (saved)': 'ஆர்டர் (சேமித்தது)', 'Visit (saved)': 'வருகை (சேமித்தது)', 'Sign in again to send saved items': 'சேமித்தவற்றை அனுப்ப மீண்டும் உள்நுழையவும்',
    '{n} saved item(s) sent to the factory': '{n} சேமித்த பதிவுகள் தொழிற்சாலைக்கு அனுப்பப்பட்டன', '{n} item(s) were rejected, see Sync': '{n} பதிவுகள் நிராகரிக்கப்பட்டன, ஒத்திசைவைப் பார்க்கவும்', 'Sync finished': 'ஒத்திசைவு முடிந்தது', 'Could not reach the server': 'சர்வரை அடைய முடியவில்லை',
    'Steps': 'நிலைகள்', 'Lines': 'வரிகள்', 'Sent': 'அனுப்பியது', 'Qty': 'அளவு', 'Rate': 'விலை', 'Dispatched qty': 'அனுப்பிய அளவு', 'packets': 'பாக்கெட்டுகள்', 'Quantity must be a whole number': 'அளவு முழு எண்ணாக இருக்க வேண்டும்', 'Choose a customer first': 'முதலில் வாடிக்கையாளரைத் தேர்ந்தெடுக்கவும்', 'Close': 'மூடு',
  });

  const money = p => fmt.money(p / 100);
  const paise = s => Math.round(Number(s) * 100);
  const tax = (taxablePaise, rate) => Math.floor((taxablePaise * Math.round(Number(rate) * 100) + 5000) / 10000);   // integer maths: no float drift
  const CUST_ORDER_KEY = 'newOrderCustomer';
  // keep a view's live-refresh listener only while its container is on screen
  function live(wrap, fn) { const l = () => { if (wrap.isConnected) { wrap._seen = true; fn(); } else if (wrap._seen) window.removeEventListener('sl:outbox', l); }; window.addEventListener('sl:outbox', l); }
  const noData = () => h('div', { class: 'banner warn' }, t('No data on this phone yet. Connect once to download customers and prices.'));

  // =============================== NEW ORDER ===============================
  SL.view('s-new', { roles: ['SALES'], label: 'New order', icon: '➕', async render(out) {
    const [customers, products] = await Promise.all([O().customers(), O().products()]);
    if (!customers.length || !products.length) { if (navigator.onLine) { await O().refreshCaches().catch(() => {}); } }
    const cs = await O().customers(), ps = await O().products();
    if (!cs.length || !ps.length) { out.append(ui.pagehead(t('New order')), noData()); return; }
    const st = { customerId: null, cart: new Map(), notes: '', clientId: null, fromOutbox: false, q: '', busy: false };
    if (SL.state[CUST_ORDER_KEY]) { st.customerId = SL.state[CUST_ORDER_KEY]; SL.state[CUST_ORDER_KEY] = null; }
    const d = SL.state.draft; if (d) {                       // editing a saved / rejected outbox order
      SL.state.draft = null; st.clientId = d.clientId; st.fromOutbox = true; st.customerId = d.payload.customerId; st.notes = d.payload.notes || '';
      d.payload.lines.forEach(l => st.cart.set(l.productId, { qty: Number(l.qty), unit: l.unit }));
    }
    const prod = id => ps.find(p => p.id === id);
    const custBox = h('div'), prodBox = h('div'), totBox = h('div'), submit = h('button', { class: 'btn primary big', type: 'button' });
    const cust = () => cs.find(c => c.id === st.customerId);

    async function lines() {
      const rows = [];
      for (const [pid, c] of st.cart) {
        const p = prod(pid); if (!p || !(c.qty > 0)) continue;
        const packets = c.qty * (c.unit === 'carton' ? p.carton_capacity : 1), price = paise(await O().priceFor(st.customerId, p));
        rows.push({ p, c, packets, price, taxable: packets * price, tax: tax(packets * price, p.gst_rate) });
      }
      return rows;
    }
    async function drawTotals() {
      const rows = await lines(), taxable = rows.reduce((a, r) => a + r.taxable, 0), gst = rows.reduce((a, r) => a + r.tax, 0), pk = rows.reduce((a, r) => a + r.packets, 0);
      totBox.replaceChildren(h('div', { class: 'card totals' },
        h('div', { class: 'row' }, h('span', { class: 'grow muted' }, t('Taxable value')), h('strong', { class: 'num' }, money(taxable))),
        h('div', { class: 'row' }, h('span', { class: 'grow muted' }, t('GST (estimate)')), h('strong', { class: 'num' }, money(gst))),
        h('div', { class: 'row big-total' }, h('span', { class: 'grow' }, t('Total (estimate)'), ' · ', pk, ' ', t('packets')), h('strong', { class: 'num' }, money(taxable + gst))),
        h('p', { class: 'muted small' }, t('estimate (server confirms price)'))));
      submit.textContent = t('Submit order') + (rows.length ? ' · ' + money(taxable + gst) : '');
      submit.disabled = st.busy || !rows.length || !st.customerId;
    }
    function drawCustomer() {
      const c = cust();
      if (c) { custBox.replaceChildren(h('div', { class: 'card chip-card' }, h('div', { class: 'grow' }, h('strong', {}, c.name), h('div', { class: 'muted small' }, `${t(c.type === 'DISTRIBUTOR' ? 'Distributor' : 'Retailer')} · ${c.state}`)), h('button', { class: 'btn small', type: 'button', onclick: () => { st.customerId = null; drawCustomer(); drawProducts(); drawTotals(); } }, t('Change')))); return; }
      const list = h('div', { class: 'cust-list' });
      const fill = () => { const q = st.q.trim().toLowerCase(), m = cs.filter(x => !q || (x.name + ' ' + x.state).toLowerCase().includes(q)); list.replaceChildren(...(m.length ? m.map(x => h('button', { class: 'cust-item', type: 'button', onclick: () => { st.customerId = x.id; drawCustomer(); drawProducts(); drawTotals(); } }, h('strong', {}, x.name), h('span', { class: 'muted small' }, `${t(x.type === 'DISTRIBUTOR' ? 'Distributor' : 'Retailer')} · ${x.state}`))) : [h('div', { class: 'empty' }, t('No customer matches'))])); };
      const inp = h('input', { type: 'search', placeholder: t('Search customer'), value: st.q, 'aria-label': t('Search customer'), oninput: e => { st.q = e.target.value; fill(); } });
      custBox.replaceChildren(h('div', { class: 'card' }, h('h2', {}, t('Choose a customer')), inp, list)); fill();
    }
    function drawProducts() {
      if (!st.customerId) { prodBox.replaceChildren(); return; }
      prodBox.replaceChildren(...ps.map(p => {
        const cur = () => st.cart.get(p.id) || { qty: 0, unit: 'packet' };
        const qin = h('input', { type: 'number', inputmode: 'numeric', min: '0', step: '1', class: 'qty', value: cur().qty || '', placeholder: '0', 'aria-label': p.name });
        const hint = h('span', { class: 'muted small' });
        const priceEl = h('span', { class: 'muted small' });
        const set = (q, u) => { q = Math.max(0, Math.floor(Number(q) || 0)); const c = { qty: q, unit: u || cur().unit }; if (q > 0) st.cart.set(p.id, c); else st.cart.delete(p.id); qin.value = q || ''; refresh(); drawTotals(); };
        const unitBtn = u => h('button', { type: 'button', class: 'seg' + (cur().unit === u ? ' on' : ''), onclick: () => set(cur().qty, u) }, t(u === 'carton' ? 'Carton' : 'Packet'));
        const segs = h('div', { class: 'segs' });
        const refresh = () => { const c = cur(); segs.replaceChildren(unitBtn('packet'), unitBtn('carton')); hint.textContent = c.qty > 0 && c.unit === 'carton' ? `= ${c.qty * p.carton_capacity} ${t('packets')} (${p.carton_capacity}/${t('Carton')})` : ''; row.classList.toggle('has', c.qty > 0); };
        O().priceFor(st.customerId, p).then(pr => { priceEl.textContent = `${p.pack_size_g} g · ${fmt.money(pr)} / ${t('Packet')}`; });
        const row = h('div', { class: 'card prow' },
          h('div', { class: 'pname' }, h('strong', {}, p.name), priceEl),
          h('div', { class: 'stepper' }, h('button', { type: 'button', class: 'step', 'aria-label': '−', onclick: () => set(cur().qty - 1) }, '−'), qin, h('button', { type: 'button', class: 'step', 'aria-label': '+', onclick: () => set(cur().qty + 1) }, '+')),
          segs, hint);
        qin.addEventListener('input', () => { const q = Math.max(0, Math.floor(Number(qin.value) || 0)); if (q > 0) st.cart.set(p.id, { qty: q, unit: cur().unit }); else st.cart.delete(p.id); refresh(); drawTotals(); });
        refresh(); return row;
      }));
    }
    const notes = h('input', { type: 'text', placeholder: t('Note for the factory (optional)'), value: st.notes, maxlength: '300', oninput: e => { st.notes = e.target.value; } });

    submit.addEventListener('click', async () => {
      if (st.busy) return;
      const rows = await lines(); if (!st.customerId) return ui.toast(t('Choose a customer first'), 'bad'); if (!rows.length) return ui.toast(t('Add at least one product'), 'bad');
      st.busy = true; submit.disabled = true;
      const clientId = st.clientId || (st.clientId = O().uuid());               // same id for every retry => server never double-books
      const payload = { clientId, customerId: st.customerId, placedAt: O().localIso(), notes: st.notes.trim() || undefined, lines: rows.map(r => ({ productId: r.p.id, qty: r.c.qty, unit: r.c.unit, clientPrice: (r.price / 100).toFixed(2) })) };
      const summary = { customer: cust().name, packets: rows.reduce((a, r) => a + r.packets, 0), taxable: rows.reduce((a, r) => a + r.taxable, 0) / 100 };
      try {
        let queued = false;
        if (navigator.onLine && SL.state.csrf && !SL.state.offlineSession) {
          try {
            const r = await SL.api('POST', '/api/orders', payload, { quiet: true });
            if (st.fromOutbox) await O().discard('order', clientId);
            ui.toast(t('Order {no} submitted', { no: r.orderNo }), 'ok'); O().refreshOrders().then(O().emit).catch(() => {});
          } catch (e) { if (e.offline || e.status === 401 || e.status === 403) queued = true; else throw e; }
        } else queued = true;
        if (queued) { await O().queueOrder(payload, summary); ui.toast(t('Saved on this phone, will send when online'), 'ok'); if (navigator.onLine) O().sync({ interactive: true }); }
        SL.go('s-orders');
      } catch (e) { ui.err(e); st.busy = false; drawTotals(); }
    });
    out.append(ui.pagehead(t('New order'), st.fromOutbox ? t('Edit') : null), custBox, prodBox,
      h('div', { class: 'card' }, ui.field(t('Note for the factory (optional)'), notes)), totBox, h('div', { class: 'submitbar' }, submit), h('p', { class: 'muted small' }, t('Prices and stock are confirmed by the factory when the order arrives.')));
    drawCustomer(); drawProducts(); await drawTotals();
  } });

  // =============================== MY ORDERS ===============================
  const STEPS = ['SUBMITTED', 'APPROVED', 'INVOICED', 'DISPATCHED'];
  function timeline(status) {
    if (status === 'REJECTED' || status === 'CANCELLED') return h('div', { class: 'row' }, ui.badge(status));
    const at = status === 'PARTIALLY_DISPATCHED' ? 3 : STEPS.indexOf(status);
    return h('div', { class: 'steps' }, STEPS.map((s, i) => h('span', { class: 'stp' + (i <= at ? ' done' : '') }, t(s.charAt(0) + s.slice(1).toLowerCase()))));
  }
  async function orderDetail(o) {
    let d = o.detail, stale = false;
    if (navigator.onLine) { try { d = await SL.api('GET', '/api/orders/' + o.id, undefined, { quiet: true }); await O().cacheOrderDetail(o.id, d); } catch (e) { if (!d) throw e; stale = true; } } else stale = true;
    const body = h('div', { class: 'stack' }, stale ? h('div', { class: 'banner info' }, t('Showing saved copy (offline)')) : null, timeline((d || o).status));
    if (d && d.status === 'REJECTED' && d.reject_reason) body.append(h('div', { class: 'banner bad' }, t('Reason') + ': ' + d.reject_reason));
    if (d && d.invoice) body.append(h('div', { class: 'row' }, h('span', { class: 'muted' }, t('Invoice')), h('strong', {}, d.invoice.invoice_no), h('span', { class: 'grow' }), h('strong', { class: 'num' }, fmt.money(d.invoice.total))));
    if (d) body.append(ui.table([{ label: t('Product'), render: l => l.name }, { label: t('Qty'), cls: 'num', render: l => fmt.num(l.qty, 0) }, { label: t('Rate'), cls: 'num', render: l => fmt.money(l.price) }, { label: t('Dispatched qty'), cls: 'num', render: l => fmt.num(l.dispatched, 0) }], d.lines));
    else body.append(h('p', { class: 'muted' }, `${fmt.num(o.packets, 0)} ${t('packets')} · ${fmt.money(o.taxable)}`));
    ui.modal(`${o.orderNo} · ${o.customer}`, body, { width: '560px' });
  }
  SL.view('s-orders', { roles: ['SALES'], label: 'My orders', icon: '📋', async render(out) {
    const wrap = h('div'); out.append(ui.pagehead(t('My orders')), wrap);
    let offline = !navigator.onLine;
    if (navigator.onLine) { try { await Promise.race([O().refreshOrders(), new Promise((_, rej) => setTimeout(rej, 4000))]); } catch (_) { offline = true; } }
    async function draw() {
      const [pend, cached] = await Promise.all([O().listOrders(), O().cachedOrders()]);
      const cards = [];
      if (offline) cards.push(h('div', { class: 'banner info' }, t('Showing saved copy (offline)')));
      for (const e of pend) {
        const failed = e.status === 'FAILED', s = e.summary || {};
        cards.push(h('div', { class: 'card ocard ' + (failed ? 'failed' : 'pending') }, h('div', { class: 'row' }, h('strong', { class: 'grow' }, s.customer || t('Order (saved)')), h('span', { class: 'pill ' + (failed ? 'bad' : 'warn') }, failed ? t('Not sent') : t('Saved on phone'))),
          h('div', { class: 'muted small' }, `${fmt.num(s.packets || 0, 0)} ${t('packets')} · ${fmt.money(s.taxable || 0)} · ${fmt.dt(e.payload.placedAt)}`),
          failed ? h('div', { class: 'err' }, e.error) : (e.error ? h('div', { class: 'muted small' }, e.error) : null),
          h('div', { class: 'row mt' }, h('button', { class: 'btn small', onclick: () => { SL.state.draft = e; SL.go('s-new'); } }, t('Edit')), h('button', { class: 'btn small danger', onclick: async () => { if (await ui.confirm(t('Discard this saved order?'))) O().discard('order', e.clientId); } }, t('Discard')))));
      }
      cached.forEach(o => cards.push(h('button', { class: 'card ocard tap', type: 'button', onclick: ui.busy(null, () => orderDetail(o)) },
        h('div', { class: 'row' }, h('strong', { class: 'grow' }, o.customer), ui.badge(o.status)),
        h('div', { class: 'muted small' }, `${o.orderNo} · ${fmt.num(o.packets, 0)} ${t('packets')} · ${fmt.money(o.taxable)} · ${fmt.dt(o.placed_at)}`), o.invoice_no ? h('div', { class: 'small' }, t('Invoice') + ' ' + o.invoice_no) : null)));
      if (!pend.length && !cached.length) cards.push(ui.empty(t('No orders yet')));
      wrap.replaceChildren(...cards);
    }
    await draw(); live(wrap, draw);
  } });

  // =============================== CUSTOMERS ===============================
  SL.view('s-customers', { roles: ['SALES'], label: 'Customers', icon: '👥', async render(out) {
    const range = { from: fmt.monthStart(), to: fmt.today() }, wrap = h('div', { class: 'stack' });
    async function draw() {
      let rows = null, stale = false;
      if (navigator.onLine) { try { rows = await SL.api('GET', '/api/orders/my/customer-sales' + SL.qs(range), undefined, { quiet: true }); await O().meta.set('custSales', { ...range, rows }); } catch (_) { stale = true; } } else stale = true;
      if (!rows) { const c = await O().meta.get('custSales'); rows = c ? c.rows : []; }
      const cs = await O().customers(), by = new Map(rows.map(r => [r.customer_id, r]));
      const all = cs.map(c => ({ c, r: by.get(c.id) })).sort((a, b) => Number(b.r ? b.r.taxable : 0) - Number(a.r ? a.r.taxable : 0) || a.c.name.localeCompare(b.c.name));
      wrap.replaceChildren(stale ? h('div', { class: 'banner info' }, t('Showing saved figures (offline)')) : null, h('p', { class: 'muted small' }, t('Tap a customer to take a new order')),
        ...all.map(({ c, r }) => h('button', { class: 'card ocard tap', type: 'button', onclick: () => { SL.state[CUST_ORDER_KEY] = c.id; SL.go('s-new'); } },
          h('div', { class: 'row' }, h('strong', { class: 'grow' }, c.name), h('strong', { class: 'num' }, fmt.money(r ? r.taxable : 0))),
          h('div', { class: 'muted small' }, `${r ? r.orders : 0} ${t('Orders count')} · ${fmt.num(r ? r.packets : 0, 0)} ${t('packets')} · ${t(c.type === 'DISTRIBUTOR' ? 'Distributor' : 'Retailer')}`))));
    }
    out.append(ui.pagehead(t('Customer-wise sales'), t('Sales (before tax)')), ui.dateRange(range, draw), h('div', { class: 'mt' }, wrap)); await draw();
  } });

  // =============================== VISITS ===============================
  function getPosition() {
    return new Promise(res => {
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }), () => res(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
    });
  }
  SL.view('s-visits', { roles: ['SALES'], label: 'Visits', icon: '📍', async render(out) {
    const cs = await O().customers(); if (!cs.length) { out.append(ui.pagehead(t('Visits')), noData()); return; }
    const sel = h('select', { 'aria-label': t('Customer') }, cs.map(c => h('option', { value: c.id }, c.name))), note = h('input', { type: 'text', placeholder: t('Note (optional)'), maxlength: '200' });
    const btn = h('button', { class: 'btn primary big', type: 'button' }, '📍 ' + t('Check in here')), list = h('div', { class: 'stack' });
    async function recent() {
      let rows = null;
      if (navigator.onLine) { try { rows = await SL.api('GET', '/api/visits' + SL.qs({ from: fmt.today().slice(0, 8) + '01', to: fmt.today() }), undefined, { quiet: true }); await O().meta.set('visits', rows); } catch (_) {} }
      if (!rows) rows = (await O().meta.get('visits')) || [];
      const pend = await O().listVisits();
      const items = [...pend.map(e => ({ t: e.payload.visitedAt, customer: (cs.find(c => c.id === e.payload.customerId) || {}).name, lat: e.payload.lat, note: e.payload.note, saved: e })), ...rows.map(v => ({ t: v.visited_at, customer: v.customer, lat: v.lat, note: v.note }))];
      list.replaceChildren(...(items.length ? items.map(v => h('div', { class: 'card ocard' }, h('div', { class: 'row' }, h('strong', { class: 'grow' }, v.customer), v.saved ? h('span', { class: 'pill ' + (v.saved.status === 'FAILED' ? 'bad' : 'warn') }, v.saved.status === 'FAILED' ? t('Not sent') : t('Saved on phone')) : null),
        h('div', { class: 'muted small' }, `${fmt.dt(v.t)} · ${v.lat !== null && v.lat !== undefined ? '📍' : t('No location')}${v.note ? ' · ' + v.note : ''}`), v.saved && v.saved.error ? h('div', { class: 'err' }, v.saved.error) : null)) : [ui.empty(t('No visits yet'))]));
    }
    btn.addEventListener('click', async () => {
      btn.disabled = true; const old = btn.textContent; btn.textContent = t('Getting location…');
      try {
        let pos = await getPosition();
        if (!pos && !(await ui.confirm(t('No GPS fix. Check in without location?')))) return;
        const v = { clientId: O().uuid(), customerId: Number(sel.value), lat: pos ? pos.lat : null, lng: pos ? pos.lng : null, accuracy: pos ? pos.accuracy : null, note: note.value.trim() || undefined, visitedAt: O().localIso() };
        await O().queueVisit(v); note.value = ''; ui.toast(navigator.onLine ? t('Visit recorded') : t('Saved on this phone, will send when online'), 'ok');
        if (navigator.onLine) await O().sync({ interactive: true }); await recent();
      } catch (e) { ui.err(e); } finally { btn.disabled = false; btn.textContent = old; }
    });
    out.append(ui.pagehead(t('Check in')), h('div', { class: 'card stack' }, ui.field(t('Customer'), sel), ui.field(t('Note (optional)'), note), btn), h('h2', { class: 'mt' }, t('Recent visits')), list);
    await recent(); live(list, recent);
  } });

  // =============================== SYNC ===============================
  SL.view('s-sync', { roles: ['SALES'], label: 'Sync', icon: '🔄', async render(out) {
    const wrap = h('div', { class: 'stack' }); out.append(ui.pagehead(t('Sync')), wrap);
    async function draw() {
      const [orders, visits, last] = await Promise.all([O().listOrders(), O().listVisits(), O().lastSync()]), all = [...orders.map(e => ({ kind: 'order', e })), ...visits.map(e => ({ kind: 'visit', e }))];
      const pend = all.filter(x => x.e.status === 'PENDING').length, failed = all.filter(x => x.e.status === 'FAILED').length;
      const syncBtn = h('button', { class: 'btn primary', type: 'button', onclick: ui.busy(null, async () => { const r = await O().sync({ interactive: true }); ui.toast(r && r.skipped === 'network' ? t('Could not reach the server') : t('Sync finished'), r && r.skipped ? 'bad' : 'ok'); await draw(); }) }, '🔄 ' + t('Sync now'));
      const refBtn = h('button', { class: 'btn', type: 'button', onclick: ui.busy(null, async () => { await O().refreshMaster(); await O().refreshOrders(); ui.toast(t('Data refreshed'), 'ok'); }) }, t('Refresh customers and prices'));
      wrap.replaceChildren(
        h('div', { class: 'cards' }, ui.stat(t('Connection'), SL.state.online ? t('Online') : t('Offline'), null, SL.state.online ? '' : 'bad'), ui.stat(t('Waiting to send'), String(pend)), ui.stat(t('Rejected'), String(failed), null, failed ? 'bad' : ''), ui.stat(t('Last sync'), last ? fmt.dt(new Date(last - new Date().getTimezoneOffset() * 60000).toISOString()) : t('Never'))),
        O().needsAuth() ? h('div', { class: 'banner warn' }, t('Sign in again to send saved items')) : null,
        h('div', { class: 'row' }, syncBtn, refBtn),
        ...(all.length ? all.map(({ kind, e }) => h('div', { class: 'card ocard ' + (e.status === 'FAILED' ? 'failed' : 'pending') }, h('div', { class: 'row' }, h('strong', { class: 'grow' }, kind === 'order' ? (e.summary.customer || t('Order (saved)')) : t('Visit (saved)')), h('span', { class: 'pill ' + (e.status === 'FAILED' ? 'bad' : 'warn') }, e.status === 'FAILED' ? t('Not sent') : t('Pending'))),
          h('div', { class: 'muted small' }, fmt.dt(new Date(e.createdAt - new Date().getTimezoneOffset() * 60000).toISOString())), e.error ? h('div', { class: 'err' }, e.error) : null,
          h('div', { class: 'row mt' }, e.status === 'FAILED' && kind === 'order' ? h('button', { class: 'btn small', onclick: () => { SL.state.draft = e; SL.go('s-new'); } }, t('Edit')) : null, e.status === 'FAILED' ? h('button', { class: 'btn small', onclick: ui.busy(null, () => O().retry(kind, e.clientId)) }, t('Retry')) : null,
            h('button', { class: 'btn small danger', onclick: async () => { if (await ui.confirm(t('Discard this saved order?'))) O().discard(kind, e.clientId); } }, t('Discard'))))) : [h('div', { class: 'banner ok' }, t('Nothing is waiting. All orders are with the factory.'))]));
    }
    await draw(); live(wrap, draw); window.addEventListener('sl:net', () => { if (wrap.isConnected) draw(); });
  } });
})();
