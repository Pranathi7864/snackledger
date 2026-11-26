'use strict';
const V = require('../validate');
const { D, round } = require('../money');
const { nowTs, today } = require('../clock');
const { bad, notFound } = require('../errors');
const { audit } = require('../audit');
const units = require('../units');
const stock = require('./stock');

async function createPurchase(tx, user, b) {
  if (!b.lines || !b.lines.length) throw bad('Add at least one line');
  const sup = await tx.one('select id from suppliers where id=$1 and active', [b.supplierId]);
  if (!sup) throw bad('Choose a valid supplier');
  const date = V.date(b.billDate, 'Bill date') || today();
  const items = new Map();
  for (const l of b.lines) {
    const it = await tx.one("select * from items where id=$1 and type in ('RAW','PACKAGING')", [l.itemId]);
    if (!it) throw bad('Purchases are for raw/packaging items only');
    items.set(l.itemId, it);
  }
  await stock.lockItems(tx, b.lines.map(l => l.itemId));
  const pur = await tx.one('insert into purchases(supplier_id,bill_no,bill_date,notes,created_by,created_at) values($1,$2,$3,$4,$5,$6) returning id', [b.supplierId, b.billNo || null, date, b.notes || null, user.username, nowTs()]);
  const ref = 'PUR-' + String(pur.id).padStart(5, '0');
  if (!String(b.billNo || '').trim()) await tx.query('update purchases set bill_no=$2 where id=$1', [pur.id, ref]);   // no supplier bill number given: use our own purchase number
  let taxable = D(0), tax = D(0);
  for (const l of b.lines) {
    const it = items.get(l.itemId);
    const eq = D(l.qty), er = D(l.rate);
    if (!eq.gt(0)) throw bad('Quantity must be positive');
    if (!er.gt(0)) throw bad('Rate must be more than 0');
    V.date(l.expiryDate, 'Expiry date', { allowFuture: true });
    const unit = l.unit || it.unit;
    const qty = units.convert(eq, unit, it.unit);                       // stock-unit quantity
    const rate = er.times(eq).div(qty);                                  // rate per stock unit (so value is preserved)
    const lt = round(eq.times(er), 2), gr = D(l.gstRate || 0), lx = round(lt.times(gr).div(100), 2);
    taxable = taxable.plus(lt); tax = tax.plus(lx);
    const batchNo = l.batchNo || `${ref}-${l.itemId}`;
    const rcv = await stock.receive(tx, { itemId: l.itemId, qty, rate, batchNo, mfg: date, expiry: l.expiryDate || null, type: 'PURCHASE', sourceType: 'PURCHASE', sourceId: pur.id, sourceRef: ref, user: user.username, note: b.billNo ? 'Bill ' + b.billNo : null });
    await tx.query('insert into purchase_lines(purchase_id,item_id,qty,rate,entered_qty,entered_unit,taxable,gst_rate,tax,batch_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [pur.id, l.itemId, qty.toFixed(4), round(rate, 4).toFixed(4), eq.toFixed(4), unit, lt.toFixed(2), gr.toFixed(2), lx.toFixed(2), rcv.batchId]);
  }
  await tx.query('update purchases set taxable=$1,tax=$2,total=$3 where id=$4', [taxable.toFixed(2), tax.toFixed(2), taxable.plus(tax).toFixed(2), pur.id]);
  await audit(tx, user.username, 'CREATE', 'PURCHASE', pur.id, `${ref} ₹${taxable.plus(tax).toFixed(2)}`);
  return pur.id;
}
async function listPurchases(db, from, to) {
  return db.query(`select p.*, s.name as supplier, 'PUR-' || lpad(p.id::text,5,'0') as purchase_no from purchases p join suppliers s on s.id=p.supplier_id
     where p.bill_date between $1 and $2 order by p.bill_date desc, p.id desc`, [from, to]);
}
async function purchaseDetail(db, id) {
  const p = await db.one("select p.*, s.name as supplier, 'PUR-' || lpad(p.id::text,5,'0') as purchase_no from purchases p join suppliers s on s.id=p.supplier_id where p.id=$1", [id]);
  if (!p) throw notFound('Purchase not found');
  p.lines = await db.query('select l.*, i.name, i.unit, b.batch_no, b.expiry_date from purchase_lines l join items i on i.id=l.item_id left join batches b on b.id=l.batch_id where l.purchase_id=$1 order by l.id', [id]);
  return p;
}
module.exports = { createPurchase, listPurchases, purchaseDetail };
