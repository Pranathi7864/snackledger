'use strict';
// MOCK e-Invoice (IRP) and e-Way Bill payloads. No government API is called. Shapes follow the NIC INV-01 / EWB schemas closely enough to be mapped.
const crypto = require('crypto');
const { D } = require('../money');
const dmy = d => d.split('-').reverse().join('/');
async function build(db, invoiceId) {
  const inv = await db.one('select * from invoices where id=$1', [invoiceId]); if (!inv) return null;
  const lines = await db.query('select * from invoice_lines where invoice_id=$1 order by id', [invoiceId]);
  const biz = await db.one('select * from business where id=1');
  const irn = crypto.createHash('sha256').update((biz.gstin + inv.fy + 'INV' + inv.invoice_no).toUpperCase()).digest('hex');
  const einv = {
    _mock: true, _note: 'MOCK payload for demonstration. Not submitted to the Invoice Registration Portal.',
    Version: '1.1', Irn: irn, AckNo: 100000000000 + inv.id, AckDt: inv.created_at,
    TranDtls: { TaxSch: 'GST', SupTyp: inv.buyer_gstin ? 'B2B' : 'B2C', RegRev: 'N', IgstOnIntra: 'N' },
    DocDtls: { Typ: 'INV', No: inv.invoice_no, Dt: dmy(inv.invoice_date) },
    SellerDtls: { Gstin: biz.gstin, LglNm: biz.name, Addr1: biz.address, Loc: 'Tiruchirappalli', Pin: 620001, Stcd: biz.state_code },
    BuyerDtls: { Gstin: inv.buyer_gstin || 'URP', LglNm: inv.buyer_name, Pos: inv.place_of_supply, Addr1: inv.buyer_address || '', Stcd: inv.buyer_state_code },
    ItemList: lines.map((l, i) => ({ SlNo: String(i + 1), PrdDesc: l.description, IsServc: 'N', HsnCd: l.hsn, Qty: Number(l.qty), Unit: 'NOS', UnitPrice: Number(l.rate), TotAmt: Number(l.taxable), AssAmt: Number(l.taxable), GstRt: Number(l.gst_rate), CgstAmt: Number(l.cgst), SgstAmt: Number(l.sgst), IgstAmt: Number(l.igst), TotItemVal: Number(l.total) })),
    ValDtls: { AssVal: Number(inv.taxable), CgstVal: Number(inv.cgst), SgstVal: Number(inv.sgst), IgstVal: Number(inv.igst), TotInvVal: Number(inv.total) },
  };
  const ewb = D(inv.total).gt(50000) ? { _mock: true, supplyType: 'O', subSupplyType: 1, docType: 'INV', docNo: inv.invoice_no, docDate: dmy(inv.invoice_date), fromGstin: biz.gstin, toGstin: inv.buyer_gstin || 'URP', totalValue: Number(inv.taxable), cgstValue: Number(inv.cgst), sgstValue: Number(inv.sgst), igstValue: Number(inv.igst), totInvValue: Number(inv.total), transMode: 1, vehicleNo: inv.vehicle_no || '', itemList: lines.map(l => ({ hsnCode: l.hsn, quantity: Number(l.qty), taxableAmount: Number(l.taxable) })) } : null;
  return { einvoice: einv, eway: ewb, ewayNote: ewb ? null : 'E-Way Bill is required only when the consignment value exceeds ₹50,000.' };
}
module.exports = { build };
