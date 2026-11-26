'use strict';
const V = require('../validate');
// Orders -> approval -> GST invoice -> dispatch -> payments -> credit notes.
const crypto = require('crypto');
const { D, round, sum } = require('../money');
const { nowTs, today, fyOf, addDays, daysBetween } = require('../clock');
const { bad, notFound, conflict, forbidden } = require('../errors');
const { audit } = require('../audit');
const { taxLine } = require('../gst');
const units = require('../units');
const stock = require('./stock');

const orderNo = id => 'ORD-' + String(id).padStart(5, '0');
const token = () => crypto.randomBytes(18).toString('hex');

async function nextSeq(tx, kind, fy) {
  await tx.query('insert into doc_seq(kind,fy,last_no) values($1,$2,0) on conflict (kind,fy) do nothing', [kind, fy]);
  const r = await tx.one('update doc_seq set last_no=last_no+1 where kind=$1 and fy=$2 returning last_no', [kind, fy]);
  return r.last_no;
}
const docNo = (prefix, fy, seq) => `${prefix}/${fy}/${String(seq).padStart(4, '0')}`;

// Price list: customer-specific price first, otherwise the product list price.
async function priceFor(tx, customerId, productId) {
  const c = await tx.one('select price from customer_prices where customer_id=$1 and product_id=$2', [customerId, productId]);
  if (c) return D(c.price);
  const p = await tx.one('select price from products where item_id=$1', [productId]);
  return D(p.price);
}

