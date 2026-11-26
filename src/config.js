'use strict';
const path = require('path');
module.exports = {
  port: Number(process.env.PORT || 8080),
  databaseUrl: process.env.DATABASE_URL || '',                      // empty => embedded Postgres (PGlite)
  dataDir: process.env.DATA_DIR || path.join(__dirname, '..', 'data', 'pgdata'),
  sessionSecret: process.env.SESSION_SECRET || 'dev-only-change-me',
  tz: 'Asia/Kolkata',                                               // single business timezone
  secureCookies: process.env.COOKIE_SECURE === '1',
  autoSeed: process.env.AUTO_SEED !== '0',
  demoPassword: process.env.DEMO_PASSWORD || 'demo1234',
};
