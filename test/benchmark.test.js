'use strict';
// Section 5 benchmark, end to end over HTTP, exactly as in the brief. Nothing is hardcoded: every number is read back from the API.
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, as } = require('./helpers');

test('Section 5 benchmark scenario', async t => {
  const env = await boot(); t.after(env.close);
  const prod = await as(env.base, 'production'), admin = await as(env.base, 'admin'), sa = await as(env.base, 'salesa'), sb = await as(env.base, 'salesb'), owner = await as(env.base, 'owner');
  const bal = async name => Number((await admin.get('/api/stock/balances')).data.find(i => i.name === name).balance);
  const ids = Object.fromEntries((await admin.get('/api/items')).data.map(i => [i.code, i.id]));
  const retailerA = (await sa.get('/api/bootstrap')).data.customers.find(c => c.name === 'Retailer A').id;
  const distB = (await sb.get('/api/bootstrap')).data.customers.find(c => c.name === 'Distributor B').id;
  assert.equal(await bal('Flour'), 100); assert.equal(await bal('Murukku 200 g'), 50);

  // 1. purchase 60 kg flour @ 45
  const sup = (await prod.get('/api/purchases?from=2000-01-01&to=2100-01-01')); assert.equal(sup.status, 200);
  const p = await prod.post('/api/purchases', { supplierId: 1, billNo: 'FM-101', lines: [{ itemId: ids.FLOUR, qty: 60, unit: 'kg', rate: 45 }] }); assert.equal(p.status, 201);
  assert.equal(await bal('Flour'), 160);
  // 2. start run: 40 kg flour, 10.5 L oil, 1.2 kg spice
  const run = await prod.post('/api/production/runs', { productId: ids.MUR200, batches: 1, issues: [{ itemId: ids.FLOUR, qty: 40 }, { itemId: ids.OIL, qty: 10.5 }, { itemId: ids.SPICE, qty: 1.2 }] }); assert.equal(run.status, 201);
  assert.equal(await bal('Flour'), 120); assert.equal(await bal('Cooking oil'), 19.5);
  // 3. actual output 188, 6 damaged pouches, 9 cartons
  const done = await prod.post(`/api/production/runs/${run.data.id}/complete`, { goodOutput: 188, damagedPackaging: 6, cartonsUsed: 9 }); assert.equal(done.status, 200);
  assert.equal(await bal('200 g pouch'), 306); assert.equal(await bal('Murukku 200 g'), 238);
  assert.equal(await bal('Carton (holds 20 packets)'), 21);
  const r = done.data.run; assert.equal(Number(r.yield_variance_pct), -6); assert.equal(r.yield_flag, true); assert.equal(Number(r.expected_output), 200);
  const oil = done.data.lines.find(l => l.name === 'Cooking oil'); assert.equal(Number(oil.variance_pct), 5); assert.equal(oil.flagged, true);
  assert.equal(done.data.lines.find(l => l.name === 'Flour').flagged, false);
  // 4. Salesman A orders 150 for Retailer A
  const o1 = await sa.post('/api/orders', { clientId: 'bench-A-1', customerId: retailerA, lines: [{ productId: ids.MUR200, qty: 150 }] }); assert.equal(o1.status, 201);
  const forAdmin = (await admin.get('/api/orders')).data; assert.ok(forAdmin.find(o => o.id === o1.data.id && o.status === 'SUBMITTED'));
  // 5. approve -> invoice -> dispatch
  const view = (await admin.get(`/api/orders/${o1.data.id}`)).data; assert.equal(view.anyShortage, false); assert.equal(view.lines[0].free_stock, '238.000');
  assert.equal((await admin.post(`/api/orders/${o1.data.id}/approve`)).status, 200);
  const inv = await admin.post(`/api/orders/${o1.data.id}/invoice`, {}); assert.equal(inv.status, 201);
  const d = (await admin.get(`/api/invoices/${inv.data.id}`)).data;
  assert.equal(d.taxable, '7500.00'); assert.equal(d.cgst, '187.50'); assert.equal(d.sgst, '187.50'); assert.equal(d.igst, '0.00'); assert.equal(d.total, '7875.00'); assert.match(d.invoice_no, /^SL\/\d{4}-\d{2}\/0001$/);
  assert.equal((await admin.post(`/api/orders/${o1.data.id}/dispatch`, { vehicleNo: 'TN45AB1234' })).status, 200);
  assert.equal(await bal('Murukku 200 g'), 88);
  // 6. Salesman B orders 120 for Distributor B (Karnataka): shortage of 32, IGST on invoice
  const o2 = await sb.post('/api/orders', { clientId: 'bench-B-1', customerId: distB, lines: [{ productId: ids.MUR200, qty: 120 }] });
  const v2 = (await admin.get(`/api/orders/${o2.data.id}`)).data;
  assert.equal(v2.anyShortage, true); assert.equal(v2.lines[0].shortage, '32.000'); assert.equal(v2.supplyType, 'INTER'); assert.equal(v2.taxPreview.igst, '300.00'); assert.equal(v2.taxPreview.cgst, '0.00');
  const blocked = await admin.post(`/api/orders/${o2.data.id}/approve`); assert.equal(blocked.status, 409); assert.match(blocked.data.error, /short by 32/);
  assert.equal(await bal('Murukku 200 g'), 88, 'stock must never go negative or change');
  // 7. payment of 4000
  const pay = await admin.post('/api/payments', { invoiceId: inv.data.id, amount: 4000, mode: 'UPI' }); assert.equal(pay.status, 201); assert.equal(pay.data.outstanding, '3875.00');
  const bals = (await admin.get('/api/customers-balances')).data.find(c => c.name === 'Retailer A'); assert.equal(bals.outstanding, '3875.00');
  // 8. labour 1200, gas/power 600 -> cost per packet
  await prod.post(`/api/production/runs/${run.data.id}/costs`, { costType: 'LABOUR', amount: 1200 });
  const c = await prod.post(`/api/production/runs/${run.data.id}/costs`, { costType: 'POWER_GAS', amount: 600 });
  assert.equal(c.data.costing.totalCost, '5855.00'); assert.equal(c.data.costing.costPerPacketRounded, '31.14'); assert.equal(c.data.costing.marginPerPacket, '18.86');
  // 9. reports
  const q = '?from=2000-01-01&to=2100-01-01';
  for (const k of ['sales-register', 'customer-sales', 'product-sales', 'gst-summary', 'purchase-register', 'stock-summary', 'stock-ledger', 'production', 'cost-report', 'payments', 'outstanding']) {
    const rep = await admin.get(`/api/reports/${k}${q}`); assert.equal(rep.status, 200, k); assert.ok(rep.data.sections.length >= 1);
    for (const f of ['csv', 'xlsx', 'pdf']) { const res = await admin.req('GET', `/api/reports/${k}${q}&format=${f}`, null, true); assert.equal(res.status, 200, `${k}.${f}`); assert.ok((await res.arrayBuffer()).byteLength > 200); }
  }
  const sum = (await admin.get(`/api/reports/stock-summary${q}`)).data.sections[0].rows;
  const flour = sum.find(x => x.item === 'Flour'); assert.deepEqual([flour.opening, flour.receipts, flour.issues, flour.closing], ['100.000', '60.000', '40.000', '120.000']);
  const gst = (await admin.get(`/api/reports/gst-summary${q}`)).data.sections[0].rows[0]; assert.equal(gst.cgst, '187.50'); assert.equal(gst.taxable, '7500.00');
  const ageing = (await admin.get(`/api/reports/outstanding${q}`)).data.sections[0].totals.total; assert.equal(ageing, '3875.00');
  const dash = (await owner.get('/api/dashboard')).data; assert.equal(dash.outstanding.total, '3875.00'); assert.ok(dash.varianceAlerts.length >= 2); assert.ok(dash.lowStock.find(x => x.name === '200 g pouch'));
  // ledger integrity
  const rec = (await admin.get('/api/stock/reconcile')).data; assert.equal(rec.ok, true);
  // every ledger row links to a source document
  const led = (await admin.get(`/api/stock/ledger${q}`)).data; assert.ok(led.length > 10); assert.ok(led.every(m => m.source_ref && m.created_by));
  // Tally export + invoice PDF + share + mock e-invoice
  const tx = await admin.req('GET', `/api/export/tally${q}`, null, true); assert.match(await tx.text(), /<VOUCHERNUMBER>SL\/\d{4}-\d{2}\/0001/);
  const pdfRes = await admin.req('GET', `/api/invoices/${inv.data.id}/pdf`, null, true); assert.equal(pdfRes.headers.get('content-type'), 'application/pdf'); assert.equal(Buffer.from(await pdfRes.arrayBuffer()).subarray(0, 4).toString(), '%PDF');
  const sh = (await admin.get(`/api/invoices/${inv.data.id}/share`)).data; assert.match(sh.whatsappUrl, /^https:\/\/wa\.me\/919000000001/);
  const pubRes = await fetch(sh.url); assert.equal(pubRes.status, 200); assert.equal(pubRes.headers.get('content-type'), 'application/pdf');
  const ei = (await admin.get(`/api/invoices/${inv.data.id}/einvoice`)).data; assert.equal(ei.einvoice.Irn.length, 64); assert.equal(ei.einvoice.ValDtls.TotInvVal, 7875);
});
