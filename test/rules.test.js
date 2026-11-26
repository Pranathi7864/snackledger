'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, as, Client } = require('./helpers');

async function setup(t) {
  const env = await boot(); t.after(env.close);
  const c = { admin: await as(env.base, 'admin'), prod: await as(env.base, 'production'), sa: await as(env.base, 'salesa'), sb: await as(env.base, 'salesb'), aud: await as(env.base, 'auditor'), own: await as(env.base, 'owner') };
  const ids = Object.fromEntries((await c.admin.get('/api/items')).data.map(i => [i.code, i.id]));
  const boot_ = (await c.sa.get('/api/bootstrap')).data;
  return { env, c, ids, A: boot_.customers.find(x => x.name === 'Retailer A').id, B: boot_.customers.find(x => x.name === 'Distributor B').id };
}
const bal = async (c, code) => Number((await c.admin.get('/api/stock/balances')).data.find(i => i.code === code).balance);
const makeRun = async (c, ids, good = 188) => { const r = await c.prod.post('/api/production/runs', { productId: ids.MUR200, batches: 1 }); await c.prod.post(`/api/production/runs/${r.data.id}/complete`, { goodOutput: good, damagedPackaging: 0 }); return r.data.id; };

test('authentication, CSRF and role enforcement', async t => {
  const { env, c, ids, A } = await setup(t);
  assert.equal((await new Client(env.base).get('/api/items')).status, 401);
  assert.equal((await new Client(env.base).login('admin', 'wrong')).status, 401);
  const noCsrf = new Client(env.base); await noCsrf.login('admin'); noCsrf.csrf = 'bad';
  assert.equal((await noCsrf.post('/api/stock/adjustments', { itemId: ids.FLOUR, qty: 1, reason: 'x' })).status, 403);
  // auditor/owner are read-only at the API, not just in the UI
  for (const u of [c.aud, c.own]) { assert.equal((await u.post('/api/production/runs', { productId: ids.MUR200, batches: 1 })).status, 403); assert.equal((await u.post('/api/payments', { invoiceId: 1, amount: 1 })).status, 403); }
  assert.equal((await c.aud.get('/api/reports/sales-register')).status, 200);
  // salesman can't reach factory data or approve; production can't invoice
  assert.equal((await c.sa.get('/api/items')).status, 403); assert.equal((await c.sa.get('/api/reports/sales-register')).status, 403); assert.equal((await c.sa.get('/api/audit')).status, 403);
  assert.equal((await c.prod.post('/api/orders/1/approve')).status, 403); assert.equal((await c.prod.get('/api/reports/sales-register')).status, 400);
  assert.equal((await c.aud.post('/api/auth/logout')).status, 200);
  // passwords are stored hashed
  const hash = (await env.db.one("select password_hash from users where username='admin'")).password_hash; assert.match(hash, /^\$2[aby]\$/);
});

test('offline outbox sync is idempotent and isolated per salesman', async t => {
  const { env, c, ids, A, B } = await setup(t); await makeRun(c, ids);
  const batch = { orders: [{ clientId: 'off-1', customerId: A, placedAt: '2026-11-20T09:15:00', lines: [{ productId: ids.MUR200, qty: 10, clientPrice: 50 }] }, { clientId: 'off-bad', customerId: 9999, lines: [{ productId: ids.MUR200, qty: 1 }] }, { clientId: 'off-2', customerId: B, lines: [{ productId: ids.MUR200, qty: 2, unit: 'carton', clientPrice: 45 }] }] };
  const r1 = (await c.sa.post('/api/orders/sync', batch)).data.results;
  assert.deepEqual(r1.map(x => x.ok), [true, false, true]);
  const r2 = (await c.sa.post('/api/orders/sync', batch)).data.results;     // network retry: no duplicates
  assert.equal(r2[0].duplicate, true); assert.equal(r2[0].orderId, r1[0].orderId);
  const mine = (await c.sa.get('/api/orders')).data; assert.equal(mine.length, 2);
  const d = (await c.admin.get(`/api/orders/${r1[2].orderId}`)).data;
  assert.equal(d.lines[0].qty, '40.000');                                      // 2 cartons x 20
  assert.equal(d.lines[0].price, '50.00'); assert.equal(d.lines[0].client_price, '45.00'); assert.equal(d.source, 'OFFLINE'); // server re-prices
  assert.equal((await c.sb.get('/api/orders')).data.length, 0);                // salesman B sees none of A's
  assert.equal((await c.sb.get(`/api/orders/${r1[0].orderId}`)).status, 403);
  assert.equal((await c.sb.post('/api/orders/sync', { orders: [batch.orders[0]] })).data.results[0].ok, false);   // can't hijack another's clientId
  const cs = (await c.sa.get('/api/orders/my/customer-sales?from=2000-01-01&to=2100-01-01')).data; assert.equal(cs.length, 2);
  const v = await c.sa.post('/api/visits/sync', { visits: [{ clientId: 'v1', customerId: A, lat: 10.8, lng: 78.69, accuracy: 12 }] }); assert.equal(v.data.results[0].ok, true);
  assert.equal((await c.sa.post('/api/visits/sync', { visits: [{ clientId: 'v1', customerId: A }] })).data.results[0].duplicate, true);
});

