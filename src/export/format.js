// Display helpers shared by the exporters.
const inr = (v, dp = 2) => {                    // Indian digit grouping: 1,23,456.50
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v); if (!isFinite(n)) return String(v);
  const [i, d] = Math.abs(n).toFixed(dp).split('.');
  const last3 = i.slice(-3), rest = i.slice(0, -3);
  const g = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3;
  return (n < 0 ? '-' : '') + g + (dp ? '.' + d : '');
};
const fmtCell = (v, type) => {
  if (v === null || v === undefined) return '';
  if (type === 'money') return inr(v, 2);
  if (type === 'rate') return Number(v).toFixed(4);
  if (type === 'pct') return v === '' ? '' : Number(v).toFixed(2);
  if (type === 'date') return String(v).slice(0, 10);
  if (type === 'datetime') return new Date(v).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });
  return String(v);
};
const dmy = (d) => String(d).slice(0, 10).split('-').reverse().join('/');
module.exports = { inr, fmtCell, dmy };