// ---------- orders ----------
async function createOrder(tx, user, b) {
  if (!b.clientId || String(b.clientId).length > 100) throw bad('clientId is required');
  const existing = await tx.one('select * from orders where client_id=$1', [b.clientId]);
  if (existing) {                                                   // idempotent retry from the offline outbox
    if (existing.salesman_id !== user.id) throw forbidden('This order id belongs to another user');
    return { id: existing.id, orderNo: orderNo(existing.id), duplicate: true };
  }
  const cust = await tx.one('select * from customers where id=$1', [b.customerId]);
  if (!cust || !cust.active) throw bad('Customer not found or inactive');
  if (!Array.isArray(b.lines) || !b.lines.length) throw bad('Add at least one product');
  const merged = new Map();
  for (const l of b.lines) {
    const prod = await tx.one('select p.*, i.name from products p join items i on i.id=p.item_id where p.item_id=$1 and i.active', [l.productId]);
    if (!prod) throw bad('Unknown or inactive product');
    const entered = D(l.qty), unit = l.unit || 'packet';
    if (!entered.gt(0)) throw bad(`Quantity for ${prod.name} must be positive`);
    const qty = units.convert(entered, unit, 'packet', { cartonCapacity: prod.carton_capacity });
    if (!qty.eq(qty.toDecimalPlaces(0))) throw bad(`${prod.name}: quantity must be a whole number of packets`);
    const m = merged.get(l.productId) || { productId: l.productId, qty: D(0), entered: D(0), unit, clientPrice: l.clientPrice };
    m.qty = m.qty.plus(qty); m.entered = m.entered.plus(entered); merged.set(l.productId, m);
  }
  const placed = b.placedAt && /^\d{4}-\d{2}-\d{2}/.test(b.placedAt) ? b.placedAt.replace('T', ' ').slice(0, 19) : nowTs();
  const o = await tx.one(`insert into orders(client_id,customer_id,salesman_id,status,source,placed_at,received_at,notes) values($1,$2,$3,'SUBMITTED',$4,$5,$6,$7) returning id`,
    [b.clientId, cust.id, user.id, b.source === 'OFFLINE' ? 'OFFLINE' : 'ONLINE', placed, nowTs(), b.notes || null]);
  for (const m of merged.values()) {
    const price = await priceFor(tx, cust.id, m.productId);             // server-authoritative price
    await tx.query('insert into order_lines(order_id,product_id,qty,price,entered_qty,entered_unit,client_price,orig_qty,orig_price) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [o.id, m.productId, m.qty.toFixed(3), price.toFixed(2), m.entered.toFixed(3), m.unit, m.clientPrice === undefined || m.clientPrice === null ? null : D(m.clientPrice).toFixed(2), m.qty.toFixed(3), price.toFixed(2)]);
  }
  await audit(tx, user.username, 'CREATE', 'ORDER', o.id, `${orderNo(o.id)} for ${cust.name} (${b.source === 'OFFLINE' ? 'offline sync' : 'online'})`);
  return { id: o.id, orderNo: orderNo(o.id), duplicate: false };
}

async function orderDetail(db, id, viewer) {
  const o = await db.one(`select o.*, c.name as customer, c.type as customer_type, c.state_code, c.gstin, c.credit_days, u.full_name as salesman, u.username as salesman_username, s.name as state
     from orders o join customers c on c.id=o.customer_id join users u on u.id=o.salesman_id join states s on s.code=c.state_code where o.id=$1`, [id]);
  if (!o) throw notFound('Order not found');
  if (viewer && viewer.role === 'SALES' && o.salesman_id !== viewer.id) throw forbidden();
  const biz = await db.one('select state_code from business where id=1');
  const intra = biz.state_code === o.state_code;
  const lines = await db.query(`select ol.*, i.name, p.gst_rate, p.hsn, p.carton_capacity,
      coalesce((select sum(dl.qty) from dispatch_lines dl where dl.order_line_id=ol.id),0) as dispatched from order_lines ol
      join products p on p.item_id=ol.product_id join items i on i.id=ol.product_id where ol.order_id=$1 order by ol.id`, [id]);
  let taxable = D(0), cgst = D(0), sgst = D(0), igst = D(0);
  let anyShort = false;
  for (const l of lines) {
    const onHand = await stock.balance(db, l.product_id);
    const committed = await stock.committed(db, l.product_id, o.id);
    const free = D.max(onHand.minus(committed), 0);
    const open = o.status === 'SUBMITTED' ? D(l.qty) : D(l.qty).minus(l.dispatched);
    const short = D.max(open.minus(free), 0);
    l.on_hand = onHand.toFixed(3); l.committed = committed.toFixed(3); l.free_stock = free.toFixed(3); l.shortage = short.toFixed(3);
    if (short.gt(0) && !['DISPATCHED', 'REJECTED', 'CANCELLED'].includes(o.status)) anyShort = true; else if (['DISPATCHED', 'REJECTED', 'CANCELLED'].includes(o.status)) l.shortage = '0.000';
    const t = taxLine(l.qty, l.price, l.gst_rate, intra);
    l.taxable = t.taxable.toFixed(2); l.cgst = t.cgst.toFixed(2); l.sgst = t.sgst.toFixed(2); l.igst = t.igst.toFixed(2); l.line_total = t.total.toFixed(2);
    l.remaining = D(l.qty).minus(l.dispatched).toFixed(3);
    taxable = taxable.plus(t.taxable); cgst = cgst.plus(t.cgst); sgst = sgst.plus(t.sgst); igst = igst.plus(t.igst);
  }
  const invoice = await db.one('select id, invoice_no, total, status from invoices where order_id=$1', [id]);
  // Profit/loss estimate (staff only): selling value minus cost of the packets, using each product's latest completed batch cost.
  let profit = null;
  if (!viewer || viewer.role !== 'SALES') {
    const prod = require('./production');
    let cost = D(0), known = true;
    for (const l of lines) {
      const r = await db.one("select id from production_runs where product_id=$1 and status='COMPLETED' order by id desc limit 1", [l.product_id]);
      if (!r) { known = false; continue; }
      const c = await prod.runCosting(db, r.id);
      if (!c.costPerPacket) { known = false; continue; }
      cost = cost.plus(D(c.costPerPacket).times(l.qty));
    }
    if (known && taxable.gt(0)) { const p = taxable.minus(cost); profit = { revenue: taxable.toFixed(2), cost: round(cost, 2).toFixed(2), profit: round(p, 2).toFixed(2), pct: round(p.div(taxable).times(100), 1).toFixed(1) }; }
  }
  return { ...o, profit, orderNo: orderNo(o.id), supplyType: intra ? 'INTRA' : 'INTER', lines, anyShortage: anyShort,
    taxPreview: { taxable: taxable.toFixed(2), cgst: cgst.toFixed(2), sgst: sgst.toFixed(2), igst: igst.toFixed(2), total: taxable.plus(cgst).plus(sgst).plus(igst).toFixed(2) }, invoice };
}

async function listOrders(db, viewer, { status, salesmanId } = {}) {
  const w = [], p = [];
  if (viewer.role === 'SALES') { p.push(viewer.id); w.push(`o.salesman_id=$${p.length}`); } else if (salesmanId) { p.push(salesmanId); w.push(`o.salesman_id=$${p.length}`); }
  if (status) { p.push(status); w.push(`o.status=$${p.length}`); }
  const rows = await db.query(`select o.id, o.client_id, o.status, o.source, o.placed_at, o.received_at, c.name as customer, u.full_name as salesman,
      (select coalesce(sum(ol.qty*ol.price),0) from order_lines ol where ol.order_id=o.id) as taxable,
      (select coalesce(sum(ol.qty),0) from order_lines ol where ol.order_id=o.id) as packets,
      (select invoice_no from invoices i where i.order_id=o.id) as invoice_no, (select id from invoices i where i.order_id=o.id) as invoice_id
      from orders o join customers c on c.id=o.customer_id join users u on u.id=o.salesman_id ${w.length ? 'where ' + w.join(' and ') : ''} order by o.id desc limit 500`, p);
  return rows.map(r => ({ ...r, orderNo: orderNo(r.id), taxable: round(r.taxable, 2).toFixed(2) }));
}

// Admin edits + approval. Shortage must be acknowledged explicitly (policy: approval reserves stock; shortage becomes a back-order).
async function approveOrder(tx, user, id, b = {}) {
  const o = await tx.one('select * from orders where id=$1 for update', [id]);
  if (!o) throw notFound('Order not found');
  if (o.status !== 'SUBMITTED') throw conflict(`Order is ${o.status}, not awaiting approval`);
  for (const e of b.edits || []) {
    const l = await tx.one('select ol.*, p.carton_capacity from order_lines ol join products p on p.item_id=ol.product_id where ol.id=$1 and ol.order_id=$2', [e.lineId, id]);
    if (!l) throw bad('Line not in this order');
    const qty = e.qty !== undefined ? D(e.qty) : D(l.qty), price = e.price !== undefined ? D(e.price) : D(l.price);
    if (!qty.gte(0) || !qty.eq(qty.toDecimalPlaces(0))) throw bad('Quantity must be a whole number of packets');
    if (price.lt(0)) throw bad('Price cannot be negative');
    if (qty.eq(0)) { await tx.query('delete from order_lines where id=$1', [l.id]); await audit(tx, user.username, 'EDIT', 'ORDER', id, `Line ${l.id} removed`, { before: { qty: l.qty, price: l.price } }); continue; }
    if (!qty.eq(l.qty) || !price.eq(l.price)) {
      await tx.query('update order_lines set qty=$1, price=$2, entered_qty=$1, entered_unit=$3 where id=$4', [qty.toFixed(3), price.toFixed(2), 'packet', l.id]);
      await audit(tx, user.username, 'EDIT', 'ORDER', id, `${orderNo(id)} line ${l.id} edited`, { before: { qty: l.qty, price: l.price }, after: { qty: qty.toFixed(3), price: price.toFixed(2) } });
    }
  }
  const lines = await tx.query('select * from order_lines where order_id=$1', [id]);
  if (!lines.length) throw bad('Order has no lines left; reject it instead');
  await stock.lockItems(tx, lines.map(l => l.product_id));
  const shortages = [];
  for (const l of lines) {
    const free = D.max((await stock.balance(tx, l.product_id)).minus(await stock.committed(tx, l.product_id, id)), 0);
    if (D(l.qty).gt(free)) shortages.push({ lineId: l.id, productId: l.product_id, ordered: D(l.qty).toFixed(0), free: free.toFixed(0), shortage: D(l.qty).minus(free).toFixed(0) });
  }
  if (shortages.length && !b.acknowledgeShortage) {
    const nm = await tx.one('select name from items where id=$1', [shortages[0].productId]);
    throw conflict(`Stock shortage: ${nm.name} ordered ${shortages[0].ordered}, available ${shortages[0].free}, short by ${shortages[0].shortage}. Reduce the quantity, reject, or approve as a back-order.`, { shortages });
  }
  await tx.query("update orders set status='APPROVED', shortage_ack=$1, decided_by=$2, decided_at=$3 where id=$4", [shortages.length > 0, user.username, nowTs(), id]);
  await audit(tx, user.username, 'APPROVE', 'ORDER', id, `${orderNo(id)} approved${shortages.length ? ' with shortage (back-order)' : ''}`, { after: { shortages } });
  return { status: 'APPROVED', shortages };
}
async function rejectOrder(tx, user, id, reason) {
  if (!reason || !reason.trim()) throw bad('A reason is required to reject an order');
  const o = await tx.one('select * from orders where id=$1 for update', [id]);
  if (!o) throw notFound('Order not found');
  if (!['SUBMITTED', 'APPROVED'].includes(o.status)) throw conflict(`Order is ${o.status}`);
  await tx.query("update orders set status='REJECTED', reject_reason=$1, decided_by=$2, decided_at=$3 where id=$4", [reason, user.username, nowTs(), id]);
  await audit(tx, user.username, 'REJECT', 'ORDER', id, `${orderNo(id)} rejected`, { reason });
}

// ---------- invoices ----------
async function createInvoice(tx, user, orderId, b = {}) {
  const o = await tx.one('select * from orders where id=$1 for update', [orderId]);
  if (!o) throw notFound('Order not found');
  if (o.status !== 'APPROVED') throw conflict(`Order is ${o.status}; approve it first`);
  const cust = await tx.one('select * from customers where id=$1', [o.customer_id]);
  const biz = await tx.one('select * from business where id=1');
  const intra = biz.state_code === cust.state_code;
  const date = b.invoiceDate || today(), fy = fyOf(date);
  const seq = await nextSeq(tx, 'INV', fy);
  const no = docNo(biz.invoice_prefix, fy, seq);
  const lines = await tx.query(`select ol.*, i.name, p.hsn, p.gst_rate, p.pack_size_g from order_lines ol join products p on p.item_id=ol.product_id join items i on i.id=ol.product_id where ol.order_id=$1 order by ol.id`, [orderId]);
  const calc = lines.map(l => ({ l, t: taxLine(l.qty, l.price, l.gst_rate, intra) }));
  const tot = k => sum(calc.map(c => c.t[k]));
  const inv = await tx.one(`insert into invoices(invoice_no,fy,seq,order_id,customer_id,invoice_date,due_date,place_of_supply,supply_type,buyer_name,buyer_gstin,buyer_address,buyer_state_code,
      taxable,cgst,sgst,igst,total,share_token,vehicle_no,notes,created_by,created_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) returning id`,
    [no, fy, seq, orderId, cust.id, date, addDays(date, cust.credit_days), cust.state_code, intra ? 'INTRA' : 'INTER', cust.name, cust.gstin, cust.address, cust.state_code,
      tot('taxable').toFixed(2), tot('cgst').toFixed(2), tot('sgst').toFixed(2), tot('igst').toFixed(2), tot('total').toFixed(2), token(), V.vehicle(b.vehicleNo), b.notes || null, user.username, nowTs()]);
  for (const { l, t } of calc)
    await tx.query('insert into invoice_lines(invoice_id,order_line_id,product_id,description,hsn,qty,rate,taxable,gst_rate,cgst,sgst,igst,total) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
      [inv.id, l.id, l.product_id, l.name, l.hsn, l.qty, l.price, t.taxable.toFixed(2), l.gst_rate, t.cgst.toFixed(2), t.sgst.toFixed(2), t.igst.toFixed(2), t.total.toFixed(2)]);
  await tx.query("update orders set status='INVOICED' where id=$1", [orderId]);
  await audit(tx, user.username, 'POST', 'INVOICE', inv.id, `${no} ₹${tot('total').toFixed(2)} (${intra ? 'CGST+SGST' : 'IGST'})`);
  return { id: inv.id, invoiceNo: no, total: tot('total').toFixed(2), supplyType: intra ? 'INTRA' : 'INTER' };
}

const OUTSTANDING_SQL = `(case when i.status='POSTED' then i.total else 0 end) - coalesce((select sum(p.amount) from payments p where p.invoice_id=i.id),0)`;
async function listInvoices(db, { from, to, customerId, status } = {}) {
  const w = [], p = [];
  if (from) { p.push(from); w.push(`i.invoice_date >= $${p.length}`); }
  if (to) { p.push(to); w.push(`i.invoice_date <= $${p.length}`); }
  if (customerId) { p.push(customerId); w.push(`i.customer_id = $${p.length}`); }
  if (status) { p.push(status); w.push(`i.status = $${p.length}`); }
  return db.query(`select i.id, i.invoice_no, i.invoice_date, i.due_date, i.order_id, i.customer_id, i.buyer_name as customer, i.supply_type, i.taxable, i.cgst, i.sgst, i.igst, i.total, i.status, i.share_token,
     coalesce((select sum(p.amount) from payments p where p.invoice_id=i.id),0) as paid, ${OUTSTANDING_SQL} as outstanding,
     (select cn_no from credit_notes c where c.invoice_id=i.id) as credit_note_no
     from invoices i ${w.length ? 'where ' + w.join(' and ') : ''} order by i.id desc`, p);
}
async function invoiceDetail(db, id) {
  const inv = await db.one(`select i.*, ${OUTSTANDING_SQL} as outstanding, coalesce((select sum(p.amount) from payments p where p.invoice_id=i.id),0) as paid, s.name as state_name from invoices i join states s on s.code=i.buyer_state_code where i.id=$1`, [id]);
  if (!inv) throw notFound('Invoice not found');
  inv.lines = await db.query('select * from invoice_lines where invoice_id=$1 order by id', [id]);
  inv.payments = await db.query('select * from payments where invoice_id=$1 order by id', [id]);
  inv.creditNote = await db.one('select * from credit_notes where invoice_id=$1', [id]);
  inv.history = await db.query("select ts, actor, action, summary, before_json, after_json, reason from audit_log where entity='INVOICE' and entity_id=$1 order by id", [id]);
  return inv;
}
async function updateInvoiceMeta(tx, user, id, b) {
  const inv = await tx.one('select * from invoices where id=$1 for update', [id]);
  if (!inv) throw notFound('Invoice not found');
  if (inv.status !== 'POSTED') throw conflict('Cancelled invoices cannot be edited');
  const before = { vehicle_no: inv.vehicle_no, notes: inv.notes, buyer_address: inv.buyer_address, buyer_gstin: inv.buyer_gstin };
  const after = { vehicle_no: b.vehicleNo === undefined ? inv.vehicle_no : V.vehicle(b.vehicleNo), notes: b.notes ?? inv.notes, buyer_address: b.buyerAddress ?? inv.buyer_address, buyer_gstin: b.buyerGstin ?? inv.buyer_gstin };
  await tx.query('update invoices set vehicle_no=$1, notes=$2, buyer_address=$3, buyer_gstin=$4 where id=$5', [after.vehicle_no, after.notes, after.buyer_address, after.buyer_gstin, id]);
  await audit(tx, user.username, 'EDIT', 'INVOICE', id, `${inv.invoice_no} non-financial details edited (amounts can only change via credit note)`, { before, after, reason: b.reason });
}
// Cancel = credit note for the full invoice (never delete). Optionally put dispatched goods back into stock, batch for batch.
async function cancelInvoice(tx, user, id, { reason, returnGoods }) {
  if (!reason || !reason.trim()) throw bad('A reason is required');
  const inv = await tx.one('select * from invoices where id=$1 for update', [id]);
  if (!inv) throw notFound('Invoice not found');
  if (inv.status !== 'POSTED') throw conflict('Invoice is already cancelled');
  const fy = fyOf(today()), seq = await nextSeq(tx, 'CN', fy), biz = await tx.one('select invoice_prefix from business where id=1');
  const no = docNo(biz.invoice_prefix + '-CN', fy, seq);
  const cn = await tx.one(`insert into credit_notes(cn_no,fy,seq,invoice_id,cn_date,reason,taxable,cgst,sgst,igst,total,goods_returned,share_token,created_by,created_at)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id`, [no, fy, seq, id, today(), reason, inv.taxable, inv.cgst, inv.sgst, inv.igst, inv.total, !!returnGoods, token(), user.username, nowTs()]);
  await tx.query("update invoices set status='CANCELLED' where id=$1", [id]);
  await tx.query("update orders set status='CANCELLED' where id=$1", [inv.order_id]);
  if (returnGoods) {
    const moves = await tx.query(`select m.* from stock_moves m join dispatches d on d.id=m.source_id and m.source_type='DISPATCH' where d.invoice_id=$1 and m.move_type='DISPATCH'`, [id]);
    await stock.lockItems(tx, moves.map(m => m.item_id));
    for (const m of moves) await stock.post(tx, { itemId: m.item_id, batchId: m.batch_id, type: 'SALES_RETURN', qty: D(m.qty).negated(), unitCost: m.unit_cost, sourceType: 'CREDIT_NOTE', sourceId: cn.id, sourceRef: no, note: `Return against ${inv.invoice_no}`, user: user.username });
  }
  await audit(tx, user.username, 'CANCEL', 'INVOICE', id, `${inv.invoice_no} cancelled by credit note ${no}`, { before: { status: 'POSTED' }, after: { status: 'CANCELLED', creditNote: no }, reason });
  return { creditNoteId: cn.id, creditNoteNo: no };
}

// ---------- dispatch ----------
async function dispatchOrder(tx, user, orderId, b = {}) {
  const o = await tx.one('select * from orders where id=$1 for update', [orderId]);
  if (!o) throw notFound('Order not found');
  if (!['INVOICED', 'PARTIALLY_DISPATCHED'].includes(o.status)) throw conflict(`Order is ${o.status}; invoice it before dispatch`);
  const inv = await tx.one("select * from invoices where order_id=$1 and status='POSTED'", [orderId]);
  const lines = await tx.query('select ol.*, i.name, coalesce((select sum(dl.qty) from dispatch_lines dl where dl.order_line_id=ol.id),0) as done from order_lines ol join items i on i.id=ol.product_id where ol.order_id=$1 order by ol.id', [orderId]);
  await stock.lockItems(tx, lines.map(l => l.product_id));
  const req = new Map((b.lines || []).map(x => [Number(x.orderLineId), D(x.qty)]));
  const plan = [];
  for (const l of lines) {
    const remaining = D(l.qty).minus(l.done);
    let q = req.size ? (req.get(l.id) || D(0)) : remaining;
    if (q.gt(remaining)) throw bad(`${l.name}: cannot dispatch more than the remaining ${remaining}`);
    if (!q.eq(q.toDecimalPlaces(0)) || q.lt(0)) throw bad('Dispatch quantity must be a whole number');
    const onHand = await stock.balance(tx, l.product_id);
    if (q.gt(onHand)) {
      if (b.partial) q = onHand;                                      // "dispatch what is available"
      else throw conflict(`Insufficient stock to dispatch ${l.name}: need ${q}, in stock ${onHand}. Use partial dispatch or produce more.`, { productId: l.product_id, short: q.minus(onHand).toFixed(0) });
    }
    if (q.gt(0)) plan.push({ l, q });
  }
  if (!plan.length) throw bad('Nothing to dispatch');
  const vehicleNo = V.vehicle(b.vehicleNo || inv.vehicle_no, { required: true });
  const d = await tx.one('insert into dispatches(dispatch_no,order_id,invoice_id,vehicle_no,notes,dispatched_at,created_by) values($1,$2,$3,$4,$5,$6,$7) returning id',
    ['TMP' + Math.random(), orderId, inv.id, vehicleNo, b.notes || null, nowTs(), user.username]);
  const dno = 'DSP-' + String(d.id).padStart(5, '0');
  await tx.query('update dispatches set dispatch_no=$1 where id=$2', [dno, d.id]);
  for (const { l, q } of plan) {
    await tx.query('insert into dispatch_lines(dispatch_id,order_line_id,product_id,qty) values($1,$2,$3,$4)', [d.id, l.id, l.product_id, q.toFixed(3)]);
    await stock.issue(tx, { itemId: l.product_id, qty: q, type: 'DISPATCH', sourceType: 'DISPATCH', sourceId: d.id, sourceRef: dno, user: user.username, note: `${inv.invoice_no} / ${orderNo(orderId)}` });
  }
  const left = await tx.one('select coalesce(sum(ol.qty - coalesce((select sum(dl.qty) from dispatch_lines dl where dl.order_line_id=ol.id),0)),0) as r from order_lines ol where ol.order_id=$1', [orderId]);
  const status = D(left.r).gt(0) ? 'PARTIALLY_DISPATCHED' : 'DISPATCHED';
  await tx.query('update orders set status=$1 where id=$2', [status, orderId]);
  await audit(tx, user.username, 'DISPATCH', 'ORDER', orderId, `${dno} ${status}: ` + plan.map(p => `${p.q} x ${p.l.name}`).join(', '));
  return { dispatchId: d.id, dispatchNo: dno, status, remaining: D(left.r).toFixed(0) };
}

// ---------- payments ----------
async function recordPayment(tx, user, b) {
  const inv = await tx.one('select * from invoices where id=$1 for update', [b.invoiceId]);
  if (!inv) throw notFound('Invoice not found');
  if (inv.status !== 'POSTED') throw conflict('Cannot receive payment against a cancelled invoice');
  const amt = D(b.amount);
  if (!amt.gt(0)) throw bad('Amount must be positive');
  const paid = D((await tx.one('select coalesce(sum(amount),0) s from payments where invoice_id=$1', [inv.id])).s);
  const due = D(inv.total).minus(paid);
  if (amt.gt(due)) throw bad(`Payment ₹${amt.toFixed(2)} exceeds outstanding ₹${due.toFixed(2)}`);
  const paidOn = V.date(b.paidOn, 'Payment date') || today(), fy = fyOf(paidOn), seq = await nextSeq(tx, 'REC', fy);
  const rno = docNo('REC', fy, seq);
  const p = await tx.one('insert into payments(receipt_no,customer_id,invoice_id,amount,mode,reference,paid_on,notes,created_by,created_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id',
    [rno, inv.customer_id, inv.id, amt.toFixed(2), b.mode || 'CASH', b.reference || null, paidOn, b.notes || null, user.username, nowTs()]);
  await audit(tx, user.username, 'RECEIVE', 'PAYMENT', p.id, `${rno} ₹${amt.toFixed(2)} against ${inv.invoice_no}`);
  return { id: p.id, receiptNo: rno, outstanding: due.minus(amt).toFixed(2) };
}
async function customerBalances(db, asOn) {
  const rows = await db.query(`select c.id, c.name, c.type, c.credit_days,
     coalesce(sum(case when i.status='POSTED' then i.total else 0 end),0) as billed,
     coalesce(sum((select coalesce(sum(p.amount),0) from payments p where p.invoice_id=i.id)),0) as paid
     from customers c left join invoices i on i.customer_id=c.id ${asOn ? 'and i.invoice_date <= $1' : ''} group by c.id order by c.name`, asOn ? [asOn] : []);
  return rows.map(r => ({ ...r, outstanding: D(r.billed).minus(r.paid).toFixed(2) }));
}
// Salesman: customer-wise sales (own orders), taxable value of non-rejected/cancelled orders.
async function salesmanCustomerSales(db, viewer, from, to) {
  return db.query(`select c.id as customer_id, c.name as customer, count(distinct o.id)::int as orders, coalesce(sum(ol.qty),0) as packets, coalesce(sum(ol.qty*ol.price),0) as taxable
     from orders o join customers c on c.id=o.customer_id join order_lines ol on ol.order_id=o.id
     where o.salesman_id=$1 and o.status not in ('REJECTED','CANCELLED') and o.received_at::date between $2 and $3 group by c.id, c.name order by taxable desc`, [viewer.id, from, to]);
}
module.exports = { orderNo, createOrder, orderDetail, listOrders, approveOrder, rejectOrder, createInvoice, listInvoices, invoiceDetail, updateInvoiceMeta, cancelInvoice, dispatchOrder, recordPayment, customerBalances, salesmanCustomerSales, priceFor, nextSeq, OUTSTANDING_SQL };
