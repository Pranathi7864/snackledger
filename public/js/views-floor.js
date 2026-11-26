/* Floor / insight screens: dashboard, production, inventory, purchases, planning, reports, audit trail. */
(function () {
  'use strict';
  const SL = window.SL, h = SL.h, ui = SL.ui, t = SL.t, fmt = SL.fmt;

  Object.assign(SL.i18n.ta, {
    'Today\'s orders': 'இன்றைய ஆர்டர்கள்', 'Pending approval': 'அங்கீகாரம் நிலுவை', 'To dispatch': 'அனுப்ப வேண்டியவை', 'Sales this month (before tax)': 'இந்த மாத விற்பனை (வரிக்கு முன்)', 'Outstanding dues': 'நிலுவைத் தொகை',
    'Stock levels': 'இருப்பு நிலை', 'Variance alerts': 'வேறுபாடு எச்சரிக்கைகள்', 'No variance alerts': 'வேறுபாடு எச்சரிக்கை இல்லை', 'Top customers': 'முக்கிய வாடிக்கையாளர்கள்', 'Top debtors': 'அதிக நிலுவை உள்ளவர்கள்',
    'Production planning': 'உற்பத்தித் திட்டம்', 'Open planning': 'திட்டமிடலைத் திற', 'Demand': 'தேவை', 'On hand': 'கையிருப்பு', 'Shortage': 'பற்றாக்குறை', 'Batches needed': 'தேவையான தொகுதிகள்', 'Reorder level': 'மறுஆர்டர் அளவு',
    'Runs': 'உற்பத்திகள்', 'Product costing': 'பொருள் செலவு', 'Run': 'உற்பத்தி எண்', 'Expected': 'எதிர்பார்த்தது', 'Good output': 'நல்ல உற்பத்தி', 'Yield variance': 'விளைச்சல் வேறுபாடு', 'Cost / packet': 'செலவு / பாக்கெட்', 'Work in progress': 'நடைபெறும் உற்பத்தி',
    'Issued material value': 'வழங்கிய பொருள் மதிப்பு', 'Number of batches': 'தொகுதிகளின் எண்ணிக்கை', 'Planned (BOM)': 'திட்டம் (BOM)', 'Issue': 'வழங்கு', 'Unit': 'அலகு', 'Recipe for this run': 'இந்த உற்பத்திக்கான செய்முறை',
    'Packaging is used up when you complete the run': 'உற்பத்தியை முடிக்கும்போது பேக்கிங் பொருட்கள் கழிக்கப்படும்', 'Start': 'தொடங்கு', 'Complete': 'முடி', 'Details': 'விவரங்கள்', 'Scrap note': 'கழிவு குறிப்பு', 'Extra packaging overrides (optional)': 'பேக்கிங் மாற்றங்கள் (விருப்பம்)',
    'Run details': 'உற்பத்தி விவரங்கள்', 'Materials and packaging': 'மூலப்பொருள் மற்றும் பேக்கிங்', 'Item': 'பொருள்', 'Kind': 'வகை', 'Flag': 'குறி', 'Unexplained loss': 'விளக்கமற்ற இழப்பு', 'Shortfall': 'குறைவு', 'Cost breakdown': 'செலவு விவரம்',
    'Allocated monthly overhead': 'மாதாந்திர பொது செலவு பங்கு', 'Selling price': 'விற்பனை விலை', 'Margin per packet': 'ஒரு பாக்கெட் லாபம்', 'Add overhead': 'செலவைச் சேர்', 'Remove': 'நீக்கு', 'Stock movements': 'இருப்பு நகர்வுகள்', 'History': 'வரலாறு', 'Void run': 'உற்பத்தியை ரத்து செய்',
    'Reason': 'காரணம்', 'Raw materials': 'மூலப்பொருட்கள்', 'Finished goods': 'முடிந்த பொருட்கள்', 'Search': 'தேடு', 'Average cost': 'சராசரி விலை', 'Value': 'மதிப்பு', 'LOW STOCK': 'குறைந்த இருப்பு', 'Batches and expiry': 'தொகுதிகள் மற்றும் காலாவதி',
    'Ledger': 'பேரேடு', 'Running balance': 'ஓடும் இருப்பு', 'Adjust stock': 'இருப்பை சரிசெய்', 'Adjustment (+ / -)': 'சரிசெய்தல் (+ / -)', 'Check ledger': 'பேரேட்டைச் சரிபார்', 'Ledger is consistent': 'பேரேடு சரியாக உள்ளது', 'Record purchase': 'கொள்முதலைப் பதிவு செய்',
    'Supplier': 'விநியோகஸ்தர்', 'Bill no': 'பில் எண்', 'Bill date': 'பில் தேதி', 'Rate': 'விலை', 'GST %': 'GST %', 'Batch no': 'தொகுதி எண்', 'Expiry': 'காலாவதி', 'Add line': 'வரி சேர்', 'Save purchase': 'கொள்முதலைச் சேமி', 'Start these batches': 'இந்த தொகுதிகளைத் தொடங்கு',
    'Required': 'தேவை', 'Available': 'உள்ளது', 'To purchase': 'வாங்க வேண்டியது', 'Export': 'ஏற்றுமதி', 'Open report': 'அறிக்கையைத் திற', 'Type': 'வகை', 'Actor': 'செய்தவர்', 'Action': 'செயல்', 'Before': 'முன்', 'After': 'பின்', 'Entity': 'பதிவு',
    'Wastage breakdown': 'வீணாதல் விவரம்', 'Labour cost': 'உழைப்புச் செலவு', 'Power / gas cost': 'மின்சாரம் / எரிவாயு செலவு', 'Materials cost': 'மூலப்பொருள் செலவு', 'Packaging cost': 'பேக்கிங் செலவு', 'Within tolerance': 'அனுமதி வரம்புக்குள்', 'Good packets made': 'உருவான நல்ல பாக்கெட்டுகள்',
  });

  const canWrite = () => ['ADMIN', 'PRODUCTION'].includes(SL.state.user.role);
  const runNo = id => 'BATCH-' + String(id).padStart(5, '0');
  const tid = id => ({ dataset: { testid: id } });
  const todayStr = () => fmt.today();
  const monthEndStr = () => { const d = new Date(fmt.today().slice(0, 8) + '01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10); };
  const varCell = (v, flagged) => (v === null || v === undefined || v === '' ? '' : h('span', { class: 'var' + (flagged ? ' over' : '') }, fmt.pct(v), flagged ? ' ⚠' : ''));
  const kvRow = (k, v, cls) => [h('dt', {}, k), h('dd', { class: cls || '' }, v)];
  let unitsCache = null;
  async function unitsMap() { if (!unitsCache) { const b = await SL.get('/api/bootstrap'); unitsCache = Object.fromEntries(b.units.map(u => [u.code, u])); } return unitsCache; }
  const sameDim = (us, code) => Object.values(us).filter(u => us[code] && u.dimension === us[code].dimension && !(u.code === 'carton')).map(u => [u.code, u.code]);
  function conv(us, q, from, to) { if (from === to) return Number(q); const a = us[from], b = us[to]; if (!a || !b || a.dimension !== b.dimension) return NaN; return Number(q) * Number(a.to_base) / Number(b.to_base); }
  const numInput = (attrs) => h('input', { type: 'number', step: 'any', inputmode: 'decimal', ...attrs });
  const section = (title, ...kids) => h('div', { class: 'card' }, h('h2', {}, title), ...kids);
  const toleranceOf = async () => { try { return Number((await SL.get('/api/settings')).varianceTolerancePct); } catch (_) { return 3; } };

  /* ================= DASHBOARD ================= */
  SL.view('dashboard', { roles: ['ADMIN', 'PRODUCTION', 'AUDITOR', 'OWNER'], label: 'Home', icon: '🏠', async render(el) {
    const d = await SL.get('/api/dashboard'), role = SL.state.user.role;
    const stats = h('div', { class: 'cards' },
      ui.stat(t('Today\'s orders'), d.orders.today_orders, d.today),
      role === 'PRODUCTION' ? ui.stat(t('To dispatch'), d.orders.to_dispatch) : ui.stat(t('Pending approval'), d.orders.pending_approval, `${d.orders.to_dispatch} ${t('To dispatch').toLowerCase()}`, d.orders.pending_approval > 0 ? 'warnv' : ''),
      role === 'PRODUCTION' ? ui.stat(t('Variance alerts'), d.varianceAlerts.length, '', d.varianceAlerts.length ? 'badv' : '') : ui.stat(t('Sales this month (before tax)'), fmt.money(d.sales.monthTaxable), `${d.sales.invoices} ${t('Invoices').toLowerCase()} · ${d.month}`),
      role === 'PRODUCTION' ? ui.stat(t('Low stock'), d.lowStock.length, '', d.lowStock.length ? 'badv' : '') : ui.stat(t('Outstanding dues'), fmt.money(d.outstanding.total), `${d.outstanding.customers.length} ${t('Customers').toLowerCase()}`));
    const bars = section(t('Stock levels'), h('div', { class: 'bars' }, d.stock.map(s => {
      const bal = Number(s.balance), re = Number(s.reorder), max = Math.max(bal, re * 2, 1);
      return h('div', { class: 'bar-row' + (s.low ? ' low' : '') }, h('div', { class: 'bar-label' }, h('strong', {}, s.name), h('span', { class: 'muted' }, ` ${s.type === 'RAW' ? '' : ''}`)),
        h('div', { class: 'bar-track', role: 'img', 'aria-label': `${s.name} ${fmt.num(bal)} ${s.unit}` }, h('div', { class: 'bar-fill', style: { width: Math.min(100, (bal / max) * 100) + '%' } }), re > 0 ? h('div', { class: 'bar-mark', style: { left: (re / max) * 100 + '%' }, title: t('Reorder level') + ' ' + fmt.num(re) }) : null),
        h('div', { class: 'bar-val num' }, fmt.num(bal), ' ', h('span', { class: 'muted' }, s.unit), s.low ? h('span', { class: 'pill bad', style: { marginLeft: '.4rem' } }, t('LOW STOCK')) : null));
    })));
    const alerts = section(t('Variance alerts'), d.varianceAlerts.length ? h('ul', { class: 'alerts' }, d.varianceAlerts.map(a => h('li', {}, h('button', { class: 'alert-btn', onclick: () => { SL.openRunId = a.runId; SL.go('production'); } }, h('span', { class: 'pill bad' }, a.type === 'YIELD' ? t('Yield') : t('Materials')), ' ', a.text)))) : h('div', { class: 'banner ok' }, t('No variance alerts')));
    const costs = section(t('Cost per packet'), ui.table([{ label: t('Product'), key: 'product' }, { label: t('Cost per packet'), cls: 'num', render: r => fmt.money(r.costPerPacket) }, { label: t('Selling price'), cls: 'num', render: r => (r.sellingPrice ? fmt.money(r.sellingPrice) : '') }, { label: t('Margin'), cls: 'num', render: r => (r.margin ? `${fmt.money(r.margin)} (${r.marginPct}%)` : '') }], d.costPerPacket, { empty: t('Nothing here yet.') }));
    const topc = section(t('Top customers'), ui.table([{ label: t('Customer'), key: 'customer' }, { label: t('Sales this month (before tax)'), cls: 'num', render: r => fmt.money(r.taxable) }], d.topCustomers));
    const debt = section(t('Top debtors'), ui.table([{ label: t('Customer'), key: 'name' }, { label: t('Outstanding'), cls: 'num', render: r => fmt.money(r.outstanding) }], d.outstanding.customers));
    const plan = section(t('Production planning'), ui.table([{ label: t('Product'), key: 'product' }, { label: t('Demand'), cls: 'num', key: 'demand' }, { label: t('On hand'), cls: 'num', key: 'onHand' }, { label: t('Shortage'), cls: 'num', render: r => h('span', { class: Number(r.shortage) > 0 ? 'var over' : '' }, r.shortage) }, { label: t('Batches needed'), cls: 'num', key: 'batchesNeeded' }], d.planning),
      SL.views.planning.roles.includes(role) ? h('p', {}, h('a', { href: '#/planning' }, t('Open planning'))) : null);
    const g = (...kids) => h('div', { class: 'grid2' }, ...kids);
    const todo = [];
    const add = (n, text, hash, tone) => { if (Number(n) > 0) todo.push(h('a', { class: 'todo ' + (tone || ''), href: '#/' + hash }, h('b', {}, n), ' ', t(text), ' →')); };
    if (role === 'ADMIN') { add(d.orders.pending_approval, 'order(s) waiting for your approval', 'orders', 'warn'); add(d.orders.to_dispatch, 'order(s) ready to dispatch', 'orders'); add(d.lowStock.length, 'item(s) low on stock: buy more', 'purchases', 'bad'); add(d.varianceAlerts.length, 'production alert(s): more material used than planned', 'production', 'bad'); }
    if (role === 'PRODUCTION') { add(d.orders.to_dispatch, 'order(s) waiting for packets', 'production'); add(d.lowStock.length, 'item(s) low on stock', 'purchases', 'bad'); add(d.varianceAlerts.length, 'production alert(s): check the batch', 'production', 'bad'); }
    const guide = h('div', { class: 'card stack', ...tid('home-guide') },
      h('strong', {}, role === 'ADMIN' || role === 'PRODUCTION' ? t('What to do now') : t('You have view-only access')),
      todo.length ? h('div', { class: 'todos' }, todo) : h('p', { class: 'muted' }, role === 'ADMIN' || role === 'PRODUCTION' ? t('Nothing is waiting. All caught up.') : t('You can look at everything and download reports, but cannot change anything.')),
      h('details', {}, h('summary', {}, t('How the app works (30 seconds)')),
        h('ol', { class: 'flow' }, h('li', {}, t('Purchases: buy flour, oil, pouches. Stock goes up.')), h('li', {}, t('Production: start a batch. Materials leave stock, packets are made, the system compares planned vs used and works out cost per packet.')), h('li', {}, t('Orders: salesmen send orders (even offline). Admin approves, makes the GST invoice and dispatches. Packet stock goes down.')), h('li', {}, t('Payments: record money received. Outstanding shows who still owes.')), h('li', {}, t('Reports: stock, sales, GST, profit. Download as Excel or PDF.'))),
        h('p', { class: 'muted' }, t('Red = needs attention. Green = fine. Every number comes from a recorded entry; nothing is typed over.'))));
    el.append(ui.pagehead(t('Home'), `${d.today}`), guide, stats, h('div', { class: 'stack mt' },
      role === 'PRODUCTION' ? [g(bars, alerts), plan, costs] : [g(alerts, bars), g(costs, plan), g(topc, debt)]));
  } });

  /* ================= PRODUCTION ================= */
  async function newRunModal(pre) {
    const [prods, tol, us] = await Promise.all([SL.get('/api/products'), toleranceOf(), unitsMap()]);
    const active = prods.filter(p => p.active !== false);
    if (!active.length) throw new Error('No products');
    const prodSel = ui.select(active.map(p => [p.item_id, p.name]), pre && pre.productId, tid('run-product'));
    const batches = numInput({ min: '0.001', value: (pre && pre.batches) || 1, ...tid('run-batches') });
    const box = h('div', {}), err = h('div', { class: 'err' });
    let rows = [], seq = 0;
    async function loadBom() {
      const my = ++seq; const bom = await SL.get(`/api/products/${prodSel.value}/bom?batches=${encodeURIComponent(batches.value || 1)}`);
      if (my !== seq) return; rows = [];
      const mats = bom.lines.filter(l => l.kind === 'MATERIAL'), pack = bom.lines.filter(l => l.kind === 'PACKAGING');
      const trs = mats.map(l => {
        const input = numInput({ min: '0', value: l.planned.replace(/\.?0+$/, ''), class: 'big-in', ...tid('issue-' + l.itemId) });
        const unitSel = ui.select(sameDim(us, l.stockUnit), l.stockUnit, { class: 'unit-sel' });
        const vc = h('td', { class: 'num', ...tid('var-' + l.itemId) });
        const row = { itemId: l.itemId, input, unitSel, unit: l.stockUnit, planned: Number(l.planned), stockUnit: l.stockUnit, vc };
        const upd = () => { const q = conv(us, input.value || 0, unitSel.value, l.stockUnit), p = row.planned; const v = p ? ((q - p) / p) * 100 : 0; const over = Math.abs(v) > tol; vc.replaceChildren(h('span', { class: 'var' + (over ? ' over' : '') }, fmt.pct(v.toFixed(2)), over ? ' ⚠ ' + t('Over tolerance') : (' ✓'))); vc.className = 'num ' + (over ? 'flagcell' : ''); };
        input.addEventListener('input', upd);
        unitSel.addEventListener('change', () => { const nq = conv(us, input.value || 0, row.unit, unitSel.value); if (!isNaN(nq)) input.value = +nq.toFixed(4); row.unit = unitSel.value; upd(); });
        rows.push(row); upd();
        return h('tr', {}, h('td', {}, h('strong', {}, l.name)), h('td', { class: 'num' }, fmt.num(l.planned, 4), ' ', l.stockUnit), h('td', {}, h('div', { class: 'row nowrapx' }, input, unitSel)), vc);
      });
      box.replaceChildren(h('h3', {}, t('Recipe for this run')), h('p', { class: 'muted' }, `${t('Expected output')}: `, h('strong', {}, fmt.num(bom.expectedOutput, 0)), ' ', t('Packets').toLowerCase(), ` · ±${tol}%`),
        h('div', { class: 'tw' }, h('table', {}, h('thead', {}, h('tr', {}, [t('Item'), t('Planned (BOM)'), t('Issue'), t('Variance')].map((x, i) => h('th', { class: i === 1 || i === 3 ? 'num' : '' }, x)))), h('tbody', {}, trs))),
        pack.length ? h('p', { class: 'muted mt' }, '📦 ' + t('Packaging is used up when you complete the run') + ': ' + pack.map(p => `${p.name} ${fmt.num(p.planned, 2)}`).join(' · ')) : null);
    }
    let timer; const reload = () => { clearTimeout(timer); timer = setTimeout(() => loadBom().catch(e => { err.textContent = e.message; }), 200); };
    prodSel.addEventListener('change', reload); batches.addEventListener('input', reload);
    const start = h('button', { class: 'btn primary big', ...tid('run-start'), onclick: async ev => {
      const btn = ev.currentTarget; btn.disabled = true; err.textContent = '';
      try {
        const out = await SL.post('/api/production/runs', { productId: Number(prodSel.value), batches: batches.value, issues: rows.map(r => ({ itemId: r.itemId, qty: r.input.value, unit: r.unitSel.value })) });
        m.close(); ui.toast(`${runNo(out.id)} ${t('Started')}`, 'ok'); SL.route();
      } catch (e) { err.textContent = e.message; btn.disabled = false; }
    } }, t('Start run'));
    const m = ui.modal(t('New production batch'), h('div', { class: 'floor stack' }, h('div', { class: 'form-grid' }, ui.field(t('Product'), prodSel), ui.field(t('Number of batches'), batches)), box, err, start), { width: '860px', sticky: true });
    await loadBom();
  }

  async function completeModal(runId) {
    const det = await SL.get('/api/production/runs/' + runId), expected = Number(det.run.expected_output);
    const pack = det.lines.filter(l => l.kind === 'PACKAGING');
    const cartonLike = pack.filter(l => Number(l.planned_qty) / expected < 1);
    const good = numInput({ min: '0', ...tid('c-good'), class: 'big-in' }), damaged = numInput({ min: '0', value: 0, ...tid('c-damaged'), class: 'big-in' });
    const cartons = cartonLike.length ? numInput({ min: '0', ...tid('c-cartons'), class: 'big-in' }) : null;
    const labour = numInput({ min: '0', placeholder: '0', ...tid('c-labour') }), power = numInput({ min: '0', placeholder: '0', ...tid('c-power') }), scrap = h('input', { placeholder: t('Scrap note') });
    const overrides = pack.map(l => ({ l, input: numInput({ min: '0', placeholder: fmt.num(l.planned_qty, 2) }) }));
    const live = h('div', { class: 'banner info', ...tid('c-live') }, '—'), err = h('div', { class: 'err' });
    const upd = () => {
      const g = Number(good.value || 0), v = expected ? ((g - expected) / expected) * 100 : 0, over = Math.abs(v) > Number(det.run.tolerance_pct);
      live.className = 'banner ' + (over ? 'bad' : 'ok');
      live.textContent = `${t('Yield variance')}: ${fmt.pct(v.toFixed(2))} (${fmt.num(g, 0)} / ${fmt.num(expected, 0)})` + (over ? ' ⚠ ' + t('Over tolerance') : '');
      if (cartons) cartons.placeholder = String(Math.ceil(g * Number(cartonLike[0].planned_qty) / expected));
    };
    good.addEventListener('input', upd); upd();
    const submit = h('button', { class: 'btn primary big', ...tid('c-submit'), onclick: async ev => {
      const btn = ev.currentTarget; btn.disabled = true; err.textContent = '';
      const body = { goodOutput: good.value, damagedPackaging: damaged.value || 0, scrapNote: scrap.value || undefined };
      if (cartons && cartons.value !== '') body.cartonsUsed = cartons.value;
      const ov = overrides.filter(o => o.input.value !== '').map(o => ({ itemId: o.l.item_id, qty: o.input.value, unit: o.l.unit })); if (ov.length) body.packaging = ov;
      if (labour.value) body.labour = labour.value; if (power.value) body.powerGas = power.value;
      try { await SL.post(`/api/production/runs/${runId}/complete`, body); m.close(); ui.toast(`${runNo(runId)} ${t('Completed')}`, 'ok'); SL.route(); await runDetailModal(runId); }
      catch (e) { err.textContent = e.message; btn.disabled = false; }
    } }, t('Finish batch'));
    const m = ui.modal(`${t('Finish batch')} · ${runNo(runId)}`, h('div', { class: 'floor stack' },
      h('p', { class: 'muted' }, `${det.run.product} · ${t('Expected output')}: ${fmt.num(expected, 0)}`),
      h('div', { class: 'form-grid' }, ui.field(t('Good packets'), good), ui.field(t('Damaged pouches'), damaged), cartons ? ui.field(t('Cartons used'), cartons) : null), live,
      h('div', { class: 'form-grid' }, ui.field(t('Labour cost') + ' (₹)', labour), ui.field(t('Power / gas cost') + ' (₹)', power), ui.field(t('Scrap note'), scrap)),
      h('details', {}, h('summary', {}, t('Extra packaging overrides (optional)')), h('div', { class: 'form-grid mt' }, overrides.map(o => ui.field(`${o.l.name} (${o.l.unit})`, o.input)))), err, submit), { width: '760px', sticky: true });
  }

  async function runDetailModal(runId) {
    const d = await SL.get('/api/production/runs/' + runId), r = d.run, c = d.costing, w = d.wastage, write = canWrite();
    let modal;
    const refresh = async () => { modal.close(); SL.route(); await runDetailModal(runId); };
    const linesT = ui.table([{ label: t('Item'), key: 'name' }, { label: t('Kind'), render: l => (l.kind === 'MATERIAL' ? t('Materials') : t('Packaging')) }, { label: t('Planned'), cls: 'num', render: l => `${fmt.num(l.planned_qty, 3)} ${l.unit}` },
      { label: t('Actual'), cls: 'num', render: l => (l.actual_qty === null ? '—' : `${fmt.num(l.actual_qty, 3)} ${l.unit}`) }, { label: t('Variance'), cls: 'num', render: l => varCell(l.variance_pct, l.flagged) }, { label: t('Cost'), cls: 'num', render: l => fmt.money(l.cost) }], d.lines, { rowClass: l => (l.flagged ? 'flag' : '') });
    const costKv = h('dl', { class: 'kv' }, ...[[t('Materials cost'), c.materialCost], [t('Packaging cost'), c.packagingCost], [t('Labour'), c.labour], [t('Power / gas'), c.powerGas], ['Other', c.otherDirect], [t('Allocated monthly overhead'), c.allocatedOverhead]].flatMap(([k, v]) => kvRow(k, fmt.money(v))),
      ...kvRow(t('Total'), h('strong', {}, fmt.money(c.totalCost))), ...kvRow(t('Cost per packet'), h('strong', { class: 'big-num', ...tid('cost-per-packet') }, c.costPerPacketRounded ? fmt.money(c.costPerPacketRounded) : '—')),
      ...kvRow(t('Selling price'), fmt.money(c.sellingPrice)), ...kvRow(t('Margin per packet'), c.marginPerPacket ? `${fmt.money(c.marginPerPacket)} (${c.marginPct}%)` : '—'));
    const costRows = ui.table([{ label: t('Type'), key: 'cost_type' }, { label: t('Amount'), cls: 'num', render: x => fmt.money(x.amount) }, { label: t('Date'), render: x => fmt.dt(x.created_at) }, { label: 'By', key: 'created_by' },
      write && r.status !== 'VOIDED' ? { label: '', render: x => h('button', { class: 'btn small danger', onclick: async () => { const why = await ui.ask(t('Reason'), { title: t('Remove') + ' ' + x.cost_type }); if (!why) return; try { await SL.del(`/api/production/runs/${runId}/costs/${x.id}?reason=${encodeURIComponent(why)}`); ui.toast('✓', 'ok'); refresh(); } catch (e) { ui.err(e); } } }, t('Remove')) } : { label: '', render: () => '' }].filter(Boolean), d.costs);
    const ctype = ui.select([['LABOUR', t('Labour')], ['POWER_GAS', t('Power / gas')], ['OTHER', 'Other']], 'LABOUR', tid('cost-type')), camt = numInput({ min: '0', placeholder: '₹', ...tid('cost-amount') });
    const addCost = write && r.status !== 'VOIDED' ? h('div', { class: 'row end mt floor' }, ui.field(t('Type'), ctype), ui.field(t('Amount'), camt), h('button', { class: 'btn primary', ...tid('cost-add'), onclick: async ev => { const btn = ev.currentTarget; btn.disabled = true; try { await SL.post(`/api/production/runs/${runId}/costs`, { costType: ctype.value, amount: camt.value }); await refresh(); } catch (e) { ui.err(e); btn.disabled = false; } } }, t('Add overhead'))) : null;
    const actions = h('div', { class: 'row' },
      write && r.status === 'STARTED' ? h('button', { class: 'btn primary', onclick: () => { modal.close(); completeModal(runId).catch(ui.err); } }, t('Finish batch')) : null,
      SL.state.user.role === 'ADMIN' && r.status !== 'VOIDED' ? h('button', { class: 'btn danger', onclick: async () => { const why = await ui.ask(t('Reason'), { title: t('Cancel this batch') + ' - ' + t('all materials go back to stock and the packets made are removed'), multiline: true }); if (!why) return; try { await SL.post(`/api/production/runs/${runId}/void`, { reason: why }); ui.toast(t('Cancelled'), 'ok'); await refresh(); } catch (e) { ui.err(e); } } }, t('Cancel this batch')) : null);
    const wast = w ? h('dl', { class: 'kv' }, ...kvRow(t('Expected'), fmt.num(w.expected, 0)), ...kvRow(t('Good output'), fmt.num(w.good, 0)), ...kvRow(t('Shortfall'), fmt.num(w.shortfall, 0)), ...kvRow(t('Damaged pouches'), fmt.num(w.damagedPackaging, 0)), ...kvRow(t('Unexplained loss'), h('strong', {}, fmt.num(w.unexplained, 0)))) : h('p', { class: 'muted' }, '—');
    const body = h('div', { class: 'stack floor' },
      h('div', { class: 'row' }, ui.badge(r.status), h('strong', {}, r.product), h('span', { class: 'muted' }, `${r.runNo} · ${fmt.date(r.run_date)} · ${fmt.num(r.batches)} ${t('Batches').toLowerCase()}`), h('span', { class: 'grow' }), actions),
      h('div', { class: 'explain', ...tid('batch-explain') }, h('strong', {}, t('What is this batch?') + ' '), r.status === 'STARTED'
        ? t('{no} is one cooking session of {product}. The materials below were taken out of stock. When cooking is over, click "Finish batch" and enter how many good packets you got.', { no: r.runNo, product: r.product })
        : t('{no} is one cooking session of {product}: {planned} packets were planned; you got {good} good packets. The table compares the material planned with what was really used; a red mark means the difference is more than {tol}%. Add labour and gas below to see the true cost per packet.', { no: r.runNo, product: r.product, planned: fmt.num(r.expected_output, 0), good: r.good_output !== null ? fmt.num(r.good_output, 0) : '-', tol: r.tolerance_pct }),),
      c.costPerPacket && Number(c.goodOutput) > 0 ? h('div', { class: 'row', ...tid('batch-profit') }, h('strong', {}, t('Net profit / loss on this batch') + ': '), ui.profit(Number(c.marginPerPacket) * Number(c.goodOutput), c.marginPct, `${fmt.num(c.goodOutput, 0)} × ${fmt.money(c.marginPerPacket)} ${t('per packet')}`)) : null,
      r.status === 'VOIDED' ? h('div', { class: 'banner bad' }, `${t('Cancelled')}: ${r.void_reason || ''}`) : null,
      r.yield_variance_pct !== null ? h('div', { class: 'banner ' + (r.yield_flag ? 'bad' : 'ok'), ...tid('yield-banner') }, `${t('Yield variance')}: `, h('strong', {}, fmt.pct(r.yield_variance_pct)), r.yield_flag ? ' ⚠ ' + t('Over tolerance') : ' · ' + t('Within tolerance'), ` (${fmt.num(r.good_output, 0)} / ${fmt.num(r.expected_output, 0)}, ±${r.tolerance_pct}%)`) : h('div', { class: 'banner warn' }, `${t('Work in progress')} · ${t('Issued material value')}: ${fmt.money(c.materialCost)}`),
      section(t('Materials and packaging'), linesT),
      h('div', { class: 'grid2' }, section(t('Wastage breakdown'), wast), section(t('Cost breakdown'), costKv)),
      section(t('Add overhead'), costRows, addCost),
      section(t('Stock movements'), ui.table([{ label: t('Item'), key: 'name' }, { label: 'Batch', key: 'batch_no' }, { label: t('Type'), render: x => x.move_type.replace(/_/g, ' ') }, { label: t('Quantity'), cls: 'num', render: x => `${Number(x.qty) > 0 ? '+' : ''}${fmt.num(x.qty, 3)} ${x.unit}` }, { label: 'Source', key: 'source_ref' }], d.moves)),
      section(t('History'), ui.table([{ label: t('Date'), render: x => fmt.dt(x.ts) }, { label: 'By', key: 'actor' }, { label: t('Action'), key: 'action' }, { label: t('Details'), key: 'summary' }], d.audits)));
    modal = ui.modal(`${r.runNo} · ${t('Batch details')}`, body, { width: '1000px' });
  }

  SL.view('production', { roles: ['ADMIN', 'PRODUCTION', 'AUDITOR', 'OWNER'], label: 'Production', icon: '🏭', async render(el) {
    const runs = await SL.get('/api/production/runs'), write = canWrite();
    const wip = runs.filter(r => r.status === 'STARTED');
    const range = { from: fmt.monthStart(), to: monthEndStr() };
    const costBox = h('div', {});
    const loadCost = async () => { try { const rows = await SL.get('/api/production/costing' + SL.qs(range)); costBox.replaceChildren(ui.table([{ label: t('Product'), key: 'product' }, { label: t('Batches'), cls: 'num', key: 'runs' }, { label: t('Good packets'), cls: 'num', key: 'goodPackets' }, { label: t('Materials'), cls: 'num', render: r => fmt.money(r.materialCost) }, { label: t('Packaging'), cls: 'num', render: r => fmt.money(r.packagingCost) }, { label: t('Labour') + ' / ' + t('Power / gas'), cls: 'num', render: r => fmt.money(r.directOverhead) }, { label: t('Allocated monthly overhead'), cls: 'num', render: r => fmt.money(r.allocatedOverhead) }, { label: t('Total'), cls: 'num', render: r => fmt.money(r.totalCost) }, { label: t('Cost per packet'), cls: 'num', render: r => h('strong', {}, fmt.money(r.costPerPacket)) }, { label: t('Selling price'), cls: 'num', render: r => fmt.money(r.sellingPrice) }, { label: t('Margin'), cls: 'num', render: r => `${fmt.money(r.margin)} (${r.marginPct}%)` }], rows)); } catch (e) { costBox.replaceChildren(h('div', { class: 'banner bad' }, e.message)); } };
    const runsTable = ui.table([{ label: t('Batch'), render: r => h('strong', {}, runNo(r.id)) }, { label: t('Date'), render: r => fmt.date(r.run_date) }, { label: t('Product'), key: 'product' }, { label: t('Status'), render: r => ui.badge(r.status) },
      { label: t('Expected'), cls: 'num', render: r => fmt.num(r.expected_output, 0) }, { label: t('Good output'), cls: 'num', render: r => (r.good_output === null ? '—' : fmt.num(r.good_output, 0)) }, { label: t('Yield variance'), cls: 'num', render: r => varCell(r.yield_variance_pct, r.yield_flag) },
      { label: t('Cost / packet'), cls: 'num', render: r => (r.costPerPacket ? fmt.money(r.costPerPacket) : '—') }], runs, { onRow: r => runDetailModal(r.id).catch(ui.err), rowClass: r => (r.yield_flag ? 'flag' : '') });
    const wipBox = wip.length ? section(t('Work in progress'), h('div', { class: 'wip' }, wip.map(r => h('div', { class: 'wip-card' }, h('div', {}, h('strong', {}, runNo(r.id)), ' · ', r.product), h('div', { class: 'muted' }, `${fmt.num(r.batches)} ${t('Batches').toLowerCase()} · ${t('Issued material value')}: ${fmt.money(r.totalCost)}`),
      h('div', { class: 'row mt' }, write ? h('button', { class: 'btn primary', ...tid('wip-complete'), onclick: () => completeModal(r.id).catch(ui.err) }, t('Finish batch')) : null, h('button', { class: 'btn', onclick: () => runDetailModal(r.id).catch(ui.err) }, t('Details'))))))) : null;
    const tabs = ui.tabs([['runs', t('Batches')], ['costing', t('Product costing')]], 'runs', id => { runsBox.classList.toggle('hide', id !== 'runs'); costWrap.classList.toggle('hide', id !== 'costing'); if (id === 'costing') loadCost(); });
    const runsBox = h('div', { class: 'stack' }, wipBox, runsTable), costWrap = h('div', { class: 'stack hide' }, ui.dateRange(range, loadCost), costBox);
    el.append(ui.pagehead(t('Production'), t('Issue to production') + ' → ' + t('Finish batch'),
      SL.views.planning.roles.includes(SL.state.user.role) ? h('a', { class: 'btn', href: '#/planning' }, t('Planning')) : null,
      write ? h('button', { class: 'btn primary', ...tid('new-run'), onclick: () => newRunModal().catch(ui.err) }, '＋ ' + t('New production batch')) : null), tabs, runsBox, costWrap);
    if (SL.prefillRun && write) { const p = SL.prefillRun; SL.prefillRun = null; setTimeout(() => newRunModal(p).catch(ui.err), 50); }
    if (SL.openRunId) { const id = SL.openRunId; SL.openRunId = null; setTimeout(() => runDetailModal(id).catch(ui.err), 50); }
  } });

  /* ================= INVENTORY ================= */
  const TYPE_LABEL = { RAW: 'Raw materials', PACKAGING: 'Packaging', FINISHED: 'Finished goods' };
  const expiryPill = d => { if (!d) return h('span', { class: 'muted' }, '—'); const days = Math.round((new Date(d + 'T00:00:00Z') - new Date(fmt.today() + 'T00:00:00Z')) / 86400000); return h('span', { class: 'pill ' + (days < 0 ? 'bad' : days <= 14 ? 'warn' : 'ok') }, fmt.date(d) + (days < 0 ? ' ✕' : days <= 14 ? ` (${days}d)` : '')); };

  async function adjustModal(items, itemId, done) {
    const sel = ui.select(items.map(i => [i.id, `${i.name} (${i.unit})`]), itemId, tid('adj-item')), qty = numInput({ placeholder: '+10 / -2.5', ...tid('adj-qty') }), reason = h('input', { placeholder: t('Reason'), ...tid('adj-reason') }), err = h('div', { class: 'err' });
    const m = ui.modal(t('Adjust stock'), h('div', { class: 'floor stack' }, ui.field(t('Item'), sel), ui.field(t('Adjustment (+ / -)'), qty), ui.field(t('Reason'), reason), err,
      h('button', { class: 'btn primary big', onclick: async ev => { const btn = ev.currentTarget; btn.disabled = true; try { await SL.post('/api/stock/adjustments', { itemId: Number(sel.value), qty: qty.value, reason: reason.value }); m.close(); ui.toast('✓', 'ok'); done(); } catch (e) { err.textContent = e.message; btn.disabled = false; } } }, t('Save'))), { width: '460px', sticky: true });
  }

  async function itemModal(item, items, reload) {
    const range = { from: fmt.monthStart(), to: monthEndStr() }, ledger = h('div', {});
    const batches = await SL.get(`/api/items/${item.id}/batches`);
    const loadLedger = async () => { const rows = await SL.get('/api/stock/ledger' + SL.qs({ itemId: item.id, ...range })); ledger.replaceChildren(ui.table([{ label: t('Date'), render: m => fmt.dt(m.moved_at) }, { label: t('Type'), render: m => m.move_type.replace(/_/g, ' ') }, { label: 'Batch', key: 'batch_no' }, { label: t('Quantity'), cls: 'num', render: m => h('span', { class: Number(m.qty) < 0 ? 'neg' : 'pos' }, (Number(m.qty) > 0 ? '+' : '') + fmt.num(m.qty, 3)) }, { label: t('Running balance'), cls: 'num', render: m => h('strong', {}, fmt.num(m.running_balance, 3)) }, { label: 'Source', render: m => h('span', { class: 'nowrap' }, m.source_ref) }, { label: 'By', key: 'created_by' }, { label: 'Note', key: 'note' }], rows)); };
    ui.modal(`${item.name} · ${fmt.num(item.balance, 3)} ${item.unit}`, h('div', { class: 'stack' },
      h('div', { class: 'row' }, h('span', { class: 'muted' }, `${t('Average cost')}: ${fmt.money(item.avg_cost)} · ${t('Reorder level')}: ${fmt.num(item.reorder_level)}`), h('span', { class: 'grow' }), canWrite() ? h('button', { class: 'btn', onclick: () => adjustModal(items, item.id, reload) }, t('Adjust stock')) : null),
      section(t('Batches and expiry'), ui.table([{ label: 'Batch', key: 'batch_no' }, { label: 'Mfg', render: b => fmt.date(b.mfg_date) }, { label: t('Expiry'), render: b => expiryPill(b.expiry_date) }, { label: t('Quantity'), cls: 'num', render: b => `${fmt.num(b.balance, 3)} ${item.unit}` }], batches, { empty: '—' }), h('p', { class: 'muted' }, 'FEFO: earliest expiry is issued first.')),
      section(t('Ledger'), ui.dateRange(range, loadLedger), ledger)), { width: '1000px' });
    await loadLedger();
  }

  SL.view('inventory', { roles: ['ADMIN', 'PRODUCTION', 'AUDITOR', 'OWNER'], label: 'Inventory', icon: '📦', async render(el) {
    const items = await SL.get('/api/items'); const q = h('input', { type: 'search', placeholder: t('Search'), ...tid('inv-search') }), box = h('div', { class: 'stack' }), rec = h('div', {});
    const reload = () => SL.route();
    const draw = () => {
      const f = q.value.trim().toLowerCase();
      box.replaceChildren(...['RAW', 'PACKAGING', 'FINISHED'].map(type => { const rows = items.filter(i => i.type === type && i.name.toLowerCase().includes(f)); if (!rows.length) return null;
        return section(t(TYPE_LABEL[type]), ui.table([{ label: t('Item'), render: i => h('strong', {}, i.name) }, { label: t('On hand'), cls: 'num', render: i => h('strong', { class: i.low ? 'var over' : '', ...tid('bal-' + i.code) }, fmt.num(i.balance, 3)) }, { label: t('Unit'), key: 'unit' },
          { label: t('Average cost'), cls: 'num', render: i => (type === 'FINISHED' ? '—' : fmt.money(i.avg_cost)) }, { label: t('Value'), cls: 'num', render: i => (type === 'FINISHED' ? '—' : fmt.money(i.value)) }, { label: t('Reorder level'), cls: 'num', render: i => fmt.num(i.reorder_level) },
          { label: '', render: i => (i.low ? h('span', { class: 'pill bad' }, t('LOW STOCK')) : '') }], rows, { onRow: i => itemModal(i, items, reload).catch(ui.err), rowClass: i => (i.low ? 'flag' : '') })); }).filter(Boolean));
    };
    q.addEventListener('input', draw); draw();
    el.append(ui.pagehead(t('Inventory'), t('Stock is the sum of the ledger; tap an item for batches and movements'),
      h('button', { class: 'btn', ...tid('reconcile'), onclick: async () => { try { const r = await SL.get('/api/stock/reconcile'); rec.replaceChildren(h('div', { class: 'banner ' + (r.ok ? 'ok' : 'bad') }, r.ok ? '✓ ' + t('Ledger is consistent') : '✕ ' + JSON.stringify(r.negativeBatches))); } catch (e) { ui.err(e); } } }, t('Check ledger')),
      canWrite() ? h('button', { class: 'btn primary', onclick: () => adjustModal(items, items[0].id, reload) }, t('Adjust stock')) : null), rec, h('div', { class: 'mb' }, q), box);
  } });

  /* ================= PURCHASES ================= */
  async function purchaseDetailModal(id) {
    const p = await SL.get('/api/purchases/' + id);
    ui.modal(`${p.purchase_no} · ${p.supplier}`, h('div', { class: 'stack' }, h('p', { class: 'muted' }, `${t('Bill no')}: ${p.bill_no || '—'} · ${fmt.date(p.bill_date)}`),
      ui.table([{ label: t('Item'), key: 'name' }, { label: t('Quantity'), cls: 'num', render: l => `${fmt.num(l.entered_qty, 3)} ${l.entered_unit}` }, { label: 'Stock qty', cls: 'num', render: l => `${fmt.num(l.qty, 3)} ${l.unit}` }, { label: t('Rate'), cls: 'num', render: l => fmt.money(l.rate) }, { label: t('Amount'), cls: 'num', render: l => fmt.money(l.taxable) }, { label: 'GST', cls: 'num', render: l => `${l.gst_rate}% ${fmt.money(l.tax)}` }, { label: 'Batch', key: 'batch_no' }, { label: t('Expiry'), render: l => fmt.date(l.expiry_date) }], p.lines),
      h('p', { class: 'right' }, h('strong', {}, `${t('Total')}: ${fmt.money(p.total)}`))), { width: '900px' });
  }
  SL.view('purchases', { roles: ['ADMIN', 'PRODUCTION', 'AUDITOR'], label: 'Purchases', icon: '🧾', async render(el) {
    const write = canWrite(), us = await unitsMap(), range = { from: fmt.monthStart(), to: monthEndStr() };
    const [suppliers, items] = await Promise.all([SL.get('/api/suppliers'), SL.get('/api/items')]); const mats = items.filter(i => i.type !== 'FINISHED');
    const list = h('div', {}), hint = h('div', {});
    const loadList = async () => { const rows = await SL.get('/api/purchases' + SL.qs(range)); list.replaceChildren(ui.table([{ label: t('Date'), render: p => fmt.date(p.bill_date) }, { label: 'Entry', key: 'purchase_no' }, { label: t('Bill no'), key: 'bill_no' }, { label: t('Supplier'), key: 'supplier' }, { label: t('Total'), cls: 'num', render: p => fmt.money(p.total) }], rows, { onRow: p => purchaseDetailModal(p.id).catch(ui.err) })); };
    let form = null;
    if (write) {
      const sup = ui.select(suppliers.filter(s => s.active).map(s => [s.id, s.name]), null, tid('p-supplier')), bill = h('input', { placeholder: t('Bill no (auto if blank)'), ...tid('p-bill') }), bdate = h('input', { type: 'date', min: '2000-01-01', max: todayStr(), required: true, value: todayStr() }), lines = h('div', { class: 'stack' }), err = h('div', { class: 'err' }), tot = h('strong', {}, fmt.money(0));
      const rowsRef = []; const sumUp = () => { tot.textContent = fmt.money(rowsRef.reduce((a, r) => a + Number(r.qty.value || 0) * Number(r.rate.value || 0) * (1 + Number(r.gst.value || 0) / 100), 0).toFixed(2)); };
      const addLine = () => {
        const item = ui.select([['', '— ' + t('Select item') + ' —'], ...mats.map(i => [i.id, i.name])], '', tid('p-item')), qty = numInput({ min: '0', placeholder: t('Quantity'), ...tid('p-qty') }), unit = ui.select([], ''), rate = numInput({ min: '0', placeholder: t('Rate') + ' ₹', ...tid('p-rate') }), gst = numInput({ min: '0', value: 0, placeholder: 'GST %' }), batch = h('input', { placeholder: t('Batch no (auto if blank)') }), exp = h('input', { type: 'date', title: t('Expiry') });
        const setUnits = () => { const it = mats.find(i => String(i.id) === item.value); if (!it) { unit.replaceChildren(h('option', { value: '' }, '—')); return; } unit.replaceChildren(...sameDim(us, it.unit).map(([v, l]) => h('option', { value: v, selected: v === it.unit }, l))); };
        item.addEventListener('change', setUnits); setUnits(); [qty, rate, gst].forEach(x => x.addEventListener('input', sumUp));
        const r = { item, qty, unit, rate, gst, batch, exp }; rowsRef.push(r);
        const wrap = h('div', { class: 'pline' }, ui.field(t('Item'), item), ui.field(t('Quantity'), qty), ui.field(t('Unit'), unit), ui.field(t('Rate') + ' / ' + t('Unit'), rate),
          h('details', { class: 'more' }, h('summary', {}, t('More details (GST, batch, expiry)')), h('div', { class: 'pline' }, ui.field(t('GST %'), gst), ui.field(t('Batch no'), batch), ui.field(t('Expiry'), exp))),
          h('button', { class: 'btn small danger', type: 'button', onclick: () => { rowsRef.splice(rowsRef.indexOf(r), 1); wrap.remove(); sumUp(); } }, '✕'));
        lines.append(wrap);
      };
      addLine();
      form = section(t('Record purchase'), h('div', { class: 'floor stack' }, h('div', { class: 'form-grid' }, ui.field(t('Supplier'), sup), ui.field(t('Bill no'), bill), ui.field(t('Bill date'), bdate)), lines,
        h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: addLine }, '＋ ' + t('Add line')), h('span', { class: 'grow' }), h('span', {}, t('Total'), ' (incl. GST): ', tot)), err,
        h('button', { class: 'btn primary big', ...tid('p-save'), onclick: async ev => {
          const btn = ev.currentTarget; btn.disabled = true; err.textContent = '';
          try {
            const body = { supplierId: Number(sup.value), billNo: bill.value || undefined, billDate: bdate.value, lines: rowsRef.map(r => ({ itemId: Number(r.item.value), qty: r.qty.value, unit: r.unit.value, rate: r.rate.value, gstRate: r.gst.value || 0, batchNo: r.batch.value || undefined, expiryDate: r.exp.value || undefined })) };
            const out = await SL.post('/api/purchases', body); ui.toast(`PUR-${String(out.id).padStart(5, '0')} ✓`, 'ok');
            const after = await SL.get('/api/items'); const used = [...new Set(body.lines.map(l => l.itemId))];
            hint.replaceChildren(h('div', { class: 'banner ok', ...tid('p-hint') }, t('Average cost') + ': ', used.map(id => { const i = after.find(x => x.id === id); return `${i.name} ${fmt.money(i.avg_cost)}/${i.unit} (${t('On hand')} ${fmt.num(i.balance, 3)}) `; }).join(' · ')));
            lines.replaceChildren(); rowsRef.length = 0; addLine(); sumUp(); loadList();
          } catch (e) { err.textContent = e.message; } finally { btn.disabled = false; }
        } }, t('Save purchase'))));
    }
    el.append(ui.pagehead(t('Purchases'), 'Raw material and packaging receipts'), form, hint, section(t('History'), ui.dateRange(range, loadList), list));
    await loadList();
  } });

  /* ================= PLANNING ================= */
  SL.view('planning', { roles: ['ADMIN', 'PRODUCTION', 'OWNER'], label: 'Planning', icon: '🗓️', async render(el) {
    const p = await SL.get('/api/production/planning'), write = canWrite();
    el.append(ui.pagehead(t('Planning'), 'To fulfil pending orders, make…'),
      p.products.length ? section(t('Production planning'), ui.table([{ label: t('Product'), key: 'product' }, { label: t('Orders'), cls: 'num', key: 'orders' }, { label: t('Demand'), cls: 'num', key: 'demand' }, { label: t('On hand'), cls: 'num', key: 'onHand' },
        { label: t('Shortage'), cls: 'num', render: r => h('span', { class: Number(r.shortage) > 0 ? 'var over' : '' }, r.shortage) }, { label: 'Packets / batch', cls: 'num', key: 'packetsPerBatch' }, { label: t('Batches needed'), cls: 'num', render: r => h('strong', {}, r.batchesNeeded) },
        write ? { label: '', render: r => (Number(r.batchesNeeded) > 0 ? h('button', { class: 'btn primary small', onclick: () => { SL.prefillRun = { productId: r.productId, batches: r.batchesNeeded }; SL.go('production'); } }, t('Start these batches')) : '') } : { label: '', render: () => '' }], p.products))
        : h('div', { class: 'banner ok' }, 'No pending orders need production.'),
      p.materials.length ? section(t('Raw materials'), ui.table([{ label: t('Item'), key: 'name' }, { label: t('Required'), cls: 'num', render: m => `${fmt.num(m.required, 3)} ${m.unit}` }, { label: t('Available'), cls: 'num', render: m => `${fmt.num(m.available, 3)} ${m.unit}` }, { label: t('To purchase'), cls: 'num', render: m => h('span', { class: Number(m.toPurchase) > 0 ? 'var over' : '' }, `${fmt.num(m.toPurchase, 3)} ${m.unit}`) }], p.materials)) : null);
  } });

  /* ================= REPORTS ================= */
  const REPORT_HELP = {
    'sales-register': 'Every invoice and credit note in the period, with GST split. Net total is what the auditor ties to the books.', 'customer-sales': 'Net sales per customer (invoices less credit notes).', 'product-sales': 'Packets and value sold per product.',
    'gst-summary': 'Outward supplies shaped like GSTR-1 (B2B, B2C small, credit notes, HSN) and GSTR-3B table 3.1(a).', 'purchase-register': 'Supplier bills with input GST.', 'stock-summary': 'Opening + receipts − issues ± adjustments = closing for every item.',
    'stock-ledger': 'Every stock movement with batch and source document.', 'production': 'Planned (BOM) versus actual consumption, yield and wastage per run; flagged beyond tolerance.', 'cost-report': 'Cost per packet and margin, by product and by run.',
    'payments': 'Receipts and collections by mode.', 'outstanding': 'Receivables with ageing by days past the due date, as on the end date.', 'visits': 'Salesman GPS check-ins.',
  };
  const PROD_REPORTS = ['production', 'stock-summary', 'stock-ledger', 'purchase-register'];
  const fcell = (c, v) => { if (v === null || v === undefined || v === '') return ''; if (c.type === 'money') return fmt.money(v); if (c.type === 'qty') return fmt.num(v, c.dp === undefined ? 3 : c.dp); if (c.type === 'pct') return Number(v).toFixed(2) + '%'; if (c.type === 'date') return fmt.date(v); return String(v); };
  function sectionTable(s) {
    const isNum = c => ['money', 'qty', 'int', 'pct'].includes(c.type);
    const flagged = r => s.columns.some(c => /OVER TOLERANCE|LOW STOCK/.test(String(r[c.key] || '')));
    if (!s.rows.length) return h('div', { class: 'tw' }, ui.empty('No records in this period.'));
    return h('div', { class: 'tw' }, h('table', {}, h('thead', {}, h('tr', {}, s.columns.map(c => h('th', { class: isNum(c) ? 'num' : '' }, c.label)))),
      h('tbody', {}, s.rows.map(r => h('tr', { class: flagged(r) ? 'flag' : '' }, s.columns.map(c => h('td', { class: isNum(c) ? 'num' : '' }, fcell(c, r[c.key])))))),
      s.totals ? h('tfoot', {}, h('tr', {}, s.columns.map((c, i) => h('td', { class: isNum(c) ? 'num' : '' }, i === 0 ? t('Total') : fcell(c, s.totals[c.key]))))) : null));
  }
  SL.view('reports', { roles: ['ADMIN', 'AUDITOR', 'OWNER', 'PRODUCTION'], label: 'Reports', icon: '📑', async render(el) {
    const role = SL.state.user.role; let cat = await SL.get('/api/reports'); if (role === 'PRODUCTION') cat = cat.filter(c => PROD_REPORTS.includes(c.key));
    const state = { key: cat[0].key, from: fmt.monthStart(), to: monthEndStr(), type: '', itemId: '' }, out = h('div', { class: 'stack' }), items = ['ADMIN', 'AUDITOR', 'OWNER', 'PRODUCTION'].includes(role) ? await SL.get('/api/items') : [];
    const help = h('p', { class: 'muted' }), exports = h('div', { class: 'row' }), filters = h('div', { class: 'row' });
    const url = fmtName => '/api/reports/' + state.key + SL.qs({ from: state.from, to: state.to, type: state.type, itemId: state.itemId, format: fmtName });
    const drawExports = () => { exports.replaceChildren(...[['csv', 'CSV'], ['xlsx', 'Excel'], ['pdf', 'PDF']].map(([f, l]) => h('a', { class: 'btn', href: url(f), target: '_blank', rel: 'noopener', ...tid('export-' + f) }, '⬇ ' + l)),
      role === 'PRODUCTION' ? null : h('a', { class: 'btn', href: '/api/export/tally' + SL.qs({ from: state.from, to: state.to }), target: '_blank', rel: 'noopener', title: 'Tally Prime voucher import (XML)' }, '⬇ Tally XML')); };
    const run = async () => {
      help.textContent = t(REPORT_HELP[state.key] || ''); drawExports(); out.replaceChildren(ui.loading());
      try { const rep = await SL.get(url('json')); out.replaceChildren(h('h2', {}, rep.title, h('span', { class: 'muted', style: { fontWeight: 400 } }, '  ' + rep.subtitle)), ...rep.sections.map(s => h('div', {}, s.title ? h('h3', {}, s.title) : null, sectionTable(s)))); }
      catch (e) { out.replaceChildren(h('div', { class: 'banner bad' }, e.message)); }
    };
    const drawFilters = () => {
      const typeSel = ui.select([['', 'All'], ['RAW', t('Raw materials')], ['PACKAGING', t('Packaging')], ['FINISHED', t('Finished goods')]], state.type, { onchange: e => { state.type = e.target.value; run(); } });
      const itemSel = ui.select([['', 'All']].concat(items.map(i => [i.id, i.name])), state.itemId, { onchange: e => { state.itemId = e.target.value; run(); } });
      filters.replaceChildren(ui.dateRange(state, run), ['stock-summary', 'stock-ledger'].includes(state.key) ? ui.field(t('Type'), typeSel) : null, state.key === 'stock-ledger' ? ui.field(t('Item'), itemSel) : null);
    };
    const pick = h('div', { class: 'report-pick' }, cat.map(c => h('button', { class: 'btn small' + (c.key === state.key ? ' primary' : ''), dataset: { key: c.key, testid: 'rep-' + c.key }, onclick: ev => { state.key = c.key; if (!['stock-summary', 'stock-ledger'].includes(c.key)) state.type = ''; if (c.key !== 'stock-ledger') state.itemId = ''; pick.querySelectorAll('button').forEach(b => b.classList.toggle('primary', b === ev.currentTarget)); drawFilters(); run(); } }, c.title)));
    el.append(ui.pagehead(t('Reports'), 'Pick a report, set the dates, export for the auditor'), pick, h('div', { class: 'card stack mt' }, filters, help, exports), h('div', { class: 'mt' }, out));
    drawFilters(); run();
  } });

  /* ================= AUDIT ================= */
  function diffView(row) {
    const parse = s => { if (!s) return null; try { return JSON.parse(s); } catch (_) { return s; } };
    const b = parse(row.before_json), a = parse(row.after_json);
    const flat = v => (v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v));
    if ((b && typeof b === 'object' && !Array.isArray(b)) || (a && typeof a === 'object' && !Array.isArray(a))) {
      const keys = [...new Set([...Object.keys(b || {}), ...Object.keys(a || {})])];
      return h('div', { class: 'tw' }, h('table', { class: 'diff' }, h('thead', {}, h('tr', {}, ['Field', t('Before'), t('After')].map(x => h('th', {}, x)))), h('tbody', {}, keys.map(k => { const bv = b && k in b ? flat(b[k]) : '', av = a && k in a ? flat(a[k]) : ''; return h('tr', { class: bv !== av ? 'changed' : '' }, h('td', {}, h('code', {}, k)), h('td', { class: 'del' }, bv), h('td', { class: 'add' }, av)); }))));
    }
    return h('div', { class: 'row' }, h('div', { class: 'diffbox del' }, h('strong', {}, t('Before') + ': '), b === null ? '—' : flat(b)), h('div', { class: 'diffbox add' }, h('strong', {}, t('After') + ': '), a === null ? '—' : flat(a)));
  }
  SL.view('audit', { roles: ['ADMIN', 'AUDITOR', 'OWNER'], label: 'Audit trail', icon: '🔍', async render(el) {
    const f = { entity: '', actor: '' }, box = h('div', {});
    const load = async () => {
      const rows = await SL.get('/api/audit' + SL.qs(f)); box.replaceChildren();
      if (!rows.length) { box.append(ui.empty()); return; }
      const tb = h('tbody', {});
      rows.forEach(r => {
        const has = r.before_json || r.after_json; let open = null;
        const tr = h('tr', { class: has ? 'clickable' : '', onclick: () => { if (!has) return; if (open) { open.remove(); open = null; return; } open = h('tr', {}, h('td', { colspan: 7 }, diffView(r))); tr.after(open); } },
          h('td', { class: 'nowrap' }, fmt.dt(r.ts)), h('td', {}, r.actor), h('td', {}, h('span', { class: 'pill info' }, r.action)), h('td', {}, `${r.entity}${r.entity_id ? ' #' + r.entity_id : ''}`), h('td', {}, r.summary || ''), h('td', {}, r.reason || ''), h('td', {}, has ? '▾' : ''));
        tb.append(tr);
      });
      box.append(h('div', { class: 'tw' }, h('table', {}, h('thead', {}, h('tr', {}, [t('Date'), t('Actor'), t('Action'), t('Entity'), t('Details'), t('Reason'), ''].map(x => h('th', {}, x)))), tb)));
    };
    const ent = h('input', { placeholder: 'INVOICE, ORDER, PRODUCTION_RUN…', list: 'ents', onchange: e => { f.entity = e.target.value.trim(); load(); } }), act = h('input', { placeholder: 'admin', onchange: e => { f.actor = e.target.value.trim(); load(); } });
    el.append(ui.pagehead(t('Audit trail'), 'Who did what and when. Tap a row for before / after values.'), h('div', { class: 'row mb' }, ui.field(t('Entity'), ent), ui.field(t('Actor'), act), h('datalist', { id: 'ents' }, ['ORDER', 'INVOICE', 'PAYMENT', 'PRODUCTION_RUN', 'PURCHASE', 'ITEM', 'PRODUCT', 'BOM', 'CUSTOMER', 'SUPPLIER', 'USER', 'SETTINGS'].map(v => h('option', { value: v })))), box);
    await load();
  } });
})();
