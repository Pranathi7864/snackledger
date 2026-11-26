'use strict';
const config = require('./config');
const { createDb } = require('./db');
const { seed } = require('../db/seed');
const units = require('./units');
const { createApp } = require('./app');

(async () => {
  const db = await createDb();
  await units.load(db);
  if (config.autoSeed && (await seed(db, { demoPassword: config.demoPassword }))) console.log('Seeded benchmark master data (users: admin, salesa, salesb, production, auditor, owner)');
  await units.load(db);
  const app = createApp(db);
  app.listen(config.port, () => console.log(`SnackLedger on http://localhost:${config.port}  [db: ${db.kind}]`));
  const stop = async () => { await db.close(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
})().catch(e => { console.error(e); process.exit(1); });
