'use strict';
const express = require('express');
const { D } = require('../money');
const { wrap, int, range, req$ } = require('../http');
const { allow } = require('../auth');
const { bad, notFound } = require('../errors');
const { audit } = require('../audit');
const { today, monthStart } = require('../clock');
const stock = require('../services/stock');
const prod = require('../services/production');
const pur = require('../services/purchasing');
const planning = require('../services/planning');

module.exports = db => {
  const r = express.Router();
  const BACK = ['ADMIN', 'PRODUCTION', 'AUDITOR', 'OWNER'], FLOOR = ['ADMIN', 'PRODUCTION'];
  const U = req => req.session.user;

  // ---- stock ----
  r.get('/stock/balances', allow(...BACK), wrap(async (req, res) => res.json(await stock.balances(db, { asOn: req.query.asOn, type: req.query.type }))));
  r.get('/stock/ledger', allow(...BACK), wrap(async (req, res) => {
    const { from, to } = range(req); const p = [from + ' 00:00:00', to + ' 23:59:59'], w = ['m.moved_at between $1 and $2'];
    if (req.query.itemId) { p.push(int(req.query.itemId)); w.push(`m.item_id=$${p.length}`); }
    if (req.query.type) { p.push(req.query.type); w.push(`i.type=$${p.length}`); }
    if (req.query.moveType) { p.push(req.query.moveType); w.push(`m.move_type=$${p.length}`); }
    const rows = await db.query(`select m.*, i.name, i.unit, i.type as item_type, b.batch_no, b.expiry_date from stock_moves m join items i on i.id=m.item_id join batches b on b.id=m.batch_id where ${w.join(' and ')} order by m.item_id, m.id`, p);
    const open = {};     // running balance per item, starting from the balance before `from`
    for (const it of [...new Set(rows.map(x => x.item_id))]) open[it] = D((await db.one('select coalesce(sum(qty),0) s from stock_moves where item_id=$1 and moved_at < $2', [it, from + ' 00:00:00'])).s);
    for (const m of rows) { open[m.item_id] = open[m.item_id].plus(m.qty); m.running_balance = open[m.item_id].toFixed(4); }
    res.json(rows);
  }));
  r.post('/stock/adjustments', allow(...FLOOR), wrap(async (req, res) => {
    req$(req.body, 'itemId', 'qty', 'reason');
    res.status(201).json({ ref: await db.tx(tx => stock.adjust(tx, { ...req.body, user: U(req).username })) });
  }));
  r.get('/stock/reconcile', allow(...BACK), wrap(async (req, res) => res.json(await stock.reconcile(db))));

  // ---- purchases ----
  r.get('/purchases', allow(...BACK), wrap(async (req, res) => { const { from, to } = range(req); res.json(await pur.listPurchases(db, from, to)); }));
  r.get('/purchases/:id', allow(...BACK), wrap(async (req, res) => res.json(await pur.purchaseDetail(db, int(req.params.id)))));
  r.post('/purchases', allow(...FLOOR), wrap(async (req, res) => res.status(201).json({ id: await db.tx(tx => pur.createPurchase(tx, U(req), req.body)) })));

  // ---- production ----
  r.get('/production/runs', allow(...BACK), wrap(async (req, res) => res.json(await prod.listRuns(db, { status: req.query.status }))));
  r.get('/production/runs/:id', allow(...BACK), wrap(async (req, res) => res.json(await prod.runDetail(db, int(req.params.id)))));
  r.post('/production/runs', allow(...FLOOR), wrap(async (req, res) => { req$(req.body, 'productId', 'batches'); res.status(201).json({ id: await db.tx(tx => prod.startRun(tx, U(req), req.body)) }); }));
  r.post('/production/runs/:id/complete', allow(...FLOOR), wrap(async (req, res) => { req$(req.body, 'goodOutput'); await db.tx(tx => prod.completeRun(tx, U(req), int(req.params.id), req.body)); res.json(await prod.runDetail(db, int(req.params.id))); }));
  r.post('/production/runs/:id/costs', allow(...FLOOR), wrap(async (req, res) => { req$(req.body, 'costType', 'amount'); const id = await db.tx(tx => prod.addCost(tx, U(req), int(req.params.id), req.body)); res.status(201).json({ id, costing: await prod.runCosting(db, int(req.params.id)) }); }));
  r.delete('/production/runs/:id/costs/:cid', allow(...FLOOR), wrap(async (req, res) => { await db.tx(tx => prod.removeCost(tx, U(req), int(req.params.id), int(req.params.cid), req.query.reason || req.body?.reason)); res.json({ ok: true }); }));
  r.post('/production/runs/:id/void', allow('ADMIN'), wrap(async (req, res) => { await db.tx(tx => prod.voidRun(tx, U(req), int(req.params.id), req.body.reason)); res.json({ ok: true }); }));
  r.get('/production/costing', allow(...BACK), wrap(async (req, res) => { const { from, to } = range(req); res.json(await prod.productCosting(db, from, to)); }));
  r.get('/production/planning', allow(...BACK), wrap(async (req, res) => res.json(await planning.plan(db))));
  r.get('/production/monthly-overheads', allow(...BACK), wrap(async (req, res) => res.json(await db.query('select * from monthly_overheads order by month desc, id desc'))));
  r.post('/production/monthly-overheads', allow('ADMIN'), wrap(async (req, res) => {
    const b = req.body; req$(b, 'month', 'costType', 'amount');
    if (!D(b.amount).gte(0)) throw bad('Amount must be zero or positive');
    const id = await db.tx(async tx => {
      const row = await tx.one('insert into monthly_overheads(month,cost_type,amount,notes,created_by,created_at) values($1,$2,$3,$4,$5,$6) returning id', [monthStart(b.month), b.costType, D(b.amount).toFixed(2), b.notes || null, U(req).username, require('../clock').nowTs()]);
      await audit(tx, U(req).username, 'CREATE', 'MONTHLY_OVERHEAD', row.id, `${b.costType} ₹${D(b.amount).toFixed(2)} for ${monthStart(b.month).slice(0, 7)}`); return row.id;
    });
    res.status(201).json({ id });
  }));
  return r;
};
