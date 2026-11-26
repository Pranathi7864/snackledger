'use strict';
const path = require('path');
const express = require('express');
const config = require('./config');
const auth = require('./auth');
const { wrap } = require('./http');
const { AppError } = require('./errors');
const { csrfFor } = auth;

function createApp(db) {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'" });
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.use(auth.sessionMiddleware(db));
  app.get('/api/health', wrap(async (req, res) => { await db.one('select 1 x'); res.json({ ok: true, db: db.kind }); }));
  const pub = require('./routes/sales')(db).pub;
  app.use(pub);                                   // public invoice share links (token protected)
  app.use(auth.csrfGuard);

  app.post('/api/auth/login', wrap(async (req, res) => {
    const user = await auth.login(db, req.body.username, req.body.password, req.ip);
    await new Promise((ok, no) => req.session.regenerate(e => (e ? no(e) : ok())));
    req.session.user = user;
    res.json({ user, csrf: csrfFor(req.sessionID) });
  }));
  app.get('/api/auth/me', (req, res) => (req.session.user ? res.json({ user: req.session.user, csrf: csrfFor(req.sessionID) }) : res.status(401).json({ error: 'Not signed in' })));
  app.post('/api/auth/logout', (req, res) => req.session.destroy(() => { res.clearCookie('sl.sid'); res.json({ ok: true }); }));
  app.post('/api/auth/password', auth.requireLogin, wrap(async (req, res) => {
    const { oldPassword, newPassword } = req.body, u = req.session.user;
    if (!newPassword || String(newPassword).length < 8) throw new AppError(400, 'New password must be at least 8 characters');
    await auth.login(db, u.username, oldPassword, req.ip);
    await db.query('update users set password_hash=$1 where id=$2', [auth.hashPassword(newPassword), u.id]);
    res.json({ ok: true });
  }));

  app.use('/api', auth.requireLogin);
  app.use('/api', require('./routes/masters')(db));
  app.use('/api', require('./routes/ops')(db));
  app.use('/api', require('./routes/sales')(db).api);
  app.use('/api', require('./routes/reports')(db));
  app.use('/api', (req, res, next) => next(new AppError(404, 'Unknown API route')));

  const pubdir = path.join(__dirname, '..', 'public');
  app.use(express.static(pubdir, { etag: true, setHeaders: (res, p) => { if (/sw\.js$|index\.html$|\.webmanifest$|manifest\.json$/.test(p)) res.set('Cache-Control', 'no-cache'); } }));
  app.get('*', (req, res) => res.sendFile(path.join(pubdir, 'index.html')));

  app.use((err, req, res, next) => {            // eslint-disable-line no-unused-vars
    if (err instanceof AppError) return res.status(err.status).json({ error: err.message, ...(err.extra ? { details: err.extra } : {}) });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    if (err.code === '23505') return res.status(409).json({ error: 'Duplicate value: that record already exists' });
    if (err.code === '23503') return res.status(409).json({ error: 'Referenced record does not exist or is still in use' });
    if (err.code === '23514') return res.status(400).json({ error: 'Value rejected by a database check: ' + (err.constraint || err.message) });
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  });
  return app;
}
module.exports = { createApp };
