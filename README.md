# SnackLedger: order-to-audit system for a small food manufacturer

One system that takes a snack factory from a **salesman's order** to the **monthly auditor's report**. Every transaction is entered once, at its source, and flows into stock, production, costing and accounts.

* **Sales loop:** order (phone, works offline) → admin verification → GST invoice → dispatch → finished-goods stock down → receivables and collections
* **Production loop:** purchase → raw stock → issue per **BOM** → production run → finished-goods stock up → **planned-vs-actual variance** and **cost per packet**
* Both loops meet at finished-goods stock and both feed the reports.

> Built for the NIT Tiruchirappalli CDI internship task. Dummy data only. The invoice is a prototype, not a certified GST document.

## Run it

**Zero install (Node 20+)**: embedded PostgreSQL, data kept in `./data`:
```bash
npm install
npm start            # http://localhost:8080
```
**Docker (real PostgreSQL 16)**, a single command:
```bash
docker compose up --build
```


| Login | Password | Role |
|---|---|---|
| `admin` | `demo1234` | Factory admin (desktop) |
| `salesa`, `salesb` | `demo1234` | Salesmen (phone) |
| `production` | `demo1234` | Production supervisor (tablet) |
| `auditor` | `demo1234` | Accountant / auditor (read-only) |
| `owner` | `demo1234` | Owner (read-only dashboard) |




## Requirement coverage

| Section 6 tier | Status |
|---|---|
| **Must have** | Login with 5 roles (enforced on the server); product / customer / raw-material / BOM masters; mobile order entry + admin approval; GST invoice PDF; production run updates raw and finished stock automatically; planned-vs-actual consumption and yield with variance; stock summary + ledger; sales register + stock report as CSV/Excel/PDF. **All done.** |
| **Should have** | Purchases and suppliers; payments, outstanding, ageing; cost per packet with overheads and margin; GST summary (GSTR-1 / 3B shape); variance alerts with configurable tolerance; owner dashboard. **All done.** |
| **Stretch** | Offline order capture with sync ✅, batch + expiry with FEFO dispatch ✅, reorder levels + low-stock alerts ✅, production planning from pending orders ✅, GPS visit check-in (offline too) ✅, Tally-compatible XML export ✅, e-Invoice / e-Way Bill mock payloads ✅, Tamil interface (floor + salesman screens, toggle in the top bar) ✅ |

