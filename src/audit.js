'use strict';
const { nowTs } = require('./clock');
const j = v => (v === undefined || v === null ? null : JSON.stringify(v));
async function audit(tx, actor, action, entity, entityId, summary, { before, after, reason } = {}) {
  await tx.query('insert into audit_log(ts,actor,action,entity,entity_id,summary,before_json,after_json,reason) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [nowTs(), actor, action, entity, entityId ?? null, summary || null, j(before), j(after), reason || null]);
}
module.exports = { audit };
