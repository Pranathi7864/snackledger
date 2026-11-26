// MOCK e-Invoice (IRN) and e-Way Bill payloads in the shape of the NIC schema. No government API is called.
const crypto = require('crypto');
const { dmy } = require('./format');
const n = (v) => Number(v);

function buildEinvoice(inv) {
  const s = inv.seller, b = inv.buyer;
  const irn = crypto.createHash('sha256').update(`${s.gstin}${inv.fy}INV${inv.invoice_no}`).digest('hex');   // the real IRN is exactly this hash
  const items = inv.lines.map((l, i) => ({
    SlNo: String(i + 1), PrdDesc: l.description, IsServc: 'N', HsnCd: l.hsn, Qty: n(l.qty), Unit: 'PKT', UnitPrice: n(l.rate), TotAmt: n(l.taxable), AssAmt: n(l.taxable),
    GstRt: n(l.gst_rate), IgstAmt: n(l.igst), CgstAmt: n(l.cgst), SgstAmt: n(l.sgst), TotItemVal: n(l.total) }));
  const einvoice = {
    _note: 'MOCK payload for demonstration. Not registered with any Invoice Registration Portal.',
    Version: '1.1', Irn: irn, AckNo: Number('1' + irn.replace(/\D/g, '').slice(0, 14)), AckDt: new Date(inv.created_at).toISOString().replace('T', ' ').slice(0, 19),
    TranDtls: { TaxSch: 'GST', SupTyp: 'B2B', RegRev: 'N', IgstOnIntra: 'N' },
    DocDtls: { Typ: 'INV', No: inv.invoice_no, Dt: dmy(inv.invoice_date) },
    SellerDtls: { Gstin: s.gstin, LglNm: s.name, Addr1: s.address, Loc: s.state, Pin: 620015, Stcd: s.state_code },
    BuyerDtls: { Gstin: b.gstin || 'URP', LglNm: b.name, Pos: inv.pos_code, Addr1: b.address || b.state, Loc: b.state, Stcd: b.state_code },
    ItemList: items,
    ValDtls: { AssVal: n(inv.taxable), CgstVal: n(inv.cgst), SgstVal: n(inv.sgst), IgstVal: n(inv.igst), TotInvVal: n(inv.total) },
  };
  const ewayRequired = n(inv.total) > 50000;
  return { einvoice, eway_bill: { required: ewayRequired, threshold: 50000,
    payload: ewayRequired ? { supplyType: 'O', docType: 'INV', docNo: inv.invoice_no, docDate: dmy(inv.invoice_date), fromGstin: s.gstin, toGstin: b.gstin || 'URP', totalValue: n(inv.taxable), cgstValue: n(inv.cgst),
      sgstValue: n(inv.sgst), igstValue: n(inv.igst), totInvValue: n(inv.total), transMode: '1', itemList: items.map((i) => ({ productName: i.PrdDesc, hsnCode: i.HsnCd, quantity: i.Qty, qtyUnit: 'PKT', taxableAmount: i.AssAmt })) } : null } };
}
module.exports = { buildEinvoice };
