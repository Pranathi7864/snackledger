'use strict';
const { D } = require('./money');
const { bad } = require('./errors');
let table = new Map();
async function load(db) { table = new Map((await db.query('select * from units')).map(u => [u.code, u])); }
// Convert qty from `from` unit into `to` unit. Carton<->packet uses the product's carton capacity.
function convert(qty, from, to, opts = {}) {
  const q = D(qty);
  if (!from || from === to) return q;
  if (from === 'carton' && (to === 'packet' || to === 'pc')) { if (!opts.cartonCapacity) throw bad('Carton capacity unknown for this item'); return q.times(opts.cartonCapacity); }
  if (to === 'carton' && (from === 'packet' || from === 'pc')) { if (!opts.cartonCapacity) throw bad('Carton capacity unknown for this item'); return q.div(opts.cartonCapacity); }
  const a = table.get(from), b = table.get(to);
  if (!a) throw bad(`Unknown unit '${from}'`);
  if (!b) throw bad(`Unknown unit '${to}'`);
  if (a.dimension !== b.dimension) throw bad(`Cannot convert ${from} to ${to}`);
  return q.times(a.to_base).div(b.to_base);
}
const list = () => [...table.values()];
module.exports = { load, convert, list };
