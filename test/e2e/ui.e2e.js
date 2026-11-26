'use strict';
// Drives the REAL screens through the benchmark: production supervisor on a tablet, then admin on desktop.
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { boot, as } = require('../helpers');
const fs = require('fs'), path = require('path');
const SHOTS = path.join(__dirname, '..', '..', 'docs', 'screens'); fs.mkdirSync(SHOTS, { recursive: true });

async function login(page, base, user) {
  await page.goto(base); await page.fill('input[name=username]', user); await page.fill('input[name=password]', 'demo1234'); await page.click('button[type=submit]'); await page.waitForSelector('.app');
}
const go = async (page, id) => { await page.evaluate(h => { document.querySelectorAll('.overlay').forEach(o => o.remove()); if (location.hash === h) SL.route(); else location.hash = h; }, '#/' + id); await page.waitForTimeout(600); };

test('benchmark through the UI: production floor then admin desk', async t => {
  const env = await boot(); t.after(env.close);
  const browser = await chromium.launch(); t.after(() => browser.close());
  const admin = await as(env.base, 'admin');
  const ids = Object.fromEntries((await admin.get('/api/items')).data.map(i => [i.code, i.id]));
  const bal = async code => Number((await admin.get('/api/stock/balances')).data.find(i => i.code === code).balance);
  const errors = [];

  // ---------- production supervisor on a tablet ----------
  const ptx = await browser.newContext({ viewport: { width: 1024, height: 768 } }); const pp = await ptx.newPage();
  pp.on('pageerror', e => errors.push(e.stack)); await login(pp, env.base, 'production');
  await go(pp, 'purchases');
  await pp.locator('[data-testid=p-supplier]').selectOption({ label: 'Demo Flour Mills' });
  await pp.locator('[data-testid=p-item]').first().selectOption({ label: 'Flour (kg)' }).catch(async () => pp.locator('[data-testid=p-item]').first().selectOption(String(ids.FLOUR)));
  await pp.fill('[data-testid=p-qty]', '60'); await pp.fill('[data-testid=p-rate]', '45'); await pp.click('[data-testid=p-save]');
  await pp.waitForTimeout(800); assert.equal(await bal('FLOUR'), 160);

  await go(pp, 'production'); await pp.click('[data-testid=new-run]'); await pp.waitForSelector(`[data-testid=issue-${ids.OIL}]`);
  await pp.fill(`[data-testid=issue-${ids.OIL}]`, '10.5');
  const oilVar = pp.locator(`[data-testid=var-${ids.OIL}]`); assert.match(await oilVar.textContent(), /5/); assert.ok(await oilVar.locator('.over').count(), 'live +5% flag while typing');
  assert.equal(await pp.locator(`[data-testid=var-${ids.FLOUR}] .over`).count(), 0);
  await pp.fill(`[data-testid=issue-${ids.SPICE}]`, '1.2'); await pp.screenshot({ path: path.join(SHOTS, 'floor-new-run.png') });
  await pp.click('[data-testid=run-start]'); await pp.waitForTimeout(1000);
  assert.equal(await bal('FLOUR'), 120); assert.equal(await bal('OIL'), 19.5);
  await pp.click('[data-testid=wip-complete]'); await pp.waitForSelector('[data-testid=c-good]');
  await pp.fill('[data-testid=c-good]', '188'); await pp.fill('[data-testid=c-damaged]', '6'); await pp.fill('[data-testid=c-cartons]', '9');
  await pp.fill('[data-testid=c-labour]', '1200'); await pp.fill('[data-testid=c-power]', '600');
  assert.match(await pp.textContent('[data-testid=c-live]'), /-6/);
  await pp.click('[data-testid=c-submit]'); await pp.waitForSelector('[data-testid=cost-per-packet]', { timeout: 8000 });
  assert.match(await pp.textContent('[data-testid=cost-per-packet]'), /31\.14/);
  await pp.screenshot({ path: path.join(SHOTS, 'floor-run-detail.png'), fullPage: false });
  assert.equal(await bal('POUCH200'), 306); assert.equal(await bal('MUR200'), 238);
  const run = (await admin.get('/api/production/runs')).data[0]; assert.equal(run.yield_flag, true); assert.equal(Number(run.yield_variance_pct), -6);
  await pp.click('.modal header .btn'); await go(pp, 'inventory'); await pp.waitForSelector('table');
  const text = await pp.textContent('#content'); for (const s of ['Flour', '120', '19.5', '306', '238']) assert.ok(text.includes(s), 'inventory shows ' + s);
  await pp.screenshot({ path: path.join(SHOTS, 'floor-inventory.png') });
  await go(pp, 'reports'); await pp.waitForTimeout(400); await pp.screenshot({ path: path.join(SHOTS, 'floor-reports.png') });
  // Tamil toggle on the production screen
  await go(pp, 'production'); await pp.click('.top .btn:has-text("தமிழ்")'); await pp.waitForTimeout(500);
  assert.ok((await pp.textContent('.nav')).includes('உற்பத்தி')); await pp.screenshot({ path: path.join(SHOTS, 'floor-tamil.png') });

  // ---------- admin desk ----------
  const sa = await as(env.base, 'salesa'), sb = await as(env.base, 'salesb'); const boot_ = (await sa.get('/api/bootstrap')).data;
  const A = boot_.customers.find(c => c.name === 'Retailer A').id, B = boot_.customers.find(c => c.name === 'Distributor B').id;
  await sa.post('/api/orders', { clientId: 'ui-a', customerId: A, lines: [{ productId: ids.MUR200, qty: 150 }] });
  const atx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const ap = await atx.newPage(); ap.on('pageerror', e => errors.push(e.stack)); await login(ap, env.base, 'admin');
  await go(ap, 'orders'); await ap.click('tr:has-text("Retailer A")'); await ap.waitForSelector('.modal');
  await ap.screenshot({ path: path.join(SHOTS, 'desk-order-detail.png') });
  await ap.click('.modal button:has-text("Approve")'); await ap.waitForTimeout(800);
  await ap.click('.modal button:has-text("Create GST invoice"), .modal button:has-text("GST invoice")'); await ap.waitForTimeout(500);
  if (await ap.locator('.modal button:has-text("Create invoice")').count()) await ap.click('.modal button:has-text("Create invoice")'); await ap.waitForTimeout(800);
  let inv = (await admin.get('/api/invoices?all=1')).data; assert.equal(inv.length, 1, 'invoice created via UI'); assert.equal(inv[0].total, '7875.00'); assert.equal(inv[0].cgst, '187.50');
  const oid = inv[0].order_id;
  assert.equal((await admin.post(`/api/orders/${oid}/dispatch`, { vehicleNo: 'TN45AB1234' })).status, 200); assert.equal(await bal('MUR200'), 88);
  // Distributor B: shortage panel
  await sb.post('/api/orders', { clientId: 'ui-b', customerId: B, lines: [{ productId: ids.MUR200, qty: 120 }] });
  await go(ap, 'orders'); await ap.click('tr:has-text("Distributor B")'); await ap.waitForSelector('.modal');
  const modalText = await ap.textContent('.modal'); assert.match(modalText, /32/); assert.match(modalText, /IGST/);
  await ap.screenshot({ path: path.join(SHOTS, 'desk-order-shortage.png') });
  await ap.click('.modal button:has-text("Approve")'); await ap.waitForTimeout(800);
  const shortText = await ap.textContent('.modal'); assert.match(shortText, /short by 32|Shortage/i); await ap.screenshot({ path: path.join(SHOTS, 'desk-shortage-panel.png') });
  assert.equal(await bal('MUR200'), 88);
  assert.deepEqual(errors, []);
});
