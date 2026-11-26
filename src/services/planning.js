'use strict';
// "To fulfil today's orders, make N batches" - from pending orders, free stock and the BOM.
const { D } = require('../money');
const stock = require('./stock');
const prod = require('./production');

async function plan(db) {
  const demand = await db.query(`select ol.product_id, i.name, coalesce(sum(case when o.status='SUBMITTED' then ol.qty else ol.qty - coalesce((select sum(dl.qty) from dispatch_lines dl where dl.order_line_id=ol.id),0) end),0) as qty,
      count(distinct o.id)::int as orders from order_lines ol join orders o on o.id=ol.order_id join items i on i.id=ol.product_id
      where o.status in ('SUBMITTED','APPROVED','INVOICED','PARTIALLY_DISPATCHED') group by ol.product_id, i.name order by i.name`);
  const out = [], need = new Map();
  for (const d of demand) {
    const onHand = await stock.balance(db, d.product_id);
    const short = D.max(D(d.qty).minus(onHand), 0);
    const info = await prod.productInfo(db, d.product_id);
    const batches = short.gt(0) ? short.div(info.packets_per_batch).toDecimalPlaces(0, D.ROUND_UP) : D(0);
    let mats = [];
    if (batches.gt(0)) {
      const bom = await prod.effectiveBom(db, d.product_id, batches);
      mats = bom.lines.map(l => ({ itemId: l.itemId, name: l.name, unit: l.stockUnit, required: l.planned }));
      for (const m of mats) need.set(m.itemId, { ...m, required: D(need.get(m.itemId)?.required || 0).plus(m.required).toFixed(4) });
    }
    out.push({ productId: d.product_id, product: d.name, orders: d.orders, demand: D(d.qty).toFixed(0), onHand: onHand.toFixed(0), shortage: short.toFixed(0), packetsPerBatch: info.packets_per_batch.toFixed(0), batchesNeeded: batches.toFixed(0), outputIfMade: batches.times(info.packets_per_batch).toFixed(0) });
  }
  const materials = [];
  for (const m of need.values()) { const have = await stock.balance(db, m.itemId); materials.push({ ...m, available: have.toFixed(4), toPurchase: D.max(D(m.required).minus(have), 0).toFixed(4) }); }
  return { products: out, materials };
}
module.exports = { plan };
