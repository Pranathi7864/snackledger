const db = require('../db');

const DEFAULT_SETTINGS = {
  factory_name: 'Sri Murugan Snacks (Demo)',
  factory_gstin: '33AAAAA0000A1Z5',
  factory_address: '12 Industrial Estate, Tiruchirappalli, Tamil Nadu 620015',
  factory_state: 'Tamil Nadu',
  factory_state_code: '33',
  factory_phone: '0431-0000000',
  factory_email: 'accounts@example.com',
  fssai_no: '12345678901234',
  invoice_prefix: 'SL',
  variance_tolerance_pct: '3',
  bank_details: 'Demo Bank, A/c 0000000000, IFSC DEMO0000001',
  declaration: 'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
};

async function getSettings(c = db) {
  const { rows } = await c.query('SELECT key, value FROM settings');
  const s = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key] = r.value;
  return s;
}
async function saveSettings(c, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in DEFAULT_SETTINGS)) continue;
    await c.query('INSERT INTO settings(key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2', [k, String(v ?? '')]);
  }
}

/** Atomic per-financial-year counter. The row lock serialises concurrent callers, so numbers are gap-free per committed transaction. */
async function nextSeq(c, docType, fy) {
  const { rows } = await c.query(
    `INSERT INTO doc_sequences(doc_type, fy, last_no) VALUES ($1,$2,1)
     ON CONFLICT (doc_type, fy) DO UPDATE SET last_no = doc_sequences.last_no + 1 RETURNING last_no`, [docType, fy]);
  return rows[0].last_no;
}

/** Append a row to the audit trail: who, what, when, before/after, reason. */
async function audit(c, user, { action, entity, entityId, summary, before, after, reason }) {
  await c.query(
    `INSERT INTO audit_log(user_id, username, action, entity, entity_id, summary, before, after, reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [user?.id ?? null, user?.username ?? 'system', action, entity, entityId == null ? null : String(entityId), summary ?? null,
     before === undefined ? null : JSON.stringify(before), after === undefined ? null : JSON.stringify(after), reason ?? null]);
}
module.exports = { getSettings, saveSettings, nextSeq, audit, DEFAULT_SETTINGS };
