'use strict';
// Business clock in IST. Injectable so tests can pin "now".
const config = require('./config');
let fixed = null;
function fmtParts(d) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: config.tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(d).map(x => [x.type, x.value]));
  return p;
}
const nowTs = () => { const p = fmtParts(fixed ? new Date(fixed) : new Date()); return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`; };
const today = () => nowTs().slice(0, 10);
const fyOf = date => { const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7)); const s = m >= 4 ? y : y - 1; return `${s}-${String(s + 1).slice(2)}`; };
const addDays = (date, n) => { const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const monthStart = date => date.slice(0, 8) + '01';
const monthEnd = date => { const d = new Date(date.slice(0, 8) + '01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
module.exports = { nowTs, today, fyOf, addDays, monthStart, monthEnd, daysBetween, freeze: v => { fixed = v; }, unfreeze: () => { fixed = null; } };
