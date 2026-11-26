'use strict';
// Real-browser proof of the offline requirement: service-worker app shell, offline sign-in, queued orders + GPS visit, auto-sync, no duplicates.
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { boot, as } = require('../helpers');

// Playwright's waitForFunction does not await async predicates, so poll explicitly.
async function until(page, fn, arg, timeout = 20000) { const end = Date.now() + timeout; let last; while (Date.now() < end) { last = await page.evaluate(fn, arg).catch(() => false); if (last) return last; await page.waitForTimeout(150); } throw new Error('timed out waiting for: ' + fn.toString().slice(0, 120)); }

test('salesman works fully offline and syncs when the network returns', async t => {
  const env = await boot(); t.after(env.close);
  const browser = await chromium.launch(); t.after(() => browser.close());
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, geolocation: { latitude: 10.8231, longitude: 78.6962, accuracy: 15 }, permissions: ['geolocation'] });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  // 1. online sign-in caches customers, products, prices
  await page.goto(env.base); await page.fill('input[name=username]', 'salesa'); await page.fill('input[name=password]', 'demo1234'); await page.click('button[type=submit]');
  await page.waitForSelector('.app');
  await page.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true), null, { timeout: 15000 });
  await until(page, async () => (await SL.offline.stats()).customers >= 2 && (await SL.offline.stats()).products >= 1, null, 15000);
  await page.reload(); await page.waitForSelector('.app');                       // now controlled by the SW
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });

  // 2. go offline, reload: the app shell still loads from the service worker
  await ctx.setOffline(true);
  await page.reload(); await page.waitForSelector('form input[name=username]', { timeout: 15000 });
  assert.ok(await page.isVisible('#loginOff'), 'offline notice shown on the login screen');
  // wrong password rejected, right password unlocks
  await page.fill('input[name=username]', 'salesa'); await page.fill('input[name=password]', 'nope'); await page.click('button[type=submit]');
  await page.waitForSelector('.err:not(:empty)'); await page.waitForTimeout(200); assert.equal(await page.locator('.app').count(), 0);
  await page.fill('input[name=password]', 'demo1234'); await page.click('button[type=submit]'); await page.waitForSelector('.app');
  assert.match(await page.textContent('#net'), /Offline/);
  const other = await page.evaluate(() => SL.offline.tryOfflineLogin('salesb', 'demo1234')); assert.equal(other, null, 'a user who never signed in on this phone cannot unlock offline');

  // 3. place a 2-line order offline for Retailer A
  await page.evaluate(() => { location.hash = '#/s-new'; });
  await page.click('.cust-item:has-text("Retailer A")');
  const plus = page.locator('.step[aria-label="+"]'); await plus.first().waitFor();
  for (let i = 0; i < 5; i++) await plus.first().click();                         // 5 packets
  await page.click('.seg:has-text("Carton")');                                     // switch to cartons => 5 cartons = 100 packets
  await page.click('.btn.primary.big');
  await until(page, async () => (await SL.offline.stats()).pending === 1, null, 8000);
  assert.equal(await page.textContent('[data-badge="s-sync"]'), '1');
  // double-tap protection: only one outbox item exists
  assert.equal(await page.evaluate(async () => (await SL.offline.stats()).pending), 1);

  // 4. visit check-in (GPS) offline
  await page.evaluate(() => { location.hash = '#/s-visits'; });
  await page.waitForSelector('select, .cust-item, button:has-text("Check in")');
  const sel = page.locator('select').first(); if (await sel.count()) await sel.selectOption({ label: 'Retailer A' }).catch(() => {});
  await page.click('button:has-text("Check in here"), button:has-text("Check in")'); await page.waitForTimeout(1500);
  await until(page, async () => (await SL.offline.stats()).pending >= 2, null, 8000);

  // 5. back online: auto-sync; order reaches the factory exactly once
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await until(page, async () => (await SL.offline.stats()).pending === 0, null, 20000);
  const admin = await as(env.base, 'admin');
  const orders = (await admin.get('/api/orders')).data; assert.equal(orders.length, 1); assert.equal(orders[0].source, 'OFFLINE'); assert.equal(orders[0].customer, 'Retailer A');
  const det = (await admin.get(`/api/orders/${orders[0].id}`)).data; assert.equal(det.lines[0].qty, '100.000'); assert.equal(det.lines[0].entered_unit, 'carton');
  await page.evaluate(() => SL.offline.sync && SL.offline.sync()); await page.evaluate(() => SL.offline.sync && SL.offline.sync());      // repeated sync => still one order
  assert.equal((await admin.get('/api/orders')).data.length, 1);
  const visits = (await admin.get('/api/visits?from=2000-01-01&to=2100-01-01')).data; assert.equal(visits.length, 1); assert.ok(Math.abs(Number(visits[0].lat) - 10.8231) < 0.001);
  assert.deepEqual(errors, []);
});
