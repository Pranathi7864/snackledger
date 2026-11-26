-- SnackLedger schema (PostgreSQL 14+). Money/quantities are NUMERIC, never float.
-- Stock balances are NEVER stored: they are SUM(stock_moves.qty). stock_moves is append-only.

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS business (          -- the factory (seller on invoices); single row id=1
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name TEXT NOT NULL, gstin TEXT, pan TEXT, address TEXT, state_code TEXT NOT NULL,
  phone TEXT, email TEXT, bank_details TEXT, invoice_prefix TEXT NOT NULL DEFAULT 'SL',
  terms TEXT);

CREATE TABLE IF NOT EXISTS states (code TEXT PRIMARY KEY, name TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('ADMIN','SALES','PRODUCTION','AUDITOR','OWNER')),
  active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMP NOT NULL);

CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, sess TEXT NOT NULL, expire TIMESTAMP NOT NULL);

CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY, ts TIMESTAMP NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
  entity TEXT NOT NULL, entity_id INT, summary TEXT, before_json TEXT, after_json TEXT, reason TEXT);
CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_log(entity, entity_id);

-- Units: factor to the dimension's base unit. Carton-of-packets is product specific (products.carton_capacity).
CREATE TABLE IF NOT EXISTS units (code TEXT PRIMARY KEY, name TEXT NOT NULL, dimension TEXT NOT NULL, to_base NUMERIC(18,9) NOT NULL);

-- ===== Items (raw, packaging, finished) =====
CREATE TABLE IF NOT EXISTS items (
  id SERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('RAW','PACKAGING','FINISHED')),
  unit TEXT NOT NULL REFERENCES units(code),           -- stock-keeping unit
  reorder_level NUMERIC(18,4) NOT NULL DEFAULT 0,
  avg_cost NUMERIC(18,6) NOT NULL DEFAULT 0,           -- moving weighted-average cost (raw/packaging)
  last_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE);

-- A BOM is the bulk recipe for one batch; several pack sizes can share it.
CREATE TABLE IF NOT EXISTS boms (
  id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL,
  batch_output_g NUMERIC(18,3) NOT NULL CHECK (batch_output_g > 0),   -- grams of finished snack one batch makes
  notes TEXT, version INT NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS bom_lines (
  id SERIAL PRIMARY KEY, bom_id INT NOT NULL REFERENCES boms(id) ON DELETE CASCADE,
  item_id INT NOT NULL REFERENCES items(id), qty NUMERIC(18,4) NOT NULL CHECK (qty > 0),
  unit TEXT NOT NULL REFERENCES units(code), UNIQUE (bom_id, item_id));

CREATE TABLE IF NOT EXISTS products (
  item_id INT PRIMARY KEY REFERENCES items(id), bom_id INT NOT NULL REFERENCES boms(id),
  pack_size_g NUMERIC(18,3) NOT NULL CHECK (pack_size_g > 0), hsn TEXT NOT NULL,
  gst_rate NUMERIC(5,2) NOT NULL, price NUMERIC(14,2) NOT NULL,          -- list price per packet, before tax
  carton_capacity INT NOT NULL DEFAULT 1 CHECK (carton_capacity > 0), shelf_life_days INT NOT NULL DEFAULT 90);
CREATE TABLE IF NOT EXISTS product_packaging (        -- packaging consumed per finished packet
  product_id INT NOT NULL REFERENCES products(item_id) ON DELETE CASCADE,
  item_id INT NOT NULL REFERENCES items(id), qty_per_packet NUMERIC(18,6) NOT NULL CHECK (qty_per_packet > 0),
  PRIMARY KEY (product_id, item_id));

-- ===== Parties =====
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL CHECK (type IN ('RETAILER','DISTRIBUTOR')),
  address TEXT, state_code TEXT NOT NULL REFERENCES states(code), gstin TEXT, phone TEXT, email TEXT,
  credit_days INT NOT NULL DEFAULT 30, active BOOLEAN NOT NULL DEFAULT TRUE);
CREATE TABLE IF NOT EXISTS customer_prices (
  customer_id INT NOT NULL REFERENCES customers(id), product_id INT NOT NULL REFERENCES products(item_id),
  price NUMERIC(14,2) NOT NULL, PRIMARY KEY (customer_id, product_id));
CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, gstin TEXT, state_code TEXT REFERENCES states(code),
  address TEXT, phone TEXT, email TEXT, active BOOLEAN NOT NULL DEFAULT TRUE);

-- ===== Inventory ledger =====
CREATE TABLE IF NOT EXISTS batches (
  id SERIAL PRIMARY KEY, item_id INT NOT NULL REFERENCES items(id), batch_no TEXT NOT NULL,
  mfg_date DATE, expiry_date DATE, created_at TIMESTAMP NOT NULL, UNIQUE (item_id, batch_no));
CREATE TABLE IF NOT EXISTS stock_moves (              -- append-only; every row has a source document
  id SERIAL PRIMARY KEY, item_id INT NOT NULL REFERENCES items(id), batch_id INT NOT NULL REFERENCES batches(id),
  moved_at TIMESTAMP NOT NULL,
  move_type TEXT NOT NULL CHECK (move_type IN ('OPENING','PURCHASE','PRODUCTION_ISSUE','PRODUCTION_OUTPUT',
     'DISPATCH','SALES_RETURN','ADJUSTMENT','PRODUCTION_REVERSAL')),
  qty NUMERIC(18,4) NOT NULL,                          -- signed, in the item's stock unit
  unit_cost NUMERIC(18,6) NOT NULL DEFAULT 0, value NUMERIC(18,4) NOT NULL DEFAULT 0,
  source_type TEXT NOT NULL, source_id INT, source_ref TEXT NOT NULL, note TEXT, created_by TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS moves_item_idx ON stock_moves(item_id, moved_at);
CREATE INDEX IF NOT EXISTS moves_batch_idx ON stock_moves(batch_id);
CREATE INDEX IF NOT EXISTS moves_source_idx ON stock_moves(source_type, source_id);

-- ===== Purchasing =====
CREATE TABLE IF NOT EXISTS purchases (
  id SERIAL PRIMARY KEY, supplier_id INT NOT NULL REFERENCES suppliers(id), bill_no TEXT, bill_date DATE NOT NULL,
  notes TEXT, taxable NUMERIC(16,2) NOT NULL DEFAULT 0, tax NUMERIC(16,2) NOT NULL DEFAULT 0, total NUMERIC(16,2) NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL, created_at TIMESTAMP NOT NULL);
CREATE TABLE IF NOT EXISTS purchase_lines (
  id SERIAL PRIMARY KEY, purchase_id INT NOT NULL REFERENCES purchases(id), item_id INT NOT NULL REFERENCES items(id),
  qty NUMERIC(18,4) NOT NULL CHECK (qty > 0), rate NUMERIC(18,4) NOT NULL CHECK (rate >= 0),  -- per stock unit
  entered_qty NUMERIC(18,4) NOT NULL, entered_unit TEXT NOT NULL,
  taxable NUMERIC(16,2) NOT NULL, gst_rate NUMERIC(5,2) NOT NULL DEFAULT 0, tax NUMERIC(16,2) NOT NULL DEFAULT 0,
  batch_id INT REFERENCES batches(id));

-- ===== Production =====
CREATE TABLE IF NOT EXISTS production_runs (
  id SERIAL PRIMARY KEY, product_id INT NOT NULL REFERENCES products(item_id), bom_id INT NOT NULL REFERENCES boms(id),
  batches NUMERIC(10,3) NOT NULL CHECK (batches > 0), status TEXT NOT NULL CHECK (status IN ('STARTED','COMPLETED','VOIDED')),
  run_date DATE NOT NULL, expected_output NUMERIC(14,3) NOT NULL, good_output NUMERIC(14,3),
  damaged_packaging NUMERIC(14,3), scrap_note TEXT, yield_variance_pct NUMERIC(10,3), yield_flag BOOLEAN NOT NULL DEFAULT FALSE,
  tolerance_pct NUMERIC(6,2) NOT NULL, fg_batch_id INT REFERENCES batches(id), notes TEXT,
  started_by TEXT NOT NULL, started_at TIMESTAMP NOT NULL, completed_by TEXT, completed_at TIMESTAMP,
  voided_by TEXT, voided_at TIMESTAMP, void_reason TEXT);
CREATE TABLE IF NOT EXISTS production_run_lines (
  id SERIAL PRIMARY KEY, run_id INT NOT NULL REFERENCES production_runs(id), item_id INT NOT NULL REFERENCES items(id),
  kind TEXT NOT NULL CHECK (kind IN ('MATERIAL','PACKAGING')), planned_qty NUMERIC(18,4) NOT NULL,
  actual_qty NUMERIC(18,4), unit_cost NUMERIC(18,6) NOT NULL DEFAULT 0, cost NUMERIC(18,4) NOT NULL DEFAULT 0,
  variance_pct NUMERIC(10,3), flagged BOOLEAN NOT NULL DEFAULT FALSE, UNIQUE (run_id, item_id));
CREATE TABLE IF NOT EXISTS run_costs (               -- direct overheads booked against one run
  id SERIAL PRIMARY KEY, run_id INT NOT NULL REFERENCES production_runs(id),
  cost_type TEXT NOT NULL CHECK (cost_type IN ('LABOUR','POWER_GAS','OTHER')), amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  notes TEXT, created_by TEXT NOT NULL, created_at TIMESTAMP NOT NULL);
CREATE TABLE IF NOT EXISTS monthly_overheads (       -- shared monthly pool, allocated to runs by output weight
  id SERIAL PRIMARY KEY, month DATE NOT NULL, cost_type TEXT NOT NULL, amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  notes TEXT, created_by TEXT NOT NULL, created_at TIMESTAMP NOT NULL);

-- ===== Sales =====
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY, client_id TEXT UNIQUE NOT NULL, customer_id INT NOT NULL REFERENCES customers(id),
  salesman_id INT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('SUBMITTED','APPROVED','INVOICED','PARTIALLY_DISPATCHED','DISPATCHED','REJECTED','CANCELLED')),
  source TEXT NOT NULL DEFAULT 'ONLINE', placed_at TIMESTAMP NOT NULL, received_at TIMESTAMP NOT NULL, notes TEXT,
  shortage_ack BOOLEAN NOT NULL DEFAULT FALSE, decided_by TEXT, decided_at TIMESTAMP, reject_reason TEXT);