test('shortage: back-order approval, partial dispatch, no overselling, concurrency', async t => {
  const { c, ids, A, B, env } = await setup(t);
  const o = (await c.sb.post('/api/orders', { clientId: 'bo-1', customerId: B, lines: [{ productId: ids.MUR200, qty: 120 }] })).data;
  const ap = await c.admin.post(`/api/orders/${o.id}/approve`, { acknowledgeShortage: true }); assert.equal(ap.status, 200); assert.equal(ap.data.shortages[0].shortage, '70');   // only 50 opening packets
  const inv = (await c.admin.post(`/api/orders/${o.id}/invoice`, {})).data; assert.equal(inv.supplyType, 'INTER');
  const full = await c.admin.post(`/api/orders/${o.id}/dispatch`, { vehicleNo: 'TN45AB1234' }); assert.equal(full.status, 409);
  const part = await c.admin.post(`/api/orders/${o.id}/dispatch`, { partial: true, vehicleNo: 'TN45AB1234' }); assert.equal(part.data.status, 'PARTIALLY_DISPATCHED'); assert.equal(part.data.remaining, '70');
  assert.equal(await bal(c, 'MUR200'), 0);
  // production catches up, remaining dispatched
  await makeRun(c, ids, 190);
  const rest = await c.admin.post(`/api/orders/${o.id}/dispatch`, { vehicleNo: 'TN45AB1234' }); assert.equal(rest.data.status, 'DISPATCHED'); assert.equal(await bal(c, 'MUR200'), 120);
  assert.equal((await c.admin.get(`/api/invoices/${inv.id}`)).data.igst, '300.00'.replace('300', '300'));
  // concurrency: two approved orders race for the same last 120 packets; exactly one wins, stock never negative
  const mk = async (id, n) => { const x = (await c.sa.post('/api/orders', { clientId: id, customerId: A, lines: [{ productId: ids.MUR200, qty: n }] })).data.id; await c.admin.post(`/api/orders/${x}/approve`, {}); await c.admin.post(`/api/orders/${x}/invoice`, {}); return x; };
  const x1 = await mk('r1', 100), x2 = await mk('r2', 100);
  const rs = await Promise.all([c.admin.post(`/api/orders/${x1}/dispatch`, { vehicleNo: 'TN45AB1234' }), c.admin.post(`/api/orders/${x2}/dispatch`, { vehicleNo: 'TN45AB1234' })]);
  assert.deepEqual(rs.map(r => r.status).sort(), [200, 409]); assert.equal(await bal(c, 'MUR200'), 20);
  assert.equal((await c.admin.get('/api/stock/reconcile')).data.ok, true);
});

