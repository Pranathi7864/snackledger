// All arithmetic on money and quantities goes through decimal.js: no binary floats anywhere in the business logic.
const Decimal = require('decimal.js');
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
const { bad } = require('./errors');

const D = (x) => {
  if (x === null || x === undefined || x === '') return new Decimal(0);
  try { return new Decimal(x); } catch { throw bad('Not a valid number: ' + x); }
};
const r2 = (x) => D(x).toDecimalPlaces(2);          // money
const r4 = (x) => D(x).toDecimalPlaces(4);          // rates and quantities
const s2 = (x) => r2(x).toFixed(2);
const s4 = (x) => r4(x).toFixed(4);
const pct = (actual, planned) => {                  // variance % = (actual - planned) / planned * 100, 2 dp
  const p = D(planned);
  if (p.isZero()) return null;
  return D(actual).minus(p).div(p).times(100).toDecimalPlaces(2);
};
const positive = (x, label = 'Quantity') => {
  const v = D(x);
  if (!v.isFinite() || v.lte(0)) throw bad(`${label} must be greater than zero`);
  return v;
};
const nonNegative = (x, label = 'Value') => {
  const v = D(x);
  if (!v.isFinite() || v.lt(0)) throw bad(`${label} cannot be negative`);
  return v;
};
module.exports = { Decimal, D, r2, r4, s2, s4, pct, positive, nonNegative };
