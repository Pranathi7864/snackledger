'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const config = require('./config');
const { AppError } = require('./errors');
const { nowTs } = require('./clock');

class PgStore extends session.Store {
  constructor(db) { super(); this.db = db; }
  get(sid, cb) { this.db.one('select sess, expire from sessions where sid=$1', [sid]).then(r => { if (!r) return cb(null, null); if (new Date(r.expire.replace(' ', 'T') + 'Z') < new Date()) return this.destroy(sid, () => cb(null, null)); cb(null, JSON.parse(r.sess)); }).catch(cb); }
  set(sid, sess, cb) {
    const exp = new Date(sess.cookie && sess.cookie.expires ? sess.cookie.expires : Date.now() + 86400000).toISOString().replace('T', ' ').slice(0, 19);
    this.db.query('insert into sessions(sid,sess,expire) values($1,$2,$3) on conflict (sid) do update set sess=excluded.sess, expire=excluded.expire', [sid, JSON.stringify(sess), exp]).then(() => cb && cb(null)).catch(cb);
  }
  destroy(sid, cb) { this.db.query('delete from sessions where sid=$1', [sid]).then(() => cb && cb(null)).catch(cb); }
  touch(sid, sess, cb) { this.set(sid, sess, cb); }
}
const csrfFor = sid => crypto.createHmac('sha256', config.sessionSecret).update(sid).digest('hex');

function sessionMiddleware(db) {
  return session({ name: 'sl.sid', secret: config.sessionSecret, resave: false, saveUninitialized: false, rolling: true, store: new PgStore(db),
    cookie: { httpOnly: true, sameSite: 'lax', secure: config.secureCookies, maxAge: 7 * 24 * 3600 * 1000 } });
}
// Any non-GET request needs the per-session CSRF token (header X-CSRF-Token) except login.
function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path === '/api/auth/login') return next();
  const tok = req.get('X-CSRF-Token') || '';
  const want = req.sessionID ? csrfFor(req.sessionID) : '';
  if (!req.session.user || tok.length !== want.length || !crypto.timingSafeEqual(Buffer.from(tok), Buffer.from(want))) {
    if (!req.session.user) return next(new AppError(401, 'Not signed in'));
    return next(new AppError(403, 'Invalid or missing CSRF token. Reload the app and try again.'));
  }
  next();
}
const requireLogin = (req, res, next) => (req.session && req.session.user ? next() : next(new AppError(401, 'Not signed in')));
// Roles: ADMIN does everything. AUDITOR and OWNER are strictly read-only (enforced here, not just in the UI).
const allow = (...roles) => (req, res, next) => {
  const u = req.session.user;
  if (!u) return next(new AppError(401, 'Not signed in'));
  if (!roles.includes(u.role)) return next(new AppError(403, `Your role (${u.role}) cannot do this`));
  if (['AUDITOR', 'OWNER'].includes(u.role) && !['GET', 'HEAD'].includes(req.method)) return next(new AppError(403, 'Read-only role'));
  next();
};
const fails = new Map();
async function login(db, username, password, ip) {
  const key = (username || '').toLowerCase() + '|' + ip, f = fails.get(key);
  if (f && f.n >= 5 && Date.now() < f.until) throw new AppError(429, 'Too many failed attempts. Try again in a minute.');
  const u = await db.one('select * from users where lower(username)=lower($1)', [username || '']);
  const ok = u && u.active && bcrypt.compareSync(password || '', u.password_hash);
  if (!ok) { const n = (f && Date.now() < f.until + 60000 ? f.n : 0) + 1; fails.set(key, { n, until: Date.now() + 60000 }); throw new AppError(401, 'Wrong username or password'); }
  fails.delete(key);
  return { id: u.id, username: u.username, fullName: u.full_name, role: u.role };
}
const hashPassword = p => bcrypt.hashSync(p, 10);
module.exports = { sessionMiddleware, csrfGuard, csrfFor, requireLogin, allow, login, hashPassword };
