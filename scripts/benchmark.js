#!/usr/bin/env node
'use strict';
// Runs the Section 5 benchmark against a RUNNING server on a freshly seeded database and prints the "Results we will check" table.
//   npm run seed && npm start   (in one terminal)      BASE_URL=http://localhost:8080 npm run benchmark   (in another)
const { Client } = require('../test/helpers');
const BASE = process.env.BASE_URL || 'http://localhost:8080';
const rows = [];
const check = (name, expected, actual) => rows.push({ name, expected: String(expected), actual: String(actual), ok: String(expected) === String(actual) });
(async () => {
  const login = async u => { const c = new Client(BASE); const r = await c.login(u); if (r.status !== 200) throw new Error(`login ${u} failed: ${JSON.stringify(r.data)}`); return c; };
  const [prod, admin, sa, sb] = await Promise.all(['production', 'admin', 'salesa', 'salesb'].map(login));
  const items = (await admin.get('/api/items')).data, id = c => items.find(i => i.code === c).id, bal = async n => Number((await admin.get('/api/stock/balances')).data.find(i => i.name === n).balance);
  if ((await bal('Flour')) !== 100) throw new Error('Database is not freshly seeded (flour opening should be 100 kg). Run `npm run seed` first.');
  const cust = (await sa.get('/api/bootstrap')).data.customers, A = cust.find(c => c.name === 'Retailer A').id, B = cust.find(c => c.name === 'Distributor B').id;
  const step = async (n, fn) => { process.stdout.write(`step ${n}... `); const r = await fn(); console.log('done'); return r; };
  await step(1, () => prod.post('/api/purchases', { supplierId: 1, billNo: 'BENCH-1', lines: [{ itemId: id('FLOUR'), qty: 60, unit: 'kg', rate: 45 }] }));
  const run = await step(2, () => prod.post('/api/production/runs', { productId: id('MUR200'), batches: 1, issues: [{ itemId: id('FLOUR'), qty: 40 }, { itemId: id('OIL'), qty: 10.5 }, { itemId: id('SPICE'), qty: 1.2 }] }));
  const done = await step(3, () => prod.post(`/api/production/runs/${run.data.id}/complete`, { goodOutput: 188, damagedPackaging: 6, cartonsUsed: 9 }));
  const o1 = await step(4, () => sa.post('/api/orders', { clientId: 'bench-' + Date.now() + 'a', customerId: A, lines: [{ productId: id('MUR200'), qty: 150 }] }));
  check('Finished goods after run', 238, await bal('Murukku 200 g'));
  const inv = await step(5, async () => { await admin.post(`/api/orders/${o1.data.id}/approve`); const i = await admin.post(`/api/orders/${o1.data.id}/invoice`, {}); await admin.post(`/api/orders/${o1.data.id}/dispatch`, { vehicleNo: 'TN45AB1234' }); return i; });
  const o2 = await step(6, () => sb.post('/api/orders', { clientId: 'bench-' + Date.now() + 'b', customerId: B, lines: [{ productId: id('MUR200'), qty: 120 }] }));
  const v2 = (await admin.get(`/api/orders/${o2.data.id}`)).data;
  const pay = await step(7, () => admin.post('/api/payments', { invoiceId: inv.data.id, amount: 4000 }));
  await step(8, async () => { await prod.post(`/api/production/runs/${run.data.id}/costs`, { costType: 'LABOUR', amount: 1200 }); return prod.post(`/api/production/runs/${run.data.id}/costs`, { costType: 'POWER_GAS', amount: 600 }); });
  const costing = (await admin.get(`/api/production/runs/${run.data.id}`)).data.costing, d = (await admin.get(`/api/invoices/${inv.data.id}`)).data, det = done.data;
  const q = '?from=2000-01-01&to=2100-01-01'; await step(9, async () => { for (const k of ['sales-register', 'gst-summary', 'stock-summary', 'production', 'outstanding']) await admin.get(`/api/reports/${k}${q}`); });
  check('Flour closing balance (kg)', 120, await bal('Flour')); check('Oil closing balance (L)', 19.5, await bal('Cooking oil')); check('Pouches closing balance', 306, await bal('200 g pouch'));
  check('Finished goods after Retailer A dispatch', 88, await bal('Murukku 200 g'));
  check('Yield variance %', '-6 flagged=true', `${Number(det.run.yield_variance_pct)} flagged=${det.run.yield_flag}`);
  const oil = det.lines.find(l => l.name === 'Cooking oil'); check('Oil variance %', '5 flagged=true', `${Number(oil.variance_pct)} flagged=${oil.flagged}`);
  check('Retailer A invoice (taxable + CGST + SGST = total)', '7500.00 + 187.50 + 187.50 = 7875.00', `${d.taxable} + ${d.cgst} + ${d.sgst} = ${d.total}`);
  check('Retailer A outstanding', '3875.00', pay.data.outstanding);
  check('Distributor B shortage (packets)', 32, Number(v2.lines[0].shortage)); check('Distributor B tax if invoiced', 'IGST 300.00, CGST 0.00', `IGST ${v2.taxPreview.igst}, CGST ${v2.taxPreview.cgst}`);
  console.log(`\nCost per packet: Rs ${costing.costPerPacketRounded} (total run cost ${costing.totalCost} / 188 good packets; weighted-average materials + run labour/power; margin Rs ${costing.marginPerPacket} = ${costing.marginPct}%)`);
  console.log('\n' + 'Check'.padEnd(52) + 'Expected'.padEnd(40) + 'Actual'.padEnd(40) + 'Result');
  for (const r of rows) console.log(r.name.padEnd(52) + r.expected.padEnd(40) + r.actual.padEnd(40) + (r.ok ? 'PASS' : 'FAIL'));
  const bad = rows.filter(r => !r.ok).length; console.log(bad ? `\n${bad} check(s) FAILED` : '\nAll benchmark checks PASS'); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e.message); process.exit(2); });
