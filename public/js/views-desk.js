/* Desk screens: orders (approval, invoice, dispatch), invoices, payments, masters, settings. */
(function () {
  'use strict';
  const SL = window.SL, h = SL.h, ui = SL.ui, fmt = SL.fmt, t = SL.t;
  Object.assign(SL.i18n.ta, {
    'Search customer, order no, salesman…': 'வாடிக்கையாளர், ஆர்டர் எண், விற்பனையாளரைத் தேடுக…', 'All': 'அனைத்தும்', 'Pending approval': 'அங்கீகாரம் நிலுவை', 'Salesman': 'விற்பனையாளர்', 'Source': 'மூலம்',
    'Received': 'பெறப்பட்டது', 'Placed': 'இடப்பட்டது', 'On hand': 'கையிருப்பு', 'Reserved': 'ஒதுக்கீடு', 'Free stock': 'கிடைக்கும் இருப்பு', 'Shortage': 'பற்றாக்குறை', 'Line total': 'வரி மொத்தம்',
    'Taxable': 'வரிக்குட்பட்டது', 'Tax preview': 'வரி முன்னோட்டம்', 'Place of supply': 'விநியோக இடம்', 'Intra-state: CGST + SGST': 'மாநிலத்திற்குள்: CGST + SGST', 'Inter-state: IGST': 'மாநிலங்களுக்கிடையே: IGST',
    'Reject order': 'ஆர்டரை நிராகரி', 'Reason': 'காரணம்', 'Stock shortage': 'இருப்புப் பற்றாக்குறை', 'Reduce to available stock': 'கிடைக்கும் இருப்புக்குக் குறை', 'Approve as back-order': 'பின்-ஆர்டராக அங்கீகரி',
    'Create GST invoice': 'GST விலைப்பட்டியல் உருவாக்கு', 'Vehicle no': 'வாகன எண்', 'Notes': 'குறிப்புகள்', 'Dispatch available stock': 'உள்ள இருப்பை அனுப்பு', 'Remaining': 'மீதம்', 'History': 'வரலாறு',
    'Share': 'பகிர்', 'Copy link': 'இணைப்பை நகலெடு', 'WhatsApp': 'வாட்ஸ்அப்', 'Email': 'மின்னஞ்சல்', 'Cancel with credit note': 'கிரெடிட் நோட்டுடன் ரத்து செய்', 'Goods returned to stock': 'பொருட்கள் இருப்புக்குத் திரும்பின',
    'Paid': 'செலுத்தியது', 'Credit note': 'கிரெடிட் நோட்', 'Edit details': 'விவரங்களைத் திருத்து', 'All dates': 'அனைத்து தேதிகள்', 'Customer balances': 'வாடிக்கையாளர் நிலுவைகள்', 'Receipts': 'ரசீதுகள்',
    'Mode': 'முறை', 'Reference': 'குறிப்பு எண்', 'Open invoice': 'திறந்த விலைப்பட்டியல்', 'Outstanding & ageing report': 'நிலுவை மற்றும் வயது அறிக்கை', 'Products': 'பொருட்கள்', 'Suppliers': 'விநியோகஸ்தர்கள்', 'Items': 'பொருள் வகைகள்',
    'BOMs': 'செய்முறைகள் (BOM)', 'Users': 'பயனர்கள்', 'Add': 'சேர்', 'Edit': 'திருத்து', 'Name': 'பெயர்', 'Code': 'குறியீடு', 'Pack size (g)': 'பேக் அளவு (கி)', 'GST %': 'GST %', 'Active': 'செயலில்', 'Reorder level': 'மறுஆர்டர் நிலை',
    'Change password': 'கடவுச்சொல்லை மாற்று', 'Old password': 'பழைய கடவுச்சொல்', 'New password': 'புதிய கடவுச்சொல்', 'Variance tolerance %': 'வேறுபாடு அனுமதி %', 'Business details': 'நிறுவன விவரங்கள்', 'Monthly overheads': 'மாதாந்திர மேல்செலவுகள்',
    'Language': 'மொழி', 'Role': 'பங்கு', 'Reset password': 'கடவுச்சொல் மீட்டமை', 'Deactivate': 'செயலிழக்கச் செய்', 'Activate': 'செயல்படுத்து', 'Full name': 'முழு பெயர்', 'Saved': 'சேமிக்கப்பட்டது',
  });

  const role = () => SL.state.user.role, isAdmin = () => role() === 'ADMIN';
  const num = (v, dp) => fmt.num(v, dp === undefined ? 3 : dp);
  const inp = (attrs) => h('input', attrs);
  const sel = (opts, val, attrs) => ui.select(opts, val, attrs);
  const STATUSES = ['SUBMITTED', 'APPROVED', 'INVOICED', 'PARTIALLY_DISPATCHED', 'DISPATCHED', 'REJECTED', 'CANCELLED'];
  const dl = (el, label, value) => [h('dt', {}, label), h('dd', {}, value === null || value === undefined || value === '' ? '—' : value)];
  const pretty = s => { try { return JSON.stringify(JSON.parse(s), null, 1); } catch (_) { return s; } };

  // audit history list (before/after visible)
  async function history(entity, id) {
    const rows = await SL.get('/api/audit' + SL.qs({ entity, entityId: id })).catch(() => []);
    if (!rows.length) return h('p', { class: 'muted' }, t('Nothing here yet.'));
    return h('div', { class: 'hist' }, rows.map(a => h('div', { class: 'hist-row' },
      h('div', { class: 'row' }, h('span', { class: 'pill info' }, a.action), h('strong', {}, a.actor), h('span', { class: 'muted' }, fmt.dt(a.ts)), a.summary ? h('span', {}, a.summary) : null),
      a.reason ? h('div', { class: 'muted' }, t('Reason') + ': ' + a.reason) : null,
      (a.before_json || a.after_json) ? h('details', {}, h('summary', {}, 'before / after'), h('div', { class: 'ba' }, a.before_json ? h('pre', {}, 'before: ' + pretty(a.before_json)) : null, a.after_json ? h('pre', {}, 'after: ' + pretty(a.after_json)) : null)) : null)));
  }

  // ------------------------------------------------------------------ ORDERS
  SL.view('orders', {
    roles: ['ADMIN', 'AUDITOR', 'OWNER'], label: 'Orders', icon: '📋',
    async render(el) {
      const st = { status: '', q: '' };
      const all = await SL.get('/api/orders');
      const body = h('div', {});
      const draw = () => {
        const pend = all.filter(o => o.status === 'SUBMITTED').length;
        const rows = all.filter(o => (!st.status || o.status === st.status) && (!st.q || [o.orderNo, o.customer, o.salesman, o.invoice_no].join(' ').toLowerCase().includes(st.q.toLowerCase())));
        body.replaceChildren(
          h('div', { class: 'row mb' }, h('button', { class: 'chip' + (!st.status ? ' on' : ''), onclick: () => { st.status = ''; draw(); } }, t('All') + ' (' + all.length + ')'),
            STATUSES.map(s => h('button', { class: 'chip' + (st.status === s ? ' on' : ''), dataset: { status: s }, onclick: () => { st.status = s; draw(); } }, ui.statusText(s) + ' (' + all.filter(o => o.status === s).length + ')')),
            h('span', { class: 'grow' }), pend ? h('span', { class: 'pill warn' }, t('Pending approval') + ': ' + pend) : null),
          ui.table([
            { label: t('Order'), render: o => h('strong', {}, o.orderNo) }, { label: t('Customer'), key: 'customer' }, { label: t('Salesman'), key: 'salesman', cls: 'hide-m' },
            { label: t('Source'), render: o => (o.source === 'OFFLINE' ? h('span', { class: 'pill info' }, 'OFFLINE') : 'Online'), cls: 'hide-m' },
            { label: t('Packets'), render: o => num(o.packets, 0), cls: 'num' }, { label: t('Taxable'), render: o => fmt.money(o.taxable), cls: 'num' },
            { label: t('Status'), render: o => ui.badge(o.status) }, { label: t('Invoice'), render: o => o.invoice_no || '' }, { label: t('Received'), render: o => fmt.dt(o.received_at), cls: 'hide-m' }],
            rows, { onRow: o => openOrder(o.id, reload) }));
      };
      const reload = async () => { const fresh = await SL.get('/api/orders'); all.splice(0, all.length, ...fresh); draw(); };
      el.append(ui.pagehead(t('Orders'), null, h('input', { class: 'search', placeholder: t('Search customer, order no, salesman…'), oninput: e => { st.q = e.target.value; draw(); } })), body);
      draw();
    },
  });

  async function openOrder(id, onChange) {
    let modal = null;
    const wrap = h('div', {});
    const refresh = async (keepOpen) => { const o = await SL.get('/api/orders/' + id); await paint(o); if (onChange) onChange(); };
    const paint = async o => {
      const editable = isAdmin() && o.status === 'SUBMITTED';
      const intra = o.supplyType === 'INTRA';
      const qIn = {}, pIn = {};
      const shortagePanel = h('div', {});
      const totals = h('div', {});
      const calc = () => {
        let taxable = 0, cgst = 0, sgst = 0, igst = 0;
        o.lines.forEach(l => {
          const q = editable ? Number(qIn[l.id].value || 0) : Number(l.qty), p = editable ? Number(pIn[l.id].value || 0) : Number(l.price);
          const tx = Math.round(q * p * 100) / 100, tax = Math.round(tx * Number(l.gst_rate)) / 100;
          taxable += tx; if (intra) { const c = Math.round(tax * 50) / 100; cgst += c; sgst += tax - c; } else igst += tax;
        });
        totals.replaceChildren(h('dl', { class: 'kv totals' }, ...dl(0, t('Taxable'), fmt.money(taxable)), ...(intra ? [...dl(0, 'CGST', fmt.money(cgst)), ...dl(0, 'SGST', fmt.money(sgst))] : dl(0, 'IGST', fmt.money(igst))), ...dl(0, t('Total'), h('strong', {}, fmt.money(taxable + cgst + sgst + igst)))),
          ...(editable ? [h('p', { class: 'muted' }, 'Estimate; the server recomputes on approval.')] : []));
      };
      const lineRows = o.lines.map(l => {
        if (editable) { qIn[l.id] = inp({ type: 'number', min: '0', step: '1', value: String(Number(l.qty)), class: 'mini', dataset: { line: l.id, f: 'qty' }, oninput: calc }); pIn[l.id] = inp({ type: 'number', min: '0', step: '0.01', value: l.price, class: 'mini', dataset: { line: l.id, f: 'price' }, oninput: calc }); }
        const short = Number(l.shortage) > 0;
        return h('tr', { class: short ? 'flag' : '' }, h('td', {}, l.name, h('div', { class: 'muted' }, 'HSN ' + l.hsn + ' · GST ' + l.gst_rate + '%')),
          h('td', { class: 'num' }, editable ? pIn[l.id] : fmt.money(l.price)), h('td', { class: 'num' }, editable ? qIn[l.id] : num(l.qty, 0)),
          h('td', { class: 'num' }, num(l.on_hand, 0)), h('td', { class: 'num' }, num(l.committed, 0)), h('td', { class: 'num' }, num(l.free_stock, 0)),
          h('td', { class: 'num' }, short ? h('strong', { class: 'neg' }, num(l.shortage, 0)) : '0'), h('td', { class: 'num' }, fmt.money(l.line_total)));
      });
      const edits = () => o.lines.map(l => ({ lineId: l.id, qty: Number(qIn[l.id].value), price: Number(pIn[l.id].value) })).filter((e, i) => e.qty !== Number(o.lines[i].qty) || e.price !== Number(o.lines[i].price));
      const act = (label, cls, fn, tid) => h('button', { class: 'btn ' + cls, dataset: { testid: tid }, onclick: ui.busy(null, fn) }, label);
      const actions = h('div', { class: 'row mt' });
      const approve = async (extra = {}) => {
        try { await SL.post('/api/orders/' + id + '/approve', { edits: extra.edits || edits(), acknowledgeShortage: !!extra.ack }); ui.toast(t('Approved'), 'ok'); await refresh(); }
        catch (e) {
          if (e.status === 409 && e.details && e.details.shortages) showShortage(e.details.shortages, e.message); else throw e;
        }
      };
      const showShortage = (shortages, msg) => {
        shortagePanel.replaceChildren(h('div', { class: 'shortage', dataset: { testid: 'shortage-panel' } }, h('h3', {}, '⚠ ' + t('Stock shortage')), h('p', {}, msg),
          h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, t('Product')), h('th', { class: 'num' }, t('Quantity')), h('th', { class: 'num' }, t('Free stock')), h('th', { class: 'num' }, t('Shortage')))),
            h('tbody', {}, shortages.map(s => h('tr', {}, h('td', {}, (o.lines.find(l => l.id === s.lineId) || {}).name), h('td', { class: 'num' }, s.ordered), h('td', { class: 'num' }, s.free), h('td', { class: 'num neg' }, 'short by ' + s.shortage))))),
          h('div', { class: 'row mt' },
            act(t('Reduce to available stock'), '', async () => { const ed = shortages.map(s => ({ lineId: s.lineId, qty: Number(s.free) })); if (ed.every(e => e.qty === 0) && ed.length === o.lines.length) { ui.toast('No stock available: reject or approve as back-order', 'bad'); return; } await approve({ edits: [...edits().filter(e => !ed.find(x => x.lineId === e.lineId)), ...ed] }); }, 'reduce'),
            act(t('Approve as back-order'), 'primary', () => approve({ ack: true }), 'backorder'),
            act(t('Reject'), 'danger', rejectIt, 'reject2'))));
      };
      const rejectIt = async () => { const r = await ui.ask(t('Reason'), { title: t('Reject order') }); if (!r) return; await SL.post('/api/orders/' + id + '/reject', { reason: r }); ui.toast(t('Rejected')); await refresh(); };
      if (isAdmin()) {
        if (o.status === 'SUBMITTED') actions.append(act(t('Approve'), 'primary', () => approve(), 'approve'), act(t('Reject'), 'danger', rejectIt, 'reject'));
        if (o.status === 'APPROVED') {
          const veh = inp({ placeholder: t('Vehicle no'), dataset: { testid: 'veh' } }), nts = inp({ placeholder: t('Notes') });
          actions.append(veh, nts, act(t('Create GST invoice'), 'primary', async () => { const r = await SL.post('/api/orders/' + id + '/invoice', { vehicleNo: veh.value, notes: nts.value }); ui.toast('Invoice ' + r.invoiceNo + ' · ' + fmt.money(r.total), 'ok'); await refresh(); }, 'invoice'), act(t('Reject'), 'danger', rejectIt, 'reject'));
        }
        if (['INVOICED', 'PARTIALLY_DISPATCHED'].includes(o.status)) {
          const dIn = {}; const veh = inp({ placeholder: t('Vehicle no') + ' *  e.g. TN45AB1234', required: true, dataset: { testid: 'veh' } });
          const rem = o.lines.filter(l => Number(l.remaining) > 0);
          const anyShort = rem.some(l => Number(l.shortage) > 0);
          const lines = () => rem.map(l => ({ orderLineId: l.id, qty: Number(dIn[l.id].value || 0) }));
          const box = h('div', { class: 'card flat mt' }, h('h3', {}, t('Dispatch')), h('div', { class: 'form-grid' }, rem.map(l => { dIn[l.id] = inp({ type: 'number', min: '0', max: l.remaining, step: '1', value: String(Number(l.remaining)), dataset: { line: l.id } }); return ui.field(l.name + ' · ' + t('Remaining') + ' ' + num(l.remaining, 0), dIn[l.id]); }), ui.field(t('Vehicle no'), veh)),
            h('div', { class: 'row mt' }, act(t('Dispatch'), 'primary', async () => { if (!veh.value.trim()) { veh.focus(); ui.toast(t('Enter the vehicle number first'), 'bad'); return; } const r = await SL.post('/api/orders/' + id + '/dispatch', { lines: lines(), vehicleNo: veh.value }); ui.toast(r.dispatchNo + ' · ' + r.status, 'ok'); await refresh(); }, 'dispatch'),
              anyShort ? act(t('Dispatch available stock'), '', async () => { if (!veh.value.trim()) { veh.focus(); ui.toast(t('Enter the vehicle number first'), 'bad'); return; } const r = await SL.post('/api/orders/' + id + '/dispatch', { lines: lines(), partial: true, vehicleNo: veh.value }); ui.toast(r.dispatchNo + ' · ' + r.status + ' · ' + t('Remaining') + ' ' + r.remaining, 'ok'); await refresh(); }, 'dispatch-partial') : null,
              anyShort ? h('span', { class: 'pill bad' }, t('Stock shortage')) : null));
          actions.append(box);
        }
      }
      const inv = o.invoice;
      wrap.replaceChildren(
        h('div', { class: 'row mb' }, ui.badge(o.status), h('span', { class: 'muted' }, ui.statusHelp(o.status)), o.source === 'OFFLINE' ? h('span', { class: 'pill info' }, 'OFFLINE') : null, o.shortage_ack ? h('span', { class: 'pill warn' }, 'BACK-ORDER') : null, o.anyShortage ? h('span', { class: 'pill bad' }, t('Stock shortage')) : null),
        h('dl', { class: 'kv' }, ...dl(0, t('Customer'), o.customer + ' (' + o.customer_type.toLowerCase() + ', ' + o.state + (o.gstin ? ', ' + o.gstin : '') + ')'), ...dl(0, t('Salesman'), o.salesman), ...dl(0, t('Placed'), fmt.dt(o.placed_at)), ...dl(0, t('Received'), fmt.dt(o.received_at)),
          ...dl(0, t('Place of supply'), o.state + ' · ' + t(intra ? 'Intra-state: CGST + SGST' : 'Inter-state: IGST')), o.reject_reason ? [...dl(0, t('Reason'), o.reject_reason)] : [], o.notes ? [...dl(0, t('Notes'), o.notes)] : []),
        ['DISPATCHED', 'REJECTED', 'CANCELLED'].includes(o.status) ? null : h('div', { class: 'stockstrip', dataset: { testid: 'stockstrip' } }, o.lines.map(l => h('div', {}, h('div', { class: 'muted' }, l.name), h('div', { class: 'row' }, h('span', {}, t('In stock') + ' ', h('b', {}, num(l.on_hand, 0))), h('span', {}, t('Promised') + ' ', h('b', {}, num(l.committed, 0))), h('span', {}, t('Free to sell') + ' ', h('b', { class: Number(l.shortage) > 0 ? 'neg' : '' }, num(l.free_stock, 0))))))),
        h('div', { class: 'tw mt' }, h('table', { class: 'lines' }, h('thead', {}, h('tr', {}, h('th', {}, t('Product')), h('th', { class: 'num' }, t('Price')), h('th', { class: 'num' }, t('Quantity')), h('th', { class: 'num' }, t('In stock')), h('th', { class: 'num' }, t('Promised')), h('th', { class: 'num' }, t('Free to sell')), h('th', { class: 'num' }, t('Shortage')), h('th', { class: 'num' }, t('Line total')))), h('tbody', {}, lineRows))),
        h('div', { class: 'row mt', style: { justifyContent: 'space-between', alignItems: 'flex-start' } },
          o.profit ? h('div', { dataset: { testid: 'order-profit' } }, h('div', { class: 'muted' }, t('Net profit / loss on this order')), ui.profit(o.profit.profit, o.profit.pct), h('div', { class: 'muted' }, `${t('Sale')} ${fmt.money(o.profit.revenue)} − ${t('cost')} ${fmt.money(o.profit.cost)} (${t('based on latest batch cost, before GST')})`)) : h('div', { class: 'muted' }, t('Profit shows after a batch has been made')),
          h('div', {}, h('div', { class: 'muted' }, t('Tax preview')), totals)),
        shortagePanel, actions,
        inv ? h('div', { class: 'row mt banner ok' }, h('span', {}, 'Invoice ', h('strong', {}, inv.invoice_no), ' · ', fmt.money(inv.total), ' · ', inv.status), h('span', { class: 'grow' }),
          h('button', { class: 'btn small', onclick: () => SL.open('/api/invoices/' + inv.id + '/pdf') }, t('Download PDF')), h('button', { class: 'btn small', onclick: () => shareInvoice(inv.id) }, t('Share')), h('button', { class: 'btn small', onclick: () => openInvoice(inv.id, onChange) }, t('Open invoice'))) : null,
        h('h3', { class: 'mt' }, t('History')), await history('ORDER', id));
      calc();
      if (o.status === 'SUBMITTED' && o.anyShortage && editable) { /* shortage visible in table; panel appears on approve */ }
      return o;
    };
    const o = await SL.get('/api/orders/' + id);
    modal = ui.modal(o.orderNo + ' · ' + o.customer, wrap, { width: '1040px' });
    await paint(o);
  }

  // ------------------------------------------------------------------ INVOICES
  async function shareInvoice(id) {
    const s = await SL.get('/api/invoices/' + id + '/share');
    const m = ui.modal(t('Share'), h('div', { class: 'stack' }, h('p', {}, s.message), h('div', { class: 'row' },
      h('a', { class: 'btn primary', href: s.whatsappUrl, target: '_blank', rel: 'noopener' }, t('WhatsApp')), h('a', { class: 'btn', href: s.mailto }, t('Email')),
      h('button', { class: 'btn', onclick: async () => { try { await navigator.clipboard.writeText(s.url); ui.toast('Link copied', 'ok'); } catch (_) { ui.toast(s.url); } } }, t('Copy link'))),
      h('input', { readonly: true, value: s.url, onclick: e => e.target.select() })), { width: '560px' });
    return m;
  }
  async function openInvoice(id, onChange) {
    const wrap = h('div', {});
    const paint = async () => {
      const i = await SL.get('/api/invoices/' + id), intra = i.supply_type === 'INTRA', cancelled = i.status === 'CANCELLED';
      const actions = h('div', { class: 'row mt' },
        h('button', { class: 'btn', onclick: () => SL.open('/api/invoices/' + id + '/pdf') }, t('Download PDF')), h('button', { class: 'btn', onclick: () => shareInvoice(id).catch(ui.err) }, t('Share')),
        h('button', { class: 'btn', onclick: async () => { const e = await SL.get('/api/invoices/' + id + '/einvoice'); ui.modal('e-Invoice (MOCK)', h('div', {}, h('div', { class: 'banner warn' }, 'MOCK: nothing was sent to the Invoice Registration Portal. Shape follows NIC INV-01 for illustration.'), h('pre', { class: 'json' }, JSON.stringify(e, null, 2))), { width: '820px' }); } }, 'e-Invoice (mock)'),
        i.creditNote ? h('button', { class: 'btn', onclick: () => SL.open('/api/invoices/' + id + '/credit-note/pdf') }, t('Credit note') + ' PDF') : null);
      if (isAdmin() && !cancelled) {
        actions.append(h('button', { class: 'btn', dataset: { testid: 'inv-edit' }, onclick: () => editMeta(i) }, t('Edit details')),
          h('button', { class: 'btn danger', dataset: { testid: 'inv-cancel' }, onclick: () => cancelIt(i) }, t('Cancel with credit note')));
      }
      const editMeta = i2 => {
        const veh = inp({ value: i2.vehicle_no || '' }), nts = inp({ value: i2.notes || '' }), adr = h('textarea', {}, i2.buyer_address || ''), why = inp({ placeholder: t('Reason') }), err = h('div', { class: 'err' });
        const m = ui.modal(t('Edit details'), h('div', { class: 'stack' }, h('div', { class: 'banner info' }, 'Amounts, items and tax cannot be edited on a posted invoice: cancel it with a credit note and raise a new one.'),
          ui.field(t('Vehicle no'), veh), ui.field(t('Notes'), nts), ui.field('Buyer address', adr), ui.field(t('Reason'), why), err,
          h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn primary', onclick: ui.busy(null, async () => { try { await SL.patch('/api/invoices/' + id, { vehicleNo: veh.value, notes: nts.value, buyerAddress: adr.value, reason: why.value }); m.close(); ui.toast(t('Saved'), 'ok'); await paint(); } catch (e) { err.textContent = e.message; } }) }, t('Save')))), { width: '560px' });
      };
      const cancelIt = i2 => {
        const why = h('textarea', { placeholder: t('Reason'), dataset: { testid: 'cn-reason' } }), ret = h('input', { type: 'checkbox', dataset: { testid: 'cn-return' }, style: { width: 'auto', minHeight: 0 } }), err = h('div', { class: 'err' });
        const m = ui.modal(t('Cancel with credit note'), h('div', { class: 'stack' }, h('div', { class: 'banner warn' }, 'A posted invoice is never deleted. A credit note for the full amount is issued; the invoice stays on record as CANCELLED.'),
          ui.field(t('Reason') + ' *', why), h('label', { class: 'row' }, ret, t('Goods returned to stock')), err,
          h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn', onclick: () => m.close() }, t('Cancel')), h('button', { class: 'btn danger', dataset: { testid: 'cn-confirm' }, onclick: ui.busy(null, async () => { try { const r = await SL.post('/api/invoices/' + id + '/cancel', { reason: why.value, returnGoods: ret.checked }); m.close(); ui.toast('Credit note ' + r.creditNoteNo, 'ok'); await paint(); if (onChange) onChange(); } catch (e) { err.textContent = e.message; } }) }, t('Cancel with credit note')))), { width: '520px' });
      };
      wrap.replaceChildren(
        h('div', { class: 'row mb' }, ui.badge(i.status), h('span', { class: 'pill ' + (intra ? 'info' : 'warn') }, intra ? 'CGST + SGST' : 'IGST')),
        h('dl', { class: 'kv' }, ...dl(0, t('Customer'), i.buyer_name), ...dl(0, 'GSTIN', i.buyer_gstin || 'Unregistered'), ...dl(0, t('Place of supply'), i.state_name + ' (' + i.place_of_supply + ')'), ...dl(0, t('Date'), fmt.date(i.invoice_date)), ...dl(0, 'Due', fmt.date(i.due_date)), ...dl(0, t('Vehicle no'), i.vehicle_no), ...dl(0, t('Notes'), i.notes), ...dl(0, 'Order', h('a', { href: '#/orders', onclick: () => {} }, '#' + i.order_id))),
        ui.table([{ label: t('Product'), key: 'description' }, { label: 'HSN', key: 'hsn' }, { label: t('Quantity'), render: l => num(l.qty, 0), cls: 'num' }, { label: t('Price'), render: l => fmt.money(l.rate), cls: 'num' }, { label: t('Taxable'), render: l => fmt.money(l.taxable), cls: 'num' }, { label: 'GST %', render: l => l.gst_rate, cls: 'num' },
          ...(intra ? [{ label: 'CGST', render: l => fmt.money(l.cgst), cls: 'num' }, { label: 'SGST', render: l => fmt.money(l.sgst), cls: 'num' }] : [{ label: 'IGST', render: l => fmt.money(l.igst), cls: 'num' }]), { label: t('Total'), render: l => fmt.money(l.total), cls: 'num' }], i.lines),
        h('div', { class: 'row mt', style: { justifyContent: 'flex-end' } }, h('dl', { class: 'kv totals' }, ...dl(0, t('Taxable'), fmt.money(i.taxable)), ...(intra ? [...dl(0, 'CGST', fmt.money(i.cgst)), ...dl(0, 'SGST', fmt.money(i.sgst))] : dl(0, 'IGST', fmt.money(i.igst))), ...dl(0, t('Total'), h('strong', {}, fmt.money(i.total))), ...dl(0, t('Paid'), fmt.money(i.paid)), ...dl(0, t('Outstanding'), h('strong', { class: Number(i.outstanding) > 0 ? 'neg' : '', dataset: { testid: 'inv-outstanding' } }, fmt.money(i.outstanding))))),
        i.creditNote ? h('div', { class: 'banner bad' }, t('Credit note') + ' ' + i.creditNote.cn_no + ' · ' + fmt.money(i.creditNote.total) + ' · ' + i.creditNote.reason + (i.creditNote.goods_returned ? ' · goods returned to stock' : '')) : null,
        i.payments.length ? h('div', {}, h('h3', {}, t('Receipts')), ui.table([{ label: t('Date'), render: p => fmt.date(p.paid_on) }, { label: 'Receipt', key: 'receipt_no' }, { label: t('Mode'), key: 'mode' }, { label: t('Reference'), key: 'reference' }, { label: t('Amount'), render: p => fmt.money(p.amount), cls: 'num' }], i.payments)) : null,
        actions, h('h3', { class: 'mt' }, t('History')), await history('INVOICE', id));
    };
    const i0 = await SL.get('/api/invoices/' + id);
    ui.modal(i0.invoice_no, wrap, { width: '1000px' });
    await paint();
  }

  SL.view('invoices', {
    roles: ['ADMIN', 'AUDITOR', 'OWNER'], label: 'Invoices', icon: '🧾',
    async render(el) {
      const st = { from: fmt.monthStart(), to: fmt.today(), all: false };
      const body = h('div', {});
      const load = async () => {
        const rows = await SL.get('/api/invoices' + (st.all ? '?all=1' : SL.qs({ from: st.from, to: st.to })));
        const sum = k => rows.filter(r => r.status === 'POSTED').reduce((a, r) => a + Number(r[k]), 0);
        body.replaceChildren(ui.table([
          { label: 'Invoice', render: r => h('strong', {}, r.invoice_no), foot: true }, { label: t('Date'), render: r => fmt.date(r.invoice_date) }, { label: t('Customer'), key: 'customer' }, { label: t('Status'), render: r => ui.badge(r.status) },
          { label: t('Taxable'), render: r => fmt.money(r.taxable), cls: 'num', foot: rs => fmt.money(sum('taxable')) }, { label: 'CGST', render: r => fmt.money(r.cgst), cls: 'num hide-m', foot: () => fmt.money(sum('cgst')) }, { label: 'SGST', render: r => fmt.money(r.sgst), cls: 'num hide-m', foot: () => fmt.money(sum('sgst')) },
          { label: 'IGST', render: r => fmt.money(r.igst), cls: 'num hide-m', foot: () => fmt.money(sum('igst')) }, { label: t('Total'), render: r => fmt.money(r.total), cls: 'num', foot: () => fmt.money(sum('total')) }, { label: t('Paid'), render: r => fmt.money(r.paid), cls: 'num', foot: () => fmt.money(sum('paid')) },
          { label: t('Outstanding'), render: r => h('span', { class: Number(r.outstanding) > 0 ? 'neg' : '' }, fmt.money(r.outstanding)), cls: 'num', foot: () => fmt.money(sum('outstanding')) }], rows, { onRow: r => openInvoice(r.id, load).catch(ui.err), foot: rows.length > 0 }));
      };
      const all = h('input', { type: 'checkbox', style: { width: 'auto', minHeight: 0 }, onchange: e => { st.all = e.target.checked; load().catch(ui.err); } });
      el.append(ui.pagehead(t('Invoices'), 'Posted invoices are never deleted: cancel with a credit note.', ui.dateRange(st, () => load().catch(ui.err)), h('label', { class: 'row' }, all, t('All dates'))), body);
      await load();
    },
  });

  // ------------------------------------------------------------------ PAYMENTS
  SL.view('payments', {
    roles: ['ADMIN', 'AUDITOR', 'OWNER'], label: 'Payments', icon: '💰',
    async render(el) {
      const st = { from: fmt.monthStart(), to: fmt.today() };
      const balBox = h('div', {}), listBox = h('div', {}), formBox = h('div', {});
      const loadBal = async () => {
        const bal = await SL.get('/api/customers-balances');
        balBox.replaceChildren(ui.table([{ label: t('Customer'), key: 'name' }, { label: 'Type', key: 'type', cls: 'hide-m' }, { label: 'Credit days', key: 'credit_days', cls: 'num hide-m' }, { label: 'Billed', render: r => fmt.money(r.billed), cls: 'num' }, { label: t('Paid'), render: r => fmt.money(r.paid), cls: 'num' },
          { label: t('Outstanding'), render: r => h('strong', { class: Number(r.outstanding) > 0 ? 'neg' : '', dataset: { cust: r.name } }, fmt.money(r.outstanding)), cls: 'num' }], bal));
        return bal;
      };
      const loadList = async () => {
        const rows = await SL.get('/api/payments' + SL.qs(st));
        listBox.replaceChildren(ui.table([{ label: t('Date'), render: p => fmt.date(p.paid_on) }, { label: 'Receipt', key: 'receipt_no' }, { label: t('Customer'), key: 'customer' }, { label: 'Invoice', key: 'invoice_no' }, { label: t('Mode'), key: 'mode' }, { label: t('Reference'), key: 'reference', cls: 'hide-m' }, { label: t('Amount'), render: p => fmt.money(p.amount), cls: 'num', foot: rs => fmt.money(rs.reduce((a, p) => a + Number(p.amount), 0)) }], rows, { foot: rows.length > 0 }));
      };
      const bal = await loadBal();
      if (isAdmin()) {
        const cust = sel([['', '—']].concat(bal.map(b => [b.id, b.name + ' · ' + fmt.money(b.outstanding)])), '', { dataset: { testid: 'pay-cust' } });
        const invSel = h('select', { dataset: { testid: 'pay-inv' } }), amt = inp({ type: 'number', min: '0.01', step: '0.01', dataset: { testid: 'pay-amt' } }), mode = sel(['CASH', 'UPI', 'BANK', 'CHEQUE'].map(m => [m, m]), 'CASH'), ref = inp({}), date = inp({ type: 'date', min: '2000-01-01', max: fmt.today(), value: fmt.today() }), err = h('div', { class: 'err' });
        let open = [];
        const setInv = () => { const i = open.find(x => String(x.id) === invSel.value); amt.value = i ? i.outstanding : ''; };
        invSel.onchange = setInv;
        cust.onchange = async () => { open = cust.value ? (await SL.get('/api/invoices?all=1&status=POSTED&customerId=' + cust.value)).filter(i => Number(i.outstanding) > 0) : []; invSel.replaceChildren(...open.map(i => h('option', { value: i.id }, i.invoice_no + ' · ' + t('Outstanding') + ' ' + fmt.money(i.outstanding)))); if (!open.length && cust.value) invSel.append(h('option', { value: '' }, 'No open invoices')); setInv(); };
        formBox.append(ui.card(t('Record payment'), h('div', { class: 'form-grid' }, ui.field(t('Customer'), cust), ui.field(t('Open invoice'), invSel), ui.field(t('Amount') + ' (₹)', amt), ui.field(t('Mode'), mode), ui.field(t('Reference'), ref), ui.field(t('Date'), date)), err,
          h('div', { class: 'row mt' }, h('button', { class: 'btn primary', dataset: { testid: 'pay-save' }, onclick: ui.busy(null, async () => { err.textContent = ''; try { const r = await SL.post('/api/payments', { invoiceId: Number(invSel.value), amount: amt.value, mode: mode.value, reference: ref.value, paidOn: date.value }); ui.toast(r.receiptNo + ' · ' + t('Outstanding') + ' ' + fmt.money(r.outstanding), 'ok'); await loadBal(); await loadList(); cust.value = ''; await cust.onchange(); } catch (e) { err.textContent = e.message; } }) }, t('Record payment')))));
      }
      el.append(ui.pagehead(t('Payments'), null, h('button', { class: 'btn', onclick: () => SL.go('reports') }, t('Outstanding & ageing report'))), formBox,
        h('h2', { class: 'mt' }, t('Customer balances')), balBox, h('div', { class: 'row mt' }, h('h2', {}, t('Receipts')), h('span', { class: 'grow' }), ui.dateRange(st, () => loadList().catch(ui.err))), listBox);
      await loadList();
    },
  });

  // ------------------------------------------------------------------ MASTERS
  const formModal = (title, fields, onSave, width) => {
    const err = h('div', { class: 'err', role: 'alert' });
    const m = ui.modal(title, h('div', { class: 'stack' }, fields, err, h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn', onclick: () => m.close() }, t('Cancel')), h('button', { class: 'btn primary', dataset: { testid: 'form-save' }, onclick: async ev => { const b = ev.currentTarget; b.disabled = true; err.textContent = ''; try { await onSave(); m.close(); } catch (e) { err.textContent = e.message; } finally { b.disabled = false; } } }, t('Save')))), { width: width || '720px', sticky: true });
    return m;
  };
  const stateOpts = states => states.map(s => [s.code, s.code + ' · ' + s.name]);

  SL.view('masters', {
    roles: ['ADMIN', 'PRODUCTION', 'AUDITOR', 'OWNER'], label: 'Masters', icon: '🗂️',
    async render(el) {
      const [units, states] = await Promise.all([SL.get('/api/bootstrap').then(b => b.units), SL.get('/api/states')]);
      const body = h('div', {});
      const admin = isAdmin();
      const tabs = [['products', t('Products')], ['customers', t('Customers')], ['suppliers', t('Suppliers')], ['items', t('Items')], ['boms', t('BOMs')]];
      if (admin) tabs.push(['users', t('Users')]);
      const addBtn = (label, fn) => admin ? h('button', { class: 'btn primary', dataset: { testid: 'add' }, onclick: fn }, '+ ' + label) : null;
      const tabViews = {
        // ---------------- products
        async products() {
          const [prods, boms, pack] = await Promise.all([SL.get('/api/products'), SL.get('/api/boms'), SL.get('/api/items?type=PACKAGING')]);
          const edit = p => {
            const f = { code: inp({ value: p ? p.code : '', disabled: !!p, dataset: { f: 'code' } }), name: inp({ value: p ? p.name : '', dataset: { f: 'name' } }), bom: sel(boms.map(b => [b.id, b.name]), p ? p.bom_id : boms[0] && boms[0].id, { dataset: { f: 'bom' } }),
              pack: inp({ type: 'number', step: '1', min: '1', value: p ? Number(p.pack_size_g) : '', dataset: { f: 'pack' } }), hsn: inp({ value: p ? p.hsn : '19059030', dataset: { f: 'hsn' } }), gst: inp({ type: 'number', step: '0.01', value: p ? p.gst_rate : '5', dataset: { f: 'gst' } }),
              price: inp({ type: 'number', step: '0.01', value: p ? p.price : '', dataset: { f: 'price' } }), cap: inp({ type: 'number', step: '1', min: '1', value: p ? p.carton_capacity : '20', dataset: { f: 'cap' } }), shelf: inp({ type: 'number', step: '1', min: '1', value: p ? p.shelf_life_days : '90', dataset: { f: 'shelf' } }) };
            const pk = (p ? p.packaging : pack.length ? [{ item_id: pack[0].id, qty_per_packet: 1 }] : []).map(x => ({ item: x.item_id, q: Number(x.qty_per_packet) }));
            const pkBox = h('div', {}), derived = h('div', { class: 'muted' });
            const calcDerived = () => { const b = boms.find(x => String(x.id) === String(f.bom.value)); derived.textContent = b && Number(f.pack.value) > 0 ? 'Packets per batch: ' + num(Number(b.batch_output_g) / Number(f.pack.value), 2) + ' (' + num(b.batch_output_g, 0) + ' g per batch ÷ pack size)' : ''; };
            f.bom.onchange = calcDerived; f.pack.oninput = calcDerived;
            const drawPk = () => pkBox.replaceChildren(...pk.map((x, i) => { const q = inp({ type: 'number', step: '0.000001', value: x.q, class: 'mini', dataset: { f: 'pk-q' }, oninput: e => { x.q = Number(e.target.value); } }); const per = inp({ type: 'number', step: '1', min: '1', class: 'mini', placeholder: 'N', oninput: e => { if (Number(e.target.value) > 0) { x.q = Math.round(1e6 / Number(e.target.value)) / 1e6; q.value = x.q; } } });
              return h('div', { class: 'row mb' }, sel(pack.map(a => [a.id, a.name]), x.item, { onchange: e => { x.item = Number(e.target.value); } }), q, h('span', { class: 'muted' }, 'per packet · 1 per'), per, h('span', { class: 'muted' }, 'packets'), h('button', { class: 'btn small danger', onclick: () => { pk.splice(i, 1); drawPk(); } }, '✕')); }),
              h('button', { class: 'btn small', onclick: () => { pk.push({ item: pack[0] && pack[0].id, q: 1 }); drawPk(); } }, '+ ' + t('Packaging')));
            drawPk(); calcDerived();
            formModal(p ? t('Edit') + ' ' + p.name : t('Add') + ' ' + t('Products'), [
              h('div', { class: 'banner info' }, 'A new pack size (e.g. 500 g) simply shares an existing recipe (BOM): packets per batch = batch output ÷ pack size. Only packaging per packet differs.'),
              h('div', { class: 'form-grid' }, ui.field(t('Code'), f.code), ui.field(t('Name'), f.name), ui.field('BOM', f.bom), ui.field(t('Pack size (g)'), f.pack), ui.field('HSN', f.hsn), ui.field(t('GST %'), f.gst), ui.field(t('Price') + ' (₹, before tax)', f.price), ui.field('Packets per carton', f.cap), ui.field('Shelf life (days)', f.shelf)),
              derived, h('h3', {}, t('Packaging') + ' (per packet)'), pkBox], async () => {
              const body = { code: f.code.value, name: f.name.value, bomId: Number(f.bom.value), packSizeG: f.pack.value, hsn: f.hsn.value, gstRate: f.gst.value, price: f.price.value, cartonCapacity: Number(f.cap.value), shelfLifeDays: Number(f.shelf.value), packaging: pk.filter(x => x.item && x.q > 0).map(x => ({ itemId: Number(x.item), qtyPerPacket: x.q })) };
              if (p) await SL.put('/api/products/' + p.item_id, { ...body, active: p.active }); else await SL.post('/api/products', body);
              ui.toast(t('Saved'), 'ok'); show('products');
            }, '780px');
          };
          return [h('div', { class: 'row mb' }, h('span', { class: 'grow' }), addBtn(t('Products'), () => edit(null))), ui.table([{ label: t('Code'), key: 'code' }, { label: t('Name'), render: p => h('strong', {}, p.name) }, { label: 'BOM', key: 'bom_name', cls: 'hide-m' }, { label: t('Pack size (g)'), render: p => num(p.pack_size_g, 0), cls: 'num' }, { label: 'Pkts/batch', render: p => num(p.packets_per_batch, 1), cls: 'num' },
            { label: 'HSN', key: 'hsn', cls: 'hide-m' }, { label: 'GST', render: p => p.gst_rate + '%', cls: 'num' }, { label: t('Price'), render: p => fmt.money(p.price), cls: 'num' }, { label: 'Carton', render: p => p.carton_capacity, cls: 'num hide-m' },
            { label: t('Packaging'), render: p => p.packaging.map(x => x.name + ' ×' + Number(x.qty_per_packet)).join(', '), cls: 'hide-m' }, { label: t('Active'), render: p => (p.active ? '✓' : '—') }], prods, { onRow: admin ? edit : null })];
        },
        // ---------------- customers
        async customers() {
          const [rows, prods] = await Promise.all([SL.get('/api/customers'), SL.get('/api/products')]);
          const edit = async c => {
            const f = { name: inp({ value: c ? c.name : '', dataset: { f: 'name' } }), type: sel([['RETAILER', 'Retailer'], ['DISTRIBUTOR', 'Distributor']], c ? c.type : 'RETAILER'), state: sel(stateOpts(states), c ? c.state_code : '33', { dataset: { f: 'state' } }), gstin: inp({ value: c ? c.gstin || '' : '', placeholder: 'optional, validated', dataset: { f: 'gstin' } }),
              addr: h('textarea', {}, c ? c.address || '' : ''), phone: inp({ value: c ? c.phone || '' : '' }), email: inp({ value: c ? c.email || '' : '' }), credit: inp({ type: 'number', value: c ? c.credit_days : 30 }) };
            const pr = {}; let existing = [];
            if (c) existing = await SL.get('/api/customers/' + c.id + '/prices').catch(() => []);
            const priceBox = c ? h('div', {}, h('h3', {}, 'Customer-specific prices'), h('p', { class: 'muted' }, 'Leave blank to use the list price.'), h('div', { class: 'form-grid' }, prods.map(p => { const cur = existing.find(e => e.product_id === p.item_id); pr[p.item_id] = inp({ type: 'number', step: '0.01', placeholder: 'List ' + p.price, value: cur ? cur.price : '' }); return ui.field(p.name, pr[p.item_id]); }))) : h('p', { class: 'muted' }, 'Save first, then set customer-specific prices.');
            formModal(c ? t('Edit') + ' ' + c.name : t('Add') + ' ' + t('Customer'), [h('div', { class: 'form-grid' }, ui.field(t('Name'), f.name), ui.field('Type', f.type), ui.field('State', f.state), ui.field('GSTIN', f.gstin), ui.field('Phone', f.phone), ui.field('Email', f.email), ui.field('Credit days', f.credit)), ui.field('Address', f.addr), priceBox], async () => {
              const body = { name: f.name.value, type: f.type.value, stateCode: f.state.value, gstin: f.gstin.value, address: f.addr.value, phone: f.phone.value, email: f.email.value, creditDays: Number(f.credit.value), active: c ? c.active : true };
              if (c) { await SL.put('/api/customers/' + c.id, body); await SL.put('/api/customers/' + c.id + '/prices', { prices: prods.map(p => ({ productId: p.item_id, price: pr[p.item_id].value === '' ? null : pr[p.item_id].value })) }); } else await SL.post('/api/customers', body);
              ui.toast(t('Saved'), 'ok'); show('customers');
            });
          };
          return [h('div', { class: 'row mb' }, h('span', { class: 'grow' }), addBtn(t('Customers'), () => edit(null))), ui.table([{ label: t('Name'), render: c => h('strong', {}, c.name) }, { label: 'Type', key: 'type' }, { label: 'State', render: c => c.state_code + ' ' + c.state }, { label: 'GSTIN', render: c => c.gstin || 'Unregistered', cls: 'hide-m' }, { label: 'Phone', key: 'phone', cls: 'hide-m' }, { label: 'Credit days', key: 'credit_days', cls: 'num' }, { label: t('Active'), render: c => (c.active ? '✓' : '—') }], rows, { onRow: admin ? edit : null })];
        },
        // ---------------- suppliers
        async suppliers() {
          const rows = await SL.get('/api/suppliers');
          const edit = s => {
            const f = { name: inp({ value: s ? s.name : '' }), state: sel(stateOpts(states), s ? s.state_code : '33'), gstin: inp({ value: s ? s.gstin || '' : '' }), phone: inp({ value: s ? s.phone || '' : '' }), email: inp({ value: s ? s.email || '' : '' }), addr: h('textarea', {}, s ? s.address || '' : '') };
            formModal(s ? t('Edit') + ' ' + s.name : t('Add') + ' ' + t('Suppliers'), [h('div', { class: 'form-grid' }, ui.field(t('Name'), f.name), ui.field('State', f.state), ui.field('GSTIN', f.gstin), ui.field('Phone', f.phone), ui.field('Email', f.email)), ui.field('Address', f.addr)], async () => {
              const body = { name: f.name.value, stateCode: f.state.value, gstin: f.gstin.value, phone: f.phone.value, email: f.email.value, address: f.addr.value, active: s ? s.active : true };
              if (s) await SL.put('/api/suppliers/' + s.id, body); else await SL.post('/api/suppliers', body); ui.toast(t('Saved'), 'ok'); show('suppliers');
            });
          };
          return [h('div', { class: 'row mb' }, h('span', { class: 'grow' }), addBtn(t('Suppliers'), () => edit(null))), ui.table([{ label: t('Name'), render: s => h('strong', {}, s.name) }, { label: 'State', render: s => (s.state_code || '') + ' ' + (s.state || '') }, { label: 'GSTIN', render: s => s.gstin || 'Unregistered' }, { label: 'Phone', key: 'phone' }, { label: t('Active'), render: s => (s.active ? '✓' : '—') }], rows, { onRow: admin ? edit : null })];
        },
        // ---------------- items (raw + packaging)
        async items() {
          const rows = (await SL.get('/api/items')).filter(i => i.type !== 'FINISHED');
          const canEdit = admin || role() === 'PRODUCTION';
          const edit = it => {
            const f = { code: inp({ value: it ? it.code : '', disabled: !!it }), name: inp({ value: it ? it.name : '', disabled: !!it && !admin }), type: sel([['RAW', 'Raw material'], ['PACKAGING', 'Packaging']], it ? it.type : 'RAW', { disabled: !!it }), unit: sel(units.map(u => [u.code, u.code + ' · ' + u.name]), it ? it.unit : 'kg', { disabled: !!it }), reorder: inp({ type: 'number', step: '0.001', value: it ? Number(it.reorder_level) : 0, dataset: { f: 'reorder' } }), active: h('input', { type: 'checkbox', checked: it ? it.active : true, style: { width: 'auto', minHeight: 0 } }) };
            formModal(it ? t('Edit') + ' ' + it.name : t('Add') + ' ' + t('Items'), [h('div', { class: 'form-grid' }, ui.field(t('Code'), f.code), ui.field(t('Name'), f.name), ui.field('Type', f.type), ui.field('Stock unit', f.unit), ui.field(t('Reorder level'), f.reorder)), it ? h('label', { class: 'row' }, f.active, t('Active')) : null], async () => {
              if (it) await SL.put('/api/items/' + it.id, { name: f.name.value, reorderLevel: f.reorder.value, active: f.active.checked }); else await SL.post('/api/items', { code: f.code.value, name: f.name.value, type: f.type.value, unit: f.unit.value, reorderLevel: f.reorder.value });
              ui.toast(t('Saved'), 'ok'); show('items');
            }, '620px');
          };
          return [h('div', { class: 'row mb' }, h('span', { class: 'grow' }), canEdit ? h('button', { class: 'btn primary', dataset: { testid: 'add' }, onclick: () => edit(null) }, '+ ' + t('Items')) : null),
            ui.table([{ label: t('Code'), key: 'code' }, { label: t('Name'), render: i => h('strong', {}, i.name) }, { label: 'Type', key: 'type' }, { label: 'Unit', key: 'unit' }, { label: t('On hand'), render: i => num(i.balance) + ' ' + i.unit, cls: 'num' }, { label: t('Reorder level'), render: i => num(i.reorder_level), cls: 'num' },
              { label: 'Avg cost', render: i => fmt.money(i.avg_cost), cls: 'num hide-m' }, { label: t('Active'), render: i => (i.active ? '✓' : '—') }, { label: '', render: i => (i.low ? h('span', { class: 'pill bad' }, t('Low stock')) : '') }], rows, { onRow: canEdit ? edit : null })];
        },
        // ---------------- BOMs
        async boms() {
          const [rows, raw, prods] = await Promise.all([SL.get('/api/boms'), SL.get('/api/items?type=RAW'), SL.get('/api/products')]);
          const edit = b => {
            const f = { name: inp({ value: b ? b.name : '', dataset: { f: 'name' } }), out: inp({ type: 'number', step: '1', value: b ? Number(b.batch_output_g) : '', dataset: { f: 'out' } }), notes: inp({ value: b ? b.notes || '' : '' }) };
            const lines = (b ? b.lines : [{ item_id: raw[0] && raw[0].id, qty: 1, unit: raw[0] && raw[0].unit }]).map(l => ({ item: l.item_id, qty: Number(l.qty), unit: l.unit }));
            const box = h('div', {}), uopts = units.filter(u => u.code !== 'carton' && u.code !== 'packet').map(u => [u.code, u.code]);
            const draw = () => box.replaceChildren(...lines.map((l, i) => h('div', { class: 'row mb' }, sel(raw.map(r => [r.id, r.name]), l.item, { onchange: e => { l.item = Number(e.target.value); } }), inp({ type: 'number', step: '0.0001', class: 'mini', value: l.qty, oninput: e => { l.qty = Number(e.target.value); } }), sel(uopts, l.unit, { class: 'mini', onchange: e => { l.unit = e.target.value; } }), h('span', { class: 'muted' }, 'per batch'), h('button', { class: 'btn small danger', onclick: () => { lines.splice(i, 1); draw(); } }, '✕'))), h('button', { class: 'btn small', onclick: () => { lines.push({ item: raw[0].id, qty: 1, unit: raw[0].unit }); draw(); } }, '+ line'));
            draw();
            const used = b ? prods.filter(p => p.bom_id === b.id).map(p => p.name + ' (' + num(Number(b.batch_output_g) / Number(p.pack_size_g), 1) + ' packets/batch)') : [];
            formModal(b ? t('Edit') + ' ' + b.name : t('Add') + ' BOM', [h('div', { class: 'banner info' }, 'One BOM = one batch of raw materials and the grams of finished snack it makes. Packaging is set per product pack size.'), h('div', { class: 'form-grid' }, ui.field(t('Name'), f.name), ui.field('Batch output (g)', f.out), ui.field(t('Notes'), f.notes)), used.length ? h('p', { class: 'muted' }, 'Used by: ' + used.join(', ')) : null, h('h3', {}, 'Recipe lines (per batch)'), box], async () => {
              const body = { name: f.name.value, batchOutputG: f.out.value, notes: f.notes.value, lines: lines.map(l => ({ itemId: Number(l.item), qty: l.qty, unit: l.unit })) };
              if (b) await SL.put('/api/boms/' + b.id, body); else await SL.post('/api/boms', body); ui.toast(t('Saved'), 'ok'); show('boms');
            });
          };
          return [h('div', { class: 'row mb' }, h('span', { class: 'grow' }), addBtn('BOM', () => edit(null))), h('div', { class: 'stack' }, rows.map(b => h('div', { class: 'card' }, h('div', { class: 'row' }, h('h3', { style: { margin: 0 } }, b.name), h('span', { class: 'pill' }, 'v' + b.version), h('span', { class: 'muted' }, 'Batch output ' + num(b.batch_output_g, 0) + ' g'), h('span', { class: 'grow' }), admin ? h('button', { class: 'btn small', dataset: { testid: 'bom-edit' }, onclick: () => edit(b) }, t('Edit')) : null),
            ui.table([{ label: 'Material', key: 'name' }, { label: 'Per batch', render: l => num(l.qty, 4) + ' ' + l.unit, cls: 'num' }], b.lines), h('p', { class: 'muted' }, 'Products: ' + (prods.filter(p => p.bom_id === b.id).map(p => p.name + ' → ' + num(Number(b.batch_output_g) / Number(p.pack_size_g), 1) + ' pkts').join(' · ') || '—')))))];
        },
        // ---------------- users
        async users() {
          const rows = await SL.get('/api/users');
          const add = () => { const f = { u: inp({}), n: inp({}), r: sel(['ADMIN', 'SALES', 'PRODUCTION', 'AUDITOR', 'OWNER'].map(x => [x, x]), 'SALES'), p: inp({ type: 'password', autocomplete: 'new-password' }) };
            formModal(t('Add') + ' ' + t('Users'), [h('div', { class: 'form-grid' }, ui.field(t('Username'), f.u), ui.field(t('Full name'), f.n), ui.field(t('Role'), f.r), ui.field(t('Password') + ' (min 8)', f.p))], async () => { await SL.post('/api/users', { username: f.u.value, fullName: f.n.value, role: f.r.value, password: f.p.value }); ui.toast(t('Saved'), 'ok'); show('users'); }, '560px'); };
          return [h('div', { class: 'row mb' }, h('span', { class: 'grow' }), addBtn(t('Users'), add)), ui.table([{ label: t('Username'), render: u => h('strong', {}, u.username) }, { label: t('Full name'), key: 'full_name' }, { label: t('Role'), render: u => h('span', { class: 'pill' }, u.role) }, { label: t('Active'), render: u => (u.active ? '✓' : '—') },
            { label: '', render: u => h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: ui.busy(null, async () => { const p = await ui.ask(t('New password') + ' (min 8)', { title: t('Reset password') + ': ' + u.username }); if (!p) return; await SL.put('/api/users/' + u.id, { password: p }); ui.toast(t('Saved'), 'ok'); }) }, t('Reset password')),
              h('button', { class: 'btn small ' + (u.active ? 'danger' : ''), onclick: ui.busy(null, async () => { await SL.put('/api/users/' + u.id, { active: !u.active }); show('users'); }) }, u.active ? t('Deactivate') : t('Activate'))) }], rows)];
        },
      };
      const show = async id => { body.replaceChildren(ui.loading()); try { body.replaceChildren(...(await tabViews[id]())); } catch (e) { body.replaceChildren(h('div', { class: 'banner bad' }, e.message)); } };
      el.append(ui.pagehead(t('Masters'), admin ? null : t('Read-only for your role.') + (role() === 'PRODUCTION' ? ' You can change reorder levels under Items.' : '')), ui.tabs(tabs, 'products', show), body);
    },
  });

  // ------------------------------------------------------------------ SETTINGS
  SL.view('settings', {
    roles: ['ADMIN', 'SALES', 'PRODUCTION', 'AUDITOR', 'OWNER'], label: 'Settings', icon: '⚙️',
    async render(el) {
      const u = SL.state.user;
      const oldP = inp({ type: 'password', autocomplete: 'current-password' }), newP = inp({ type: 'password', autocomplete: 'new-password' }), perr = h('div', { class: 'err' });
      el.append(ui.pagehead(t('Settings'), u.fullName + ' · ' + u.role));
      const grid = h('div', { class: 'cards' });
      grid.append(ui.card(t('Change password'), h('div', { class: 'stack' }, ui.field(t('Old password'), oldP), ui.field(t('New password') + ' (min 8)', newP), perr,
        h('button', { class: 'btn primary', onclick: ui.busy(null, async () => { perr.textContent = ''; try { await SL.post('/api/auth/password', { oldPassword: oldP.value, newPassword: newP.value }); oldP.value = newP.value = ''; ui.toast(t('Saved'), 'ok'); } catch (e) { perr.textContent = e.message; } }) }, t('Change password')))),
        ui.card(t('Language'), h('div', { class: 'row' }, h('button', { class: 'btn' + (SL.state.lang === 'en' ? ' primary' : ''), onclick: () => SL.setLang('en') }, 'English'), h('button', { class: 'btn' + (SL.state.lang === 'ta' ? ' primary' : ''), onclick: () => SL.setLang('ta') }, 'தமிழ்'))));
      el.append(grid);
      if (u.role === 'SALES') return;
      const s = await SL.get('/api/settings'), b = s.business;
      if (!isAdmin()) { el.append(h('div', { class: 'card mt' }, h('p', {}, t('Variance tolerance %') + ': ' + s.varianceTolerancePct))); return; }
      const tol = inp({ type: 'number', step: '0.1', min: '0', max: '100', value: s.varianceTolerancePct, dataset: { testid: 'tol' } });
      const bf = { name: inp({ value: b.name }), gstin: inp({ value: b.gstin || '' }), address: h('textarea', {}, b.address || ''), phone: inp({ value: b.phone || '' }), email: inp({ value: b.email || '' }), bank: h('textarea', {}, b.bank_details || ''), terms: h('textarea', {}, b.terms || '') };
      const serr = h('div', { class: 'err' });
      grid.append(ui.card(t('Variance tolerance %'), h('p', { class: 'muted' }, 'Planned-vs-actual variance beyond this is flagged on production runs (applies to new runs).'), ui.field(t('Variance tolerance %'), tol), h('div', { class: 'row mt' }, h('button', { class: 'btn primary', onclick: ui.busy(null, async () => { await SL.put('/api/settings', { varianceTolerancePct: tol.value }); ui.toast(t('Saved'), 'ok'); }) }, t('Save')))));
      el.append(h('div', { class: 'card mt' }, h('h2', {}, t('Business details')), h('p', { class: 'muted' }, 'Appears on invoices. Dummy data in this prototype.'), h('div', { class: 'form-grid' }, ui.field(t('Name'), bf.name), ui.field('GSTIN', bf.gstin), ui.field('Phone', bf.phone), ui.field('Email', bf.email)), ui.field('Address', bf.address), ui.field('Bank details', bf.bank), ui.field('Terms', bf.terms), serr,
        h('div', { class: 'row mt' }, h('button', { class: 'btn primary', dataset: { testid: 'biz-save' }, onclick: ui.busy(null, async () => { serr.textContent = ''; try { await SL.put('/api/settings', { business: { name: bf.name.value, gstin: bf.gstin.value, address: bf.address.value, phone: bf.phone.value, email: bf.email.value, bankDetails: bf.bank.value, terms: bf.terms.value } }); ui.toast(t('Saved'), 'ok'); } catch (e) { serr.textContent = e.message; } }) }, t('Save')))));
      // monthly overheads
      const oh = h('div', {}), month = inp({ type: 'month', value: fmt.today().slice(0, 7) }), type = sel(['RENT', 'POWER', 'GAS', 'SALARIES', 'OTHER'].map(x => [x, x]), 'RENT'), amt = inp({ type: 'number', step: '0.01', min: '0' }), note = inp({}), oerr = h('div', { class: 'err' });
      const loadOh = async () => { const rows = await SL.get('/api/production/monthly-overheads'); oh.replaceChildren(ui.table([{ label: 'Month', render: r => String(r.month).slice(0, 7) }, { label: 'Type', key: 'cost_type' }, { label: t('Amount'), render: r => fmt.money(r.amount), cls: 'num' }, { label: t('Notes'), key: 'notes' }, { label: 'By', key: 'created_by' }], rows)); };
      el.append(h('div', { class: 'card mt' }, h('h2', {}, t('Monthly overheads')), h('p', { class: 'muted' }, 'A shared monthly pool (rent, salaries…) allocated to that month’s completed runs by output weight (good packets × pack size).'),
        h('div', { class: 'form-grid' }, ui.field('Month', month), ui.field('Type', type), ui.field(t('Amount') + ' (₹)', amt), ui.field(t('Notes'), note)), oerr,
        h('div', { class: 'row mt mb' }, h('button', { class: 'btn primary', onclick: ui.busy(null, async () => { oerr.textContent = ''; try { await SL.post('/api/production/monthly-overheads', { month: month.value + '-01', costType: type.value, amount: amt.value, notes: note.value }); amt.value = ''; ui.toast(t('Saved'), 'ok'); await loadOh(); } catch (e) { oerr.textContent = e.message; } }) }, t('Add'))), oh));
      await loadOh();
    },
  });
})();
