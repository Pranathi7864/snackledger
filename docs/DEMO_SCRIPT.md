# Demo video script (max 8 min): follows Section 5 in order

Prepare: `npm run seed && npm start`. Two browser windows: a phone-sized one (DevTools device mode, 390×844) and a desktop one. Language toggle (தமிழ்) is in the top bar.

| Min | Show | Say |
|---|---|---|
| 0:00 | Admin dashboard, opening stock | One system, two loops meeting at finished-goods stock. Stock is a ledger, not a number. |
| 0:30 | **Step 1.** Production login → Purchases → 60 kg flour @ ₹45 | Weighted average becomes ₹43.125. |
| 1:00 | **Step 2.** Production → New run: issue 40 kg flour, **10.5 L oil** (live **+5%** red flag as you type), 1.2 kg spice | BOM scaled by batches; raw stock drops now. |
| 1:45 | **Step 3.** Complete: 188 good, 6 damaged pouches, 9 cartons → run detail | Yield −6% flagged, oil +5% flagged, wastage split into damaged vs unexplained. Inventory: flour 120, oil 19.5, pouches 306, FG 238. |
| 2:45 | **Step 4.** Phone, salesman A: New order, Retailer A, 150 packets (also show cartons toggle) | Under a minute. |
| 3:15 | *Offline moment:* DevTools → Network → Offline, reload, sign in offline, place a small order, show the pending badge, go online and watch it sync | The app shell, data and login work offline; the outbox syncs idempotently. |
| 4:00 | **Step 5.** Admin: order → free stock 238 → Approve → GST invoice → PDF → Dispatch | ₹7,500 + 187.50 + 187.50 = ₹7,875; FG 88; FEFO batches in the ledger. |
| 5:00 | **Step 6.** Phone, salesman B: Distributor B, 120 packets → admin sees **shortage 32** and the **IGST ₹300** preview | Never negative stock; choices: reduce, reject, back-order. |
| 5:45 | **Step 7.** Payment ₹4,000 → outstanding ₹3,875 | |
| 6:10 | **Step 8.** Run detail: add labour 1,200 and power/gas 600 → **₹31.14 per packet**, margin 37.7% | Method: weighted average + run overheads; monthly pool allocated by output weight. |
| 6:45 | **Step 9.** Reports: stock summary, GST summary, production variance, ageing → Excel/PDF/CSV; auditor login shows read-only | Everything comes from ledger rows. Open one ledger row to show its source document. |
| 7:30 | Audit trail + credit-note cancellation (briefly) | Posted invoices are never deleted. |
