'use strict';
const express = require('express');
const { D } = require('../money');
const { wrap, int, range, req$ } = require('../http');
const { allow } = require('../auth');
const { bad, notFound, forbidden } = require('../errors');
const { audit } = require('../audit');
const { nowTs, today, monthStart, monthEnd } = require('../clock');
const S = require('../services/sales');
const pdf = require('../pdf');
const einv = require('../services/einvoice');

async function invoicePdf(db, id) {
  const inv = await S.invoiceDetail(db, id), biz = await db.one('select * from business where id=1');
  return pdf.taxDocument('INV', inv, biz, inv.lines, inv.state_name);
}
async function cnPdf(db, invoiceId) {
  const inv = await S.invoiceDetail(db, invoiceId); if (!inv.creditNote) throw notFound('No credit note');
  const biz = await db.one('select * from business where id=1');
  const cn = { ...inv.creditNote, invoice_no: inv.invoice_no, buyer_name: inv.buyer_name, buyer_address: inv.buyer_address, buyer_gstin: inv.buyer_gstin, buyer_state_code: inv.buyer_state_code, place_of_supply: inv.place_of_supply, supply_type: inv.supply_type };
  return pdf.taxDocument('CN', cn, biz, inv.lines, inv.state_name);
}
const sendPdf = (res, buf, name) => { res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${name}"` }); res.send(buf); };

module.exports = db => {
  const r = express.Router(), pub = express.Router();
  const U = req => req.session.user;
  const BACK = ['ADMIN', 'AUDITOR', 'OWNER', 'PRODUCTION'], ACCT = ['ADMIN', 'AUDITOR', 'OWNER'];
  const base = req => process.env.PUBLIC_URL || `${req.get('x-forwarded-proto') || req.protocol}://${req.get('host')}`;

  // ---- orders ----
  r.get('/orders', allow('ADMIN', 'SALES', 'AUDITOR', 'OWNER', 'PRODUCTION'), wrap(async (req, res) => res.json(await S.listOrders(db, U(req), { status: req.query.status, salesmanId: req.query.salesmanId ? int(req.query.salesmanId) : null }))));
  r.get('/orders/my/customer-sales', allow('SALES'), wrap(async (req, res) => { const { from, to } = range(req); res.json(await S.salesmanCustomerSales(db, U(req), from, to)); }));
  r.get('/orders/:id', allow('ADMIN', 'SALES', 'AUDITOR', 'OWNER'), wrap(async (req, res) => res.json(await S.orderDetail(db, int(req.params.id), U(req)))));
  r.post('/orders', allow('SALES', 'ADMIN'), wrap(async (req, res) => { const out = await db.tx(tx => S.createOrder(tx, U(req), req.body)); res.status(out.duplicate ? 200 : 201).json(out); }));
  // Offline outbox sync: each order is its own transaction; a bad one never blocks the rest.
  r.post('/orders/sync', allow('SALES', 'ADMIN'), wrap(async (req, res) => {
    const results = [];
    for (const o of (req.body.orders || []).slice(0, 100)) {
      try { const out = await db.tx(tx => S.createOrder(tx, U(req), { ...o, source: 'OFFLINE' })); results.push({ clientId: o.clientId, ok: true, orderId: out.id, orderNo: out.orderNo, duplicate: out.duplicate }); }
      catch (e) { results.push({ clientId: o.clientId, ok: false, status: e.status || 500, error: e.message }); }
    }
    res.json({ results });
  }));
  r.post('/orders/:id/approve', allow('ADMIN'), wrap(async (req, res) => res.json(await db.tx(tx => S.approveOrder(tx, U(req), int(req.params.id), req.body)))));
  r.post('/orders/:id/reject', allow('ADMIN'), wrap(async (req, res) => { await db.tx(tx => S.rejectOrder(tx, U(req), int(req.params.id), req.body.reason)); res.json({ ok: true }); }));
  r.post('/orders/:id/invoice', allow('ADMIN'), wrap(async (req, res) => res.status(201).json(await db.tx(tx => S.createInvoice(tx, U(req), int(req.params.id), req.body)))));
  r.post('/orders/:id/dispatch', allow('ADMIN'), wrap(async (req, res) => res.json(await db.tx(tx => S.dispatchOrder(tx, U(req), int(req.params.id), req.body)))));

  // ---- invoices ----
  r.get('/invoices', allow(...ACCT), wrap(async (req, res) => { const { from, to } = range(req); res.json(await S.listInvoices(db, { from: req.query.all ? undefined : from, to: req.query.all ? undefined : to, customerId: req.query.customerId, status: req.query.status })); }));
  r.get('/invoices/:id', allow(...ACCT), wrap(async (req, res) => res.json(await S.invoiceDetail(db, int(req.params.id)))));
  r.patch('/invoices/:id', allow('ADMIN'), wrap(async (req, res) => { await db.tx(tx => S.updateInvoiceMeta(tx, U(req), int(req.params.id), req.body)); res.json({ ok: true }); }));
  r.post('/invoices/:id/cancel', allow('ADMIN'), wrap(async (req, res) => res.json(await db.tx(tx => S.cancelInvoice(tx, U(req), int(req.params.id), req.body)))));
  r.get('/invoices/:id/pdf', allow(...ACCT), wrap(async (req, res) => { const inv = await S.invoiceDetail(db, int(req.params.id)); sendPdf(res, await invoicePdf(db, inv.id), inv.invoice_no.replace(/\//g, '-') + '.pdf'); }));
  r.get('/invoices/:id/credit-note/pdf', allow(...ACCT), wrap(async (req, res) => sendPdf(res, await cnPdf(db, int(req.params.id)), 'credit-note.pdf')));
  r.get('/invoices/:id/share', allow('ADMIN', 'AUDITOR', 'OWNER'), wrap(async (req, res) => {
    const inv = await S.invoiceDetail(db, int(req.params.id));
    const cust = await db.one('select phone, email from customers where id=$1', [inv.customer_id]);
    const url = `${base(req)}/s/${inv.share_token}`;
    const msg = `Dear ${inv.buyer_name}, your invoice ${inv.invoice_no} for Rs. ${D(inv.total).toFixed(2)} is ready: ${url}`;
    const phone = (cust.phone || '').replace(/\D/g, '');
    res.json({ url, message: msg, whatsappUrl: `https://wa.me/${phone ? (phone.length === 10 ? '91' + phone : phone) : ''}?text=${encodeURIComponent(msg)}`, mailto: `mailto:${cust.email || ''}?subject=${encodeURIComponent('Invoice ' + inv.invoice_no)}&body=${encodeURIComponent(msg)}` });
  }));
  r.get('/invoices/:id/einvoice', allow('ADMIN', 'AUDITOR', 'OWNER'), wrap(async (req, res) => { const out = await einv.build(db, int(req.params.id)); if (!out) throw notFound(); res.json(out); }));

  // ---- payments ----
  r.get('/payments', allow(...ACCT), wrap(async (req, res) => {
    const { from, to } = range(req);
    res.json(await db.query(`select p.*, c.name as customer, i.invoice_no from payments p join customers c on c.id=p.customer_id join invoices i on i.id=p.invoice_id where p.paid_on between $1 and $2 order by p.id desc`, [from, to]));
  }));
  r.post('/payments', allow('ADMIN'), wrap(async (req, res) => { req$(req.body, 'invoiceId', 'amount'); res.status(201).json(await db.tx(tx => S.recordPayment(tx, U(req), req.body))); }));
  r.get('/customers-balances', allow(...ACCT), wrap(async (req, res) => res.json(await S.customerBalances(db, req.query.asOn))));

  // ---- visits (GPS check-in, offline capable) ----
  const saveVisit = async (tx, user, v) => {
    if (!v.clientId) throw bad('clientId required');
    if (await tx.one('select 1 x from visits where client_id=$1', [v.clientId])) return { duplicate: true };
    if (!(await tx.one('select 1 x from customers where id=$1', [v.customerId]))) throw bad('Unknown customer');
    const lat = v.lat === undefined || v.lat === null ? null : D(v.lat), lng = v.lng === undefined || v.lng === null ? null : D(v.lng);
    if (lat && (lat.abs().gt(90) || lng.abs().gt(180))) throw bad('Invalid coordinates');
    await tx.query('insert into visits(client_id,salesman_id,customer_id,lat,lng,accuracy_m,note,visited_at,received_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [v.clientId, user.id, v.customerId, lat ? lat.toFixed(6) : null, lng ? lng.toFixed(6) : null, v.accuracy ? D(v.accuracy).toFixed(1) : null, v.note || null, (v.visitedAt || nowTs()).replace('T', ' ').slice(0, 19), nowTs()]);
    return { duplicate: false };
  };
  r.post('/visits/sync', allow('SALES'), wrap(async (req, res) => {
    const results = [];
    for (const v of (req.body.visits || []).slice(0, 200)) { try { results.push({ clientId: v.clientId, ok: true, ...(await db.tx(tx => saveVisit(tx, U(req), v))) }); } catch (e) { results.push({ clientId: v.clientId, ok: false, error: e.message }); } }
    res.json({ results });
  }));
  r.get('/visits', allow('SALES', ...ACCT), wrap(async (req, res) => {
    const { from, to } = range(req), u = U(req); const p = [from + ' 00:00:00', to + ' 23:59:59']; let w = '';
    if (u.role === 'SALES') { p.push(u.id); w = ' and v.salesman_id=$3'; }
    res.json(await db.query(`select v.*, c.name as customer, u.full_name as salesman from visits v join customers c on c.id=v.customer_id join users u on u.id=v.salesman_id where v.visited_at between $1 and $2 ${w} order by v.visited_at desc`, p));
  }));

  // ---- public share links (unguessable token; read-only PDF) ----
  pub.get('/s/:token', wrap(async (req, res) => {
    const inv = await db.one('select id from invoices where share_token=$1', [req.params.token]);
    if (inv) return sendPdf(res, await invoicePdf(db, inv.id), 'invoice.pdf');
    const cn = await db.one('select invoice_id from credit_notes where share_token=$1', [req.params.token]);
    if (cn) return sendPdf(res, await cnPdf(db, cn.invoice_id), 'credit-note.pdf');
    throw notFound('Link not found');
  }));
  return { api: r, pub };
};
