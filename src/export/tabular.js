const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { fmtCell } = require('./format');
const { getSettings } = require('../services/common');

const NUMERIC = new Set(['money', 'qty', 'int', 'pct', 'rate']);
const cell = (v, type) => (v === null || v === undefined ? '' : fmtCell(v, type));

function toCsv(report) {
  const esc = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const lines = [esc(report.title) + ',' + esc(`${report.period.from} to ${report.period.to}`)];
  for (const s of report.sections) {
    lines.push('', esc(s.title), s.columns.map((c) => esc(c.label)).join(','));
    for (const r of s.rows) lines.push(s.columns.map((c) => esc(c.type === 'datetime' || c.type === 'date' ? cell(r[c.key], c.type) : r[c.key] ?? '')).join(','));
    if (s.totals) lines.push(s.columns.map((c) => esc(s.totals[c.key] ?? '')).join(','));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';        // BOM so Excel opens ₹/Tamil text correctly
}

async function toXlsx(report) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SnackLedger'; wb.created = new Date();
  const used = new Set();
  report.sections.forEach((s, i) => {
    let name = (s.title.replace(/[\\/*?:[\]]/g, ' ').slice(0, 28) || 'Sheet') ; if (used.has(name)) name = name.slice(0, 25) + ' ' + (i + 1); used.add(name);
    const ws = wb.addWorksheet(name);
    ws.addRow([report.title + '  |  ' + report.period.from + ' to ' + report.period.to]).font = { bold: true, size: 13 };
    ws.addRow([s.title]).font = { italic: true };
    ws.addRow([]);
    const head = ws.addRow(s.columns.map((c) => c.label));
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7A3E00' } }; c.alignment = { vertical: 'middle', wrapText: true }; });
    const addData = (r, bold) => {
      const row = ws.addRow(s.columns.map((c) => {
        const v = r[c.key];
        if (v === null || v === undefined || v === '') return '';
        if (NUMERIC.has(c.type) && isFinite(Number(v))) return Number(v);
        if (c.type === 'datetime') return cell(v, 'datetime');
        return typeof v === 'object' ? JSON.stringify(v) : v;
      }));
      if (bold) row.font = { bold: true };
      s.columns.forEach((c, ix) => {
        const x = row.getCell(ix + 1);
        if (c.type === 'money') x.numFmt = '#,##0.00'; else if (c.type === 'qty') x.numFmt = '#,##0.####'; else if (c.type === 'pct') x.numFmt = '0.00'; else if (c.type === 'rate') x.numFmt = '0.0000';
      });
    };
    s.rows.forEach((r) => addData(r, false));
    if (s.totals) addData(s.totals, true);
    s.columns.forEach((c, ix) => {
      const maxLen = Math.max(c.label.length, ...s.rows.slice(0, 200).map((r) => String(cell(r[c.key], c.type)).length));
      ws.getColumn(ix + 1).width = Math.min(Math.max(10, maxLen + 2), 45);
    });
    ws.views = [{ state: 'frozen', ySplit: 4 }];
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function toPdf(report, res) {
  const settings = await getSettings();
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28, bufferPages: true });
  doc.pipe(res);
  const W = doc.page.width - 56;
  const header = () => {
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#222').text(report.title, 28, 24);
    doc.font('Helvetica').fontSize(8.5).fillColor('#666').text(`${settings.factory_name}   |   Period: ${report.period.from} to ${report.period.to}`, 28, doc.y);
    doc.moveDown(0.5);
  };
  header();
  for (const s of report.sections) {
    if (doc.y > doc.page.height - 120) { doc.addPage(); header(); }
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#7a3e00').text(s.title, 28, doc.y + 4, { width: W });
    doc.moveDown(0.3);
    const weights = s.columns.map((c) => (NUMERIC.has(c.type) ? 1 : c.type === 'date' ? 1.1 : c.type === 'datetime' ? 1.6 : 1.7));
    const tot = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => (w / tot) * W);
    const fs = s.columns.length > 11 ? 6.2 : s.columns.length > 8 ? 7 : 8;
    const drawRow = (vals, opts = {}) => {
      doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fs);
      const h = Math.max(...vals.map((v, i) => doc.heightOfString(String(v), { width: widths[i] - 4 }))) + 5;
      if (doc.y + h > doc.page.height - 36) { doc.addPage(); header(); drawHead(); }
      const y = doc.y; let x = 28;
      if (opts.fill) doc.rect(28, y - 1, W, h).fill(opts.fill);
      vals.forEach((v, i) => {
        doc.fillColor(opts.color || '#222').text(String(v), x + 2, y + 1, { width: widths[i] - 4, align: NUMERIC.has(s.columns[i].type) ? 'right' : 'left' });
        x += widths[i];
      });
      doc.y = y + h;
      if (!opts.fill) doc.moveTo(28, doc.y - 1.5).lineTo(28 + W, doc.y - 1.5).lineWidth(0.25).strokeColor('#ddd').stroke();
    };
    const drawHead = () => drawRow(s.columns.map((c) => c.label), { bold: true, fill: '#f1e3cf' });
    drawHead();
    if (!s.rows.length) { doc.font('Helvetica-Oblique').fontSize(8).fillColor('#888').text('No records in this period.', 30, doc.y + 2); }
    for (const r of s.rows) drawRow(s.columns.map((c) => cell(r[c.key], c.type)));
    if (s.totals) drawRow(s.columns.map((c) => (c.type === 'money' ? cell(s.totals[c.key], 'money') : s.totals[c.key] ?? '')), { bold: true, fill: '#f6f6f6' });
    doc.moveDown(0.8);
  }
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc.font('Helvetica').fontSize(7).fillColor('#999').text(`Page ${i + 1} of ${range.count}   |   Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}   |   SnackLedger`, 28, doc.page.height - 22, { width: W, align: 'center', lineBreak: false });
  }
  doc.end();
}
module.exports = { toCsv, toXlsx, toPdf };
