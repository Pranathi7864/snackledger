const PDFDocument = require('pdfkit');
const { inr, dmy } = require('./format');
const { rupeesInWords } = require('../lib/words');

/** Renders a tax invoice or credit note. `doc` = invoice detail (see sales.getInvoice); `cn` = credit note row when rendering a credit note. */
function render(res, inv, cn = null) {
  const pdf = new PDFDocument({ size: 'A4', margin: 34 });
  pdf.pipe(res);
  const s = inv.seller, b = inv.buyer, intra = inv.supply_type === 'INTRA';
  const L = 34, W = pdf.page.width - 68;
  const title = cn ? 'CREDIT NOTE' : 'TAX INVOICE';
  const sign = cn ? -1 : 1;
  const m = (v) => inr(sign * Number(v));

  pdf.font('Helvetica-Bold').fontSize(16).fillColor('#222').text(title, L, 34, { width: W, align: 'center' });
  pdf.font('Helvetica').fontSize(7.5).fillColor('#777').text(cn ? 'Issued against a cancelled tax invoice' : 'Original for recipient', { width: W, align: 'center' });
  pdf.moveDown(0.6);
  let y = pdf.y;
  pdf.rect(L, y, W, 78).lineWidth(0.6).strokeColor('#999').stroke();
  pdf.moveTo(L + W * 0.58, y).lineTo(L + W * 0.58, y + 78).stroke();
  pdf.font('Helvetica-Bold').fontSize(11).fillColor('#222').text(s.name, L + 8, y + 7, { width: W * 0.58 - 16 });
  pdf.font('Helvetica').fontSize(8).fillColor('#333').text(`${s.address}\nGSTIN: ${s.gstin}    State: ${s.state} (${s.state_code})\nPhone: ${s.phone || '-'}    Email: ${s.email || '-'}\nFSSAI Lic. No: ${s.fssai || '-'}`, L + 8, y + 22, { width: W * 0.58 - 16 });
  const rx = L + W * 0.58 + 8, rw = W * 0.42 - 16;
  const kv = (k, v, yy) => { pdf.font('Helvetica').fontSize(8).fillColor('#666').text(k, rx, yy, { width: 70 }); pdf.font('Helvetica-Bold').fillColor('#222').text(v, rx + 72, yy, { width: rw - 72 }); };
  kv(cn ? 'Credit note no.' : 'Invoice no.', cn ? cn.cn_no : inv.invoice_no, y + 8);
  kv('Date', dmy(cn ? cn.cn_date : inv.invoice_date), y + 21);
  if (cn) kv('Against invoice', `${inv.invoice_no} (${dmy(inv.invoice_date)})`, y + 34);
  else kv('Order ref.', inv.order_no, y + 34);
  kv('Place of supply', `${inv.pos_state} (${inv.pos_code})`, y + 47);
  kv('Supply type', intra ? 'Intra-state (CGST + SGST)' : 'Inter-state (IGST)', y + 60);
  y += 84;
  pdf.rect(L, y, W, 58).stroke();
  pdf.font('Helvetica-Bold').fontSize(8).fillColor('#7a3e00').text('BILL TO / SHIP TO', L + 8, y + 6);
  pdf.font('Helvetica-Bold').fontSize(10).fillColor('#222').text(b.name, L + 8, y + 18);
  pdf.font('Helvetica').fontSize(8).fillColor('#333').text(`${b.address || ''}\nGSTIN: ${b.gstin || 'Unregistered'}    State: ${b.state} (${b.state_code})${b.phone ? '    Phone: ' + b.phone : ''}`, L + 8, y + 31, { width: W - 16 });
  y += 68;

  const cols = intra
    ? [['#', 18, 'c'], ['Description', 118, 'l'], ['HSN', 42, 'l'], ['Qty', 30, 'r'], ['Rate', 38, 'r'], ['Taxable', 52, 'r'], ['CGST %', 28, 'r'], ['CGST', 42, 'r'], ['SGST %', 28, 'r'], ['SGST', 42, 'r'], ['Total', 0, 'r']]
    : [['#', 18, 'c'], ['Description', 150, 'l'], ['HSN', 46, 'l'], ['Qty', 34, 'r'], ['Rate', 44, 'r'], ['Taxable', 60, 'r'], ['IGST %', 34, 'r'], ['IGST', 52, 'r'], ['Total', 0, 'r']];
  const fixed = cols.reduce((a, c) => a + c[1], 0); cols[cols.length - 1][1] = W - fixed;
  const row = (vals, bold, fill) => {
    pdf.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.6);
    const h = Math.max(...vals.map((v, i) => pdf.heightOfString(String(v), { width: cols[i][1] - 4 }))) + 6;
    if (fill) pdf.rect(L, y, W, h).fill(fill);
    let x = L;
    vals.forEach((v, i) => { pdf.fillColor('#222').text(String(v), x + 2, y + 3, { width: cols[i][1] - 4, align: cols[i][2] === 'r' ? 'right' : cols[i][2] === 'c' ? 'center' : 'left' }); x += cols[i][1]; });
    y += h; pdf.moveTo(L, y).lineTo(L + W, y).lineWidth(0.3).strokeColor('#bbb').stroke();
  };
  row(cols.map((c) => c[0]), true, '#f1e3cf');
  inv.lines.forEach((l, i) => {
    const base = [i + 1, l.description, l.hsn || '', Number(l.qty), m(l.rate), m(l.taxable)];
    const tax = intra ? [Number(l.gst_rate) / 2, m(l.cgst), Number(l.gst_rate) / 2, m(l.sgst)] : [Number(l.gst_rate), m(l.igst)];
    row([...base, ...tax, m(l.total)]);
  });
  pdf.rect(L, y - 0, W, 0).stroke();
  y += 8;
  const tot = cn || inv;
  const box = (k, v, bold) => { pdf.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 10 : 8.5).fillColor('#222').text(k, L + W - 220, y, { width: 120 }).text(v, L + W - 100, y, { width: 100, align: 'right' }); y += bold ? 17 : 13; };
  box('Taxable value', m(tot.taxable));
  if (intra) { box('CGST', m(tot.cgst)); box('SGST', m(tot.sgst)); } else box('IGST', m(tot.igst));
  pdf.moveTo(L + W - 220, y).lineTo(L + W, y).strokeColor('#999').stroke(); y += 4;
  box(cn ? 'Credit note value' : 'Invoice total (Rs.)', m(tot.total), true);
  y += 4;
  pdf.font('Helvetica-Bold').fontSize(8).fillColor('#333').text('Amount in words: ', L, y, { continued: true }).font('Helvetica').text(rupeesInWords(Number(tot.total).toFixed(2)), { width: W });
  y = pdf.y + 8;
  if (cn) { pdf.font('Helvetica').fontSize(8).text(`Reason: ${cn.reason}`, L, y, { width: W }); y = pdf.y + 8; }
  else if (inv.status === 'CANCELLED') { pdf.font('Helvetica-Bold').fontSize(9).fillColor('#b00020').text('This invoice has been CANCELLED' + (inv.credit_note ? ` (credit note ${inv.credit_note.cn_no})` : ''), L, y); y = pdf.y + 8; }
  if (!cn && s.bank) { pdf.font('Helvetica').fontSize(8).fillColor('#333').text('Bank details: ' + s.bank, L, y, { width: W }); y = pdf.y + 4; }
  pdf.font('Helvetica').fontSize(7.2).fillColor('#666').text(s.declaration || '', L, y, { width: W * 0.62 });
  pdf.font('Helvetica-Bold').fontSize(8.5).fillColor('#222').text(`For ${s.name}`, L + W * 0.66, y, { width: W * 0.34, align: 'right' });
  pdf.font('Helvetica').fontSize(8).text('Authorised signatory', L + W * 0.66, y + 38, { width: W * 0.34, align: 'right' });
  pdf.font('Helvetica').fontSize(7).fillColor('#999').text('This is a computer-generated document. Prototype output for demonstration; verify against current GST rules before real use.', L, pdf.page.height - 48, { width: W, align: 'center', lineBreak: false });

  if (!cn && inv.status === 'CANCELLED') {
    pdf.save().rotate(-30, { origin: [pdf.page.width / 2, pdf.page.height / 2] }).font('Helvetica-Bold').fontSize(80).fillColor('#b00020').fillOpacity(0.12)
      .text('CANCELLED', 60, pdf.page.height / 2 - 40, { width: pdf.page.width - 120, align: 'center', lineBreak: false }).restore();
  }
  pdf.end();
}
module.exports = { render };
