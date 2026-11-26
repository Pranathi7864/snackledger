'use strict';
const { D, round } = require('./money');
const CH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
function checkChar(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i++) { let v = CH.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2); v = Math.floor(v / 36) + (v % 36); sum += v; }
  return CH[(36 - (sum % 36)) % 36];
}
const makeGstin = first14 => first14 + checkChar(first14);
function validateGstin(g) {
  if (!g) return true;                       // GSTIN optional for unregistered buyers
  g = g.toUpperCase();
  return GSTIN_RE.test(g) && checkChar(g.slice(0, 14)) === g[14];
}
const stateOfGstin = g => (g ? g.slice(0, 2) : null);
// Tax for one invoice line. Intra-state: CGST+SGST (half each; SGST = remainder so halves always sum to the tax). Inter-state: IGST.
function taxLine(qty, rate, gstRate, intra) {
  const taxable = round(D(qty).times(rate), 2);
  const tax = round(taxable.times(gstRate).div(100), 2);
  let cgst = D(0), sgst = D(0), igst = D(0);
  if (intra) { cgst = round(tax.div(2), 2); sgst = tax.minus(cgst); } else igst = tax;
  return { taxable, cgst, sgst, igst, tax, total: taxable.plus(tax) };
}
module.exports = { validateGstin, makeGstin, stateOfGstin, taxLine };
