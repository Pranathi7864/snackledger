// Tally-compatible voucher XML (import via Gateway of Tally > Import > Vouchers). Ledger names must exist or be auto-created in Tally.
const esc = (s) => String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
const ymd = (d) => String(d).slice(0, 10).replace(/-/g, '');
const entry = (name, amount, deemedPositive) => `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${esc(name)}</LEDGERNAME><ISDEEMEDPOSITIVE>${deemedPositive ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE><AMOUNT>${deemedPositive ? '-' : ''}${Number(amount).toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST>`;
const wrap = (company, vouchers) => `<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${esc(company)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>\n${vouchers.join('\n')}\n</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>\n`;

function salesXml(company, invoices) {
  return wrap(company, invoices.map((i) => `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="Sales" ACTION="Create"><DATE>${ymd(i.invoice_date)}</DATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>${esc(i.invoice_no)}</VOUCHERNUMBER><PARTYLEDGERNAME>${esc(i.customer)}</PARTYLEDGERNAME><NARRATION>Order ${esc(i.order_no)}</NARRATION>
${entry(i.customer, i.total, true)}
${entry('Sales', i.taxable, false)}
${Number(i.cgst) ? entry('CGST', i.cgst, false) : ''}${Number(i.sgst) ? entry('SGST', i.sgst, false) : ''}${Number(i.igst) ? entry('IGST', i.igst, false) : ''}
</VOUCHER></TALLYMESSAGE>`));
}
function purchaseXml(company, rows) {
  return wrap(company, rows.map((p) => `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="Purchase" ACTION="Create"><DATE>${ymd(p.purchase_date)}</DATE><VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME><VOUCHERNUMBER>${esc(p.purchase_no)}</VOUCHERNUMBER><PARTYLEDGERNAME>${esc(p.supplier)}</PARTYLEDGERNAME><NARRATION>Supplier invoice ${esc(p.supplier_invoice || '')}</NARRATION>
${entry(p.supplier, p.total, false)}
${entry('Purchases', p.taxable, true)}
${Number(p.gst_amount) ? entry('Input GST', p.gst_amount, true) : ''}
</VOUCHER></TALLYMESSAGE>`));
}
module.exports = { salesXml, purchaseXml };
