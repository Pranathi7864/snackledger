const { D, r2 } = require('./dec');

// GSTIN: 2-digit state code + 10-char PAN + entity digit + 'Z' + checksum char. Format check only (dummy data has no real checksum).
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const isGstin = (g) => GSTIN_RE.test(String(g || '').toUpperCase());

const STATE_CODES = {
  'Jammu and Kashmir': '01', 'Himachal Pradesh': '02', 'Punjab': '03', 'Chandigarh': '04', 'Uttarakhand': '05', 'Haryana': '06',
  'Delhi': '07', 'Rajasthan': '08', 'Uttar Pradesh': '09', 'Bihar': '10', 'Sikkim': '11', 'Arunachal Pradesh': '12',
  'Nagaland': '13', 'Manipur': '14', 'Mizoram': '15', 'Tripura': '16', 'Meghalaya': '17', 'Assam': '18', 'West Bengal': '19',
  'Jharkhand': '20', 'Odisha': '21', 'Chhattisgarh': '22', 'Madhya Pradesh': '23', 'Gujarat': '24', 'Maharashtra': '27',
  'Andhra Pradesh': '37', 'Karnataka': '29', 'Goa': '30', 'Kerala': '32', 'Tamil Nadu': '33', 'Puducherry': '34',
  'Telangana': '36', 'Ladakh': '38',
};
const stateCode = (name) => STATE_CODES[name] || null;

// Place of supply drives the tax split: same state as the factory -> CGST + SGST; otherwise IGST.
const supplyType = (factoryState, customerState) =>
  String(factoryState).trim().toLowerCase() === String(customerState).trim().toLowerCase() ? 'INTRA' : 'INTER';

/** Tax for one invoice line. Rounded per line to paise (half-up); CGST and SGST are each half of the GST rate. */
function lineTax({ qty, rate, gstRate }, intra) {
  const taxable = r2(D(qty).times(rate));
  const g = D(gstRate);
  let cgst = D(0), sgst = D(0), igst = D(0);
  if (intra) { cgst = r2(taxable.times(g).div(200)); sgst = r2(taxable.times(g).div(200)); }
  else igst = r2(taxable.times(g).div(100));
  return { taxable, cgst, sgst, igst, total: taxable.plus(cgst).plus(sgst).plus(igst) };
}
function invoiceTotals(lines, intra) {
  const calc = lines.map((l) => ({ ...l, ...lineTax(l, intra) }));
  const sum = (k) => calc.reduce((a, l) => a.plus(l[k]), D(0));
  return { lines: calc, taxable: sum('taxable'), cgst: sum('cgst'), sgst: sum('sgst'), igst: sum('igst'), total: sum('total') };
}

/** Indian financial year (1 Apr - 31 Mar). Returns e.g. { fy: '2026-27', short: '26-27', startYear: 2026 }. */
function financialYear(dateStr) {
  const [y, m] = String(dateStr).slice(0, 10).split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  const end = String((start + 1) % 100).padStart(2, '0');
  return { fy: `${start}-${end}`, short: `${String(start % 100).padStart(2, '0')}-${end}`, startYear: start };
}
module.exports = { isGstin, stateCode, STATE_CODES, supplyType, lineTax, invoiceTotals, financialYear };
