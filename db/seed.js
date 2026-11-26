'use strict';
// Loads the Section 5 benchmark master data exactly. Safe to re-run: does nothing if users exist (use --reset via scripts/reset.js).
const bcrypt = require('bcryptjs');
const { nowTs, today, monthStart, addDays } = require('../src/clock');
const { makeGstin } = require('../src/gst');

const STATES = { '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman & Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh' };
const UNITS = [['kg', 'Kilogram', 'MASS', 1], ['g', 'Gram', 'MASS', 0.001], ['L', 'Litre', 'VOLUME', 1], ['mL', 'Millilitre', 'VOLUME', 0.001], ['pc', 'Piece', 'COUNT', 1], ['packet', 'Packet', 'COUNT', 1], ['carton', 'Carton', 'COUNT', 1]];

async function seed(db, { demoPassword = 'demo1234' } = {}) {
  const have = await db.one('select count(*)::int c from users');
  if (have.c > 0) return false;
  const hash = bcrypt.hashSync(demoPassword, 10);
  const ts = nowTs(), openAt = monthStart(today()) + ' 00:00:00';
  await db.tx(async tx => {
    for (const [c, n] of Object.entries(STATES)) await tx.query('insert into states values($1,$2)', [c, n]);
    for (const u of UNITS) await tx.query('insert into units values($1,$2,$3,$4)', u);
    await tx.query("insert into settings values('variance_tolerance_pct','3')");
    await tx.query(`insert into business(id,name,gstin,pan,address,state_code,phone,email,bank_details,invoice_prefix,terms) values(1,$1,$2,$3,$4,'33',$5,$6,$7,'SL',$8)`,
      ['Demo Murukku Foods (dummy data)', makeGstin('33AABCS1429B1Z'), 'AABCS1429B', '12, Industrial Estate, Tiruchirappalli, Tamil Nadu 620 001', '0431-0000000', 'accounts@demo-foods.example', 'Demo Bank, A/c 000000000000, IFSC DEMO0000001',
        'Goods once sold will not be taken back except through a credit note. Interest @18% p.a. on overdue bills. Subject to Tiruchirappalli jurisdiction. This is a prototype invoice; dummy GSTIN.']);
    const users = [['admin', 'Factory Admin', 'ADMIN'], ['salesa', 'Salesman A', 'SALES'], ['salesb', 'Salesman B', 'SALES'], ['production', 'Production Supervisor', 'PRODUCTION'], ['auditor', 'Accountant / Auditor', 'AUDITOR'], ['owner', 'Owner', 'OWNER']];
    for (const [u, n, r] of users) await tx.query('insert into users(username,full_name,password_hash,role,active,created_at) values($1,$2,$3,$4,true,$5)', [u, n, hash, r, ts]);

    const item = async (code, name, type, unit, reorder, cost) => (await tx.one('insert into items(code,name,type,unit,reorder_level,avg_cost,last_cost) values($1,$2,$3,$4,$5,$6,$6) returning id', [code, name, type, unit, reorder, cost])).id;
    const flour = await item('FLOUR', 'Flour', 'RAW', 'kg', 50, 42), oil = await item('OIL', 'Cooking oil', 'RAW', 'L', 15, 140), spice = await item('SPICE', 'Salt and spice mix', 'RAW', 'kg', 2, 200);
    const pouch = await item('POUCH200', '200 g pouch', 'PACKAGING', 'pc', 400, 2.5), carton = await item('CARTON20', 'Carton (holds 20 packets)', 'PACKAGING', 'pc', 15, 15);
    const mur = await item('MUR200', 'Murukku 200 g', 'FINISHED', 'packet', 50, 0);
    // One bulk recipe: a batch makes 40 kg of murukku = 200 packets of 200 g. Other pack sizes can share it.
    const bom = (await tx.one("insert into boms(name,batch_output_g,notes) values('Murukku standard batch', 40000, 'Benchmark BOM: 40 kg flour -> 200 x 200 g packets') returning id")).id;
    for (const [i, q, u] of [[flour, 40, 'kg'], [oil, 10, 'L'], [spice, 1.2, 'kg']]) await tx.query('insert into bom_lines(bom_id,item_id,qty,unit) values($1,$2,$3,$4)', [bom, i, q, u]);
    await tx.query('insert into products(item_id,bom_id,pack_size_g,hsn,gst_rate,price,carton_capacity,shelf_life_days) values($1,$2,200,$3,5,50,20,90)', [mur, bom, '19059030']);
    await tx.query('insert into product_packaging values($1,$2,1)', [mur, pouch]);          // 1 pouch per packet  -> 200 per batch
    await tx.query('insert into product_packaging values($1,$2,0.05)', [mur, carton]);      // 1 carton per 20     -> 10 per batch

    await tx.query("insert into customers(name,type,address,state_code,gstin,phone,email,credit_days) values('Retailer A','RETAILER','14 Market Road, Tiruchirappalli, Tamil Nadu','33',$1,'9000000001','retailer.a@example.com',15)", [makeGstin('33AAECR4521K1Z')]);
    await tx.query("insert into customers(name,type,address,state_code,gstin,phone,email,credit_days) values('Distributor B','DISTRIBUTOR','7 Commercial Street, Bengaluru, Karnataka','29',$1,'9000000002','dist.b@example.com',30)", [makeGstin('29AABCD7788M1Z')]);
    await tx.query("insert into suppliers(name,gstin,state_code,address,phone) values('Demo Flour Mills',$1,'33','Salem, Tamil Nadu','9000000010')", [makeGstin('33AAACF1111A1Z')]);
    await tx.query("insert into suppliers(name,state_code,address,phone) values('Demo Oil & Packaging Traders','33','Madurai, Tamil Nadu','9000000011')");

    // Opening balances as ledger rows (batch OPENING, dated start of month)
    for (const [id, q, cost, expiry] of [[flour, 100, 42, null], [oil, 30, 140, null], [spice, 5, 200, null], [pouch, 500, 2.5, null], [carton, 30, 15, null], [mur, 50, 0, addDays(today(), 60)]]) {
      const b = (await tx.one('insert into batches(item_id,batch_no,mfg_date,expiry_date,created_at) values($1,$2,$3,$4,$5) returning id', [id, 'OPENING', null, expiry, ts])).id;
      await tx.query(`insert into stock_moves(item_id,batch_id,moved_at,move_type,qty,unit_cost,value,source_type,source_ref,note,created_by) values($1,$2,$3,'OPENING',$4,$5,$6,'OPENING','OPENING','Opening balance','seed')`, [id, b, openAt, q, cost, q * cost]);
    }
    await tx.query("insert into audit_log(ts,actor,action,entity,summary) values($1,'seed','SEED','SYSTEM','Benchmark master data loaded')", [ts]);
  });
  return true;
}
module.exports = { seed, STATES };
