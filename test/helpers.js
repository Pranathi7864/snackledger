'use strict';
const { createDb } = require('../src/db');
const { seed } = require('../db/seed');
const units = require('../src/units');
const { createApp } = require('../src/app');

async function boot() {
  const url = process.env.TEST_DATABASE_URL || '';              // set to run the very same suite on real PostgreSQL
  if (url) { const { Client: PgC } = require('pg'); const c = new PgC({ connectionString: url }); await c.connect(); await c.query('drop schema public cascade; create schema public'); await c.end(); }
  const db = await createDb({ dataDir: 'memory://', databaseUrl: url });
  await seed(db); await units.load(db);
  const app = createApp(db);
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { db, base, close: async () => { server.close(); await db.close(); } };
}
class Client {
  constructor(base) { this.base = base; this.cookie = ''; this.csrf = ''; }
  async req(method, path, body, raw) {
    const res = await fetch(this.base + path, { method, redirect: 'manual', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(this.cookie ? { Cookie: this.cookie } : {}), ...(this.csrf ? { 'X-CSRF-Token': this.csrf } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const sc = res.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0];
    if (raw) return res;
    const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  }
  get(p) { return this.req('GET', p); } post(p, b) { return this.req('POST', p, b || {}); } put(p, b) { return this.req('PUT', p, b); } patch(p, b) { return this.req('PATCH', p, b); } del(p) { return this.req('DELETE', p); }
  async login(username, password = 'demo1234') { const r = await this.req('POST', '/api/auth/login', { username, password }); if (r.status === 200) this.csrf = r.data.csrf; return r; }
}
async function as(base, u) { const c = new Client(base); const r = await c.login(u); if (r.status !== 200) throw new Error('login failed ' + u); return c; }
module.exports = { boot, Client, as };