test('credit note cancels an invoice (never deletes) and can return goods', async t => {
  const { c, ids, A, env } = await setup(t);
  const o = (await c.sa.post('/api/orders', { clientId: 'cn-1', customerId: A, lines: [{ productId: ids.MUR200, qty: 30 }] })).data;
  await c.admin.post(`/api/orders/${o.id}/approve`, {}); const inv = (await c.admin.post(`/api/orders/${o.id}/invoice`, {})).data;
  await c.admin.post(`/api/orders/${o.id}/dispatch`, { vehicleNo: 'TN45AB1234' }); assert.equal(await bal(c, 'MUR200'), 20);
  await c.admin.post('/api/payments', { invoiceId: inv.id, amount: 500 });
  assert.equal((await c.admin.post(`/api/invoices/${inv.id}/cancel`, { returnGoods: true })).status, 400);   // reason mandatory
  const cn = await c.admin.post(`/api/invoices/${inv.id}/cancel`, { reason: 'Wrong customer', returnGoods: true }); assert.equal(cn.status, 200); assert.match(cn.data.creditNoteNo, /^SL-CN\/\d{4}-\d{2}\/0001$/);
  assert.equal(await bal(c, 'MUR200'), 50);
  const d = (await c.admin.get(`/api/invoices/${inv.id}`)).data; assert.equal(d.status, 'CANCELLED'); assert.equal(d.creditNote.total, d.total);
  assert.equal((await c.admin.post('/api/payments', { invoiceId: inv.id, amount: 1 })).status, 409);
  assert.equal((await env.db.one('select count(*)::int c from invoices')).c, 1);                          // still there
  await assert.rejects(env.db.query('delete from invoices'), /immutable/);
  await assert.rejects(env.db.query('delete from stock_moves'), /immutable/);
  await assert.rejects(env.db.query("update invoice_lines set qty=1"), /immutable/);
  const reg = (await c.admin.get('/api/reports/sales-register?from=2000-01-01&to=2100-01-01')).data.sections[0]; assert.equal(reg.totals.total, '0.00');   // invoice offset by credit note
  assert.equal((await c.admin.get(`/api/invoices/${inv.id}/credit-note/pdf`)).status, 200);
  const hist = (await c.admin.get(`/api/audit?entity=INVOICE&entityId=${inv.id}`)).data; assert.ok(hist.find(h => h.action === 'CANCEL' && h.reason === 'Wrong customer'));
  // editing a posted invoice's non-financial fields is logged with before/after
  const o2 = (await c.sa.post('/api/orders', { clientId: 'cn-2', customerId: A, lines: [{ productId: ids.MUR200, qty: 5 }] })).data; await c.admin.post(`/api/orders/${o2.id}/approve`, {}); const i2 = (await c.admin.post(`/api/orders/${o2.id}/invoice`, {})).data;
  await c.admin.patch(`/api/invoices/${i2.id}`, { vehicleNo: 'TN45AB1234', reason: 'driver changed' });
  const h2 = (await c.admin.get(`/api/audit?entity=INVOICE&entityId=${i2.id}`)).data.find(h => h.action === 'EDIT'); assert.match(h2.after_json, /TN45AB1234/); assert.equal(h2.actor, 'admin');
});

test('order edits by admin are audited; approve is idempotent-safe; payments cannot exceed due', async t => {
  const { c, ids, A } = await setup(t);
  const o = (await c.sa.post('/api/orders', { clientId: 'ed-1', customerId: A, lines: [{ productId: ids.MUR200, qty: 20 }] })).data;
  const line = (await c.admin.get(`/api/orders/${o.id}`)).data.lines[0];
  assert.equal((await c.admin.post(`/api/orders/${o.id}/approve`, { edits: [{ lineId: line.id, qty: 10, price: 48 }] })).status, 200);
  assert.equal((await c.admin.post(`/api/orders/${o.id}/approve`, {})).status, 409);
  const inv = (await c.admin.post(`/api/orders/${o.id}/invoice`, {})).data; assert.equal(inv.total, '504.00');      // 10 x 48 + 5%
  assert.equal((await c.admin.post('/api/payments', { invoiceId: inv.id, amount: 600 })).status, 400);
  const a = (await c.admin.get(`/api/audit?entity=ORDER&entityId=${o.id}`)).data.find(x => x.action === 'EDIT'); assert.match(a.before_json, /20/); assert.match(a.after_json, /48/);
  const rej = (await c.sa.post('/api/orders', { clientId: 'ed-2', customerId: A, lines: [{ productId: ids.MUR200, qty: 1 }] })).data;
  assert.equal((await c.admin.post(`/api/orders/${rej.id}/reject`, {})).status, 400); assert.equal((await c.admin.post(`/api/orders/${rej.id}/reject`, { reason: 'Credit limit' })).status, 200);
});

