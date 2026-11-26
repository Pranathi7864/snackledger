#!/usr/bin/env node
'use strict';
// Extra benchmarks (beyond Section 5) against a RUNNING server: correctness under stress + speed.
//   npm run seed && npm start      then      npm run benchmark:extra
// Safe to run after `npm run benchmark` too (it works from current balances).
const { Client } = require('../test/helpers');
const BASE = process.env.BASE_URL || 'http://localhost:8080';
const rows = [];
const check = (name, expected, actual) => rows.push({ name, expected: String(expected), actual: String(actual), ok: String(expected) === String(actual) });
const timed = async (fn) => { const t = Date.now(); const r = await fn(); return [r, Date.now() - t]; };
(async () => {
  const login = async u => { const c = new Client(BASE); const r = await c.login(u); if (r.status !== 200) throw new Error('login failed ' + u); return c; };
  const [prod, admin, sa, sb, auditor] = await Promise.all(['production', 'admin', 'salesa', 'salesb', 'auditor'].map(login));
  const items = (await admin.get('/api/items')).data, id = c => items.find(i => i.code === c).id;
  const bal = async n => Number((await admin.get('/api/stock/balances')).data.find(i => i.name === n).balance);
  const cust = (await sa.get('/api/bootstrap')).data.customers, A = cust.find(c => c.name === 'Retailer A').id;
  const tag = Date.now();

  // X1 stock for the stress tests: produce 1 batch (200 packets)
  const run = await prod.post('/api/production/runs', { productId: id('MUR200'), batches: 1, issues: [{ itemId: id('FLOUR'), qty: 40 }, { itemId: id('OIL'), qty: 10 }, { itemId: id('SPICE'), qty: 1.2 }] });
  if (run.status >= 300) throw new Error('Need at least 40 kg flour / 10 L oil in stock; run `npm run seed` first. ' + JSON.stringify(run.data));
  await prod.post(`/api/production/runs/${run.data.id}/complete`, { goodOutput: 200, damagedPackaging: 0, cartonsUsed: 10 });
  const fg0 = await bal('Murukku 200 g');

  // X2 idempotent offline sync: same batch sent 3 times -> exactly 1 order
  const batch = { orders: [{ clientId: 'x2-' + tag, customerId: A, lines: [{ productId: id('MUR200'), qty: 1, clientPrice: 1 }] }] };
  const before = (await sa.get('/api/orders')).data.length;
  for (let i = 0; i < 3; i++) await sa.post('/api/orders/sync', batch);
  check('X2 offline sync retried 3x creates N orders', 1, (await sa.get('/api/orders')).data.length - before);
  const o = (await sa.get('/api/orders')).data.find(x => x.id);
  check('X2 server re-prices a tampered client price (stored price)', '50.00', (await admin.get(`/api/orders/${(await sa.post('/api/orders/sync', batch)).data.results[0].orderId}`)).data.lines[0].price);

  // X3 overselling race: 30 orders x 10 packets compete for (fg0 - committed) free stock; approvals fired at once
  const mk = await Promise.all(Array.from({ length: 30 }, (_, i) => sa.post('/api/orders', { clientId: `x3-${tag}-${i}`, customerId: A, lines: [{ productId: id('MUR200'), qty: 10 }] })));
  const ids = mk.map(r => r.data.id);
  const [ap, ms] = await timed(() => Promise.all(ids.map(i => admin.post(`/api/orders/${i}/approve`))));
  const approved = ap.filter(r => r.status < 300).length;
  const free = fg0 - 1; // minus the 1-packet order from X2 that is not yet approved -> upper bound check below
  check('X3 approved qty never exceeds stock (no overselling)', true, approved * 10 <= fg0);
  check('X3 rejected approvals report a shortage (409/422), none crash (5xx)', 0, ap.filter(r => r.status >= 500).length);
  console.log(`   (X3: ${approved} of 30 approved concurrently in ${ms} ms; free stock was ${fg0})`);

  // X4 concurrent dispatch of approved orders: ledger must equal exact sum
  const okIds = ids.filter((_, i) => ap[i].status < 300);
  for (const i of okIds) await admin.post(`/api/orders/${i}/invoice`, {});
  await Promise.all(okIds.map(i => admin.post(`/api/orders/${i}/dispatch`, { vehicleNo: 'TN45AB1234' })));
  check('X4 stock after concurrent dispatch = start - dispatched', fg0 - okIds.length * 10, await bal('Murukku 200 g'));

  // X5 permissions
  check('X5 auditor cannot create an order (read-only)', 403, (await auditor.post('/api/orders', { clientId: 'x5' + tag, customerId: A, lines: [{ productId: id('MUR200'), qty: 1 }] })).status);
  check('X5 salesman cannot read stock balances', 403, (await sa.get('/api/stock/balances')).status);
  check('X5 unauthenticated request rejected', 401, (await new Client(BASE).get('/api/orders')).status);

  // X6 speed
  const [, tList] = await timed(() => sa.get('/api/bootstrap'));
  const [, tRep] = await timed(() => admin.get('/api/reports/sales-register?from=2000-01-01&to=2100-01-01'));
  const [bulk, tBulk] = await timed(() => sa.post('/api/orders/sync', { orders: Array.from({ length: 100 }, (_, i) => ({ clientId: `x6-${tag}-${i}`, customerId: A, lines: [{ productId: id('MUR200'), qty: 1 }] })) }));
  check('X6 sync of 100 offline orders all accepted', 100, bulk.data.results.filter(r => r.ok).length);
  console.log(`   (X6 timings: bootstrap ${tList} ms, sales-register ${tRep} ms, 100-order sync ${tBulk} ms)`);
  check('X6 100-order sync under 10 s', true, tBulk < 10000);

  console.log('\n' + 'Check'.padEnd(66) + 'Expected'.padEnd(12) + 'Actual'.padEnd(12) + 'Result');
  for (const r of rows) console.log(r.name.padEnd(66) + r.expected.padEnd(12) + r.actual.padEnd(12) + (r.ok ? 'PASS' : 'FAIL'));
  const bad = rows.filter(r => !r.ok).length; console.log(bad ? `\n${bad} FAILED` : '\nAll extra benchmarks PASS'); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e.message); process.exit(2); });
