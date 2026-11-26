'use strict';
const { D, round } = require('../money');
const { today, monthStart, monthEnd } = require('../clock');
const stock = require('./stock');
const prod = require('./production');
const S = require('./sales');
const planning = require('./planning');

async function summary(db) {
  const t = today(), ms = monthStart(t), me = monthEnd(t);
  const o = await db.one(`select count(*) filter (where received_at::date = $1)::int as today_orders, count(*) filter (where status='SUBMITTED')::int as pending_approval,
     count(*) filter (where status in ('APPROVED','INVOICED','PARTIALLY_DISPATCHED'))::int as to_dispatch from orders`, [t]);
  // month sales = invoices issued this month less credit notes issued this month (never the invoice's current status)
  const si = await db.one(`select coalesce(sum(taxable),0) as taxable, coalesce(sum(total),0) as total, count(*)::int as invoices from invoices where invoice_date between $1 and $2`, [ms, me]);
  const sc = await db.one(`select coalesce(sum(taxable),0) as taxable, coalesce(sum(total),0) as total from credit_notes where cn_date between $1 and $2`, [ms, me]);
  const sales = { taxable: D(si.taxable).minus(sc.taxable), total: D(si.total).minus(sc.total), invoices: si.invoices };
  const todaySales = await db.one(`select (select coalesce(sum(taxable),0) from invoices where invoice_date=$1) - (select coalesce(sum(taxable),0) from credit_notes where cn_date=$1) as taxable`, [t]);
  const items = await stock.balances(db);
  const outstanding = (await S.customerBalances(db)).filter(c => D(c.outstanding).gt(0)).sort((a, b) => D(b.outstanding).minus(a.outstanding).toNumber());
  const alerts = [];
  const runs = await db.query("select r.id, r.run_date, i.name as product, r.yield_variance_pct, r.yield_flag from production_runs r join items i on i.id=r.product_id where r.status='COMPLETED' order by r.id desc limit 10");
  for (const r of runs) {
    const no = 'BATCH-' + String(r.id).padStart(5, '0');
    if (r.yield_flag) alerts.push({ type: 'YIELD', runId: r.id, text: `${no} ${r.product}: yield ${D(r.yield_variance_pct).toFixed(1)}% vs plan` });
    for (const l of await db.query('select l.variance_pct, i.name from production_run_lines l join items i on i.id=l.item_id where l.run_id=$1 and l.flagged', [r.id])) alerts.push({ type: 'CONSUMPTION', runId: r.id, text: `${no} ${l.name}: ${D(l.variance_pct).gt(0) ? '+' : ''}${D(l.variance_pct).toFixed(1)}% vs BOM` });
  }
  const low = items.filter(i => i.low).map(i => ({ id: i.id, name: i.name, balance: i.balance, unit: i.unit, reorder: i.reorder_level }));
  const costing = await prod.productCosting(db, ms, me);
  const lastRuns = await prod.listRuns(db);
  const top = await db.query(`select buyer_name as customer, sum(taxable) as taxable from (select buyer_name, taxable from invoices where invoice_date between $1 and $2 union all select i.buyer_name, -n.taxable from credit_notes n join invoices i on i.id=n.invoice_id where n.cn_date between $1 and $2) x group by buyer_name order by taxable desc limit 5`, [ms, me]);
  const recent = await db.query(`select o.id, o.status, c.name as customer, o.received_at from orders o join customers c on c.id=o.customer_id order by o.id desc limit 6`);
  return {
    today: t, month: ms.slice(0, 7), orders: o, sales: { monthTaxable: D(sales.taxable).toFixed(2), monthTotal: D(sales.total).toFixed(2), invoices: sales.invoices, todayTaxable: D(todaySales.taxable).toFixed(2) },
    stock: items.map(i => ({ id: i.id, name: i.name, type: i.type, unit: i.unit, balance: D(i.balance).toFixed(3), reorder: i.reorder_level, low: i.low })),
    lowStock: low, varianceAlerts: alerts, costPerPacket: costing.length ? costing : lastRuns.filter(r => r.status === 'COMPLETED').slice(0, 1).map(r => ({ product: r.product, costPerPacket: round(r.costPerPacket, 2).toFixed(2) })),
    outstanding: { total: outstanding.reduce((a, c) => a.plus(c.outstanding), D(0)).toFixed(2), customers: outstanding.slice(0, 8).map(c => ({ name: c.name, outstanding: c.outstanding })) },
    topCustomers: top, recentOrders: recent, planning: (await planning.plan(db)).products,
  };
}
module.exports = { summary };