test('production: voiding reverses the ledger; wastage maths; second pack size shares the BOM', async t => {
  const { c, ids, env } = await setup(t);
  const id = await makeRun(c, ids, 190);
  assert.equal(await bal(c, 'FLOUR'), 60); assert.equal(await bal(c, 'MUR200'), 240);
  assert.equal((await c.admin.post(`/api/production/runs/${id}/void`, {})).status, 400);
  assert.equal((await c.admin.post(`/api/production/runs/${id}/void`, { reason: 'Entered wrong quantities' })).status, 200);
  assert.equal(await bal(c, 'FLOUR'), 100); assert.equal(await bal(c, 'MUR200'), 50); assert.equal(await bal(c, 'POUCH200'), 500);
  const det = (await c.admin.get(`/api/production/runs/${id}`)).data; assert.equal(det.run.status, 'VOIDED'); assert.ok(det.moves.some(m => m.move_type === 'PRODUCTION_REVERSAL'));
  // insufficient raw material is refused and leaves no partial postings
  const before = (await env.db.one('select count(*)::int c from stock_moves')).c;
  const big = await c.prod.post('/api/production/runs', { productId: ids.MUR200, batches: 5 }); assert.equal(big.status, 409); assert.match(big.data.error, /Insufficient stock of Flour/);
  assert.equal((await env.db.one('select count(*)::int c from stock_moves')).c, before); assert.equal((await env.db.one('select count(*)::int c from production_runs')).c, 1);
  // unit conversion in issue: 40000 g == 40 kg
  const r2 = await c.prod.post('/api/production/runs', { productId: ids.MUR200, batches: 1, issues: [{ itemId: ids.FLOUR, qty: 40000, unit: 'g' }] }); assert.equal(r2.status, 201); assert.equal(await bal(c, 'FLOUR'), 60);
  // interview change: add a 500 g pack that shares the same BOM (data only, no code change)
  const bom = (await c.admin.get('/api/boms')).data[0];
  const p = await c.admin.post('/api/products', { code: 'MUR500', name: 'Murukku 500 g', bomId: bom.id, packSizeG: 500, hsn: '19059030', gstRate: 5, price: 120, cartonCapacity: 10, packaging: [{ itemId: ids.POUCH200, qtyPerPacket: 1 }, { itemId: ids.CARTON20, qtyPerPacket: 0.1 }] });
  assert.equal(p.status, 201);
  const eb = (await c.admin.get(`/api/products/${p.data.id}/bom?batches=2`)).data;
  assert.equal(eb.expectedOutput, '160.000'); assert.equal(eb.lines.find(l => l.name === 'Flour').planned, '80.0000'); assert.equal(eb.lines.find(l => l.kind === 'PACKAGING' && l.name.includes('Carton')).planned, '16.0000');
});

