// Units and conversion. Each unit belongs to a dimension and has a factor to that dimension's base unit.
// "carton" is special: it only exists for finished goods and means `carton_size` packets of that product.
const { D } = require('./dec');
const { bad } = require('./errors');

const UNITS = {
  kg:     { name: 'Kilogram',  dimension: 'MASS',   factor: '1' },
  g:      { name: 'Gram',      dimension: 'MASS',   factor: '0.001' },
  quintal:{ name: 'Quintal',   dimension: 'MASS',   factor: '100' },
  L:      { name: 'Litre',     dimension: 'VOLUME', factor: '1' },
  ml:     { name: 'Millilitre',dimension: 'VOLUME', factor: '0.001' },
  piece:  { name: 'Piece',     dimension: 'COUNT',  factor: '1' },
  packet: { name: 'Packet',    dimension: 'COUNT',  factor: '1' },
  dozen:  { name: 'Dozen',     dimension: 'COUNT',  factor: '12' },
  carton: { name: 'Carton (of packets)', dimension: 'COUNT', factor: '1' },
};

function convert(qty, from, to, item = {}) {
  qty = D(qty);
  if (from === to) return qty;
  const f = UNITS[from], t = UNITS[to];
  if (!f) throw bad(`Unknown unit "${from}"`);
  if (!t) throw bad(`Unknown unit "${to}"`);
  if (from === 'carton' || to === 'carton') {
    if (!item.carton_size) throw bad(`"${item.name || 'This item'}" has no carton size, so cartons cannot be converted`);
    const packets = from === 'carton' ? qty.times(item.carton_size) : convert(qty, from, 'packet');
    return to === 'carton' ? packets.div(item.carton_size) : convert(packets, 'packet', to);
  }
  if (f.dimension !== t.dimension) throw bad(`Cannot convert ${from} (${f.dimension.toLowerCase()}) to ${to} (${t.dimension.toLowerCase()})`);
  return qty.times(f.factor).div(t.factor);
}
const compatible = (a, b) => a === b || (UNITS[a] && UNITS[b] && UNITS[a].dimension === UNITS[b].dimension);
module.exports = { UNITS, convert, compatible };
