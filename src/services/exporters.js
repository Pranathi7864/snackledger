'use strict';
const ExcelJS = require('exceljs');
const { D } = require('../money');
const pdf = require('../pdf');
const NUM = ['money', 'qty', 'int', 'pct'];
const cell = (c, v) => (v === null || v === undefined || v === '' ? '' : NUM.includes(c.type) ? Number(v) : v);   // Excel needs numbers; values were exact decimal strings until here
const csvEsc = v => { v = v === null || v === undefined ? '' : String(v); return /[",\n\r]/.test(v) || /^[=+\-@]/.test(v) && isNaN(Number(v)) ? '"' + (/^[=+\-@]/.test(v) && isNaN(Number(v)) ? "'" : '') + v.replace(/"/g, '""') + '"' : v; };  // also defuses CSV formula injection
function toCsv(rep) {
  const out = [csvEsc(rep.title), csvEsc(rep.subtitle || ''), ''];
  for (const s of rep.sections) {
    if (s.title) out.push(csvEsc(s.title));
    out.push(s.columns.map(c => csvEsc(c.label)).join(','));
    for (const r of s.rows) out.push(s.columns.map(c => csvEsc(r[c.key])).join(','));
    if (s.totals) out.push(s.columns.map((c, i) => (i === 0 ? 'TOTAL' : csvEsc(s.totals[c.key] ?? ''))).join(','));
    out.push('');
  }
  return '﻿' + out.join('\r\n');
}
async function toXlsx(rep, meta) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'SnackLedger';
  rep.sections.forEach((s, i) => {
    const ws = wb.addWorksheet(`${i + 1} ${(s.title || rep.title).replace(/[\\/*?:\[\]]/g, ' ').slice(0, 24)}`);
    ws.addRow([rep.title + (rep.subtitle ? '  |  ' + rep.subtitle : '')]).font = { bold: true, size: 13 };
    ws.addRow([s.title || '']).font = { italic: true };
    const h = ws.addRow(s.columns.map(c => c.label)); h.font = { bold: true }; h.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFE6D5' } }; });
    s.columns.forEach((c, k) => { const col = ws.getColumn(k + 1); col.width = Math.max(12, Math.min(40, c.label.length + 6)); if (c.type === 'money') col.numFmt = '#,##0.00'; else if (c.type === 'qty') col.numFmt = c.dp === 0 ? '#,##0' : '#,##0.000'; else if (c.type === 'pct') col.numFmt = '0.00'; });
    for (const r of s.rows) ws.addRow(s.columns.map(c => cell(c, r[c.key])));
    if (s.totals) { const t = ws.addRow(s.columns.map((c, k) => (k === 0 ? 'TOTAL' : cell(c, s.totals[c.key])))); t.font = { bold: true }; }
    ws.views = [{ state: 'frozen', ySplit: 3 }];
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
const toPdf = (rep, meta) => pdf.reportPdf(rep, meta);
module.exports = { toCsv, toXlsx, toPdf };