test('FEFO dispatch, costing allocation of monthly overheads, adjustments, tolerance setting', async t => {
  const { c, ids, A } = await setup(t);
  await makeRun(c, ids, 200);                                                    // new batch, later expiry than OPENING (+60d)
  const o = (await c.sa.post('/api/orders', { clientId: 'fe-1', customerId: A, lines: [{ productId: ids.MUR200, qty: 70 }] })).data;
  await c.admin.post(`/api/orders/${o.id}/approve`, {}); await c.admin.post(`/api/orders/${o.id}/invoice`, {}); await c.admin.post(`/api/orders/${o.id}/dispatch`, { vehicleNo: 'TN45AB1234' });
  const batches = (await c.admin.get(`/api/items/${ids.MUR200}/batches`)).data;
  assert.equal(batches.length, 1); assert.match(batches[0].batch_no, /^MUR200-/); assert.equal(Number(batches[0].balance), 180);    // OPENING (earliest expiry) emptied first
  // monthly overhead pool is allocated by output weight; the run carries 100% here
  await c.admin.post('/api/production/monthly-overheads', { month: new Date().toISOString().slice(0, 10), costType: 'RENT', amount: 1000 });
  const run = (await c.admin.get('/api/production/runs')).data[0];
  const cost = (await c.admin.get(`/api/production/runs/${run.id}`)).data.costing; assert.equal(cost.allocatedOverhead, '1000.00');
  // adjustments need a reason, are ledgered, and can't drive stock negative
  assert.equal((await c.admin.post('/api/stock/adjustments', { itemId: ids.FLOUR, qty: -5 })).status, 400);
  assert.equal((await c.admin.post('/api/stock/adjustments', { itemId: ids.FLOUR, qty: -5, reason: 'Spillage' })).status, 201); assert.equal(await bal(c, 'FLOUR'), 55);
  assert.equal((await c.admin.post('/api/stock/adjustments', { itemId: ids.FLOUR, qty: -5000, reason: 'oops' })).status, 409);
  // tolerance is configurable
  assert.equal((await c.admin.put('/api/settings', { varianceTolerancePct: 10 })).status, 200);
  const r = await c.prod.post('/api/production/runs', { productId: ids.MUR200, batches: 1, issues: [{ itemId: ids.OIL, qty: 10.5 }] });
  const d = (await c.prod.get(`/api/production/runs/${r.data.id}`)).data; assert.equal(d.lines.find(l => l.name === 'Cooking oil').flagged, false);   // +5% is within 10%
  // planning from pending orders
  const o2 = (await c.sa.post('/api/orders', { clientId: 'fe-2', customerId: A, lines: [{ productId: ids.MUR200, qty: 500 }] })).data;
  const plan = (await c.admin.get('/api/production/planning')).data; assert.equal(plan.products[0].batchesNeeded, '2'); assert.ok(plan.materials.find(m => m.name === 'Flour'));
});

test('master data validation: GSTIN, users, audit trail', async t => {
  const { c } = await setup(t);
  const bad = await c.admin.post('/api/customers', { name: 'X', type: 'RETAILER', stateCode: '33', gstin: '33AAAAA0000A1Z5' }); assert.equal(bad.status, 400);
  const wrongState = await c.admin.post('/api/customers', { name: 'X', type: 'RETAILER', stateCode: '29', gstin: require('../src/gst').makeGstin('33AABCS1429B1Z') }); assert.equal(wrongState.status, 400);
  const ok = await c.admin.post('/api/customers', { name: 'Walk-in Store', type: 'RETAILER', stateCode: '33' }); assert.equal(ok.status, 201);
  assert.equal((await c.admin.post('/api/users', { username: 'rep3', fullName: 'Rep 3', role: 'SALES', password: 'short' })).status, 400);
  assert.equal((await c.admin.post('/api/users', { username: 'rep3', fullName: 'Rep 3', role: 'SALES', password: 'longenough1' })).status, 201);
  assert.equal((await new Client(c.admin.base).login('rep3', 'longenough1')).status, 200);
  const au = (await c.aud.get('/api/audit')).data; assert.ok(au.find(a => a.entity === 'CUSTOMER' && a.action === 'CREATE') && au.find(a => a.entity === 'USER'));
});