CREATE TABLE IF NOT EXISTS order_lines (
  id SERIAL PRIMARY KEY, order_id INT NOT NULL REFERENCES orders(id), product_id INT NOT NULL REFERENCES products(item_id),
  qty NUMERIC(14,3) NOT NULL CHECK (qty > 0), price NUMERIC(14,2) NOT NULL,
  entered_qty NUMERIC(14,3) NOT NULL, entered_unit TEXT NOT NULL, client_price NUMERIC(14,2),
  orig_qty NUMERIC(14,3) NOT NULL, orig_price NUMERIC(14,2) NOT NULL);

CREATE TABLE IF NOT EXISTS doc_seq (kind TEXT NOT NULL, fy TEXT NOT NULL, last_no INT NOT NULL, PRIMARY KEY (kind, fy));
CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY, invoice_no TEXT UNIQUE NOT NULL, fy TEXT NOT NULL, seq INT NOT NULL,
  order_id INT NOT NULL REFERENCES orders(id), customer_id INT NOT NULL REFERENCES customers(id),
  invoice_date DATE NOT NULL, due_date DATE NOT NULL, place_of_supply TEXT NOT NULL, supply_type TEXT NOT NULL CHECK (supply_type IN ('INTRA','INTER')),
  buyer_name TEXT NOT NULL, buyer_gstin TEXT, buyer_address TEXT, buyer_state_code TEXT NOT NULL,
  taxable NUMERIC(16,2) NOT NULL, cgst NUMERIC(16,2) NOT NULL, sgst NUMERIC(16,2) NOT NULL, igst NUMERIC(16,2) NOT NULL, total NUMERIC(16,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED','CANCELLED')), share_token TEXT UNIQUE NOT NULL,
  vehicle_no TEXT, notes TEXT, created_by TEXT NOT NULL, created_at TIMESTAMP NOT NULL, UNIQUE (fy, seq));
CREATE TABLE IF NOT EXISTS invoice_lines (
  id SERIAL PRIMARY KEY, invoice_id INT NOT NULL REFERENCES invoices(id), order_line_id INT NOT NULL REFERENCES order_lines(id),
  product_id INT NOT NULL REFERENCES products(item_id), description TEXT NOT NULL, hsn TEXT NOT NULL,
  qty NUMERIC(14,3) NOT NULL, rate NUMERIC(14,2) NOT NULL, taxable NUMERIC(16,2) NOT NULL, gst_rate NUMERIC(5,2) NOT NULL,
  cgst NUMERIC(16,2) NOT NULL, sgst NUMERIC(16,2) NOT NULL, igst NUMERIC(16,2) NOT NULL, total NUMERIC(16,2) NOT NULL);
