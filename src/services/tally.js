'use strict';
// Tally Prime-compatible XML (Import Data > Vouchers). Ledger names are configurable in Tally; these defaults are documented in the README.
const { D } = require('../money');
const esc = s => String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
const tdate = d => String(d).slice(0, 10).replace(/-/g, '');
const entry = (name, amt, deemedPositive) => `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${esc(name)}</LEDGERNAME><ISDEEMEDPOSITIVE>${deemedPositive ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE><AMOUNT>${deemedPositive ? '-' : ''}${D(amt).toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST>`;
const voucher = (type, date, no, narr, entries) => `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${type}" ACTION="Create" OBJVIEW="Accounting Voucher View"><DATE>${tdate(date)}</DATE><VOUCHERTYPENAME>${type}</VOUCHERTYPENAME><VOUCHERNUMBER>${esc(no)}</VOUCHERNUMBER><NARRATION>${esc(narr)}</NARRATION>${entries.join('')}</VOUCHER></TALLYMESSAGE>`;
async function build(db, from, to) {
  const biz = await db.one('select name from business where id=1'), msgs = [];
  for (const i of await db.query("select * from invoices where invoice_date between $1 and $2 order by id", [from, to])) {
    const e = [entry(i.buyer_name, i.total, true), entry('Sales (GST)', i.taxable, false)];
    if (D(i.cgst).gt(0)) e.push(entry('Output CGST', i.cgst, false)); if (D(i.sgst).gt(0)) e.push(entry('Output SGST', i.sgst, false)); if (D(i.igst).gt(0)) e.push(entry('Output IGST', i.igst, false));
    msgs.push(voucher('Sales', i.invoice_date, i.invoice_no, 'Invoice ' + i.invoice_no, e));
  }
  for (const c of await db.query('select c.*, i.buyer_name, i.invoice_no from credit_notes c join invoices i on i.id=c.invoice_id where c.cn_date between $1 and $2', [from, to])) {
    const e = [entry(c.buyer_name, c.total, false), entry('Sales (GST)', c.taxable, true)];
    if (D(c.cgst).gt(0)) e.push(entry('Output CGST', c.cgst, true)); if (D(c.sgst).gt(0)) e.push(entry('Output SGST', c.sgst, true)); if (D(c.igst).gt(0)) e.push(entry('Output IGST', c.igst, true));
    msgs.push(voucher('Credit Note', c.cn_date, c.cn_no, 'Against ' + c.invoice_no + ': ' + c.reason, e));
  }
  for (const p of await db.query('select p.*, c.name as customer, i.invoice_no from payments p join customers c on c.id=p.customer_id join invoices i on i.id=p.invoice_id where p.paid_on between $1 and $2 order by p.id', [from, to]))
    msgs.push(voucher('Receipt', p.paid_on, p.receipt_no, `Against ${p.invoice_no} (${p.mode})`, [entry(p.mode === 'CASH' ? 'Cash' : 'Bank Account', p.amount, true), entry(p.customer, p.amount, false)]));
  for (const p of await db.query('select p.*, s.name as supplier from purchases p join suppliers s on s.id=p.supplier_id where p.bill_date between $1 and $2 order by p.id', [from, to])) {
    const e = [entry(p.supplier, p.total, false), entry('Purchases (Raw & Packing)', p.taxable, true)];
    if (D(p.tax).gt(0)) e.push(entry('Input GST', p.tax, true));
    msgs.push(voucher('Purchase', p.bill_date, p.bill_no || 'PUR-' + p.id, 'Purchase entry ' + p.id, e));
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${esc(biz.name)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>${msgs.join('')}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
}
module.exports = { build };
