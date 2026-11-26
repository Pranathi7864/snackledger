'use strict';
const { D } = require('./money');
const { bad } = require('./errors');
const { today, monthStart, monthEnd } = require('./clock');
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const int = (v, name = 'id') => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw bad(`Invalid ${name}`); return n; };
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
function range(req) {
  const t = today();
  const from = req.query.from || monthStart(t), to = req.query.to || monthEnd(t);
  if (!isDate(from) || !isDate(to)) throw bad('from/to must be YYYY-MM-DD');
  return { from, to };
}
function req$(b, ...fields) { for (const f of fields) if (b[f] === undefined || b[f] === null || b[f] === '') throw bad(`${f} is required`); }
module.exports = { wrap, int, range, isDate, req$ };
