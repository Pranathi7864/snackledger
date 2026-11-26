'use strict';
// Thin adapter so the same SQL runs on node-postgres (production) and PGlite (embedded Postgres: zero-install demo + tests).
const fs = require('fs');
const path = require('path');
const config = require('./config');

async function createDb(opts = {}) {
  const url = opts.databaseUrl !== undefined ? opts.databaseUrl : config.databaseUrl;
  let impl;
  if (url) {
    const { Pool, types } = require('pg');
    types.setTypeParser(1082, v => v);     // DATE      -> 'YYYY-MM-DD'
    types.setTypeParser(1114, v => v);     // TIMESTAMP -> string (wall-clock IST, written by the app)
    types.setTypeParser(1700, v => v);     // NUMERIC   -> string (never a float)
    const pool = new Pool({ connectionString: url });
    impl = {
      query: async (sql, p) => (await pool.query(sql, p)).rows,
      exec: async sql => { await pool.query(sql); },
      tx: async fn => {
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          const r = await fn({ query: async (sql, p) => (await c.query(sql, p)).rows });
          await c.query('COMMIT');
          return r;
        } catch (e) { try { await c.query('ROLLBACK'); } catch (_) {} throw e; } finally { c.release(); }
      },
      close: () => pool.end(),
    };
  } else {
    const { PGlite } = require('@electric-sql/pglite');
    const dir = opts.dataDir !== undefined ? opts.dataDir : config.dataDir;
    if (dir && !dir.startsWith('memory://')) fs.mkdirSync(path.dirname(dir), { recursive: true });
    const pg = new PGlite(dir || 'memory://', { parsers: { 1082: v => v, 1114: v => v, 1700: v => v } });
    await pg.waitReady;
    impl = {
      query: async (sql, p) => (await pg.query(sql, p)).rows,
      exec: async sql => { await pg.exec(sql); },
      tx: async fn => pg.transaction(async t => fn({ query: async (sql, p) => (await t.query(sql, p)).rows })),
      close: () => pg.close(),
    };
  }
  const withOne = t => { t.one = async (sql, p) => (await t.query(sql, p))[0] || null; return t; };
  const db = {
    ...impl,
    tx: fn => impl.tx(t => fn(withOne(t))),
    one: async (sql, p) => (await impl.query(sql, p))[0] || null,
    kind: url ? 'postgres' : 'pglite',
  };
  await db.exec(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));
  return db;
}
module.exports = { createDb };
