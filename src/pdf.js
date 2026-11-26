'use strict';
const PDFDocument = require('pdfkit');
const { D, str } = require('./money');
const { rupeesInWords } = require('./words');
const fmt = (v, dp = 2) => D(v).toFixed(dp).replace(/\B(?=(\d{3})+(?!\d))/g, ','); // simple grouping (display only)
const dmy = d => (d ? String(d).slice(0, 10).split('-').reverse().join('-') : '');
function collect(doc) { const bufs = []; doc.on('data', b => bufs.push(b)); return new Promise(r => doc.on('end', () => r(Buffer.concat(bufs)))); }

async function taxDocument(kind, d, biz, lines, stateName) {
  const doc = new PDFDocument({ size: 'A4', margin: 36 }); const done = collect(doc);
  const W = doc.page.width - 72;
  doc.font('Helvetica-Bold').fontSize(16).text(kind === 'CN' ? 'CREDIT NOTE' : (d.buyer_gstin ? 'TAX INVOICE' : 'TAX INVOICE (B2C)'), { align: 'center' });
  doc.moveDown(0.3).fontSize(12).text(biz.name, { align: 'center' });
  doc.font('Helvetica').fontSize(8.5).text(biz.address, { align: 'center' }).text(`GSTIN: ${biz.gstin}   PAN: ${biz.pan || '-'}   Ph: ${biz.phone || '-'}   ${biz.email || ''}`, { align: 'center' });
  doc.moveDown(0.6); const y0 = doc.y;
  doc.rect(36, y0, W, 66).stroke();
  doc.font('Helvetica-Bold').fontSize(9).text(kind === 'CN' ? 'Credit Note No.' : 'Invoice No.', 44, y0 + 6).font('Helvetica').text(kind === 'CN' ? d.cn_no : d.invoice_no, 130, y0 + 6);
  doc.font('Helvetica-Bold').text('Date', 44, y0 + 20).font('Helvetica').text(dmy(kind === 'CN' ? d.cn_date : d.invoice_date), 130, y0 + 20);
  if (kind === 'INV') { doc.font('Helvetica-Bold').text('Due date', 44, y0 + 34).font('Helvetica').text(dmy(d.due_date), 130, y0 + 34); doc.font('Helvetica-Bold').text('Vehicle', 44, y0 + 48).font('Helvetica').text(d.vehicle_no || '-', 130, y0 + 48); }
  else { doc.font('Helvetica-Bold').text('Against invoice', 44, y0 + 34).font('Helvetica').text(d.invoice_no, 130, y0 + 34); doc.font('Helvetica-Bold').text('Reason', 44, y0 + 48).font('Helvetica').text(d.reason, 130, y0 + 48, { width: 200 }); }
  doc.font('Helvetica-Bold').text('Bill to', 340, y0 + 6).font('Helvetica').text(`${d.buyer_name}\n${d.buyer_address || ''}`, 340, y0 + 18, { width: W - 310 });
  doc.text(`State: ${stateName} (${d.buyer_state_code})   GSTIN: ${d.buyer_gstin || 'Unregistered'}`, 340, y0 + 46, { width: W - 310 });
  doc.y = y0 + 74; doc.font('Helvetica').fontSize(8.5).text(`Place of supply: ${stateName} (${d.place_of_supply || d.buyer_state_code}) - ${d.supply_type === 'INTRA' ? 'Intra-state: CGST + SGST' : 'Inter-state: IGST'}`);
  doc.moveDown(0.5);
  const intra = d.supply_type === 'INTRA';
  const cols = intra ? [['#', 18], ['Description', 128], ['HSN', 50], ['Qty', 34], ['Rate', 42], ['Taxable', 56], ['CGST', 56], ['SGST', 56], ['Total', 63]] : [['#', 18], ['Description', 150], ['HSN', 55], ['Qty', 38], ['Rate', 48], ['Taxable', 66], ['IGST', 66], ['Total', 70]];
  let x = 36, y = doc.y;
  doc.rect(36, y, W, 16).fillAndStroke('#eeeeee', '#000'); doc.fillColor('#000').font('Helvetica-Bold').fontSize(8);
  for (const [h, w] of cols) { doc.text(h, x + 2, y + 4, { width: w - 4, align: ['#', 'Description', 'HSN'].includes(h) ? 'left' : 'right' }); x += w; }
  y += 16; doc.font('Helvetica').fontSize(8);
  lines.forEach((l, i) => {
    const tax = intra ? [[fmt(l.cgst) + `\n@${D(l.gst_rate).div(2).toString()}%`], [fmt(l.sgst) + `\n@${D(l.gst_rate).div(2).toString()}%`]] : [[fmt(l.igst) + `\n@${D(l.gst_rate).toString()}%`]];
    const vals = [i + 1, l.description, l.hsn, D(l.qty).toFixed(0), fmt(l.rate), fmt(l.taxable), ...tax.map(t => t[0]), fmt(l.total)];
    x = 36; doc.rect(36, y, W, 26).stroke();
    vals.forEach((v, k) => { doc.text(String(v), x + 2, y + 3, { width: cols[k][1] - 4, align: k < 3 ? 'left' : 'right' }); x += cols[k][1]; });
    y += 26;
  });
  y += 8; doc.font('Helvetica').fontSize(9);
  const row = (a, b, bold) => { doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').text(a, 340, y, { width: 110 }).text(b, 450, y, { width: W - 414, align: 'right' }); y += 14; };
  row('Taxable value', 'Rs. ' + fmt(d.taxable)); if (intra) { row('CGST', 'Rs. ' + fmt(d.cgst)); row('SGST', 'Rs. ' + fmt(d.sgst)); } else row('IGST', 'Rs. ' + fmt(d.igst));
  row(kind === 'CN' ? 'Credit total' : 'Invoice total', 'Rs. ' + fmt(d.total), true);
  doc.font('Helvetica-Bold').fontSize(8.5).text('Amount in words:', 36, y - 56).font('Helvetica').text(rupeesInWords(D(d.total).toFixed(2)), 36, y - 44, { width: 290 });
  y += 10; doc.fontSize(8).font('Helvetica-Bold').text('Bank details', 36, y).font('Helvetica').text(biz.bank_details || '', 36, y + 10, { width: 300 });
  doc.font('Helvetica-Bold').text('Terms', 36, y + 34).font('Helvetica').text(biz.terms || '', 36, y + 44, { width: 330 });
  doc.font('Helvetica-Bold').text(`For ${biz.name}`, 380, y + 20, { width: W - 344, align: 'right' }).font('Helvetica').text('Authorised signatory', 380, y + 70, { width: W - 344, align: 'right' });
  doc.fontSize(7).fillColor('#666').text('Computer-generated prototype document. Dummy GSTIN. Validate against current GST rules before real use.', 36, doc.page.height - 50, { width: W, align: 'center' });
  doc.end(); return done;
}

// Generic report -> PDF (every section is a table; landscape when any section is wide)
async function reportPdf(rep, meta) {
  const sections = rep.sections;
  const wide = sections.some(s => s.columns.length > 7);
  const doc = new PDFDocument({ size: 'A4', layout: wide ? 'landscape' : 'portrait', margin: 30 }); const done = collect(doc);
  const W = doc.page.width - 60;
  doc.font('Helvetica-Bold').fontSize(14).text(rep.title).font('Helvetica').fontSize(9).fillColor('#444').text(`${meta.business}  |  ${rep.subtitle || ''}  |  Generated ${meta.generated} by ${meta.user}`).fillColor('#000').moveDown(0.6);
  const NUM = ['money', 'qty', 'int', 'pct'];
  const fmtCell = (c, v) => (v === null || v === undefined ? '' : c.type === 'money' ? fmt(v) : c.type === 'qty' ? D(v).toFixed(c.dp ?? 3).replace(/\.?0+$/, '') : c.type === 'pct' ? D(v).toFixed(2) + '%' : String(v));
  for (const sec of sections) {
    const cols = sec.columns, widths = cols.map(c => (NUM.includes(c.type) ? 1 : c.type === 'date' ? 1.1 : 1.8));
    const tot = widths.reduce((a, b) => a + b, 0), w = widths.map(x => (x / tot) * W);
    if (doc.y > doc.page.height - 100) doc.addPage();
    if (sec.title) doc.font('Helvetica-Bold').fontSize(10).text(sec.title).moveDown(0.2);
    const header = y => { let x = 30; doc.rect(30, y, W, 16).fill('#e8e8e8'); doc.fillColor('#000').font('Helvetica-Bold').fontSize(7.5); cols.forEach((c, i) => { doc.text(c.label, x + 2, y + 4, { width: w[i] - 4, align: NUM.includes(c.type) ? 'right' : 'left' }); x += w[i]; }); return y + 16; };
    let y = header(doc.y); doc.font('Helvetica').fontSize(7.5);
    const draw = (obj, bold) => {
      const hts = cols.map((c, i) => doc.heightOfString(fmtCell(c, obj[c.key]), { width: w[i] - 4 })); const h = Math.max(12, ...hts) + 4;
      if (y + h > doc.page.height - 40) { doc.addPage(); y = header(30); }
      let x = 30; doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5); cols.forEach((c, i) => { doc.text(fmtCell(c, obj[c.key]), x + 2, y + 2, { width: w[i] - 4, align: NUM.includes(c.type) ? 'right' : 'left' }); x += w[i]; });
      doc.moveTo(30, y + h).lineTo(30 + W, y + h).strokeColor('#ddd').stroke().strokeColor('#000'); y += h;
    };
    for (const r of sec.rows) draw(r);
    if (sec.totals) draw({ ...sec.totals, [cols[0].key]: 'TOTAL' }, true);
    if (!sec.rows.length) { doc.font('Helvetica').text('No records in this period.', 30, y + 4); y += 16; }
    doc.y = y + 14;
  }
  doc.end(); return done;
}
module.exports = { taxDocument, reportPdf };