CREATE TABLE IF NOT EXISTS credit_notes (
  id SERIAL PRIMARY KEY, cn_no TEXT UNIQUE NOT NULL, fy TEXT NOT NULL, seq INT NOT NULL, invoice_id INT UNIQUE NOT NULL REFERENCES invoices(id),
  cn_date DATE NOT NULL, reason TEXT NOT NULL, taxable NUMERIC(16,2) NOT NULL, cgst NUMERIC(16,2) NOT NULL, sgst NUMERIC(16,2) NOT NULL,
  igst NUMERIC(16,2) NOT NULL, total NUMERIC(16,2) NOT NULL, goods_returned BOOLEAN NOT NULL DEFAULT FALSE,
  share_token TEXT UNIQUE NOT NULL, created_by TEXT NOT NULL, created_at TIMESTAMP NOT NULL, UNIQUE (fy, seq));
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY, receipt_no TEXT UNIQUE NOT NULL, customer_id INT NOT NULL REFERENCES customers(id),
  invoice_id INT NOT NULL REFERENCES invoices(id), amount NUMERIC(16,2) NOT NULL CHECK (amount > 0),
  mode TEXT NOT NULL DEFAULT 'CASH', reference TEXT, paid_on DATE NOT NULL, notes TEXT, created_by TEXT NOT NULL, created_at TIMESTAMP NOT NULL);
CREATE TABLE IF NOT EXISTS dispatches (
  id SERIAL PRIMARY KEY, dispatch_no TEXT UNIQUE NOT NULL, order_id INT NOT NULL REFERENCES orders(id), invoice_id INT NOT NULL REFERENCES invoices(id),
  vehicle_no TEXT, notes TEXT, dispatched_at TIMESTAMP NOT NULL, created_by TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dispatch_lines (
  id SERIAL PRIMARY KEY, dispatch_id INT NOT NULL REFERENCES dispatches(id), order_line_id INT NOT NULL REFERENCES order_lines(id),
  product_id INT NOT NULL REFERENCES products(item_id), qty NUMERIC(14,3) NOT NULL CHECK (qty > 0));

CREATE TABLE IF NOT EXISTS visits (                   -- salesman visit log with GPS check-in (works offline)
  id SERIAL PRIMARY KEY, client_id TEXT UNIQUE NOT NULL, salesman_id INT NOT NULL REFERENCES users(id),
  customer_id INT NOT NULL REFERENCES customers(id), lat NUMERIC(10,6), lng NUMERIC(10,6), accuracy_m NUMERIC(10,1),
  note TEXT, visited_at TIMESTAMP NOT NULL, received_at TIMESTAMP NOT NULL);

-- ===== Immutability guards: ledger and posted tax documents can never be edited or deleted =====
CREATE OR REPLACE FUNCTION forbid_change() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION '% rows are immutable (use a reversal / credit note)', TG_TABLE_NAME; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS stock_moves_ro ON stock_moves;
CREATE TRIGGER stock_moves_ro BEFORE UPDATE OR DELETE ON stock_moves FOR EACH ROW EXECUTE FUNCTION forbid_change();
DROP TRIGGER IF EXISTS audit_log_ro ON audit_log;
CREATE TRIGGER audit_log_ro BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION forbid_change();
DROP TRIGGER IF EXISTS invoices_nodelete ON invoices;
CREATE TRIGGER invoices_nodelete BEFORE DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION forbid_change();
DROP TRIGGER IF EXISTS invoice_lines_ro ON invoice_lines;
CREATE TRIGGER invoice_lines_ro BEFORE UPDATE OR DELETE ON invoice_lines FOR EACH ROW EXECUTE FUNCTION forbid_change();
DROP TRIGGER IF EXISTS credit_notes_ro ON credit_notes;
CREATE TRIGGER credit_notes_ro BEFORE UPDATE OR DELETE ON credit_notes FOR EACH ROW EXECUTE FUNCTION forbid_change();
