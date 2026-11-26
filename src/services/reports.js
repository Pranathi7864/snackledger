'use strict';
// Every report returns { key, title, subtitle, sections:[{title, columns:[{key,label,type}], rows:[...], totals}] } so one renderer
// can produce JSON, CSV, XLSX and PDF. Money/qty are strings (no float drift).
const { D, round, sum } = require('../money');
const { today, daysBetween } = require('../clock');
const S = require('./sales');
const prod = require('./production');
const stock = require('./stock');

const col = (key, label, type = 'text', dp) => ({ key, label, type, dp });
const m2 = v => D(v).toFixed(2);
const totalsOf = (rows, keys) => Object.fromEntries(keys.map(k => [k, sum(rows.map(r => r[k])).toFixed(2)]));
const period = (from, to) => `${from} to ${to}`;

const REPORTS = {
  'sales-register': { title: 'Sales register', async run(db, { from, to }) {
    const inv = await db.query(`select invoice_date as date, invoice_no as doc_no, 'Invoice' as doc_type, buyer_name as customer, coalesce(buyer_gstin,'Unregistered') as gstin, supply_type, taxable, cgst, sgst, igst, total, status from invoices where invoice_date between $1 and $2`, [from, to]);
    const cn = await db.query(`select c.cn_date as date, c.cn_no as doc_no, 'Credit note' as doc_type, i.buyer_name as customer, coalesce(i.buyer_gstin,'Unregistered') as gstin, i.supply_type, -c.taxable as taxable, -c.cgst as cgst, -c.sgst as sgst, -c.igst as igst, -c.total as total, 'CREDIT NOTE' as status from credit_notes c join invoices i on i.id=c.invoice_id where c.cn_date between $1 and $2`, [from, to]);
    // Cancelled invoices stay visible (audit) but are offset by their credit note row, so net totals are right.
    const rows = [...inv, ...cn].sort((a, b) => (a.date + a.doc_no).localeCompare(b.date + b.doc_no));
    const K = ['taxable', 'cgst', 'sgst', 'igst', 'total'];
    return [{ title: 'Invoices and credit notes', columns: [col('date', 'Date', 'date'), col('doc_no', 'Document'), col('doc_type', 'Type'), col('customer', 'Customer'), col('gstin', 'GSTIN'), col('supply_type', 'Supply'), ...K.map(k => col(k, k.toUpperCase(), 'money')), col('status', 'Status')], rows, totals: totalsOf(rows, K) }];
  } },
  'customer-sales': { title: 'Customer-wise sales', async run(db, { from, to }) {
    // Period logic (same as GST): invoices ISSUED in the period, less credit notes ISSUED in the period. An invoice's current status is never used,
    // so looking back at January still shows a January sale that was cancelled in February; the February report carries the credit note.
    const inv = await db.query(`select c.id, c.name as customer, c.type, count(i.id)::int as invoices, sum(i.taxable) as taxable, sum(i.cgst+i.sgst+i.igst) as tax, sum(i.total) as total
      from invoices i join customers c on c.id=i.customer_id where i.invoice_date between $1 and $2 group by c.id, c.name, c.type`, [from, to]);
    const cn = await db.query(`select c.id, c.name as customer, c.type, sum(n.taxable) as taxable, sum(n.cgst+n.sgst+n.igst) as tax, sum(n.total) as total
      from credit_notes n join invoices i on i.id=n.invoice_id join customers c on c.id=i.customer_id where n.cn_date between $1 and $2 group by c.id, c.name, c.type`, [from, to]);
    const m = new Map();
    const row = r => { if (!m.has(r.id)) m.set(r.id, { customer: r.customer, type: r.type, invoices: 0, taxable: D(0), tax: D(0), total: D(0), cancelled: D(0) }); return m.get(r.id); };
    for (const r of inv) { const x = row(r); x.invoices = r.invoices; x.taxable = x.taxable.plus(r.taxable); x.tax = x.tax.plus(r.tax); x.total = x.total.plus(r.total); }
    for (const r of cn) { const x = row(r); x.taxable = x.taxable.minus(r.taxable); x.tax = x.tax.minus(r.tax); x.cancelled = x.cancelled.plus(r.total); }
    const rows = [...m.values()].map(x => ({ ...x, taxable: x.taxable.toFixed(2), tax: x.tax.toFixed(2), total: x.total.toFixed(2), cancelled: x.cancelled.toFixed(2), net: x.total.minus(x.cancelled).toFixed(2) })).sort((a, b) => D(b.net).minus(a.net).toNumber());
    return [{ title: 'Sales by customer (invoices issued in the period less credit notes issued in the period)', columns: [col('customer', 'Customer'), col('type', 'Type'), col('invoices', 'Invoices', 'int'), col('taxable', 'Taxable (net)', 'money'), col('tax', 'GST (net)', 'money'), col('total', 'Invoiced', 'money'), col('cancelled', 'Credit notes', 'money'), col('net', 'Net sales', 'money')], rows, totals: totalsOf(rows, ['taxable', 'tax', 'total', 'cancelled', 'net']) }];
  } },
  'product-sales': { title: 'Product-wise sales', async run(db, { from, to }) {
    const set = (sign, cond) => `select l.description, l.hsn, ${sign}l.qty as qty, ${sign}l.taxable as taxable, ${sign}(l.cgst+l.sgst+l.igst) as tax, ${sign}l.total as total from invoice_lines l join invoices i on i.id=l.invoice_id ${cond}`;
    const rows = await db.query(`select description as product, hsn, sum(qty) as qty, sum(taxable) as taxable, sum(tax) as tax, sum(total) as total
      from (${set('', 'where i.invoice_date between $1 and $2')} union all ${set('-', 'join credit_notes c on c.invoice_id=i.id where c.cn_date between $1 and $2')}) x group by description, hsn order by total desc`, [from, to]);
    return [{ title: 'Sales by product (invoices issued in the period less credit notes issued in the period)', columns: [col('product', 'Product'), col('hsn', 'HSN'), col('qty', 'Packets', 'qty', 0), col('taxable', 'Taxable', 'money'), col('tax', 'GST', 'money'), col('total', 'Total', 'money')], rows, totals: totalsOf(rows, ['qty', 'taxable', 'tax', 'total']) }];
  } },
  'gst-summary': { title: 'GST summary of outward supplies (GSTR-1 / GSTR-3B shape)', async run(db, { from, to }) {
    // GST rule: every invoice ISSUED in the period is outward supply, even if it is cancelled later (the credit note is the reversal, dated when it was issued).
    // Filtering cancelled invoices out AND subtracting their credit notes would subtract the sale twice.
    const base = `from invoices i where i.invoice_date between $1 and $2`;
    const b2b = await db.query(`select i.buyer_gstin as gstin, i.buyer_name as customer, i.invoice_no, i.invoice_date as date, i.total as value, i.place_of_supply as pos, i.taxable, i.igst, i.cgst, i.sgst ${base} and i.buyer_gstin is not null order by i.invoice_date, i.id`, [from, to]);
    // Lines of invoices issued in the period (+) and lines of invoices whose credit note was issued in the period (-)
    const lineSet = (sign, cond) => `select i.place_of_supply as pos, i.supply_type, i.buyer_gstin, l.hsn, l.description, l.gst_rate as rate, ${sign}l.qty as qty, ${sign}l.total as value, ${sign}l.taxable as taxable, ${sign}l.igst as igst, ${sign}l.cgst as cgst, ${sign}l.sgst as sgst from invoice_lines l join invoices i on i.id=l.invoice_id ${cond}`;
    const lines = `(${lineSet('', 'where i.invoice_date between $1 and $2')} union all ${lineSet('-', 'join credit_notes c on c.invoice_id=i.id where c.cn_date between $1 and $2')}) x`;
    const b2cs = await db.query(`select pos, rate, supply_type, sum(taxable) as taxable, sum(igst) as igst, sum(cgst) as cgst, sum(sgst) as sgst from ${lines} where buyer_gstin is null group by pos, rate, supply_type`, [from, to]);
    const hsn = await db.query(`select hsn, description, sum(qty) as qty, sum(value) as value, sum(taxable) as taxable, sum(igst) as igst, sum(cgst) as cgst, sum(sgst) as sgst, rate from ${lines} group by hsn, description, rate`, [from, to]);
    const cdn = await db.query(`select coalesce(i.buyer_gstin,'Unregistered') as gstin, c.cn_no, c.cn_date as date, i.invoice_no as orig_invoice, c.taxable, c.igst, c.cgst, c.sgst, c.total from credit_notes c join invoices i on i.id=c.invoice_id where c.cn_date between $1 and $2`, [from, to]);
    const t3b = await db.one(`select coalesce(sum(taxable),0) t, coalesce(sum(igst),0) ig, coalesce(sum(cgst),0) cg, coalesce(sum(sgst),0) sg ${base}`, [from, to]);
    const cdnT = await db.one('select coalesce(sum(taxable),0) t, coalesce(sum(igst),0) ig, coalesce(sum(cgst),0) cg, coalesce(sum(sgst),0) sg from credit_notes where cn_date between $1 and $2', [from, to]);
    const net = k => D(t3b[k]).minus(cdnT[k]).toFixed(2);
    const K = ['taxable', 'igst', 'cgst', 'sgst'];
    return [
      { title: '3B 3.1(a) Outward taxable supplies (net of credit notes)', columns: [col('desc', 'Nature of supply'), col('taxable', 'Taxable value', 'money'), col('igst', 'IGST', 'money'), col('cgst', 'CGST', 'money'), col('sgst', 'SGST', 'money')], rows: [{ desc: 'Outward taxable supplies (other than zero rated, nil rated, exempted)', taxable: net('t'), igst: net('ig'), cgst: net('cg'), sgst: net('sg') }] },
      { title: 'GSTR-1 4A/4B: B2B invoices (registered buyers)', columns: [col('gstin', 'GSTIN'), col('customer', 'Customer'), col('invoice_no', 'Invoice'), col('date', 'Date', 'date'), col('value', 'Invoice value', 'money'), col('pos', 'POS'), ...K.map(k => col(k, k.toUpperCase(), 'money'))], rows: b2b, totals: totalsOf(b2b, ['value', ...K]) },
      { title: 'GSTR-1 7: B2C small (unregistered buyers)', columns: [col('pos', 'Place of supply'), col('supply_type', 'Supply'), col('rate', 'Rate %', 'pct'), ...K.map(k => col(k, k.toUpperCase(), 'money'))], rows: b2cs, totals: totalsOf(b2cs, K) },
      { title: 'GSTR-1 9B: Credit / debit notes', columns: [col('gstin', 'GSTIN'), col('cn_no', 'Credit note'), col('date', 'Date', 'date'), col('orig_invoice', 'Original invoice'), col('total', 'Value', 'money'), ...K.map(k => col(k, k.toUpperCase(), 'money'))], rows: cdn, totals: totalsOf(cdn, ['total', ...K]) },
      { title: 'GSTR-1 12: HSN-wise summary', columns: [col('hsn', 'HSN'), col('description', 'Description'), col('qty', 'Qty', 'qty', 0), col('rate', 'Rate %', 'pct'), col('value', 'Value', 'money'), ...K.map(k => col(k, k.toUpperCase(), 'money'))], rows: hsn, totals: totalsOf(hsn, ['qty', 'value', ...K]) },
    ];
  } },
  'purchase-register': { title: 'Purchase register', async run(db, { from, to }) {
    const rows = await db.query(`select p.bill_date as date, 'PUR-' || lpad(p.id::text,5,'0') as purchase_no, p.bill_no, s.name as supplier, coalesce(s.gstin,'Unregistered') as gstin, i.name as item, l.qty, i.unit, l.rate, l.taxable, l.gst_rate as rate_pct, l.tax, l.taxable + l.tax as total
      from purchases p join purchase_lines l on l.purchase_id=p.id join items i on i.id=l.item_id join suppliers s on s.id=p.supplier_id where p.bill_date between $1 and $2 order by p.bill_date, p.id, l.id`, [from, to]);
    return [{ title: 'Purchases', columns: [col('date', 'Date', 'date'), col('purchase_no', 'Entry'), col('bill_no', 'Supplier bill'), col('supplier', 'Supplier'), col('gstin', 'GSTIN'), col('item', 'Item'), col('qty', 'Qty', 'qty'), col('unit', 'Unit'), col('rate', 'Rate', 'money'), col('taxable', 'Taxable', 'money'), col('rate_pct', 'GST %', 'pct'), col('tax', 'Tax', 'money'), col('total', 'Total', 'money')], rows, totals: totalsOf(rows, ['taxable', 'tax', 'total']) }];
  } },
  'stock-summary': { title: 'Stock summary', async run(db, { from, to, type }) {
    const items = await db.query(`select id, name, type, unit, reorder_level, avg_cost from items ${type ? 'where type=$1' : ''} order by type, id`, type ? [type] : []);
    const rows = [];
    for (const it of items) {
      const mv = await db.query('select move_type, moved_at, qty from stock_moves where item_id=$1 and moved_at <= $2', [it.id, to + ' 23:59:59']);
      let opening = D(0), receipts = D(0), issues = D(0), adj = D(0);
      for (const m of mv) {
        const inPeriod = m.moved_at.slice(0, 10) >= from, q = D(m.qty);
        if (!inPeriod || m.move_type === 'OPENING') { opening = opening.plus(q); continue; }
        if (['PURCHASE', 'PRODUCTION_OUTPUT', 'SALES_RETURN'].includes(m.move_type)) receipts = receipts.plus(q);
        else if (['PRODUCTION_ISSUE', 'DISPATCH'].includes(m.move_type)) issues = issues.plus(q.negated());
        else adj = adj.plus(q);                                   // ADJUSTMENT and PRODUCTION_REVERSAL
      }
      const closing = opening.plus(receipts).minus(issues).plus(adj);
      rows.push({ item: it.name, category: it.type, unit: it.unit, opening: opening.toFixed(3), receipts: receipts.toFixed(3), issues: issues.toFixed(3), adjustments: adj.toFixed(3), closing: closing.toFixed(3), avg_cost: D(it.avg_cost).toFixed(4), value: it.type === 'FINISHED' ? '' : round(closing.times(it.avg_cost), 2).toFixed(2), alert: closing.lte(it.reorder_level) && D(it.reorder_level).gt(0) ? 'LOW STOCK' : '' });
    }
    return [{ title: 'Opening + receipts - issues ± adjustments = closing', columns: [col('item', 'Item'), col('category', 'Category'), col('unit', 'Unit'), col('opening', 'Opening', 'qty'), col('receipts', 'Receipts', 'qty'), col('issues', 'Issues / sales', 'qty'), col('adjustments', 'Adjustments', 'qty'), col('closing', 'Closing', 'qty'), col('avg_cost', 'Avg cost', 'money'), col('value', 'Value', 'money'), col('alert', 'Alert')], rows, totals: totalsOf(rows.filter(r => r.value !== ''), ['value']) }];
  } },
  'stock-ledger': { title: 'Stock ledger', async run(db, { from, to, itemId, type }) {
    const p = [from + ' 00:00:00', to + ' 23:59:59'], w = ['m.moved_at between $1 and $2'];
    if (itemId) { p.push(itemId); w.push(`m.item_id=$${p.length}`); }
    if (type) { p.push(type); w.push(`i.type=$${p.length}`); }
    const rows = await db.query(`select m.item_id, m.moved_at, i.name as item, i.unit, b.batch_no, b.expiry_date, m.move_type, m.qty, m.source_ref, m.created_by, m.note from stock_moves m join items i on i.id=m.item_id join batches b on b.id=m.batch_id where ${w.join(' and ')} order by m.item_id, m.id`, p);
    const run = {};
    for (const id of [...new Set(rows.map(r => r.item_id))]) run[id] = D((await db.one('select coalesce(sum(qty),0) s from stock_moves where item_id=$1 and moved_at < $2', [id, from + ' 00:00:00'])).s);
    for (const r of rows) { run[r.item_id] = run[r.item_id].plus(r.qty); r.balance = run[r.item_id].toFixed(3); r.date = r.moved_at.slice(0, 16); }
    return [{ title: 'Every movement with its source document', columns: [col('date', 'Date/time'), col('item', 'Item'), col('batch_no', 'Batch'), col('expiry_date', 'Expiry', 'date'), col('move_type', 'Movement'), col('qty', 'Qty (+/-)', 'qty'), col('unit', 'Unit'), col('balance', 'Balance', 'qty'), col('source_ref', 'Source doc'), col('created_by', 'By'), col('note', 'Note')], rows }];
  } },
  'production': { title: 'Production report: planned vs actual', async run(db, { from, to }) {
    const runs = await db.query(`select r.*, i.name as product from production_runs r join items i on i.id=r.product_id where r.run_date between $1 and $2 order by r.id`, [from, to]);
    const sum1 = [], lines = [];
    for (const r of runs) {
      const no = 'BATCH-' + String(r.id).padStart(5, '0'), good = r.good_output === null ? null : D(r.good_output);
      sum1.push({ run: no, date: r.run_date, product: r.product, status: r.status, batches: D(r.batches).toFixed(2), expected: D(r.expected_output).toFixed(0), good: good ? good.toFixed(0) : '', damaged: D(r.damaged_packaging || 0).toFixed(0), shortfall: good ? D(r.expected_output).minus(good).toFixed(0) : '', unexplained: good ? D(r.expected_output).minus(good).minus(r.damaged_packaging || 0).toFixed(0) : '', yield_var: r.yield_variance_pct === null ? '' : D(r.yield_variance_pct).toFixed(2), flag: r.yield_flag ? 'OVER TOLERANCE' : '' });
      for (const l of await db.query('select l.*, i.name, i.unit from production_run_lines l join items i on i.id=l.item_id where l.run_id=$1 order by l.kind desc, l.id', [r.id]))
        lines.push({ run: no, item: l.name, kind: l.kind, unit: l.unit, planned: D(l.planned_qty).toFixed(3), actual: l.actual_qty === null ? '' : D(l.actual_qty).toFixed(3), diff: l.actual_qty === null ? '' : D(l.actual_qty).minus(l.planned_qty).toFixed(3), variance: l.variance_pct === null ? '' : D(l.variance_pct).toFixed(2), flag: l.flagged ? 'OVER TOLERANCE' : '', cost: D(l.cost).toFixed(2) });
    }
    const tol = await prod.tolerance(db);
    return [
      { title: `Runs: expected vs actual output and wastage (tolerance ±${tol}%)`, columns: [col('run', 'Run'), col('date', 'Date', 'date'), col('product', 'Product'), col('status', 'Status'), col('batches', 'Batches', 'qty', 2), col('expected', 'Expected', 'qty', 0), col('good', 'Good output', 'qty', 0), col('damaged', 'Damaged pouches', 'qty', 0), col('shortfall', 'Shortfall', 'qty', 0), col('unexplained', 'Unexplained loss', 'qty', 0), col('yield_var', 'Yield var %', 'pct'), col('flag', 'Flag')], rows: sum1 },
      { title: 'Material and packaging consumption: planned (BOM) vs actual', columns: [col('run', 'Run'), col('item', 'Item'), col('kind', 'Kind'), col('unit', 'Unit'), col('planned', 'Planned', 'qty'), col('actual', 'Actual', 'qty'), col('diff', 'Difference', 'qty'), col('variance', 'Variance %', 'pct'), col('flag', 'Flag'), col('cost', 'Cost', 'money')], rows: lines, totals: totalsOf(lines, ['cost']) },
    ];
  } },
  'cost-report': { title: 'Cost per packet and margin', async run(db, { from, to }) {
    const products = await prod.productCosting(db, from, to), runs = [];
    for (const r of await db.query("select id from production_runs where status='COMPLETED' and run_date between $1 and $2 order by id", [from, to])) { const c = await prod.runCosting(db, r.id); runs.push(c); }
    const mm = ['materialCost', 'packagingCost'];
    return [
      { title: 'Product-wise (weighted over all completed runs in the period)', columns: [col('product', 'Product'), col('runs', 'Runs', 'int'), col('goodPackets', 'Good packets', 'qty', 0), col('materialCost', 'Materials', 'money'), col('packagingCost', 'Packaging', 'money'), col('directOverhead', 'Labour/power/gas', 'money'), col('allocatedOverhead', 'Allocated monthly overhead', 'money'), col('totalCost', 'Total cost', 'money'), col('costPerPacket', 'Cost / packet', 'money'), col('sellingPrice', 'Price', 'money'), col('margin', 'Margin / packet', 'money'), col('marginPct', 'Margin %', 'pct')], rows: products },
      { title: 'Run-wise', columns: [col('runNo', 'Run'), col('product', 'Product'), col('goodOutput', 'Good packets', 'qty', 0), ...[['materialCost', 'Materials'], ['packagingCost', 'Packaging'], ['labour', 'Labour'], ['powerGas', 'Power/gas'], ['otherDirect', 'Other'], ['allocatedOverhead', 'Allocated'], ['totalCost', 'Total']].map(([k, l]) => col(k, l, 'money')), col('costPerPacket', 'Cost / packet', 'money'), col('marginPct', 'Margin %', 'pct')], rows: runs },
    ];
  } },
  'payments': { title: 'Payments and collections', async run(db, { from, to }) {
    const rows = await db.query(`select p.paid_on as date, p.receipt_no, c.name as customer, i.invoice_no, p.mode, p.reference, p.amount, p.created_by from payments p join customers c on c.id=p.customer_id join invoices i on i.id=p.invoice_id where p.paid_on between $1 and $2 order by p.paid_on, p.id`, [from, to]);
    const modes = await db.query('select mode, count(*)::int as receipts, sum(amount) as amount from payments where paid_on between $1 and $2 group by mode order by mode', [from, to]);
    return [
      { title: 'Receipts', columns: [col('date', 'Date', 'date'), col('receipt_no', 'Receipt'), col('customer', 'Customer'), col('invoice_no', 'Invoice'), col('mode', 'Mode'), col('reference', 'Reference'), col('amount', 'Amount', 'money'), col('created_by', 'By')], rows, totals: totalsOf(rows, ['amount']) },
      { title: 'Collections by mode', columns: [col('mode', 'Mode'), col('receipts', 'Receipts', 'int'), col('amount', 'Amount', 'money')], rows: modes, totals: totalsOf(modes, ['amount']) },
    ];
  } },
  'outstanding': { title: 'Outstanding receivables and ageing', async run(db, { to }) {
    const asOn = to || today();
    const invs = await db.query(`select i.id, i.invoice_no, i.invoice_date, i.due_date, i.customer_id, i.buyer_name as customer, i.total, coalesce((select sum(p.amount) from payments p where p.invoice_id=i.id and p.paid_on <= $1),0) as paid,
      coalesce((select sum(n.total) from credit_notes n where n.invoice_id=i.id and n.cn_date <= $1),0) as credited   -- cancelled only counts from the credit-note date
      from invoices i where i.invoice_date <= $1 order by i.invoice_date, i.id`, [asOn]);
    const bucket = d => (d <= 0 ? 'current' : d <= 30 ? 'b1' : d <= 60 ? 'b2' : d <= 90 ? 'b3' : 'b4');
    const detail = [], byCust = new Map();
    for (const i of invs) {
      const out = D(i.total).minus(i.paid).minus(i.credited); if (out.lte(0)) continue;
      const days = daysBetween(i.due_date, asOn), b = bucket(days);
      detail.push({ customer: i.customer, invoice_no: i.invoice_no, invoice_date: i.invoice_date, due_date: i.due_date, days_overdue: Math.max(days, 0), total: D(i.total).toFixed(2), paid: D(i.paid).plus(i.credited).toFixed(2), outstanding: out.toFixed(2), bucket: { current: 'Not due', b1: '1-30', b2: '31-60', b3: '61-90', b4: '90+' }[b] });
      const c = byCust.get(i.customer_id) || { customer: i.customer, current: D(0), b1: D(0), b2: D(0), b3: D(0), b4: D(0), total: D(0) };
      c[b] = c[b].plus(out); c.total = c.total.plus(out); byCust.set(i.customer_id, c);
    }
    const rows = [...byCust.values()].map(c => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, k === 'customer' ? v : v.toFixed(2)])));
    const K = ['current', 'b1', 'b2', 'b3', 'b4', 'total'];
    return [
      { title: `Customer-wise ageing as on ${asOn} (days past due date)`, columns: [col('customer', 'Customer'), col('current', 'Not due', 'money'), col('b1', '1-30 days', 'money'), col('b2', '31-60', 'money'), col('b3', '61-90', 'money'), col('b4', '90+', 'money'), col('total', 'Total outstanding', 'money')], rows, totals: totalsOf(rows, K) },
      { title: 'Invoice-wise outstanding', columns: [col('customer', 'Customer'), col('invoice_no', 'Invoice'), col('invoice_date', 'Invoice date', 'date'), col('due_date', 'Due date', 'date'), col('days_overdue', 'Days overdue', 'int'), col('total', 'Invoice total', 'money'), col('paid', 'Paid', 'money'), col('outstanding', 'Outstanding', 'money'), col('bucket', 'Bucket')], rows: detail, totals: totalsOf(detail, ['total', 'paid', 'outstanding']) },
    ];
  } },
  'visits': { title: 'Salesman visits (GPS check-ins)', async run(db, { from, to }) {
    const rows = await db.query(`select v.visited_at as time, u.full_name as salesman, c.name as customer, v.lat, v.lng, v.accuracy_m, v.note from visits v join users u on u.id=v.salesman_id join customers c on c.id=v.customer_id where v.visited_at between $1 and $2 order by v.visited_at desc`, [from + ' 00:00:00', to + ' 23:59:59']);
    return [{ title: 'Visits', columns: [col('time', 'Time'), col('salesman', 'Salesman'), col('customer', 'Customer'), col('lat', 'Latitude'), col('lng', 'Longitude'), col('accuracy_m', 'Accuracy (m)'), col('note', 'Note')], rows }];
  } },
};
const catalog = () => Object.entries(REPORTS).map(([key, r]) => ({ key, title: r.title }));
async function run(db, key, params) {
  const r = REPORTS[key]; if (!r) return null;
  const sections = await r.run(db, params);
  return { key, title: r.title, subtitle: key === 'outstanding' ? `As on ${params.to}` : period(params.from, params.to), from: params.from, to: params.to, sections };
}
module.exports = { run, catalog };