test('input validation: dates, bill number, vehicle number, phone', async t => {
  const { c, ids, A } = await setup(t);
  const line = [{ itemId: ids.FLOUR, qty: 1, unit: 'kg', rate: 45 }];
  const p = b => c.prod.post('/api/purchases', { supplierId: 1, lines: line, ...b });
  assert.equal((await p({ billNo: 'X1', billDate: '0001-01-01' })).status, 400);        // year 0001 rejected
  assert.equal((await p({ billNo: 'X1', billDate: '2999-01-01' })).status, 400);        // future rejected
  assert.equal((await p({ billNo: 'X1', billDate: '2026-02-30' })).status, 400);        // not a real date
  assert.equal((await p({ billDate: '2026-11-01' })).status, 201);                      // bill number optional: auto-filled
  assert.equal((await p({ billNo: 'X1', billDate: '2026-11-01' })).status, 201);
  await makeRun(c, ids);
  const o = (await c.sa.post('/api/orders', { clientId: 'v-1', customerId: A, lines: [{ productId: ids.MUR200, qty: 5 }] })).data;
  await c.admin.post(`/api/orders/${o.id}/approve`, {}); await c.admin.post(`/api/orders/${o.id}/invoice`, {});
  assert.equal((await c.admin.post(`/api/orders/${o.id}/dispatch`, {})).status, 400);   // no vehicle number
  assert.equal((await c.admin.post(`/api/orders/${o.id}/dispatch`, { vehicleNo: '1234' })).status, 400);
  assert.equal((await c.admin.post(`/api/orders/${o.id}/dispatch`, { vehicleNo: 'tn 45 ab 1234' })).status, 200);
  const inv = (await c.admin.get('/api/invoices')).data[0];
  assert.equal((await c.admin.post('/api/payments', { invoiceId: inv.id, amount: 10, paidOn: '0001-01-01' })).status, 400);
  const cu = b => c.admin.post('/api/customers', { name: 'Zed', type: 'RETAILER', stateCode: '33', ...b });
  assert.equal((await cu({ phone: '12345' })).status, 400);
  assert.equal((await cu({ phone: '9876543210' })).status, 201);
});

test('GST summary does not subtract a cancelled invoice twice (invoice + credit note nets to zero)', async t => {
  const { c, ids, A } = await setup(t);
  await makeRun(c, ids);
  const invoice = async (n, qty) => { const o = (await c.sa.post('/api/orders', { clientId: n, customerId: A, lines: [{ productId: ids.MUR200, qty }] })).data; await c.admin.post(`/api/orders/${o.id}/approve`, {}); return (await c.admin.post(`/api/orders/${o.id}/invoice`, {})).data; };
  const keep = await invoice('g-keep', 20), drop = await invoice('g-drop', 30);        // 20 x 50 = 1000 kept, 30 x 50 = 1500 cancelled
  const R = '?from=2000-01-01&to=2100-01-01';
  const sec = async (path, title) => (await c.admin.get('/api/reports/' + path + R)).data.sections.find(s => s.title.startsWith(title));
  const net = async () => (await sec('gst-summary', '3B')).rows;
  const before = (await net()).find(r => /Outward/i.test(r.desc || r.description || '')) || (await net())[0];
  assert.equal(Number(before.taxable), 2500);                                           // both invoices, nothing cancelled yet
  assert.equal((await c.admin.post(`/api/invoices/${drop.id}/cancel`, { reason: 'Customer returned' })).status, 200);
  const rows = await net();
  const row = rows.find(r => r.taxable !== undefined && /Outward/i.test(r.desc || r.description || '')) || rows[0];
  assert.equal(Number(row.taxable), 1000, 'net taxable must be only the invoice that was kept');
  assert.equal(Number(row.cgst), 25); assert.equal(Number(row.sgst), 25); assert.equal(Number(row.igst), 0);
  // the credit note appears once in section 9B; the cancelled invoice stays visible (audit) in the B2B/B2C list
  assert.equal((await sec('gst-summary', 'GSTR-1 9B')).rows.length, 1);
  // HSN summary is net as well: 20 packets, not 50 and not -10
  const hsn = (await sec('gst-summary', 'GSTR-1 12')).rows; assert.equal(hsn.reduce((a, r) => a + Number(r.qty), 0), 20); assert.equal(hsn.reduce((a, r) => a + Number(r.taxable), 0), 1000);
  // sales register and customer sales agree with the GST summary
  assert.equal((await sec('sales-register', 'Invoices')).totals.taxable, '1000.00');
  assert.equal((await sec('customer-sales', 'Sales by customer')).totals.net, '1050.00');   // 1000 + 5% GST
  // Tally export: both vouchers present once each, so it nets out too
  const tl = await c.admin.get('/api/export/tally' + R); assert.equal(tl.status, 200, JSON.stringify(tl.data).slice(0, 200)); const xml = String(tl.data);
  assert.equal((xml.match(/<VOUCHER[ >]/g) || []).length, 3);                              // 2 sales vouchers + 1 credit-note voucher
  const dropNo = (await c.admin.get(`/api/invoices/${drop.id}`)).data.invoice_no;
  assert.ok(xml.includes(dropNo));                                                       // the cancelled invoice is still exported, so its credit note nets it out
  void keep;
});

