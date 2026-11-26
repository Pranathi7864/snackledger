'use strict';
// The stock ledger. Balances are always SUM(stock_moves.qty); nothing is ever overwritten.
const { D, round, str } = require('../money');
const { nowTs } = require('../clock');
const { bad, conflict } = require('../errors');

async function lockItems(tx, ids) {
  const u = [...new Set(ids)].sort((a, b) => a - b);          // fixed order => no deadlocks
  for (const id of u) if (!(await tx.one('select id from items where id=$1 for update', [id]))) throw bad(`Item ${id} not found`);
}
async function balance(tx, itemId) {
  const r = await tx.one('select coalesce(sum(qty),0) as b from stock_moves where item_id=$1', [itemId]);
  return D(r.b);
}
async function getBatch(tx, itemId, batchNo, mfg, expiry) {
  const ex = await tx.one('select id from batches where item_id=$1 and batch_no=$2', [itemId, batchNo]);
  if (ex) return ex.id;
  const r = await tx.one('insert into batches(item_id,batch_no,mfg_date,expiry_date,created_at) values($1,$2,$3,$4,$5) returning id', [itemId, batchNo, mfg || null, expiry || null, nowTs()]);
  return r.id;
}
// Append one ledger row.
async function post(tx, m) {
  const qty = D(m.qty), cost = D(m.unitCost || 0);
  await tx.query(`insert into stock_moves(item_id,batch_id,moved_at,move_type,qty,unit_cost,value,source_type,source_id,source_ref,note,created_by)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [m.itemId, m.batchId, m.movedAt || nowTs(), m.type, qty.toFixed(4), cost.toFixed(6), round(qty.times(cost), 4).toFixed(4), m.sourceType, m.sourceId ?? null, m.sourceRef, m.note || null, m.user]);
}
// FEFO allocation: earliest expiry first (no-expiry stock last), then oldest batch.
async function allocate(tx, itemId, qty) {
  const rows = await tx.query(`select b.id, b.batch_no, b.expiry_date, sum(m.qty) as bal from batches b join stock_moves m on m.batch_id=b.id
     where b.item_id=$1 group by b.id, b.batch_no, b.expiry_date having sum(m.qty) > 0 order by b.expiry_date asc nulls last, b.id asc`, [itemId]);
  let need = D(qty); const out = [];
  for (const r of rows) {
    if (need.lte(0)) break;
    const take = D.min(need, D(r.bal));
    out.push({ batchId: r.id, batchNo: r.batch_no, qty: take }); need = need.minus(take);
  }
  if (need.gt(0)) {
    const it = await tx.one('select name,unit from items where id=$1', [itemId]);
    const have = D(qty).minus(need);
    throw conflict(`Insufficient stock of ${it.name}: need ${D(qty).toFixed(3)} ${it.unit}, available ${have.toFixed(3)} ${it.unit}`, { itemId, short: need.toFixed(3) });
  }
  return out;
}
// Issue (reduce) stock FEFO at the item's current average cost. Returns total value issued.
async function issue(tx, { itemId, qty, type, sourceType, sourceId, sourceRef, user, note, cost }) {
  const it = await tx.one('select avg_cost from items where id=$1', [itemId]);
  const unitCost = cost !== undefined ? D(cost) : D(it.avg_cost);
  const alloc = await allocate(tx, itemId, qty);
  let value = D(0);
  for (const a of alloc) {
    await post(tx, { itemId, batchId: a.batchId, type, qty: a.qty.negated(), unitCost, sourceType, sourceId, sourceRef, user, note });
    value = value.plus(round(a.qty.times(unitCost), 4));
  }
  return { value, unitCost, alloc };
}
// Receive stock; keeps moving weighted-average cost: (onhand*avg + qty*rate)/(onhand+qty)
async function receive(tx, { itemId, qty, rate, batchNo, mfg, expiry, type, sourceType, sourceId, sourceRef, user, note }) {
  const it = await tx.one('select avg_cost from items where id=$1', [itemId]);
  const onhand = await balance(tx, itemId);
  const q = D(qty), r = D(rate);
  const base = D.max(onhand, 0);
  const newAvg = base.plus(q).isZero() ? r : round(base.times(it.avg_cost).plus(q.times(r)).div(base.plus(q)), 6);
  const batchId = await getBatch(tx, itemId, batchNo, mfg, expiry);
  await post(tx, { itemId, batchId, type, qty: q, unitCost: r, sourceType, sourceId, sourceRef, user, note });
  await tx.query('update items set avg_cost=$1, last_cost=$2 where id=$3', [newAvg.toFixed(6), r.toFixed(6), itemId]);
  return { batchId, avgCost: newAvg };
}
// Manual adjustment (+/-) with a mandatory reason.
async function adjust(tx, { itemId, qty, reason, user, batchNo }) {
  const q = D(qty);
  if (q.isZero()) throw bad('Adjustment quantity cannot be zero');
  if (!reason || !reason.trim()) throw bad('A reason is required for stock adjustments');
  await lockItems(tx, [itemId]);
  const it = await tx.one('select * from items where id=$1', [itemId]);
  const ref = 'ADJ-' + nowTs().replace(/\D/g, '').slice(0, 14);
  if (q.gt(0)) {
    const bn = batchNo || 'ADJ-' + nowTs().slice(0, 10).replace(/-/g, '');
    const batchId = await getBatch(tx, itemId, bn, null, null);
    await post(tx, { itemId, batchId, type: 'ADJUSTMENT', qty: q, unitCost: it.avg_cost, sourceType: 'ADJUSTMENT', sourceRef: ref, note: reason, user });
  } else await issue(tx, { itemId, qty: q.abs(), type: 'ADJUSTMENT', sourceType: 'ADJUSTMENT', sourceRef: ref, note: reason, user });
  return ref;
}
// Balances (optionally as on a date) for all items, with batch detail on request.
async function balances(db, { asOn, type } = {}) {
  const params = []; let w = '';
  if (asOn) { params.push(asOn + ' 23:59:59'); w = ' and m.moved_at <= $1'; }
  const rows = await db.query(`select i.id, i.code, i.name, i.type, i.unit, i.reorder_level, i.avg_cost, i.last_cost, i.active,
      coalesce(sum(m.qty),0) as balance from items i left join stock_moves m on m.item_id=i.id ${w ? '' : ''}
      ${asOn ? 'and m.moved_at <= $1' : ''} ${type ? 'where i.type=' + (asOn ? '$2' : '$1') : ''} group by i.id order by i.type, i.id`,
    type ? (asOn ? [params[0], type] : [type]) : params);
  return rows.map(r => ({ ...r, balance: D(r.balance).toFixed(4), value: round(D(r.balance).times(r.avg_cost), 2).toFixed(2), low: D(r.balance).lte(r.reorder_level) && D(r.reorder_level).gt(0) }));
}
async function batchBalances(db, itemId) {
  return db.query(`select b.id, b.batch_no, b.mfg_date, b.expiry_date, sum(m.qty) as balance from batches b join stock_moves m on m.batch_id=b.id
    where b.item_id=$1 group by b.id, b.batch_no, b.mfg_date, b.expiry_date having sum(m.qty) <> 0 order by b.expiry_date asc nulls last, b.id`, [itemId]);
}
// Free finished-goods stock = on hand - qty promised to other approved/invoiced orders not yet dispatched.
async function committed(tx, productId, excludeOrderId) {
  const r = await tx.one(`select coalesce(sum(ol.qty - coalesce((select sum(dl.qty) from dispatch_lines dl where dl.order_line_id=ol.id),0)),0) as c
     from order_lines ol join orders o on o.id=ol.order_id
     where ol.product_id=$1 and o.status in ('APPROVED','INVOICED','PARTIALLY_DISPATCHED') and o.id <> $2`, [productId, excludeOrderId || 0]);
  return D(r.c);
}
// Reconciliation: re-derive each batch/item total from raw rows and compare with items' ledger sum.
async function reconcile(db) {
  const rows = await db.query(`select i.id, i.name, coalesce((select sum(qty) from stock_moves where item_id=i.id),0) as item_sum,
     coalesce((select sum(s) from (select sum(qty) s from stock_moves where item_id=i.id group by batch_id) x),0) as batch_sum,
     coalesce((select sum(qty) from stock_moves where item_id=i.id and qty<0),0) as outs from items i order by i.id`);
  const negBatches = await db.query('select batch_id, sum(qty) s from stock_moves group by batch_id having sum(qty) < 0');
  return { ok: negBatches.length === 0 && rows.every(r => D(r.item_sum).eq(r.batch_sum)), negativeBatches: negBatches, items: rows.map(r => ({ id: r.id, name: r.name, ledger: str(r.item_sum, 4), batches: str(r.batch_sum, 4) })) };
}
module.exports = { lockItems, balance, getBatch, post, allocate, issue, receive, adjust, balances, batchBalances, committed, reconcile };
