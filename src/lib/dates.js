const { tz } = require('../config');
// Business dates are in IST regardless of where the server runs.
const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(Date.parse(s));
const monthStart = (d) => d.slice(0, 7) + '-01';
function addDays(d, n) { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
function range(q) {                        // ?from=&to= with sensible defaults: the current month
  const today = todayIST();
  const from = isDate(q.from) ? q.from : monthStart(today);
  const to = isDate(q.to) ? q.to : today;
  return { from, to };
}
module.exports = { todayIST, isDate, monthStart, addDays, range };