## Offline mode (how it really works)
* **App shell:** a service worker precaches every screen; the app opens with no network. Nothing loads from a CDN.
* **Data on the phone:** after any online sign-in, customers, products, prices and the salesman's orders are cached in IndexedDB.
* **Offline sign-in:** a salesman who has signed in on this phone before can unlock offline. The phone stores only a salted **PBKDF2** verifier, never the password. Other users and unknown accounts cannot.
* **Outbox:** orders and GPS visit check-ins are saved locally with a UUID `clientId`. The badge shows how many are pending.
* **Sync:** when the network returns (and every 30 s / on app focus), the outbox is sent in batches. The server is idempotent on `clientId`, so retries never duplicate. Each item succeeds or fails on its own, and failures stay visible with the server's reason so the salesman can edit or discard. If the server session expired, the app asks for the password again, then continues.
* **Truth is on the server:** the server **re-prices** every offline order from the price list (the phone's price is stored as `client_price` for comparison) and checks stock only at admin approval.
* Verified in a real browser: `test/e2e/offline.e2e.js` goes offline, reloads, signs in offline, places an order and a visit, reconnects and checks exactly one order arrives, even after repeated syncs.
* **Limits:** factory-desk roles (admin, production, auditor, owner) need the server on the factory network. Background Sync from the service worker is Chromium-only (other browsers sync when the app is opened or focused).

## Benchmark results (Section 5), measured by `npm run benchmark`

| Check | Expected | This system |
|---|---|---|
| Flour closing | 120 kg | **120 kg** |
| Oil closing | 19.5 L | **19.5 L** |
| Pouches closing | 306 | **306** (188 used + 6 damaged) |
| Finished goods after run | 238 | **238** |
| After Retailer A dispatch | 88 | **88** |
| Yield variance | −6%, flagged | **−6.00%, flagged** |
| Oil variance | +5%, flagged | **+5.00%, flagged** |
| Retailer A invoice | ₹7,500 + 187.50 + 187.50 = ₹7,875 | **identical** (`SL/2026-27/0001`) |
| Retailer A outstanding | ₹3,875 | **₹3,875.00** |
| Distributor B | shortage 32, IGST if invoiced | **shortage 32**; tax preview **IGST ₹300.00** on ₹6,000 |
| Cost per packet | your figure | **₹31.14** (see below) |

Differences and extra observations, all explained:
* **Cartons:** 9 used vs 10 planned is −10%, so cartons are also flagged (9 cartons hold 180 packets; the other 8 packets are assumed loose). **Pouches** are −3.00% (194 vs 200), which is *not* flagged because the rule is "beyond" the 3% tolerance (strictly greater).
* **Flour cost** uses the moving weighted average: (100 × ₹42 + 60 × ₹45) / 160 = **₹43.125/kg**.
* **Distributor B** is *not* approvable at 120 because only 88 packets are free; the admin sees the shortage and chooses to reduce the quantity, reject, or approve as a **back-order** (then invoice → IGST, and dispatch what is available). The benchmark leaves it unapproved, as the brief implies.

### Cost per packet: method stated
* **Materials/packaging: moving weighted-average cost**, chosen because purchase prices vary (₹42 → ₹45) and it needs no layer tracking. Each issue is valued at the average at that moment and stored on the ledger row.
* **Direct overheads** (labour, power/gas) are booked against the run. **Monthly overheads** (rent, supervisor salary) go into a monthly pool allocated to that month's runs **by output weight** (good packets × pack size in grams), so a 500 g pack carries more than a 200 g pack.
* **Cost per packet = (materials + packaging + labour + power/gas + allocated overhead) ÷ good packets**. Damaged pouches and the oil overuse are absorbed by the good packets.
* Benchmark: materials ₹3,435 + packaging ₹620 + labour ₹1,200 + power/gas ₹600 = **₹5,855 ÷ 188 = ₹31.1436 → ₹31.14**, margin ₹18.86 (37.7%) on the ₹50 price.
* Finished-goods stock is tracked in quantity; the 50 opening packets have no cost basis in the brief, so FG valuation uses the run's cost per packet, not a blended stock value.

## Assumptions 
1. **Approval reserves stock.** Approved or invoiced orders reserve finished goods; "free stock" = on hand − reserved by other orders. Dispatch checks real stock again.
2. **Invoice at order quantity, dispatch may be partial.** Invoice numbering is per financial year (April–March), gap-free (`SL/2026-27/0001`); credit notes `SL-CN/…`, receipts `REC/…`. Tax is rounded per line to paise, with SGST = tax − CGST so halves always add up. No whole-rupee round-off, so the invoice total is exactly ₹7,875.00.
3. **Place of supply = customer's state.** Seller state is Tamil Nadu (33), so TN → CGST+SGST and any other state → IGST. GSTINs are validated (format, checksum, and state code must match the chosen state). Buyers without GSTIN get a B2C invoice.
4. **Carton = 20 packets** for Murukku 200 g; orders can be entered in cartons and are converted to packets.
5. **One BOM can serve many pack sizes.** A BOM is the bulk recipe for a batch (40 kg of snack); a product adds only its pack size and packaging per packet. 200 packets × 200 g = 40 kg, so adding a 500 g pack that shares the BOM is data entry only (80 packets per batch), no code.
6. **Tolerance = 3%**, configurable by the admin; a run stores the tolerance in force when it was posted.
7. **Single business timezone: IST.** Opening stock is dated the first of the current month so month reports show it as "opening".
8. Prices are server-authoritative: customer-specific price, else list price.
9. Ageing buckets are days past the **due date** (invoice date + customer's credit days).


