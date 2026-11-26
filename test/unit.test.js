'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { D, pct, round } = require('../src/money');
const { taxLine, validateGstin, makeGstin } = require('../src/gst');
const { rupeesInWords } = require('../src/words');
const { fyOf, monthEnd, addDays } = require('../src/clock');
const units = require('../src/units');

test('money uses exact decimals (no float drift)', () => {
  assert.equal(D('0.1').plus('0.2').toString(), '0.3');
  assert.equal(round('187.505', 2).toFixed(2), '187.51');
  assert.equal(D('43.125').times(40).toFixed(2), '1725.00');
});
test('variance percentages', () => {
  assert.equal(pct(188, 200).toFixed(2), '-6.00');
  assert.equal(pct('10.5', 10).toFixed(2), '5.00');
  assert.equal(pct(5, 0), null);
});
test('GST intra-state splits CGST+SGST; halves always add up to the tax', () => {
  const t = taxLine(150, '50.00', '5.00', true);
  assert.equal(t.taxable.toFixed(2), '7500.00'); assert.equal(t.cgst.toFixed(2), '187.50'); assert.equal(t.sgst.toFixed(2), '187.50'); assert.equal(t.total.toFixed(2), '7875.00');
  const odd = taxLine(1, '0.30', '5.00', true);                  // tax 0.015 -> 0.02, halves 0.01 + 0.01
  assert.equal(odd.cgst.plus(odd.sgst).toFixed(2), odd.tax.toFixed(2));
  const odd2 = taxLine(3, '1.00', '5.00', true);                 // tax 0.15 -> CGST 0.08, SGST 0.07
  assert.equal(odd2.cgst.plus(odd2.sgst).toFixed(2), '0.15');
});
test('GST inter-state uses IGST only', () => {
  const t = taxLine(120, '50.00', '5.00', false);
  assert.equal(t.igst.toFixed(2), '300.00'); assert.equal(t.cgst.toFixed(2), '0.00'); assert.equal(t.total.toFixed(2), '6300.00');
});
test('GSTIN validation (format + checksum)', () => {
  const g = makeGstin('33AABCS1429B1Z'); assert.ok(validateGstin(g));
  assert.ok(!validateGstin(g.slice(0, 14) + (g[14] === 'A' ? 'B' : 'A')));
  assert.ok(!validateGstin('NOTAGSTIN')); assert.ok(validateGstin(''));
});
test('amount in words (Indian numbering)', () => {
  assert.equal(rupeesInWords('7875.00'), 'Rupees Seven Thousand Eight Hundred Seventy Five Only');
  assert.equal(rupeesInWords('123456.50'), 'Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Fifty Paise Only');
});
test('financial year and dates', () => {
  assert.equal(fyOf('2026-03-31'), '2025-26'); assert.equal(fyOf('2026-04-01'), '2026-27');
  assert.equal(monthEnd('2026-02-10'), '2026-02-28'); assert.equal(addDays('2026-11-30', 1), '2026-12-01');
});
test('unit conversion', async () => {
  const { createDb } = require('../src/db'); const { seed } = require('../db/seed');
  const db = await createDb({ dataDir: 'memory://', databaseUrl: '' }); await seed(db); await units.load(db);
  assert.equal(units.convert(500, 'g', 'kg').toString(), '0.5'); assert.equal(units.convert(250, 'mL', 'L').toString(), '0.25');
  assert.equal(units.convert(3, 'carton', 'packet', { cartonCapacity: 20 }).toString(), '60'); assert.equal(units.convert(40, 'packet', 'carton', { cartonCapacity: 20 }).toString(), '2');
  assert.throws(() => units.convert(1, 'kg', 'L')); await db.close();
});
