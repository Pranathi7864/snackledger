#!/usr/bin/env node
'use strict';
// Wipes ALL data and reloads the Section 5 benchmark master data. Destructive: for demo databases only.
const fs = require('fs');
const config = require('../src/config');
const { createDb } = require('../src/db');
const { seed } = require('../db/seed');
(async () => {
  if (config.databaseUrl) {
    const { Client } = require('pg'); const c = new Client({ connectionString: config.databaseUrl }); await c.connect();
    await c.query('drop schema public cascade; create schema public'); await c.end();
  } else fs.rmSync(config.dataDir, { recursive: true, force: true });
  const db = await createDb(); await seed(db, { demoPassword: config.demoPassword }); await db.close();
  console.log('Database reset and benchmark master data loaded. Logins: admin, salesa, salesb, production, auditor, owner / ' + config.demoPassword);
})().catch(e => { console.error(e); process.exit(1); });
