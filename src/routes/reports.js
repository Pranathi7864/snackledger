'use strict';
const express = require('express');
const { wrap, range } = require('../http');
const { allow } = require('../auth');
const { bad, notFound } = require('../errors');
const { nowTs, today } = require('../clock');
const reports = require('../services/reports');
const ex = require('../services/exporters');
const dash = require('../services/dashboard');
const tally = require('../services/tally');

module.exports = db => {
  const r = express.Router();
  const READ = ['ADMIN', 'AUDITOR', 'OWNER', 'PRODUCTION'];
  r.get('/dashboard', allow(...READ), wrap(async (req, res) => res.json(await dash.summary(db))));
  r.get('/reports', allow(...READ), wrap(async (req, res) => res.json(reports.catalog())));
  r.get('/reports/:key', allow(...READ), wrap(async (req, res) => {
    const u = req.session.user;
    // Production supervisors see production/stock reports only; money reports are for admin/auditor/owner.
    if (u.role === 'PRODUCTION' && !['production', 'stock-summary', 'stock-ledger', 'purchase-register'].includes(req.params.key)) throw bad('Your role cannot open this report');
    const { from, to } = range(req);
    const rep = await reports.run(db, req.params.key, { from, to, itemId: req.query.itemId ? Number(req.query.itemId) : null, type: req.query.type || null });
    if (!rep) throw notFound('Unknown report');
    const fmt = (req.query.format || 'json').toLowerCase(), fname = `${req.params.key}_${from}_${to}`;
    const biz = await db.one('select name from business where id=1'), meta = { business: biz.name, generated: nowTs(), user: u.username };
    if (fmt === 'json') return res.json(rep);
    if (fmt === 'csv') { res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${fname}.csv"` }); return res.send(ex.toCsv(rep)); }
    if (fmt === 'xlsx') { res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${fname}.xlsx"` }); return res.send(await ex.toXlsx(rep, meta)); }
    if (fmt === 'pdf') { res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${fname}.pdf"` }); return res.send(await ex.toPdf(rep, meta)); }
    throw bad('format must be json, csv, xlsx or pdf');
  }));
  r.get('/export/tally', allow('ADMIN', 'AUDITOR', 'OWNER'), wrap(async (req, res) => {
    const { from, to } = range(req);
    res.set({ 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': `attachment; filename="tally_${from}_${to}.xml"` });
    res.send(await tally.build(db, from, to));
  }));
  return r;
};
