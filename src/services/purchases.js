const { D, r2, r4, s2, s4, positive, nonNegative } = require('../lib/dec');
const { convert, compatible } = require('../lib/units');
const { financialYear } = require('../lib/gst');
const { todayIST, isDate } = require('../lib/dates');
const { bad, notFound } = require('../lib/errors');
const stock = require('./stock');
const { nextSeq, audit } = require('./common');

/** Record a purchase: one document, N lines, each line creates a lot and a PURCHASE ledger movement. */
async function createPurchase(c, user, b) {
  if (b.client_id) {                                          // idempotent replay (offline queue retries)
    const { rows } = await c.query('SELECT id FROM purchases WHERE client_id=$1', [b.client_id]);
    if (rows[0]) return { id: rows[0].id, duplicate: true };
  }
  const date = isDate(b.purchase_date) ? b.purchase_date : todayIST();
  if (!b.supplier_id) throw bad('Choose a supplier');
  const sup = (await c.query('SELECT id FROM suppliers WHERE id=$1', [b.supplier_id])).rows[0];
  if (!sup) throw notFound('Supplier not found');
  if (!Array.isArray(b.lines) || !b.lines.length) throw bad('Add at least one item');

  const items = await stock.lockItems(c, b.lines.map((l) => Number(l.item_id)));
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  const { fy } = financialYear(date);
  const seq = await nextSeq(c, 'PUR', fy);
  const purchaseNo = `PUR/${financialYear(date).short}/${String(seq).padStart(4, '0')}`;

  const calc = b.lines.map((l, idx) => {
    const item = byId[Number(l.item_id)];
    if (item.category === 'FINISHED') throw bad(`${item.name} is a finished good; purchases are for raw and packaging materials`);
    const unit = l.unit || item.unit;
    if (!compatible(unit, item.unit)) throw bad(`${item.name} is stocked in ${item.unit}; ${unit} is not compatible`);
    const qty = positive(l.qty, `Quantity for ${item.name}`);
    const rate = positive(l.rate, `Rate for ${item.name}`);
    const qtyBase = convert(qty, unit, item.unit, item);
    const taxable = r2(qty.times(rate));
    const rateBase = r4(taxable.div(qtyBase));                // cost per STOCK unit, excl. GST (input tax is claimed, not costed)
    const gstRate = nonNegative(l.gst_rate ?? 0, 'GST rate');
    return { item, unit, qty, rate, qtyBase, rateBase, taxable, gstRate, gst: r2(taxable.times(gstRate).div(100)), l, idx };
  });
  const taxable = calc.reduce((a, x) => a.plus(x.taxable), D(0));
  const gst = calc.reduce((a, x) => a.plus(x.gst), D(0));
  const { rows: [p] } = await c.query(
    `INSERT INTO purchases(purchase_no, supplier_id, supplier_invoice, purchase_date, taxable, gst_amount, total, notes, client_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [purchaseNo, b.supplier_id, b.supplier_invoice || null, date, s2(taxable), s2(gst), s2(taxable.plus(gst)), b.notes || null, b.client_id || null, user.username]);

  for (const x of calc) {
    const lotNo = x.l.lot_no || `${purchaseNo}-${x.idx + 1}`;
    const { lotId } = await stock.receive(c, {
      item: x.item, qty: x.qtyBase, rate: x.rateBase, lotNo, mfg: null, expiry: isDate(x.l.expiry_date) ? x.l.expiry_date : null,
      sourceType: 'PURCHASE', sourceId: p.id, docNo: purchaseNo, user: user.username });
    await c.query(
      `INSERT INTO purchase_lines(purchase_id,item_id,qty,unit,qty_base,rate,rate_base,gst_rate,taxable,gst_amount,lot_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [p.id, x.item.id, x.qty.toFixed(4), x.unit, s4(x.qtyBase), s4(x.rate), s4(x.rateBase), x.gstRate.toFixed(2), s2(x.taxable), s2(x.gst), lotId]);
  }
  await audit(c, user, { action: 'POST', entity: 'purchase', entityId: p.id, summary: `${purchaseNo}: ${calc.map((x) => `${x.qty} ${x.unit} ${x.item.name}`).join(', ')} = ₹${s2(taxable.plus(gst))}` });
  return { id: p.id, purchase_no: purchaseNo };
}

async function listPurchases(c, { from, to }) {
  const { rows } = await c.query(
    `SELECT p.id, p.purchase_no, p.purchase_date, s.name AS supplier, s.gstin AS supplier_gstin, p.supplier_invoice,
            p.taxable, p.gst_amount, p.total, p.created_by,
            (SELECT string_agg(i.name || ' ' || trim(trailing '.' from trim(trailing '0' from pl.qty::text)) || ' ' || pl.unit, ', ' ORDER BY pl.id)
               FROM purchase_lines pl JOIN items i ON i.id=pl.item_id WHERE pl.purchase_id=p.id) AS items
       FROM purchases p JOIN suppliers s ON s.id=p.supplier_id
      WHERE p.purchase_date BETWEEN $1 AND $2 ORDER BY p.purchase_date DESC, p.id DESC`, [from, to]);
  return rows;
}
async function getPurchase(c, id) {
  const { rows: [p] } = await c.query(
    `SELECT p.*, s.name AS supplier FROM purchases p JOIN suppliers s ON s.id=p.supplier_id WHERE p.id=$1`, [id]);
  if (!p) throw notFound('Purchase not found');
  const { rows: lines } = await c.query(
    `SELECT pl.*, i.name AS item, i.unit AS stock_unit, l.lot_no, l.expiry_date FROM purchase_lines pl JOIN items i ON i.id=pl.item_id
       LEFT JOIN lots l ON l.id=pl.lot_id WHERE pl.purchase_id=$1 ORDER BY pl.id`, [id]);
  return { ...p, lines };
}
module.exports = { createPurchase, listPurchases, getPurchase };
