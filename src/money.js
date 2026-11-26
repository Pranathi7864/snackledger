'use strict';
// All money / quantity arithmetic uses decimal.js and NUMERIC strings. No floating point.
const Decimal = require('decimal.js');
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
const D = v => (v instanceof Decimal ? v : new Decimal(v === null || v === undefined || v === '' ? 0 : v));
D.max = (...a) => Decimal.max(...a.map(D)); D.min = (...a) => Decimal.min(...a.map(D)); D.ROUND_UP = Decimal.ROUND_UP;
const round = (v, dp = 2) => D(v).toDecimalPlaces(dp, Decimal.ROUND_HALF_UP);
const str = (v, dp = 2) => round(v, dp).toFixed(dp);
const sum = arr => arr.reduce((a, b) => a.plus(D(b)), D(0));
function pct(actual, planned, dp = 3) {          // (actual - planned) / planned * 100
  const p = D(planned);
  if (p.isZero()) return null;
  return round(D(actual).minus(p).div(p).times(100), dp);
}
module.exports = { Decimal, D, round, str, sum, pct };