test('past-period reports use the credit-note date, not the invoice\'s current status (raised in January, cancelled in February)', async t => {
  const clock = require('../src/clock'); t.after(() => clock.unfreeze());
  const { c, ids, A } = await setup(t);
  const get = async (p) => (await c.admin.get('/api/reports/' + p)).data.sections;
  clock.freeze('2026-01-15T10:00:00+05:30');
  const o = (await c.sa.post('/api/orders', { clientId: 'hist-1', customerId: A, lines: [{ productId: ids.MUR200, qty: 30 }] })).data;      // 30 x 50 = 1500 + 5% = 1575
  await c.admin.post(`/api/orders/${o.id}/approve`, {}); const inv = (await c.admin.post(`/api/orders/${o.id}/invoice`, {})).data;
  await c.admin.post(`/api/orders/${o.id}/dispatch`, { vehicleNo: 'TN45AB1234' });
  assert.equal((await c.admin.post('/api/payments', { invoiceId: inv.id, amount: 500 })).status, 201);                                       // paid 500 in January
  clock.freeze('2026-02-10T10:00:00+05:30');
  assert.equal((await c.admin.post(`/api/invoices/${inv.id}/cancel`, { reason: 'Cancelled in February' })).status, 200);
  const JAN = '?from=2026-01-01&to=2026-01-31', FEB = '?from=2026-02-01&to=2026-02-28';
  const first = (secs, title) => secs.find(s => s.title.startsWith(title));
  // --- customer-wise sales
  const cj = first(await get('customer-sales' + JAN), 'Sales by customer'); assert.equal(cj.totals.net, '1575.00', 'January still shows the January sale'); assert.equal(cj.totals.cancelled, '0.00'); assert.equal(cj.totals.taxable, '1500.00');
  const cf = first(await get('customer-sales' + FEB), 'Sales by customer'); assert.equal(cf.totals.net, '-1575.00', 'February carries the credit note'); assert.equal(cf.totals.total, '0.00'); assert.equal(cf.totals.cancelled, '1575.00');
  const call = first(await get('customer-sales?from=2026-01-01&to=2026-02-28'), 'Sales by customer'); assert.equal(call.totals.net, '0.00');          // whole span nets to zero
  // --- product-wise sales
  const pj = first(await get('product-sales' + JAN), 'Sales by product'); assert.equal(Number(pj.totals.qty), 30); assert.equal(pj.totals.total, '1575.00');
  const pf = first(await get('product-sales' + FEB), 'Sales by product'); assert.equal(Number(pf.totals.qty), -30); assert.equal(pf.totals.total, '-1575.00');
  const pall = first(await get('product-sales?from=2026-01-01&to=2026-02-28'), 'Sales by product'); assert.equal(Number(pall.totals.qty), 0); assert.equal(pall.totals.total, '0.00');
  // --- outstanding as on a past date
  const out = async d => first(await get('outstanding?to=' + d), 'Invoice-wise');
  const oj = await out('2026-01-31'); assert.equal(oj.rows.length, 1, 'on 31 Jan the invoice was still owed'); assert.equal(oj.rows[0].outstanding, '1075.00');      // 1575 - 500 paid
  assert.equal((await out('2026-02-09')).rows.length, 1);                                                                                         // day before the credit note
  assert.equal((await out('2026-02-10')).rows.length, 0, 'from the credit-note date it is no longer owed');
  assert.equal((await out('2026-02-28')).rows.length, 0);
  assert.equal((await out('2026-01-10')).rows.length, 0, 'before the invoice existed');
  // --- dashboard (current month = Feb 2026 while frozen): the credit note reduces this month, not the invoice status
  const dash = (await c.admin.get('/api/dashboard')).data; assert.equal(dash.sales.monthTaxable, '-1500.00');
});
