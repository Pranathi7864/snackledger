const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { wrap, signedIn } = require('../lib/http');
const { bad, HttpError } = require('../lib/errors');
const { audit } = require('../services/common');

const r = express.Router();
const fails = new Map();                                   // naive login throttle: 5 failures -> 1 minute lock per user+ip
const key = (req) => `${(req.body.username || '').toLowerCase()}|${req.ip}`;

const publicUser = (u) => ({ id: u.id, username: u.username, full_name: u.full_name, roles: u.roles });

r.post('/login', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) throw bad('Enter username and password');
  const k = key(req), f = fails.get(k);
  if (f && f.n >= 5 && Date.now() - f.t < 60000) throw new HttpError(429, 'Too many failed attempts. Try again in a minute.');
  const { rows: [u] } = await db.query('SELECT * FROM users WHERE lower(username)=lower($1)', [username]);
  const ok = u && u.active && await bcrypt.compare(String(password), u.password_hash);
  if (!ok) { fails.set(k, { n: (f && Date.now() - f.t < 60000 ? f.n : 0) + 1, t: Date.now() }); throw new HttpError(401, 'Wrong username or password'); }
  fails.delete(k);
  await new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));   // new session id on login
  req.session.uid = u.id;
  await db.query('SELECT 1');
  res.json({ user: publicUser(u) });
}));
r.post('/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
r.get('/me', wrap(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  res.json({ user: publicUser(req.user) });
}));
r.post('/password', signedIn, wrap(async (req, res) => {
  const { current, next } = req.body || {};
  if (!next || String(next).length < 6) throw bad('New password must be at least 6 characters');
  const { rows: [u] } = await db.query('SELECT * FROM users WHERE id=$1', [req.user.id]);
  if (!(await bcrypt.compare(String(current || ''), u.password_hash))) throw new HttpError(403, 'Current password is wrong');
  await db.tx(async (c) => {
    await c.query('UPDATE users SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(String(next), 10), u.id]);
    await audit(c, req.user, { action: 'PASSWORD', entity: 'user', entityId: u.id, summary: `${u.username} changed their password` });
  });
  res.json({ ok: true });
}));
module.exports = r;
